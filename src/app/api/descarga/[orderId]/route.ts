import { NextResponse, type NextRequest } from "next/server";
import { get } from "@vercel/blob";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseService } from "@/lib/supabase/service";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const session = await supabaseServer();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "Inicia sesión para descargar." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const db = supabaseService();
  const { data: order } = await db.from("orders").select("id,status,user_id").eq("id", orderId).eq("user_id", user.id).maybeSingle();
  if (!order || order.status !== "paid") return NextResponse.json({ error: "Pedido no disponible." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  const { data: file } = await db.from("download_packages").select("blob_path").eq("order_id", orderId).maybeSingle();
  if (!file) return NextResponse.json({ error: "El paquete todavía se está preparando." }, { status: 409, headers: { "Cache-Control": "no-store" } });
  const blob = await get(file.blob_path, { access: "private" });
  if (!blob || blob.statusCode !== 200 || !blob.stream) return NextResponse.json({ error: "No se pudo obtener el paquete." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  const { data: allowed, error } = await db.rpc("consume_download", { p_order_id: orderId, p_user_id: user.id });
  if (error || !allowed?.length) return NextResponse.json({ error: "Se alcanzó el límite de descargas." }, { status: 429, headers: { "Cache-Control": "no-store" } });
  const name = "folio-" + orderId.replace(/-/g, "").slice(0, 10) + ".zip";
  return new NextResponse(blob.stream, { headers: { "Content-Type": "application/zip", "Content-Disposition": "attachment; filename=\"" + name + "\"", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
