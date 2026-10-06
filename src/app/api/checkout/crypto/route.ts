import { NextResponse, type NextRequest } from "next/server";
import { checkoutSchema, createPendingOrder } from "@/lib/order-create";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseService } from "@/lib/supabase/service";

export async function POST(request: NextRequest) {
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (!site || request.headers.get("origin") !== new URL(site).origin) return NextResponse.json({ error: "Solicitud no permitida." }, { status: 403 });
  const session = await supabaseServer();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "Inicia sesión para comprar." }, { status: 401 });
  const parsed = checkoutSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Carrito no válido." }, { status: 400 });
  let orderId = "";
  try {
    const key = process.env.NOWPAYMENTS_API_KEY;
    if (!key) throw new Error("Crypto provider is not configured.");
    const created = await createPendingOrder(user.id, "nowpayments", parsed.data.productIds);
    orderId = created.orderId;
    const response = await fetch("https://api.nowpayments.io/v1/invoice", {
      method: "POST", cache: "no-store",
      headers: { "x-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        price_amount: created.amount, price_currency: "mxn", order_id: orderId,
        order_description: created.products.map((p) => p.name).join(", ").slice(0, 120),
        ipn_callback_url: site + "/api/payments/nowpayments",
        success_url: site + "/cuenta?payment=processing",
        cancel_url: site + "/cuenta?payment=cancelled",
      }),
    });
    const data = await response.json();
    if (!response.ok || !data.invoice_url || !data.id) throw new Error("Crypto invoice was not created.");
    await supabaseService().from("orders").update({ external_order_id: String(data.id) }).eq("id", orderId);
    return NextResponse.json({ checkoutUrl: data.invoice_url }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    if (orderId) await supabaseService().from("orders").update({ status: "failed" }).eq("id", orderId);
    return NextResponse.json({ error: "No se pudo iniciar el pago cripto. Intenta de nuevo." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
