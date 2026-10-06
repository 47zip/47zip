import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeAdminApi } from "@/lib/admin";
import { supabaseService } from "@/lib/supabase/service";

const uploadPayload = z.object({
  productId: z.string().uuid(),
  name: z.string().min(1).max(150),
  size: z.number().int().positive(),
  format: z.enum(["pdf", "docx", "zip", "rar"]),
});
const callbackPayload = uploadPayload.extend({ userId: z.string().uuid() });
const extensions: Record<string, string> = { pdf: ".pdf", docx: ".docx", zip: ".zip", rar: ".rar" };
const contentTypes = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/zip",
  "application/x-zip-compressed",
  "application/vnd.rar",
  "application/x-rar-compressed",
];

export async function POST(request: Request) {
  try {
    const body = await request.json() as HandleUploadBody;
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const auth = await authorizeAdminApi();
        if (!auth.allowed) throw new Error("No autorizado.");
        const payload = uploadPayload.parse(JSON.parse(clientPayload ?? "{}"));
        const max = Number(process.env.MAX_PACKAGE_SOURCE_BYTES ?? 25000000);
        const name = payload.name.split(/[\\/]/).pop() ?? "";
        if (!Number.isSafeInteger(max) || max < 1 || payload.size > max || !name.toLowerCase().endsWith(extensions[payload.format])) {
          throw new Error("Archivo no válido o demasiado grande.");
        }
        if (pathname !== "products/" + payload.productId + "/" + name) throw new Error("Ruta de carga no válida.");
        const { data: product } = await supabaseService()
          .from("products")
          .select("id,format,published")
          .eq("id", payload.productId)
          .maybeSingle();
        if (!product || product.published || product.format !== payload.format) throw new Error("Producto no disponible.");
        return {
          allowedContentTypes: contentTypes,
          maximumSizeInBytes: max,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ ...payload, userId: auth.user.id }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const saved = callbackPayload.safeParse(JSON.parse(tokenPayload ?? "{}"));
        if (!saved.success) throw new Error("Carga no asociada a un producto.");
        const max = Number(process.env.MAX_PACKAGE_SOURCE_BYTES ?? 25000000);
        const prefix = "products/" + saved.data.productId + "/";
        const size = Number(blob.size ?? saved.data.size);
        if (!Number.isSafeInteger(max) || max < 1 || size < 1 || size > max ||
            !blob.pathname.startsWith(prefix) ||
            !blob.pathname.toLowerCase().endsWith(extensions[saved.data.format])) {
          throw new Error("Archivo cargado no válido.");
        }

        const db = supabaseService();
        const { data: uploader } = await db
          .from("user_roles")
          .select("role")
          .eq("user_id", saved.data.userId)
          .maybeSingle();
        if (uploader?.role !== "admin") throw new Error("La cuenta administradora ya no está habilitada.");

        const { data: product } = await db
          .from("products")
          .select("id,format,published")
          .eq("id", saved.data.productId)
          .maybeSingle();
        if (!product || product.published || product.format !== saved.data.format) throw new Error("Producto no disponible.");

        const { error } = await db.from("product_assets").upsert({
          product_id: saved.data.productId,
          source_path: blob.pathname,
          source_name: saved.data.name,
          source_size: size,
        });
        if (error) throw new Error("No se pudo asociar el archivo.");
        const { error: publishError } = await db
          .from("products")
          .update({ published: true })
          .eq("id", saved.data.productId);
        if (publishError) throw new Error("No se pudo publicar el producto.");
      },
    });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "No se pudo autorizar o completar la carga." }, { status: 400 });
  }
}
