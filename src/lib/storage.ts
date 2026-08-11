import { mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
import type { NonSharedBuffer } from "buffer";
import { put } from "@vercel/blob";

export function contentTypeForExt(ext: string): string {
  const e = ext.toLowerCase();
  if (e === "png") return "image/png";
  if (e === "webp") return "image/webp";
  if (e === "gif") return "image/gif";
  return "image/jpeg";
}

export async function saveBuffer(buffer: Buffer, ext: string, prefix = ""): Promise<string> {
  const filename = `${prefix}${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(filename, buffer, {
      access: "public",
      addRandomSuffix: false,
      contentType: contentTypeForExt(ext),
    });
    return blob.url;
  }

  const dir = join(process.cwd(), "public", "uploads");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, filename), buffer);
  return `/uploads/${filename}`;
}

export async function loadBuffer(url: string): Promise<NonSharedBuffer> {
  if (url.startsWith("/uploads/")) {
    return readFile(join(process.cwd(), "public", url));
  }
  const res = await fetch(url);
  return Buffer.from(await res.arrayBuffer());
}
