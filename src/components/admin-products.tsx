"use client";
import { useEffect, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";

type Product = { id:string; name:string; category:string; format:string; price_mxn_cents:number; published:boolean; created_at:string };
const formats = ["pdf","docx","zip","rar"] as const;
const money = (cents:number) => new Intl.NumberFormat("es-MX",{style:"currency",currency:"MXN"}).format(cents/100);

export default function AdminProducts() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [items,setItems] = useState<Product[]>([]);
  const [format,setFormat] = useState<typeof formats[number]>("pdf");
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState("");
  const [error,setError] = useState("");
  async function refresh() {
    const response = await fetch("/api/admin/products",{cache:"no-store"});
    const data = await response.json();
    if(response.ok) setItems(data.products ?? []);
    else setError(data.error ?? "No se pudo cargar el catálogo.");
  }
  useEffect(()=>{ void refresh(); },[]);
  async function create(event:React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(""); setError("");
    const form = new FormData(event.currentTarget);
    const file = fileRef.current?.files?.[0];
    if(!file){setError("Selecciona el archivo original.");setBusy(false);return;}
    const price = Number(form.get("price"));
    if(!Number.isFinite(price) || price <= 0){setError("Escribe un precio válido.");setBusy(false);return;}
    try {
      const response = await fetch("/api/admin/products",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
        name:String(form.get("name")),description:String(form.get("description")),category:String(form.get("category")),
        format,priceMxnCents:Math.round(price*100),
      })});
      const data = await response.json();
      if(!response.ok) throw new Error(data.error ?? "No se pudo crear el producto.");
      const productId = data.product.id as string;
      await upload("products/"+productId+"/"+file.name,file,{
        access:"private",handleUploadUrl:"/api/admin/upload",
        clientPayload:JSON.stringify({productId,name:file.name,size:file.size,format}),
      });
      setMessage("El archivo quedó privado y el producto ya está publicado.");
      event.currentTarget.reset();
      if(fileRef.current) fileRef.current.value="";
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el producto.");
      await refresh();
    } finally { setBusy(false); }
  }
  return <div className="product-admin-grid">
    <section className="admin-table"><h2>Agregar producto</h2><p className="admin-subtext">Se publica cuando termina la carga privada.</p>
      <form className="product-form" onSubmit={create}>
        <label>Nombre<input name="name" minLength={3} maxLength={100} required /></label>
        <label>Categoría<input name="category" maxLength={50} required /></label>
        <label>Descripción<textarea name="description" maxLength={800} rows={3} /></label>
        <div className="form-pair"><label>Formato<select value={format} onChange={(e)=>setFormat(e.target.value as typeof formats[number])}>{formats.map(f=><option key={f} value={f}>{f.toUpperCase()}</option>)}</select></label><label>Precio (MXN)<input name="price" type="number" min="1" step="0.01" required /></label></div>
        <label>Archivo original<input ref={fileRef} type="file" accept=".pdf,.docx,.zip,.rar" required /><small>Sin contraseña previa · límite inicial configurable de 25 MB</small></label>
        <button className="btn dark" disabled={busy}>{busy?"Cargando archivo…":"Crear y publicar →"}</button>
        {message&&<p className="auth-message" role="status">{message}</p>}{error&&<p className="auth-message error" role="alert">{error}</p>}
      </form>
    </section>
    <section className="admin-table"><h2>Catálogo</h2>{items.length===0?<p>No hay productos todavía.</p>:items.map(p=><div className="admin-product-row" key={p.id}><div><b>{p.name}</b><small>{p.category} · {p.format.toUpperCase()}</small></div><strong>{money(p.price_mxn_cents)}</strong><span className={p.published?"paid":"status-pill"}>{p.published?"Publicado":"Borrador"}</span></div>)}</section>
  </div>;
}
