import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import { join, normalize } from "path";
import type { NonSharedBuffer } from "buffer";
import { del, put } from "@vercel/blob";

export function contentTypeForExt(ext: string): string {
  const e = ext.toLowerCase();
  if (e === "png") return "image/png";
  if (e === "webp") return "image/webp";
  if (e === "gif") return "image/gif";
  return "image/jpeg";
}

export async function saveBuffer(buffer: Buffer, ext: string, prefix = "", signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted();
  const filename = `${prefix}${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(filename, buffer, {
      access: "public",
      addRandomSuffix: false,
      contentType: contentTypeForExt(ext),
      abortSignal: signal,
    });
    return blob.url;
  }

  const dir = join(process.cwd(), "public", "uploads");
  await mkdir(dir, { recursive: true });
  signal?.throwIfAborted();
  await writeFile(join(dir, filename), buffer);
  return `/uploads/${filename}`;
}

export async function loadBuffer(url: string, signal?: AbortSignal): Promise<NonSharedBuffer> {
  signal?.throwIfAborted();
  if (url.startsWith("/uploads/")) {
    const buffer = await readFile(join(process.cwd(), "public", url));
    signal?.throwIfAborted();
    return buffer;
  }
  const res = await fetch(url, { signal });
  const buffer = Buffer.from(await res.arrayBuffer());
  signal?.throwIfAborted();
  return buffer;
}

export async function deleteStoredAsset(url: string): Promise<void> {
  if (url.startsWith("/uploads/")) {
    const uploadsRoot = join(process.cwd(), "public", "uploads");
    const target = normalize(join(process.cwd(), "public", url));
    if (!target.startsWith(`${uploadsRoot}/`)) throw new Error("Refusing to delete outside uploads");
    await unlink(target).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
    return;
  }
  if (process.env.BLOB_READ_WRITE_TOKEN && /^https:\/\//.test(url)) {
    await del(url);
  }
}
