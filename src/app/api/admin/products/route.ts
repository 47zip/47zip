import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { authorizeAdminApi } from "@/lib/admin";
import { supabaseService } from "@/lib/supabase/service";

const schema = z.object({
  name: z.string().trim().min(3).max(100),
  description: z.string().trim().max(800).default(""),
  category: z.string().trim().min(2).max(50),
  format: z.enum(["pdf","docx","zip","rar"]),
  priceMxnCents: z.number().int().positive().max(10000000),
}).strict();

export async function GET() {
  const auth = await authorizeAdminApi();
  if (!auth.allowed) return NextResponse.json({ error: "No autorizado." }, { status: auth.reason === "auth" ? 401 : 403 });
  const { data, error } = await supabaseService().from("products").select("id,name,category,format,price_mxn_cents,published,created_at,product_assets(source_name,source_size)").order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "No se pudieron cargar productos." }, { status: 503 });
  return NextResponse.json({ products: data }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const auth = await authorizeAdminApi();
  if (!auth.allowed) return NextResponse.json({ error: "No autorizado." }, { status: auth.reason === "auth" ? 401 : 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Revisa los datos del producto." }, { status: 400 });
  const db = supabaseService();
  const baseSlug = parsed.data.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 55);
  const slug = (baseSlug || "recurso") + "-" + randomBytes(3).toString("hex");
  const { data, error } = await db.from("products").insert({
    slug, name: parsed.data.name, description: parsed.data.description, category: parsed.data.category,
    format: parsed.data.format, price_mxn_cents: parsed.data.priceMxnCents, published: false,
  }).select("id,name,format").single();
  if (error || !data) return NextResponse.json({ error: "No se pudo crear el producto." }, { status: 503 });
  return NextResponse.json({ product: data }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
