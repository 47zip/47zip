import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { fulfillPaidOrder } from "@/lib/package-order";
import { paypalOrderDetails, verifyPaypalWebhook } from "@/lib/paypal";
import { supabaseService } from "@/lib/supabase/service";

export const maxDuration = 60;

export async function POST(request: Request) {
  const event = await request.json().catch(() => null);
  if (!event || !await verifyPaypalWebhook(request, event)) return NextResponse.json({ error: "Firma inválida." }, { status: 400 });
  const type = event.event_type as string;
  if (type !== "PAYMENT.CAPTURE.COMPLETED" && type !== "PAYMENT.CAPTURE.REFUNDED") return NextResponse.json({ received: true });

  const relatedOrderId = event.resource?.supplementary_data?.related_ids?.order_id;
  if (typeof relatedOrderId !== "string") return NextResponse.json({ error: "Orden ausente." }, { status: 400 });
  const db = supabaseService();
  const { data: order } = await db.from("orders").select("id,status,amount_mxn_cents,external_order_id").eq("provider", "paypal").eq("external_order_id", relatedOrderId).maybeSingle();
  if (!order) return NextResponse.json({ error: "Orden desconocida." }, { status: 404 });

  if (type === "PAYMENT.CAPTURE.REFUNDED") {
    const { data: pack } = await db.from("download_packages").select("blob_path").eq("order_id", order.id).maybeSingle();
    if (pack) {
      await del(pack.blob_path).catch(() => undefined);
      await db.from("download_packages").delete().eq("order_id", order.id);
    }
    await db.from("orders").update({ status: "refunded" }).eq("id", order.id);
  } else {
    const details = await paypalOrderDetails(relatedOrderId);
    const purchase = details.purchase_units?.[0];
    const expected = (order.amount_mxn_cents / 100).toFixed(2);
    if (details.status !== "COMPLETED" || purchase?.custom_id !== order.id || purchase?.amount?.currency_code !== "MXN" || purchase?.amount?.value !== expected) {
      return NextResponse.json({ error: "El monto no coincide." }, { status: 400 });
    }
    await db.from("orders").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", order.id);
    try {
      await fulfillPaidOrder(order.id);
    } catch {
      await db.from("orders").update({ status: "fulfillment_failed" }).eq("id", order.id);
      return NextResponse.json({ error: "No se pudo preparar el archivo." }, { status: 503 });
    }
  }
  if (event.id) await db.from("payment_events").upsert({ provider: "paypal", event_id: String(event.id) }, { onConflict: "provider,event_id", ignoreDuplicates: true });
  return NextResponse.json({ received: true });
}
