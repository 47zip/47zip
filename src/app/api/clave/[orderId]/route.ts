import { NextResponse, type NextRequest } from "next/server";
import { decryptPackagePassword } from "@/lib/package-order";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseService } from "@/lib/supabase/service";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const session = await supabaseServer();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "Inicia sesión para ver la clave." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const db = supabaseService();
  const { data: order } = await db.from("orders").select("id,status").eq("id", orderId).eq("user_id", user.id).maybeSingle();
  if (!order || order.status !== "paid") return NextResponse.json({ error: "Pedido no disponible." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  const { data: pack } = await db.from("download_packages").select("password_ciphertext,password_nonce,password_tag").eq("order_id", orderId).maybeSingle();
  if (!pack) return NextResponse.json({ error: "La clave todavía no está disponible." }, { status: 409, headers: { "Cache-Control": "no-store" } });
  try {
    return NextResponse.json({ password: decryptPackagePassword(pack) }, { headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return NextResponse.json({ error: "No se pudo recuperar la clave." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
