import { NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const { data, error } = await supabaseService()
      .from("products")
      .select("id,name,description,category,format,price_mxn_cents")
      .eq("published", true)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ products: data ?? [] }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch {
    return NextResponse.json({ error: "El catálogo todavía no está configurado." }, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
