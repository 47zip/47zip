import { NextResponse, type NextRequest } from "next/server";
import { fulfillPaidOrder } from "@/lib/package-order";
import { capturePaypalOrder, paypalOrderDetails } from "@/lib/paypal";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseService } from "@/lib/supabase/service";

export const maxDuration = 60;
export async function GET(request: NextRequest) {
  const internalId = request.nextUrl.searchParams.get("orderId");
  const paypalId = request.nextUrl.searchParams.get("token");
  const session = await supabaseServer();
  const { data: { user } } = await session.auth.getUser();
  if (!user || !internalId || !paypalId) return NextResponse.redirect(new URL("/ingresar?next=/cuenta", request.url));
  const db = supabaseService();
  const { data: order } = await db.from("orders").select("id,user_id,status,provider,external_order_id,amount_mxn_cents").eq("id", internalId).maybeSingle();
  if (!order || order.user_id !== user.id || order.provider !== "paypal" || order.external_order_id !== paypalId) return NextResponse.redirect(new URL("/cuenta?payment=problem", request.url));
  if (order.status === "paid" || order.status === "fulfillment_failed") {
    try {
      await db.from("orders").update({ status: "paid" }).eq("id", internalId);
      await fulfillPaidOrder(internalId);
      return NextResponse.redirect(new URL("/cuenta?payment=ready", request.url));
    } catch {
      await db.from("orders").update({ status: "fulfillment_failed" }).eq("id", internalId);
      return NextResponse.redirect(new URL("/cuenta?payment=preparing", request.url));
    }
  }
  if (order.status !== "pending") return NextResponse.redirect(new URL("/cuenta?payment=problem", request.url));
  try {
    await capturePaypalOrder(paypalId);
    const details = await paypalOrderDetails(paypalId);
    const purchase = details.purchase_units?.[0];
    const expected = (order.amount_mxn_cents / 100).toFixed(2);
    if (details.status !== "COMPLETED" || purchase?.custom_id !== internalId || purchase?.amount?.currency_code !== "MXN" || purchase?.amount?.value !== expected) {
      return NextResponse.redirect(new URL("/cuenta?payment=problem", request.url));
    }
    const { error } = await db.from("orders").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", internalId).eq("user_id", user.id).eq("status", "pending");
    if (error) throw new Error("Could not record the captured order.");
    await fulfillPaidOrder(internalId);
    return NextResponse.redirect(new URL("/cuenta?payment=ready", request.url));
  } catch {
    const { data: fresh } = await db.from("orders").select("status").eq("id", internalId).maybeSingle();
    if (fresh?.status === "paid") await db.from("orders").update({ status: "fulfillment_failed" }).eq("id", internalId);
    return NextResponse.redirect(new URL("/cuenta?payment=preparing", request.url));
  }
}

