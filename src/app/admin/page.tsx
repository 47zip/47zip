import { requireAdmin } from "@/lib/admin";

const money = (cents: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(cents / 100);
const date = (value: string) => new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(new Date(value));

export default async function AdminPage() {
  const { supabase } = await requireAdmin();
  const [ordersResult, summaryResult] = await Promise.all([
    supabase.from("orders").select("id,user_id,status,amount_mxn_cents,provider,created_at").order("created_at", { ascending: false }).limit(25),
    supabase.rpc("get_admin_summary"),
  ]);
  const orders = ordersResult.data ?? [];
  const stats = summaryResult.data?.[0];
  return <main className="admin-shell">
    <header className="admin-head"><a className="logo" href="/">✦ folio<span>.</span> <small>ADMIN</small></a><form action="/auth/salir" method="post"><button type="submit">Cerrar sesión</button></form></header>
    <section className="admin-main"><div className="admin-topline"><div><small className="label">PANEL ADMINISTRATIVO</small><h1>Resumen de ventas</h1><p>Totales históricos y los 25 pedidos más recientes.</p></div><a className="btn dark" href="/admin/productos">Gestionar productos →</a></div>
      <div className="stats"><article className="stat-card"><small>VENTAS CONFIRMADAS</small><strong>{stats?.total_sales ?? 0}</strong><span>pedidos pagados sin reembolso registrado</span></article><article className="stat-card"><small>INGRESOS REGISTRADOS</small><strong>{money(stats?.total_revenue_cents ?? 0)}</strong><span>MXN · pedidos no marcados como reembolsados</span></article><article className="stat-card"><small>PRODUCTOS PUBLICADOS</small><strong>{stats?.product_count ?? 0}</strong><span>en el catálogo</span></article></div>
      <div className="admin-table"><h2>Pedidos recientes</h2><div className="admin-row head"><span>Pedido / cliente</span><span>Fecha</span><span>Estado</span><span>Total</span></div>{orders.map((o) => <div className="admin-row" key={o.id}><span>{o.id.slice(0, 8).toUpperCase()} · {o.user_id.slice(0, 8)}</span><span>{date(o.created_at)}</span><span className={o.status === "paid" ? "paid" : ""}>{o.status === "paid" ? "Pagado" : o.status === "pending" ? "Pendiente" : o.status}</span><span>{money(o.amount_mxn_cents)}</span></div>)}{orders.length === 0 && <p>No hay pedidos todavía.</p>}</div>
      <p className="admin-help">Esta sección requiere rol admin y sesión con MFA verificada. Los totales históricos los calcula una función de base de datos que vuelve a validar ambos controles.</p>
    </section>
  </main>;
}

