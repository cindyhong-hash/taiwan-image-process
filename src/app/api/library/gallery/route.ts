import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Never statically cache this handler — gallery contents change on every edit/save/delete.
export const dynamic = "force-dynamic";

/**
 * GET /api/library/gallery?clientId=...
 * The brand image gallery for the merged 風格組件 tab — a union of:
 *   • "uploaded"  — analyzed images (StyleComponent.previewUrl), grouped by url
 *   • "generated" — library-generated images (LibraryImage rows)
 * Sorted newest first.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("clientId");
  const unassigned = searchParams.get("unassigned") === "1"; // 未分組：clientId 為 null 嘅素材

  // ── Generated library images ── (fetch first so we can exclude their URLs from uploaded)
  const gens = await db.libraryImage.findMany({
    where: clientId ? { clientId } : unassigned ? { clientId: null } : undefined,
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  // Exclude previewUrls that are already a generated image URL (to prevent analysed generated
  // images from appearing twice — once as AI生成, once as 上傳).
  const genUrls = new Set(gens.map((g) => g.imageUrl));

  // ── Uploaded analyzed images (components that carry a previewUrl) ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const compWhere: Record<string, any> = { previewUrl: { not: null } };
  if (clientId) compWhere.clientId = clientId;
  else if (unassigned) compWhere.clientId = null;

  const comps = await db.styleComponent.findMany({
    where: compWhere,
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  const uploadedMap = new Map<
    string,
    { imageUrl: string; types: string[]; componentIds: string[]; createdAt: Date; name: string; aiPromptText: string; mode: string | null }
  >();
  for (const c of comps) {
    const u = c.previewUrl!;
    if (genUrls.has(u)) continue; // skip: this image is already a LibraryImage (AI生成)
    const entry =
      uploadedMap.get(u) ?? { imageUrl: u, types: [], componentIds: [], createdAt: c.createdAt, name: c.name, aiPromptText: c.aiPromptText ?? "", mode: null };
    if (!entry.types.includes(c.type)) entry.types.push(c.type);
    entry.componentIds.push(c.id);
    // The group's representative name + sort time follow the most-recently-edited component.
    if (c.createdAt >= entry.createdAt) {
      entry.createdAt = c.createdAt; entry.name = c.name;
      if (c.aiPromptText) entry.aiPromptText = c.aiPromptText;
    }
    // Extract mode from data JSON (stored by GenerateAssetModal for AI-generated backgrounds).
    if (!entry.mode) {
      try { const d = JSON.parse(c.data ?? "{}"); if (d.mode) entry.mode = d.mode; } catch { /* ignore */ }
    }
    uploadedMap.set(u, entry);
  }

  const items = [
    ...[...uploadedMap.values()].map((e) => {
      // A group whose ONLY type is BACKGROUND = 背景素材 (material); otherwise = 上傳 (analysed image).
      const isMaterial = e.types.length > 0 && e.types.every((t) => t === "BACKGROUND");
      return {
        kind: (isMaterial ? "material" : "uploaded") as "material" | "uploaded",
        imageUrl: e.imageUrl,
        types: e.types,
        componentIds: e.componentIds,
        name: e.name,
        createdAt: e.createdAt,
        ...(isMaterial && { aiPromptText: e.aiPromptText || undefined, mode: e.mode || undefined }),
      };
    }),
    ...gens.map((g) => ({
      kind: "generated" as const,
      imageUrl: g.imageUrl,
      libraryImageId: g.id,
      copyText: g.copyText,
      subject: g.subject,
      paramsJson: g.paramsJson,
      prompt: g.prompt,
      createdAt: g.createdAt,
    })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return NextResponse.json(items);
}
