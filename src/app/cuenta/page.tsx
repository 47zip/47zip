import { requireCustomer } from "@/lib/admin";
import { supabaseService } from "@/lib/supabase/service";
import PasswordControl from "@/components/password-control";

const money = (cents: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(cents / 100);
const date = (value: string) => new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(new Date(value));
const paymentMessages: Record<string, string> = {
  ready: "Pago confirmado. Tu compra está disponible en la biblioteca.",
  processing: "El proveedor está confirmando el pago cripto. Recarga esta página en unos minutos para actualizar el estado.",
  preparing: "El pago se confirmó y estamos preparando tu ZIP individual. Vuelve a consultar esta biblioteca en unos minutos.",
  cancelled: "El proceso de pago se canceló; no se registró una compra confirmada.",
  problem: "No pudimos confirmar el pago. Si PayPal ya mostró un cargo, escribe a soporte antes de intentar pagar otra vez.",
};

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ payment?: string }> }) {
  const { user, supabase } = await requireCustomer();
  const params = await searchParams;
  const paymentMessage = params.payment ? paymentMessages[params.payment] : undefined;
  const { data: orders } = await supabase.from("orders").select("id,status,amount_mxn_cents,created_at,paid_at").order("created_at", { ascending: false });
  const ids = (orders ?? []).filter((order) => order.status === "paid").map((order) => order.id);
  let packages = new Set<string>();
  if (ids.length && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { data } = await supabaseService().from("download_packages").select("order_id").in("order_id", ids);
    packages = new Set((data ?? []).map((pack) => pack.order_id));
  }
  return <main className="account-shell">
    <header className="account-head"><a className="logo" href="/">✦ folio<span>.</span></a><form action="/auth/salir" method="post"><button type="submit">Cerrar sesión</button></form></header>
    <section className="account-main">{paymentMessage && <div className="auth-message" role="status">{paymentMessage}</div>}<small className="label">MI BIBLIOTECA</small><h1>Hola, {user.email?.split("@")[0] ?? "bienvenido"}.</h1><p>Tus pedidos y archivos están aquí, disponibles desde tus dispositivos.</p>
      {(orders?.length ?? 0) === 0 ? <div className="account-empty">Todavía no hay compras en tu biblioteca. <a href="/">Explora la colección →</a></div> :
        <div className="purchase-list">{orders?.map((order) => {
          const label = order.status === "paid" ? "Pago confirmado" : order.status === "pending" ? "Pago pendiente" : order.status === "failed" ? "Pago fallido" : order.status === "refunded" ? "Reembolsado" : "Pago confirmado · paquete pendiente";
          return <article className="purchase" key={order.id}><span className="purchase-icon">↓</span><div className="purchase-info"><b>{"Pedido " + order.id.slice(0, 8).toUpperCase()}</b><small>{date(order.created_at)} · {label}</small></div><div className="purchase-total">{money(order.amount_mxn_cents)}<small>{order.status === "paid" || order.status === "fulfillment_failed" ? "Confirmado" : label}</small></div>{order.status === "paid" && (packages.has(order.id) ? <div className="account-download"><a className="download-link" href={"/api/descarga/" + order.id}>Descargar ZIP</a><PasswordControl orderId={order.id} /></div> : <span className="status-pill">Preparando paquete</span>)}{order.status === "fulfillment_failed" && <span className="status-pill">Soporte de tienda requerido</span>}</article>;
        })}</div>}
    </section>
  </main>;
}
