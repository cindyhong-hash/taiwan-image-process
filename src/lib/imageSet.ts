import sharp from "sharp";
import { db } from "@/lib/db";
import { falFlux2Edit, generateImage, translateBriefToEnglishPrompt, falRemoveBg } from "@/lib/generate";
import { loadBuffer, saveBuffer } from "@/lib/storage";

// [PRODUCT] AI 商品套圖：把產品的一組「可疊積木」批次生成出來。
//
// 兩條生成路徑（呼應設計決策）：
//  • path="edit"  實拍類：以去背主圖為錨點做合成/換背景（falFlux2Edit）→ 產品外觀一致
//  • path="text"  概念/背景類：純文字生圖（generateImage）→ 走品牌風格、可不含產品實拍
// cutout=true 的積木生成後再去背成透明 PNG，方便之後排版疊加。

export type SetItem = {
  role: string;                 // assetRole：hero｜texture｜background｜ingredient｜decoration
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
};
type ClientLike = { primaryColor?: string | null } | null;

// 各產品類型的場景/質地/概念描述（第一階段用規則表；未來可換 LLM 動態產生）
const CATEGORY_HINTS: Record<string, { texture: string; scene: string; concept: string }> = {
  "保養":   { texture: "精華液水潤質地微距特寫，透亮水珠光澤", scene: "明亮浴室洗手台或梳妝台使用情境", concept: "保濕水感成分抽象概念視覺，水潤透亮" },
  "彩妝":   { texture: "膏體或粉質細膩質地特寫，柔滑光澤",   scene: "時尚梳妝台使用情境",           concept: "顯色與妝感概念視覺，細緻光影" },
  "香氛":   { texture: "香氛質地與煙霧感特寫",               scene: "溫暖居家氛圍情境",             concept: "香調意象抽象概念視覺" },
  "3C 電子": { texture: "material 材質金屬與螢幕細節特寫",     scene: "現代簡約桌面使用情境",         concept: "科技功能特色概念視覺，俐落線條" },
  "食品飲料": { texture: "食材新鮮質地特寫，誘人光澤",         scene: "餐桌或廚房情境擺盤",           concept: "新鮮原料與風味概念視覺" },
  "服飾配件": { texture: "布料材質紋理特寫",                   scene: "生活穿搭情境",                 concept: "風格質感概念視覺" },
  "居家生活": { texture: "材質細節特寫",                       scene: "溫馨居家使用情境",             concept: "生活風格概念視覺" },
  default:   { texture: "產品質地與內容物微距特寫",           scene: "簡潔生活使用情境",             concept: "產品功效概念抽象視覺" },
};

/** 依產品類型 + 品牌，建議一組套圖積木（第一階段：規則表 + 品類模板）。 */
export function buildImageSetSuggestions(product: ProductLike, client: ClientLike): SetItem[] {
  const hint = CATEGORY_HINTS[product.category ?? ""] ?? CATEGORY_HINTS.default;
  const brandColor = product.primaryColorOverride || client?.primaryColor || "";
  const colorLine = brandColor ? `，主色調 ${brandColor}` : "";
  const name = product.name;
  return [
    { role: "hero",        label: "主視覺",        path: "edit", cutout: false, sceneCn: `乾淨純色背景棚拍主視覺，突出${name}，柔和光影、專業產品攝影${colorLine}` },
    { role: "texture",     label: "質地特寫",      path: "edit", cutout: false, sceneCn: `${hint.texture}${colorLine}` },
    { role: "background",  label: "情境背景版",    path: "text", cutout: false, sceneCn: `${hint.scene}空景，畫面刻意留白供之後放置產品與文字，不出現任何產品${colorLine}` },
    { role: "ingredient",  label: "成分／功效概念", path: "text", cutout: false, sceneCn: `${hint.concept}${colorLine}` },
    { role: "decoration",  label: "裝飾元素",      path: "text", cutout: true,  sceneCn: `簡約裝飾點綴元素（光點、水珠、細緻線條），乾淨純色背景以便去背疊加` },
  ];
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
