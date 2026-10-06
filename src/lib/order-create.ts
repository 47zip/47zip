import "server-only";
import { z } from "zod";
import { supabaseService } from "@/lib/supabase/service";

export const checkoutSchema = z.object({ productIds: z.array(z.string().uuid()).min(1).max(12) }).strict();

export async function createPendingOrder(userId: string, provider: "paypal" | "nowpayments", productIds: string[]) {
  if (new Set(productIds).size !== productIds.length) throw new Error("Duplicate products.");
  const db = supabaseService();
  const { data: products, error } = await db.from("products").select("id,name,format,price_mxn_cents").in("id", productIds).eq("published", true);
  if (error || !products || products.length !== productIds.length) throw new Error("Product is not available.");
  const ordered = productIds.map((id) => products.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => Boolean(p));
  const { data: assets, error: assetError } = await db.from("product_assets").select("product_id,source_size").in("product_id", productIds);
  if (assetError || !assets || assets.length !== productIds.length) throw new Error("Product file is unavailable.");
  const maximum = Number(process.env.MAX_PACKAGE_SOURCE_BYTES ?? 25000000);
  const sourceTotal = (assets ?? []).reduce((sum, asset) => sum + Number(asset.source_size), 0);
  if (!Number.isSafeInteger(maximum) || maximum < 1 || sourceTotal > maximum) throw new Error("The selected files exceed the package size limit.");
  const total = ordered.reduce((sum, product) => sum + product.price_mxn_cents, 0);
  if (!Number.isSafeInteger(total) || total < 1 || total > 100000000) throw new Error("Invalid order total.");
  const { data: order, error: orderError } = await db.from("orders").insert({
    user_id: userId, status: "pending", provider, currency: "MXN", amount_mxn_cents: total,
  }).select("id").single();
  if (orderError || !order) throw new Error("Could not create order.");
  const lines = ordered.map((product) => ({
    order_id: order.id, product_id: product.id, product_name: product.name,
    product_format: product.format, unit_price_mxn_cents: product.price_mxn_cents,
  }));
  const { error: linesError } = await db.from("order_items").insert(lines);
  if (linesError) {
    await db.from("orders").delete().eq("id", order.id);
    throw new Error("Could not create order items.");
  }
  return { orderId: order.id, amount: total / 100, products: ordered };
}



