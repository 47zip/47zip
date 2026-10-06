import { NextResponse, type NextRequest } from "next/server";
import { checkoutSchema, createPendingOrder } from "@/lib/order-create";
import { paypalBase, paypalToken } from "@/lib/paypal";
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
    const created = await createPendingOrder(user.id, "paypal", parsed.data.productIds);
    orderId = created.orderId;
    const token = await paypalToken();
    const response = await fetch(paypalBase() + "/v2/checkout/orders", {
      method: "POST", cache: "no-store",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", "PayPal-Request-Id": orderId },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [{ reference_id: orderId, custom_id: orderId, amount: { currency_code: "MXN", value: created.amount.toFixed(2) }, description: created.products.map((p) => p.name).join(", ").slice(0, 120) }],
        application_context: { brand_name: "Folio", user_action: "PAY_NOW", return_url: site + "/api/payments/paypal/return?orderId=" + orderId, cancel_url: site + "/cuenta?payment=cancelled" },
      }),
    });
    const data = await response.json();
    const approval = data.links?.find((link: { rel: string }) => link.rel === "payer-action" || link.rel === "approve")?.href;
    if (!response.ok || !data.id || !approval) throw new Error("PayPal did not return an approval URL.");
    await supabaseService().from("orders").update({ external_order_id: data.id }).eq("id", orderId);
    return NextResponse.json({ approvalUrl: approval }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    if (orderId) await supabaseService().from("orders").update({ status: "failed" }).eq("id", orderId);
    return NextResponse.json({ error: "No se pudo iniciar el pago. Intenta de nuevo." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
