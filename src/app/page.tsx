"use client";
import { useEffect, useMemo, useState } from "react";

type Product = { id: string; name: string; category: string; format: string; price: number; blurb: string; color: string; previewOnly?: boolean };
const samples: Product[] = [
  { id: "sample-agenda", name: "Agenda semanal esencial", category: "Organización", format: "pdf", price: 129, blurb: "Planea tu semana sin complicaciones.", color: "lilac", previewOnly: true },
  { id: "sample-kit", name: "Kit de marca para redes", category: "Diseño", format: "zip", price: 249, blurb: "Recursos editables para crear con consistencia.", color: "peach", previewOnly: true },
  { id: "sample-plan", name: "Planificador de proyectos", category: "Productividad", format: "docx", price: 179, blurb: "De la idea al siguiente paso, con claridad.", color: "sage", previewOnly: true },
  { id: "sample-fondos", name: "Biblioteca de fondos", category: "Diseño", format: "zip", price: 199, blurb: "Texturas suaves y listas para tus proyectos.", color: "blue", previewOnly: true },
];
const palette = ["lilac", "peach", "sage", "blue"];
const mxn = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 }).format(n);
const label = (format: string) => format.toUpperCase();

export default function Home() {
  const [products, setProducts] = useState<Product[]>(samples);
  const [filter, setFilter] = useState("Todo");
  const [cart, setCart] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [needLogin, setNeedLogin] = useState(false);
  const [provider, setProvider] = useState<"paypal" | "crypto">("paypal");
  const [busy, setBusy] = useState(false);
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const [catalogReady, setCatalogReady] = useState(false);
  const [cartRestored, setCartRestored] = useState(false);

  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(window.localStorage.getItem("folio.cart") ?? "[]");
      if (Array.isArray(saved)) setCart(saved.filter((id): id is string => typeof id === "string").slice(0, 12));
    } catch { /* Ignore invalid local cart data. */ }
    setCartRestored(true);
  }, []);

  useEffect(() => {
    if (!cartRestored) return;
    try { window.localStorage.setItem("folio.cart", JSON.stringify(cart)); } catch { /* The cart still works for this visit. */ }
  }, [cart, cartRestored]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("checkout") === "1") {
      setOpen(true);
      url.searchParams.delete("checkout");
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    fetch("/api/catalog", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) return;
      const data = await response.json();
      if (!alive || !Array.isArray(data.products)) return;
      const realProducts: Product[] = data.products.map((p: { id: string; name: string; description: string; category: string; format: string; price_mxn_cents: number }, index: number) => ({
        id: p.id, name: p.name, category: p.category, format: p.format, price: p.price_mxn_cents / 100,
        blurb: p.description || "Un recurso digital para tu próxima idea.", color: palette[index % palette.length],
      }));
      setProducts(realProducts);
      setCart((current) => current.filter((id) => realProducts.some((product) => product.id === id)));
      setCatalogReady(true);
    }).catch(() => undefined);
    return () => { alive = false; };
  }, []);

  const filters = useMemo(() => ["Todo", ...Array.from(new Set(products.map((p) => p.category)))], [products]);
  const shown = useMemo(() => filter === "Todo" ? products : products.filter((p) => p.category === filter), [filter, products]);
  const items = cart.map((id) => products.find((p) => p.id === id)).filter((p): p is Product => Boolean(p));
  const total = items.reduce((sum, p) => sum + p.price, 0);

  function addProduct(product: Product) {
    if (product.previewOnly) {
      setNeedLogin(false);
      setNotice("Estos productos son solo muestras de diseño. Cuando conectes Supabase y publiques productos desde el panel, aquí aparecerá el catálogo real.");
      return;
    }
    setPolicyAccepted(false);
    setCart((current) => current.includes(product.id) ? current : [...current, product.id]);
    setOpen(true);
  }

  async function checkout() {
    if (!items.length || busy) return;
    if (!policyAccepted) {
      setNeedLogin(false);
      setNotice("Lee y acepta la política de compra para continuar.");
      return;
    }
    if (items.some((item) => item.previewOnly)) {
      setNeedLogin(false);
      setNotice("Las muestras no se pueden comprar. Publica un producto real desde el panel de administración.");
      return;
    }
    setBusy(true);
    setNeedLogin(false);
    try {
      const response = await fetch(provider === "paypal" ? "/api/checkout/paypal" : "/api/checkout/crypto", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productIds: items.map((item) => item.id) }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) {
        setNeedLogin(true);
        setNotice("Inicia sesión para vincular esta compra con tu biblioteca privada.");
      } else if (!response.ok) {
        setNeedLogin(false);
        setNotice(data.error || "No se pudo iniciar el pago. Revisa la configuración del proveedor e intenta de nuevo.");
      } else {
        const target = provider === "paypal" ? data.approvalUrl : data.checkoutUrl;
        if (typeof target !== "string") throw new Error("El proveedor no devolvió el enlace de pago.");
        window.location.assign(target);
      }
    } catch (error) {
      setNeedLogin(false);
      setNotice(error instanceof Error ? error.message : "No se pudo conectar con el proveedor de pago.");
    } finally {
      setBusy(false);
    }
  }

  return <main>
    <header className="top"><a className="logo" href="#"><i>✦</i> folio<span>.</span></a><nav><a href="#coleccion">Explorar</a><a href="#como">Cómo funciona</a><a href="#preguntas">Preguntas</a></nav><div className="top-actions"><a href="/ingresar?next=%2Fcuenta">Mi biblioteca ↗</a><button className="cart-icon" aria-label={`Carrito, ${cart.length} artículos`} onClick={() => setOpen(true)}>♧<b>{cart.length}</b></button></div></header>
    <section className="hero">
      <div className="hero-copy"><div className="kicker"><i/> RECURSOS DIGITALES, A TU RITMO</div><h1>Ideas listas<br/>para <em>tomar forma.</em></h1><p>Plantillas, guías y recursos cuidadosamente creados para ayudarte a hacer más, con menos ruido.</p><div className="hero-cta"><a className="btn dark" href="#coleccion">Explorar colección <span>→</span></a><small>♙ Compra segura y descarga privada</small></div><div className="proof"><span className="faces"><i>F</i><i>M</i><i>R</i></span> Recursos hechos para la vida real <b>★★★★★</b></div></div>
      <div className="hero-art" aria-label="Vista previa de una agenda digital"><div className="ring r1"/><div className="ring r2"/><div className="paper back"><small>NOTAS <span>01 — 04</span></small><i/><i/><i/><b>ideas<br/>en orden</b></div><div className="paper front"><small>FOLIO / ESTUDIO</small><h2>Plan<br/>de hoy<span>.</span></h2><hr/><p>◯ Prioridad uno</p><p>◯ Un paso a la vez</p><p>◯ Tiempo para crear</p><small className="date">LUNES · 09:00</small></div><span className="art-star">✳</span><small className="art-cap">01　 Tu próxima buena idea empieza aquí</small></div>
    </section>
    <section className="benefits" id="como"><div><i>♙</i><p><b>Acceso privado</b><small>Tu compra queda en tu cuenta</small></p></div><div><i>↓</i><p><b>Descarga segura</b><small>Al confirmarse el pago</small></p></div><div><i>✳</i><p><b>Hecho para ti</b><small>Recursos listos para usar</small></p></div></section>
    <section className="catalog" id="coleccion"><div className="section-head"><div><small className="label">LA COLECCIÓN</small><h2>Pequeñas herramientas,<br/><em>grandes comienzos.</em></h2></div><p>Encuentra ese recurso que hace que el siguiente paso se sienta más fácil.</p></div>
      <div className="toolbar"><div className="filters">{filters.map((f) => <button key={f} className={filter === f ? "chosen" : ""} onClick={() => setFilter(f)}>{f}</button>)}</div><small>{catalogReady ? `${shown.length} recursos` : "Muestras de diseño"}</small></div>
      <div className="products">{shown.map((p, i) => <article className="product" key={p.id}><div className={`cover ${p.color}`}>{p.previewOnly && <span className="tag">MUESTRA</span>}<span className="num">{String(i + 1).padStart(2, "0")}</span>{p.format === "pdf" ? <div className="sheet"><small>FOLIO / GUÍA</small><b>Una semana<br/>con intención<span>.</span></b><i>PLAN · REFLEXIONA · AVANZA</i></div> : p.format === "zip" || p.format === "rar" ? <div className="stack"><i/><i/><i/><b>✦</b></div> : <div className="board"><small>PROYECTO 01</small><b>De la idea<br/>al plan.</b><i/><i/><i/></div>}<span className="file">{label(p.format)}</span></div><div className="product-info"><small>{p.category}<span>{label(p.format)}</span></small><h3>{p.name}</h3><p>{p.blurb}</p><div className="buy"><b>{mxn(p.price)}</b><button onClick={() => addProduct(p)}>{p.previewOnly ? "Ver muestra" : cart.includes(p.id) ? "En carrito ✓" : <>Agregar <span>＋</span></>}</button></div></div></article>)}</div>
      {catalogReady && products.length === 0 && <div className="note"><b>Aún no hay productos publicados.</b> Cuando publiques uno desde el panel, aparecerá aquí.</div>}
      <div className="note"><b>✳　Todo en su lugar.</b> Cada compra aparece en tu biblioteca privada al confirmarse el pago.<a href="#preguntas">Conoce cómo funciona →</a></div>
    </section>
    <section className="manifesto"><span>✦</span><small>MENOS FRICCIÓN. MÁS CREACIÓN.</small><h2>Un buen recurso no<br/>hace el trabajo por ti.<br/><em>Te ayuda a empezar.</em></h2><p>Herramientas simples para que tu atención se quede donde importa: en lo que quieres crear.</p><a className="btn light" href="#coleccion">Encuentra tu siguiente paso →</a></section>
    <section className="faq" id="preguntas"><div><small className="label">ANTES DE DESCARGAR</small><h2>Todo claro,<br/><em>desde el inicio.</em></h2><p>¿Tienes otra pregunta? Escríbenos y te ayudamos.</p><a href="mailto:hola@folio.digital">hola@folio.digital ↗</a></div><div className="questions"><details open><summary>¿Cuándo recibo mi compra?<b>＋</b></summary><p>Al confirmarse el pago, el recurso aparecerá en la biblioteca de tu cuenta.</p></details><details><summary>¿Puedo abrir mis archivos en el celular?<b>＋</b></summary><p>Sí. La tienda y la biblioteca son adaptables a iPhone, iPad y Android. Para abrir ZIP cifrados AES en el celular puede hacer falta una app compatible.</p></details><details><summary>¿Cómo se protegen mis descargas?<b>＋</b></summary><p>Los originales se guardan de forma privada y se genera un ZIP AES-256 con clave única por compra. Cada PDF lleva una marca de pedido; los DOCX reciben un sello de licencia. Esto ayuda a disuadir la reventa, pero no impide que el comprador comparta los archivos y la clave.</p></details><details><summary>¿Puedo solicitar un reembolso?<b>＋</b></summary><p>La tienda no ofrece reembolsos voluntarios por cambio de opinión después de la entrega. Esto no elimina los derechos que resulten aplicables ni el soporte por cobros duplicados o archivos con problemas; consulta la política completa antes de pagar.</p></details><details><summary>¿Qué métodos de pago habrá?<b>＋</b></summary><p>PayPal y cripto mediante NOWPayments, después de configurar y validar tus cuentas comerciales.</p></details></div></section>
    <footer><div><a className="logo" href="#"><i>✦</i> folio<span>.</span></a><small>Recursos para hacer espacio a tus ideas.</small><nav><a href="#coleccion">Colección</a><a href="#preguntas">Ayuda</a><a href="mailto:hola@folio.digital">Contacto</a><a href="/politica-de-compras">Política de compra</a></nav></div><hr/><small>© 2026 Folio Digital</small><small>Hecho con intención ✳</small><small>Marca, contacto y textos legales por personalizar</small></footer>
    {open && <div className="shade" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}><aside className="drawer"><header><div><small className="label">TU SELECCIÓN</small><h2>Tu carrito <small>({cart.length})</small></h2></div><button className="close" onClick={() => setOpen(false)} aria-label="Cerrar carrito">×</button></header>{items.length === 0 ? <div className="empty"><h3>Tu próxima idea empieza aquí.</h3><p>Explora la colección y agrega un recurso.</p><button className="btn dark" onClick={() => { setOpen(false); document.getElementById("coleccion")?.scrollIntoView({ behavior: "smooth" }); }}>Ver recursos →</button></div> : <><div className="cart-items">{items.map((p) => <div className="cart-item" key={p.id}><span className={`thumb ${p.color}`}>{label(p.format)}</span><div><b>{p.name}</b><small>{label(p.format)}</small><strong>{mxn(p.price)}</strong></div><button onClick={() => { setPolicyAccepted(false); setCart((current) => current.filter((id) => id !== p.id)); }} aria-label={`Quitar ${p.name}`}>×</button></div>)}</div><div className="total"><span>Total</span><b>{mxn(total)}</b></div><p className="secure">♙　Pago protegido · descarga al confirmar el pago</p><label className="policy-check"><input type="checkbox" checked={policyAccepted} onChange={(event) => setPolicyAccepted(event.target.checked)} /><span>Acepto la <a href="/politica-de-compras" target="_blank" rel="noreferrer">política de compra</a>, incluida la política de no reembolso voluntario por cambio de opinión, sujeta a los derechos aplicables.</span></label><div className="payment-methods" role="group" aria-label="Método de pago"><button className={provider === "paypal" ? "selected" : ""} onClick={() => setProvider("paypal")}>PayPal</button><button className={provider === "crypto" ? "selected" : ""} onClick={() => setProvider("crypto")}>Cripto</button></div><button className="btn dark pay" disabled={busy || !policyAccepted || items.some((item) => item.previewOnly)} onClick={checkout}>{busy ? "Conectando…" : `Continuar con ${provider === "paypal" ? "PayPal" : "cripto"} →`}</button>{items.some((item) => item.previewOnly) ? <small className="demo">Las muestras no se pueden comprar.</small> : <small className="demo">Los pagos requieren configurar tus cuentas y secretos.</small>}</>}</aside></div>}
    {notice && <div className="notice-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) { setNotice(""); setNeedLogin(false); } }}><section className="notice" role="dialog" aria-modal="true" aria-labelledby="notice-title"><button className="close" onClick={() => { setNotice(""); setNeedLogin(false); }} aria-label="Cerrar aviso">×</button><span className="label">SIGUIENTE PASO</span><h2 id="notice-title">{needLogin ? "Entra a tu biblioteca." : "Aviso de la tienda"}</h2><p>{notice}</p>{needLogin && <a className="btn dark" href="/ingresar?next=%2F%3Fcheckout%3D1">Iniciar sesión →</a>}<button className="btn outline" onClick={() => { setNotice(""); setNeedLogin(false); }}>Entendido</button></section></div>}
  </main>;
}





