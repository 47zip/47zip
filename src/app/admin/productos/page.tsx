import Link from "next/link";
import AdminProducts from "@/components/admin-products";
import { requireAdmin } from "@/lib/admin";

export default async function ProductsAdminPage() {
  await requireAdmin();
  return <main className="admin-shell">
    <header className="admin-head"><a className="logo" href="/">✦ folio<span>.</span> <small>ADMIN</small></a><Link href="/admin">← Resumen</Link></header>
    <section className="admin-main"><small className="label">CATÁLOGO PRIVADO</small><h1>Productos</h1><p>Carga el original sin contraseña. El archivo queda privado hasta que alguien compra.</p><AdminProducts /></section>
  </main>;
}
