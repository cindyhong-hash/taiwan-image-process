import { removeBackground } from "@/lib/fal";
import { saveBuffer } from "@/lib/storage";
import sharp from "sharp";

/**
 * [PRODUCT] 對一張商品照去背、回存乾淨 PNG 主圖，回傳其 URL。
 * best-effort：缺 FAL_KEY 或去背失敗時回 null（呼叫端自行決定是否提示重試），不丟例外。
 * 這張主圖是之後所有「實拍類」套圖的錨點，確保同一支產品外觀一致。
 */
export async function cutoutHero(imageUrl: string): Promise<string | null> {
  try {
    if (!process.env.FAL_KEY) return null;
    const cut = await removeBackground(imageUrl);
    if (!cut) return null;
    const png = await sharp(cut).png().toBuffer();
    return await saveBuffer(png, "png", "product-hero-");
  } catch (e) {
    console.warn("[product] cutoutHero failed:", e);
    return null;
  }
}
