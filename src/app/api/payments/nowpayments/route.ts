import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { fulfillPaidOrder } from "@/lib/package-order";
import { supabaseService } from "@/lib/supabase/service";

function sortPayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortPayload);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortPayload((value as Record<string, unknown>)[key])]));
  }
  return value;
}

function validSignature(payload: unknown, signature: string | null) {
  const secret = process.env.NOWPAYMENTS_IPN_SECRET;
  if (!secret || !signature) return false;
  const expected = createHmac("sha512", secret).update(JSON.stringify(sortPayload(payload))).digest();
  let supplied: Buffer;
  try { supplied = Buffer.from(signature, "hex"); } catch { return false; }
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export const maxDuration = 60;
export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  if (!payload || !validSignature(payload, request.headers.get("x-nowpayments-sig"))) return NextResponse.json({ error: "Firma inválida." }, { status: 400 });
  const orderId = typeof payload.order_id === "string" ? payload.order_id : "";
  const paymentId = String(payload.payment_id ?? "");
  const status = String(payload.payment_status ?? "");
  if (!orderId || !/^[A-Za-z0-9_-]{1,100}$/.test(paymentId)) return NextResponse.json({ error: "Referencia inválida." }, { status: 400 });
  const db = supabaseService();
  const { data: order } = await db.from("orders").select("id,status,provider,amount_mxn_cents").eq("id", orderId).eq("provider", "nowpayments").maybeSingle();
  if (!order) return NextResponse.json({ error: "Orden desconocida." }, { status: 404 });

  if (status === "failed" || status === "expired") {
    if (order.status === "pending") await db.from("orders").update({ status: "failed" }).eq("id", orderId).eq("status", "pending");
    await db.from("payment_events").upsert({ provider: "nowpayments", event_id: paymentId + ":" + status }, { onConflict: "provider,event_id", ignoreDuplicates: true });
    return NextResponse.json({ received: true });
  }
  if (status !== "finished") return NextResponse.json({ received: true });

  const apiKey = process.env.NOWPAYMENTS_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Proveedor no configurado." }, { status: 503 });
  const verifiedResponse = await fetch("https://api.nowpayments.io/v1/payment/" + encodeURIComponent(paymentId), { headers: { "x-api-key": apiKey }, cache: "no-store" });
  if (!verifiedResponse.ok) return NextResponse.json({ error: "No se pudo verificar el pago." }, { status: 503 });
  const verified = await verifiedResponse.json();
  const cents = Math.round(Number(verified.price_amount) * 100);
  if (verified.payment_status !== "finished" || verified.order_id !== orderId || String(verified.price_currency).toLowerCase() !== "mxn" || cents !== order.amount_mxn_cents) {
    return NextResponse.json({ error: "El monto o el estado no coincide." }, { status: 400 });
  }
  await db.from("orders").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", orderId);
  try {
    await fulfillPaidOrder(orderId);
  } catch {
    await db.from("orders").update({ status: "fulfillment_failed" }).eq("id", orderId);
    return NextResponse.json({ error: "No se pudo preparar el archivo." }, { status: 503 });
  }
  await db.from("payment_events").upsert({ provider: "nowpayments", event_id: paymentId + ":finished" }, { onConflict: "provider,event_id", ignoreDuplicates: true });
  return NextResponse.json({ received: true });
}
