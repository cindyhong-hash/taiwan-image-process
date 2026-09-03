import sharp from "sharp";
import { db } from "@/lib/db";
import { falFlux2Edit, generateImage, translateBriefToEnglishPrompt, falRemoveBg } from "@/lib/generate";
import { loadBuffer, saveBuffer } from "@/lib/storage";
import { buildImageSetArtDirection, type ImageSetArtDirection } from "@/lib/products/product-visual-analysis";
import { fallbackProductVisualProfile, type ProductVisualProfile } from "@/lib/products/product-visual-profile";
import { planImageSetRoles, type ImageSetRole } from "@/lib/products/image-set-roles";

export type { ImageSetArtDirection } from "@/lib/products/product-visual-analysis";
export type { ProductVisualProfile } from "@/lib/products/product-visual-profile";
export type { ImageSetRole, ImageSetRoleSpec } from "@/lib/products/image-set-roles";

// [PRODUCT] AI 商品套圖：把產品的一組「可疊積木」批次生成出來。
//
// 兩條生成路徑（呼應設計決策）：
//  • path="edit"  實拍類：以去背主圖為錨點做合成/換背景（falFlux2Edit）→ 產品外觀一致
//  • path="text"  概念/背景類：純文字生圖（generateImage）→ 走品牌風格、可不含產品實拍
// cutout=true 的積木生成後再去背成透明 PNG，方便之後排版疊加。

export type SetItem = {
  role: ImageSetRole;
  label: string;                // 使用者可見名稱
  path: "edit" | "text";
  cutout: boolean;
  sceneCn: string;              // 中文場景描述（生成前翻成英文）
};

type ProductLike = {
  id: string;
  clientId: string;
  name: string;
  category: string | null;
  primaryColorOverride: string | null;
  heroImageUrl: string | null;
  description?: string | null;
};
type ClientLike = { primaryColor?: string | null } | null;

export type ImageSetSuggestionInputs = {
  profile?: ProductVisualProfile;
  artDirection?: ImageSetArtDirection;
};

/** 依產品類型 + 品牌，建議一組套圖積木（第一階段：規則表 + 品類模板）。 */
export function buildImageSetSuggestions(
  product: ProductLike,
  client: ClientLike,
  inputs: ImageSetSuggestionInputs = {},
): SetItem[] {
  const profile = inputs.profile ?? fallbackProductVisualProfile(product);
  const artDirection = inputs.artDirection ?? buildImageSetArtDirection(profile, {
    primaryColor: product.primaryColorOverride || client?.primaryColor,
  });
  void artDirection;

  return planImageSetRoles(profile).map(({ role, label, path, cutout, sceneCn }) => ({
    role,
    label,
    path,
    cutout,
    sceneCn,
  }));
}

async function toDataUri(buf: Buffer | Uint8Array, max = 2048): Promise<string> {
  const png = await sharp(buf).resize(max, max, { fit: "inside", withoutEnlargement: true }).png().toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}

/** 生成單一套圖積木，並把結果寫回它的 LibraryImage 記錄（DONE/FAILED）。 */
export async function generateImageSetItem(
  rowId: string,
  product: ProductLike,
  client: ClientLike,
  item: SetItem,
): Promise<void> {
  try {
    const sceneEn = await translateBriefToEnglishPrompt(item.sceneCn);

    let out: Buffer;
    let contentType = "image/png";
    if (item.path === "edit") {
      if (!product.heroImageUrl) throw new Error("需要去背主圖作為錨點");
      const heroBuf = await loadBuffer(product.heroImageUrl);
      const heroUri = await toDataUri(heroBuf);
      const img = await falFlux2Edit({ productDataUris: [heroUri], sceneDescription: sceneEn, aspectRatio: "1:1" });
      out = img.buffer;
      contentType = img.contentType;
    } else {
      const img = await generateImage({ prompt: sceneEn, width: 1024, height: 1024 });
      out = img.buffer;
      contentType = img.contentType;
    }

    if (item.cutout) {
      const cut = await falRemoveBg(await toDataUri(out));
      out = await sharp(cut).png().toBuffer();
      contentType = "image/png";
    }

    const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
    const imageUrl = await saveBuffer(out, ext, "product-set-");
    await db.libraryImage.update({
      where: { id: rowId },
      data: { status: "DONE", imageUrl, prompt: `[套圖·${item.label}] ${item.sceneCn}` },
    });
    void client; // 品牌 context 已折入 sceneCn（主色）；保留參數供未來擴充語氣/禁忌
  } catch (e) {
    await db.libraryImage.update({
      where: { id: rowId },
      data: { status: "FAILED", errorMessage: (e instanceof Error ? e.message : String(e)).slice(0, 500) },
    }).catch(() => {});
  }
}
