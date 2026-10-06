import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { del, get, put } from "@vercel/blob";
import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";
import JSZip from "jszip";
import { Uint8ArrayReader, Uint8ArrayWriter, ZipWriter } from "@zip.js/zip.js";
import { supabaseService } from "@/lib/supabase/service";

function encryptSecret(plain: string) {
  const raw = process.env.DOWNLOAD_SECRET_KEY;
  if (!raw) throw new Error("Download encryption key is not configured.");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("Download encryption key must be 32 bytes.");
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return { password_ciphertext: ciphertext.toString("base64"), password_nonce: nonce.toString("base64"), password_tag: cipher.getAuthTag().toString("base64") };
}

function safeName(input: string) {
  const leaf = input.split(/[\\/]/).pop() ?? "archivo";
  return leaf.replace(/[\u0000-\u001f<>:"|?*]/g, "_").slice(0, 120) || "archivo";
}

async function personalize(bytes: Uint8Array, format: string, reference: string) {
  if (format === "pdf") {
    const pdf = await PDFDocument.load(bytes);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const mark = `FOLIO · LICENCIA PERSONAL · PEDIDO ${reference}`;
    for (const page of pdf.getPages()) {
      const { width, height } = page.getSize();
      page.drawText(mark, { x: 14, y: Math.max(20, height * 0.48), size: 10, font, color: rgb(0.43, 0.50, 0.40), opacity: 0.24, rotate: degrees(-16), maxWidth: Math.max(100, width - 28) });
    }
    return new Uint8Array(await pdf.save());
  }
  if (format === "docx") {
    const document = await JSZip.loadAsync(bytes);
    const expanded = Object.values(document.files).reduce((sum, file) => {
      const size = (file as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0;
      return sum + size;
    }, 0);
    if (expanded > 80000000) throw new Error("DOCX expands beyond the safe processing limit.");
    const xmlFile = document.file("word/document.xml");
    if (!xmlFile) throw new Error("DOCX content could not be found.");
    const xml = await xmlFile.async("string");
    const bodyTag = /<w:body(?:\s[^>]*)?>/;
    if (!bodyTag.test(xml)) throw new Error("DOCX document structure is not supported.");
    const stamp = `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="200"/></w:pPr><w:r><w:rPr><w:color w:val="718164"/><w:sz w:val="16"/></w:rPr><w:t>FOLIO · LICENCIA PERSONAL · PEDIDO ${reference}</w:t></w:r></w:p>`;
    document.file("word/document.xml", xml.replace(bodyTag, (tag) => tag + stamp));
    return await document.generateAsync({ type: "uint8array", compression: "STORE" });
  }
  return bytes;
}

export function decryptPackagePassword(row: { password_ciphertext: string; password_nonce: string; password_tag: string }) {
  const raw = process.env.DOWNLOAD_SECRET_KEY;
  if (!raw) throw new Error("Download encryption key is not configured.");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("Download encryption key must be 32 bytes.");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(row.password_nonce, "base64"));
  decipher.setAuthTag(Buffer.from(row.password_tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(row.password_ciphertext, "base64")), decipher.final()]).toString("utf8");
}

export async function fulfillPaidOrder(orderId: string) {
  const db = supabaseService();
  const { data: existing } = await db.from("download_packages").select("order_id").eq("order_id", orderId).maybeSingle();
  if (existing) return;
  const { data: order } = await db.from("orders").select("id,status,created_at").eq("id", orderId).maybeSingle();
  if (!order || order.status !== "paid") throw new Error("Paid order is unavailable for fulfillment.");
  const { data: items, error: itemsError } = await db.from("order_items").select("product_id,product_name,product_format").eq("order_id", orderId);
  if (itemsError || !items?.length || items.some((item) => !item.product_id)) throw new Error("Order items are incomplete.");
  const productIds = items.map((item) => item.product_id as string);
  const { data: assets, error: assetsError } = await db.from("product_assets").select("product_id,source_path,source_name,source_size").in("product_id", productIds);
  if (assetsError || !assets || assets.length !== productIds.length) throw new Error("A private product file is missing.");
  const maximum = Number(process.env.MAX_PACKAGE_SOURCE_BYTES ?? 25000000);
  const sourceTotal = assets.reduce((n, asset) => n + Number(asset.source_size), 0);
  if (!Number.isSafeInteger(maximum) || maximum < 1 || sourceTotal > maximum) throw new Error("Order exceeds the configured package size limit.");

  const reference = orderId.replace(/-/g, "").slice(0, 12).toUpperCase();
  const password = randomBytes(20).toString("base64url");
  const writer = new Uint8ArrayWriter();
  const zip = new ZipWriter(writer, { password, encryptionStrength: 3 });
  try {
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      const asset = assets.find((candidate) => candidate.product_id === item.product_id);
      if (!asset) throw new Error("Product source is missing.");
      const source = await get(asset.source_path, { access: "private" });
      if (!source || source.statusCode !== 200 || !source.stream) throw new Error("Private product source could not be read.");
      if (source.blob.size && source.blob.size > maximum) throw new Error("Product source exceeds the configured size limit.");
      const original = new Uint8Array(await new Response(source.stream).arrayBuffer());
      const personalized = await personalize(original, item.product_format.toLowerCase(), reference);
      await zip.add(String(index + 1).padStart(2, "0") + "-" + safeName(asset.source_name), new Uint8ArrayReader(personalized), { compressionMethod: 0 });
    }
    const license = "FOLIO DIGITAL — LICENCIA PERSONAL\nPedido: " + reference + "\nFecha: " + new Date(order.created_at).toISOString().slice(0, 10) + "\nUso individual para la persona titular de esta compra.\nNo redistribuir ni revender el archivo.\nLos PDF incluyen una marca de pedido y los DOCX un sello de licencia cuando el formato permite procesarlos.\nLos ZIP y RAR originales se conservan como archivos, dentro de este paquete cifrado.";
    await zip.add("LEEME-LICENCIA.txt", new Uint8ArrayReader(new TextEncoder().encode(license)));
    await zip.close();
    const packageBytes = await writer.getData();
    const path = "packages/" + orderId + "/" + randomBytes(10).toString("hex") + ".zip";
    await put(path, Buffer.from(packageBytes), { access: "private", addRandomSuffix: false, contentType: "application/zip", cacheControlMaxAge: 1 });
    const encrypted = encryptSecret(password);
    const { error: insertError } = await db.from("download_packages").insert({ order_id: orderId, blob_path: path, ...encrypted });
    if (insertError) {
      await del(path).catch(() => undefined);
      const { data: winner } = await db.from("download_packages").select("order_id").eq("order_id", orderId).maybeSingle();
      if (!winner) throw insertError;
    }
  } finally {
    await zip.close().catch(() => undefined);
  }
}
