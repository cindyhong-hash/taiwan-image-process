import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { anthropic } from "@/lib/anthropic";
import { generateImageFal, generateImageFluxSchnell, describeStyle, describeProduct, removeBackground } from "@/lib/fal";
import { generateImageOpenRouter } from "@/lib/openrouter";
import { compositeCollage, overlaySubImageCard, overlayProduct, extractDominantColor, sampleCornerBusyness, sampleRegionBusynessByZone, type SubCardVariant } from "@/lib/composite-multi";
import { buildImagePrompt } from "@/lib/prompts";
import { getMultiLayout, getCellRects } from "@/types/multiLayout";
import { generateGlobalDesignSpec, designSpecPromptBlock, type GlobalDesignSpec } from "@/lib/multi/design-spec";
import { generateFramePlans, type FramePlan } from "@/lib/multi/frame-planner";
import { buildMultiImagePrompt, type LockBlocks } from "@/lib/multi/prompt-builder";
import { VARIANT_STYLE } from "@/lib/multi/variant-style";
import { pickVisualTemplate, visualTemplatePromptBlock } from "@/lib/multi/visual-template-selector";

// 各圖獨立模式 B 組：內容＋色調＋人物都相同，只換「文字排版/底框/構圖角度」（附加在每格圖片 prompt 末尾）
const VARIANT_B_STYLE_SUFFIX =
  "VARIANT B — keep the EXACT SAME color palette, warm tones, person appearance, product, and lighting mood as Variant A. " +
  "ONLY change: text layout position (e.g. move headline to bottom-right instead of top-left), " +
  "text container style (e.g. use a different frame/box shape), " +
  "and slight composition crop or framing shift. " +
  "Color temperature, skin tone, background warmth, and overall visual feel must remain IDENTICAL to Variant A.";

// 字體鎖定：整組最多 2 種字體（FONT A 標題粗黑體 / FONT B 內文細體），禁止襯線/手寫/裝飾字
const TYPOGRAPHY_LOCK = `🔒 TYPOGRAPHY CONSISTENCY LOCK — STRICTEST RULE, VIOLATING THIS IS A CRITICAL FAILURE:
This carousel must use EXACTLY 2 typeface roles throughout ALL cells, no exceptions:
- ROLE 1 (Headline font): used ONLY for headlines/titles, in every single cell, no exceptions.
- ROLE 2 (Body font): used ONLY for subtitles, descriptions, captions, badge labels, fine print — in every single cell, no exceptions.
The ACTUAL typeface choice for each role (serif/宋體, sans-serif/黑體, or any other style) is established by CELL 1 (the hero image) and is NOT fixed in advance — but once CELL 1 establishes which typeface is ROLE 1 and which is ROLE 2, EVERY subsequent cell (2, 3, 4, 5...) MUST reuse the EXACT SAME two typefaces for the exact same roles.
FORBIDDEN: switching ROLE 1's typeface between cells (e.g. cell 2 headline in bold sans-serif, cell 3 headline in serif — this is a violation even if each individual cell looks fine on its own). FORBIDDEN: introducing a third typeface anywhere, in any cell.
Mixing serif and sans-serif WITHIN one cell IS allowed (e.g. serif headline + sans-serif body in the same image), as long as that exact same pairing repeats identically in every other cell.`;

/** 徽章標籤：只有當文案本身夠短（像標籤）時才用；長句一律不做徽章，避免截成殘句（如「生活值得被溫」）。 */
function inferBadgeLabel(text: string): string {
  const t = (text || "").replace(/[，。！？、,.!?\s]/g, "");
  return t.length <= 5 ? t : "";
}

/** 穩定字串雜湊（用於副圖版型輪換，讓不同活動分散到不同版型） */
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** 把本地 /uploads 圖檔（或遠端 url）轉成 Claude Vision 可用的 base64 image part */
async function toVisionImagePart(url: string): Promise<
  | { type: "image"; source: { type: "base64"; media_type: "image/jpeg" | "image/png" | "image/webp" | "image/gif"; data: string } }
  | null
> {
  try {
    let buf: Buffer;
    let mime = "image/jpeg";
    if (url.startsWith("/")) {
      const { readFile } = await import("fs/promises");
      const { join } = await import("path");
      buf = await readFile(join(process.cwd(), "public", url));
      if (url.endsWith(".png")) mime = "image/png";
      else if (url.endsWith(".webp")) mime = "image/webp";
    } else {
      const res = await fetch(url);
      buf = Buffer.from(await res.arrayBuffer());
      mime = res.headers.get("content-type") || "image/jpeg";
    }
    return {
      type: "image",
      source: {
        type: "base64",
        media_type: mime as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
        data: buf.toString("base64"),
      },
    };
  } catch {
    return null;
  }
}

// 副圖版型輪換池：只用「文字在獨立區塊、與照片分開」的版型（白卡／分割），
// 確保 (1) 文字/框永遠不會遮到照片裡的產品或人，(2) 次要文字一定在可讀的白底內、不會被裁一半。
// 「文字直接疊在照片上」的版型（badge-top-left / banner-bottom / side-accent / minimal-top / gradient-bottom）
// 因為會蓋到主體、且壓字可讀性差，已排除在輪換之外（renderer 仍保留，未來要用可再加回）。
// 副圖輪換池：只放「結構上安全」的版型——照片內縮進卡片、或滿版但上方預留文字區 → 不會壓到主體。
// 純文字疊照片的 5 種（badge-top-left/banner-bottom/side-accent/minimal-top/gradient-bottom）會蓋到人，
// renderer 仍保留但不放進輪換。
const ALL_SUB_VARIANTS = [
  "photo-full-top-text",     // 滿版照片＋上方預留文字
  "photo-caption-pill", "card-price-bottom", "card-badge-straddle",
  "title-top-caption-bottom", "split-left-text", "ribbon-top-card", "corner-label-card",
  "ribbon-tab-card", "diagonal-ribbon-card", "minimal-top-label-card",
  "speech-bubble-price",
] as const;

// 「疊字型」版型：文字直接疊在滿版照片上。為避免壓到主體，改用「預防」策略——
// 生背景圖時就叫 AI 把該版型的文字區留成乾淨空景、主體閃到別處（而非事後靠忙碌度偵測猜測）。
// 每個 key 對應一段構圖指令，會附加到副圖生圖 prompt。白卡型/對話框型不在此表 → 用置中構圖。
const OVERLAY_RESERVE_ZONE: Partial<Record<SubCardVariant, string>> = {
  "photo-full-top-text": "Leave the TOP ~42% of the frame as clean, calm, softly-lit background (no product, no person, no busy detail) — this space is reserved for a text header. Keep the main subject in the lower portion, well clear of the top.",
  "badge-top-left": "Leave the TOP-LEFT ~45% of the frame as clean, empty, softly-lit negative space (no product, no person, no clutter) — this area is reserved for a text label. Place the main subject in the lower-right, fully clear of the top-left.",
  "minimal-top": "Leave the TOP ~35% of the frame as clean, empty negative space (no product, no person) — reserved for a text header. Keep the main subject in the lower two-thirds.",
  "banner-bottom": "Leave the BOTTOM ~35% of the frame as clean, empty negative space (no product, no person) — reserved for a text banner. Keep the main subject in the upper two-thirds.",
  "gradient-bottom": "Leave the BOTTOM ~40% of the frame as calm, uncluttered background — reserved for text over a gradient. Keep the main subject in the upper portion.",
  "side-accent": "Leave the LEFT ~45% of the frame as clean, empty negative space — reserved for a text panel. Place the main subject on the right side.",
};
const CENTERED_COMPOSITION = "Keep the main subject well-centered with comfortable margin on every side (it will be placed inside a card frame); do not push the subject to the edges.";

/** 判斷每張產品圖是否為「刮鬍刀/剃刀類」（複雜金屬幾何，AI 難重畫→改真圖合成）。回傳需合成的 index 陣列。 */
async function classifyRazorProducts(urls: string[]): Promise<number[]> {
  const results = await Promise.all(urls.map(async (u, idx) => {
    const img = await toVisionImagePart(u);
    if (!img) return null;
    try {
      const res = await anthropic.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 10,
        messages: [{
          role: "user",
          content: [
            img,
            { type: "text", text: "這張產品圖是「刮鬍刀 / 剃刀 / 除毛刀（有刀頭、金屬刀片、握把的裝置）」，還是「瓶罐 / 軟管 / 盒裝之類的簡單容器」？只回一個字：razor 或 bottle。" },
          ],
        }],
      });
      const raw = ((res.content[0] as { text?: string })?.text ?? "").toLowerCase();
      return raw.includes("razor") ? idx : null;
    } catch {
      return null;
    }
  }));
  return results.filter((v): v is number => v !== null);
}

/** 這個場景適不適合放一支刮鬍刀？（避免把刀貼到臉部特寫/純肌膚特寫上）。失敗預設 true 不擋流程。 */
async function sceneSuitsRazor(sceneUrl: string): Promise<boolean> {
  const img = await toVisionImagePart(sceneUrl);
  if (!img) return true;
  try {
    const res = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 10,
      messages: [{
        role: "user",
        content: [
          img,
          { type: "text", text: "這個場景是否有一個乾淨的檯面或空間，適合擺放一支刮鬍刀當商品展示（而不是人臉特寫、肌膚大特寫或完全沒有平面的畫面）？只回 yes 或 no。" },
        ],
      }],
    });
    const raw = ((res.content[0] as { text?: string })?.text ?? "").toLowerCase();
    return !raw.includes("no");
  } catch {
    return true;
  }
}

// ── 品牌過往貼文風格分析（多張取最具代表性描述）────────────────────────────
async function analyzeBrandStyle(pastPostUrls: string[]): Promise<string | null> {
  if (!pastPostUrls.length) return null;
  // 最多分析前 2 張，避免太慢
  const toAnalyze = pastPostUrls.slice(0, 2);
  const descs = await Promise.all(toAnalyze.map((url) => describeStyle(url)));
  const valid = descs.filter(Boolean) as string[];
  if (!valid.length) return null;

  // 如果有多張，用 Claude 合併成一段風格指南
  if (valid.length === 1) return valid[0];

  const res = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 200,
    messages: [{
      role: "user",
      content: `Below are visual style descriptions of a brand's past posts. Synthesize them into ONE concise brand visual style guide (2-3 sentences) for an image generation AI. English only.\n\n${valid.map((d, i) => `Post ${i + 1}: ${d}`).join("\n")}`,
    }],
  });
  return (res.content[0] as { text: string }).text.trim();
}

export const maxDuration = 180;

/**
 * 多圖拼版生成：storyboard → 逐格生成 → 拼版 → 建立 GeneratedLayout。
 * 從舊版 generate route 的 `if (multiLayoutId !== "single")` 分支抽出，改接目前 repo 的模組。
 */
export async function generateMulti(activityId: string): Promise<NextResponse> {
  const activity = await db.activity.findUnique({
    where: { id: activityId },
    include: { client: true },
  });
  if (!activity) {
    return NextResponse.json({ error: "Activity not found" }, { status: 404 });
  }

  await db.activity.update({ where: { id: activityId }, data: { status: "GENERATING", errorMessage: null } });

  const { client } = activity;

  try {
    // ── JSON 防呆解析 ──────────────────────────────────────────────────────────
    const toneLabels: string[]      = client.toneLabels        ? JSON.parse(client.toneLabels)        : [];
    const pastPostUrls: string[]    = client.pastPostImageUrls ? JSON.parse(client.pastPostImageUrls) : [];
    const refImageUrls: string[]    = activity.referenceImageUrls  ? JSON.parse(activity.referenceImageUrls)  : [];
    const productImageUrls: string[]= activity.productImageUrls    ? JSON.parse(activity.productImageUrls)    : [];

    // ── 品牌風格分析（在迴圈外只跑一次）──────────────────────────────────────
    // 優先：活動參考圖 → 其次：品牌過往貼文
    let brandStyleGuide: string | null = null;
    if (refImageUrls.length > 0) {
      console.log("[generate] Analysing activity style reference…");
      brandStyleGuide = await describeStyle(refImageUrls[0]);
    } else if (pastPostUrls.length > 0) {
      console.log("[generate] Analysing brand past posts for style guide…");
      brandStyleGuide = await analyzeBrandStyle(pastPostUrls);
    }
    if (brandStyleGuide) {
      console.log("[generate] Brand style guide:", brandStyleGuide.slice(0, 100));
    }

    // ══ 多圖分支：layoutId !== "single" → 逐格生成 + 拼版 ══
    const multiLayoutId = activity.layoutId || "single";
    const ml = getMultiLayout(multiLayoutId);
    const ratio = activity.imageRatio ?? "1:1";
    const imageModel = activity.imageModel || "google/gemini-3-pro-image-preview";
    const isFal = imageModel.startsWith("fal-ai/");
    const useOR = !isFal && !!process.env.OPENROUTER_API_KEY;

    // 0. 產品描述（與單圖邏輯對齊）：供分鏡文案準確 + 注入視覺系統
    let multiProductDesc: string | null = null;
    if (productImageUrls.length > 0) {
      const descs = await Promise.all(
        productImageUrls.slice(0, 3).map(url => describeProduct(url))
      );
      const valid = descs.filter(Boolean) as string[];
      if (valid.length === 1) {
        multiProductDesc = valid[0];
      } else if (valid.length > 1) {
        multiProductDesc = valid.map((d, i) => `Product ${i + 1}: ${d}`).join(" ");
      }
      console.log(`[generate][multi] Product desc: ${multiProductDesc?.slice(0, 100)}`);
    }

    // 0.5 產品「真圖合成」開關（預設關閉）：
    //   關閉時＝全部交給 Gemini 重畫（與單圖同一套流程，場景自然），保留已修好的精準度改善。
    //   開啟時＝主圖貼全部去背真圖、副圖貼去背刮鬍刀（像素級精準，但會有「貼上去」感）。
    //   想切回真圖合成把這行改成 true 即可。
    const ENABLE_REAL_PRODUCT_COMPOSITE = false;

    let productCleanBufs: (Buffer | null)[] = [];  // 每張上傳產品的去背 PNG（整組共用）
    let razorCleanBuf: Buffer | null = null;        // 刮鬍刀去背（副圖用）
    let aiDrawProductUrls: string[] = productImageUrls;  // 副圖交給 Gemini 重畫的產品（排除刀類）
    if (ENABLE_REAL_PRODUCT_COMPOSITE && productImageUrls.length > 0) {
      try {
        const razorIdx = await classifyRazorProducts(productImageUrls);
        const razorSet = new Set(razorIdx);
        aiDrawProductUrls = productImageUrls.filter((_, i) => !razorSet.has(i));
        productCleanBufs = await Promise.all(
          productImageUrls.map((u) => removeBackground(u).catch(() => null)),
        );
        if (razorIdx.length > 0) razorCleanBuf = productCleanBufs[razorIdx[0]] ?? null;
        console.log(`[generate][multi] product composite: bgRemoved=${JSON.stringify(productCleanBufs.map((b) => !!b))} razorIdx=${JSON.stringify(razorIdx)} aiDraw=${aiDrawProductUrls.length}`);
      } catch (e) {
        console.warn("[generate][multi] product classification/removeBg failed, fallback to all-AI:", e);
        productCleanBufs = [];
        razorCleanBuf = null;
        aiDrawProductUrls = productImageUrls;
      }
    }
    const useProductComposite = productCleanBufs.some(Boolean);  // hero 全產品真圖合成
    const useRazorComposite = !!razorCleanBuf;                    // 副圖刀真圖合成

    // 1. 取得分鏡「組」：perCell=1組；unified+2組=A導購/B敘事；unified+1組=設計總監單組
    type CellIn = {
      description: string; mustText: string; assetUrls: string[];
      subtitle?: string; container_style?: string; composition_hint?: string; tag?: string;
    };
    type GenSet = { cellData: CellIn[]; label: string; stylePromptSuffix?: string; globalSpec?: GlobalDesignSpec; framePlans?: FramePlan[];
      visualTemplateBlock?: string; visualTemplateCard?: SubCardVariant; visualTemplateName?: string; visualTemplateFullBleed?: boolean };
    const stored: CellIn[] = activity.cells ? JSON.parse(activity.cells) : [];
    const userMustText = (activity.titleText || activity.focusPoint || "").trim();
    const count = ml?.count ?? 1;

    type ParsedCell = { description?: string; mustText?: string; subtitle?: string; container_style?: string; composition_hint?: string; tag?: string };
    const buildCells = (parsed: ParsedCell[]): CellIn[] => Array.from({ length: count }, (_, i) => ({
      description: parsed[i]?.description ?? (activity.imagePrompt || activity.theme),
      mustText: i === 0 && userMustText ? userMustText : (parsed[i]?.mustText ?? ""),
      subtitle: parsed[i]?.subtitle ?? "",
      container_style: parsed[i]?.container_style ?? "",
      composition_hint: parsed[i]?.composition_hint ?? "",
      tag: parsed[i]?.tag ?? "",
      assetUrls: productImageUrls,
    }));

    const cellsFromPlans = (plans: FramePlan[]): CellIn[] => plans.map((p, i) => ({
      description: `${p.action}. ${p.composition}. (camera: ${p.camera}; emotion: ${p.emotion})`,
      mustText: i === 0 && userMustText ? userMustText : (p.copy.headline ?? ""),
      subtitle: p.copy.caption ?? "",
      container_style: "", composition_hint: p.composition, tag: "",
      assetUrls: productImageUrls,
    }));

    let sets: GenSet[] = [];
    if (activity.genMode === "perCell" && stored.length > 0) {
      // 各圖獨立：2 組＝內容完全相同，B 組只在每格 prompt 附加「換設計風格」修飾詞
      if (activity.variantCount === 2) {
        sets = [
          { cellData: stored, label: "A 原版", stylePromptSuffix: "" },
          { cellData: stored, label: "B 換設計", stylePromptSuffix: VARIANT_B_STYLE_SUFFIX },
        ];
      } else {
        // [MULTI] 暫時關閉同時生成 2 組（Vercel Hobby 逾時風險）→ 用 variantChoice 揀單組要 A 定 B
        const wantB = activity.variantChoice === "B";
        sets = [{
          cellData: stored, label: wantB ? "B 換設計" : "",
          stylePromptSuffix: wantB ? VARIANT_B_STYLE_SUFFIX : "",
        }];
      }
    } else if (activity.variantCount === 2) {
      // 兩組：A 導購 + B 敘事（frame-planner 產生分鏡＋文案，取代 storyboardPrompt2）
      const [A, B] = await Promise.all([
        generateFramePlans({
          theme: activity.imagePrompt || activity.theme, n: count,
          productDesc: multiProductDesc || undefined, variant: "A",
          userHeadline: userMustText || undefined,
        }),
        generateFramePlans({
          theme: activity.imagePrompt || activity.theme, n: count,
          productDesc: multiProductDesc || undefined, variant: "B",
          userHeadline: userMustText || undefined,
        }),
      ]);
      sets = [
        { cellData: cellsFromPlans(A), label: "A 導購版", framePlans: A },
        { cellData: cellsFromPlans(B), label: "B 敘事版", framePlans: B },
      ];
      console.log(`[generate][multi] 2 sets — A:${A[0]?.copy.headline?.slice(0, 40)} | B:${B[0]?.copy.headline?.slice(0, 40)}`);
    } else {
      // [MULTI] 暫時關閉同時生成 2 組（Vercel Hobby 逾時風險）→ 用 variantChoice 揀單組要 A 導購定 B 敘事
      const chosenVariant: "A" | "B" = activity.variantChoice === "B" ? "B" : "A";
      const plans = await generateFramePlans({
        theme: activity.imagePrompt || activity.theme, n: count,
        productDesc: multiProductDesc || undefined, variant: chosenVariant,
        userHeadline: userMustText || undefined,
      });
      sets = [{ cellData: cellsFromPlans(plans), label: chosenVariant === "B" ? "B 敘事版" : "", framePlans: plans }];
    }
    console.log(`[generate][multi] layout=${multiLayoutId} sets=${sets.length} genMode=${activity.genMode} model=${imageModel}`);

    // 1.5 整組共用的「視覺設計系統」基準（品牌色/人物/產品/排版）——A/B 各自獨立一份 spec
    for (const s of sets) {
      const variant: "A" | "B" = activity.genMode === "perCell" ? "A" : (s.label.startsWith("B") ? "B" : "A");
      s.globalSpec = await generateGlobalDesignSpec({
        theme: activity.imagePrompt || activity.theme,
        productDesc: multiProductDesc || undefined,
        primaryColor: client.primaryColor,
        toneLabels,
        variant,
      });
      // [VISUAL TEMPLATE] 每組(＝一次生成)挑「一個」整組視覺設計；同組所有 frame 共用。
      // seedKey 帶時間 → 每次重新生成會換一種設計（符合「大資料庫挑不同設計」）。
      const vt = pickVisualTemplate(
        { theme: activity.imagePrompt || activity.theme, focusPoint: activity.focusPoint,
          requiredText: userMustText || undefined, hasProduct: productImageUrls.length > 0 },
        `${activityId}-${s.label || "A"}-${Date.now()}`,
      );
      s.visualTemplateBlock = visualTemplatePromptBlock(vt);
      s.visualTemplateCard = vt.textTreatment.cardVariant;
      s.visualTemplateName = vt.name;
      s.visualTemplateFullBleed = vt.fullBleed;
      console.log(`[generate][multi] visual template = ${vt.name} (card: ${vt.textTreatment.cardVariant})`);
    }

    // 2. 產生「一組」拼版（逐格生成→拼版→存一筆 GeneratedLayout）
    const produceSet = async (set: GenSet, seedKey: string) => {
      const cd = set.cellData;
      const n = cd.length;
      const cellUrls: string[] = [];
      // 副圖延後處理：先全部生成乾淨底圖，等看完整組才決定版型（維持同組一致），再統一合成卡片
      const subPending: { i: number; url: string; c: CellIn; hasMustText: boolean; seed: string }[] = [];
      let cell0StyleUrl: string | undefined;

      // 副圖文字卡片：整組副圖套用同一種版型與同一主色（由 hero 圖決定，維持系列一致）
      // 於 hero(cell 0)生成後才決定；先給 fallback 初始值
      let heroAccentColor = client.primaryColor || "#4A90D9";
      // 副圖版型：依活動＋組別在「安全版型池」中輪換（不同活動/組別分散到不同版型）。
      // 要鎖死單一種：把 FORCE_SUB_VARIANT 設成某個版型字串。
      const FORCE_SUB_VARIANT = null as SubCardVariant | null;
      // [VISUAL TEMPLATE] 整組共用 template 指定的卡片語言；沒有才 fallback 到舊的 hash 挑選。
      const chosenVariant: SubCardVariant = FORCE_SUB_VARIANT
        ?? set.visualTemplateCard
        ?? ALL_SUB_VARIANTS[hashStr(`${activityId}-${seedKey}`) % ALL_SUB_VARIANTS.length];

      // 產品識別鎖（比照單圖 productPrefix）：只在有「交給 AI 畫的產品圖」時啟用
      // 刮鬍刀走真圖合成時，不算進 Gemini 要畫的產品數
      const geminiProductUrls = useRazorComposite ? aiDrawProductUrls : productImageUrls;
      const productCount = geminiProductUrls.length;
      // [MULTI] perCell 模式產品是「逐格上傳」、活動層級可能為空 → 只要任一格有產品就算「有產品」
      const anyCellAsset = cd.some((c) => (c.assetUrls?.length ?? 0) > 0);
      const hasProductImages = productCount > 0 || anyCellAsset;
      const PRODUCT_IDENTITY_LOCK = hasProductImages
        ? `PRODUCT IDENTITY — CRITICAL RULES:
IMAGE ROLES — you are receiving TWO sets of reference images in this request:
- PRODUCT REFERENCE IMAGES (${productCount} image(s)): These show the EXACT physical product(s) you must reproduce. These are the ground truth for all product appearance decisions.
- STYLE REFERENCE IMAGES: These show previously generated carousel cells. Use them ONLY to match color temperature, typography, and layout composition. Do NOT use the product appearance from these style references — the product in those images may already have been slightly altered by the generation process and must not be used as the product template.

When in doubt about product appearance, ALWAYS defer to the PRODUCT REFERENCE IMAGES, never to the style reference images.
${multiProductDesc ? `\n## PRODUCT GROUND-TRUTH DESCRIPTION (text lock — must match the reference images exactly):\n${multiProductDesc}\nThe product(s) in your output MUST match BOTH this written description AND the product reference images. If your rendering starts to differ (wrong color, wrong material, wrong handle/cap), correct it to match this description. Example failure: a white-and-rose-gold handle must NOT be rendered blue.\n` : ""}
## WHAT YOU ARE FREE TO DO (creative latitude):
- Change the camera angle: show the product from a 3/4 view, slight tilt, top-down, or hero angle
- Change the lighting direction and quality (dramatic side light, soft window light, rim light, etc.)
- Show the product rotated up to 45° for a more dynamic composition
- Slightly adjust scale or position to fit the layout composition
- Add natural reflections, cast shadows, or surface gloss consistent with the scene and surface

## WHAT YOU MUST NEVER CHANGE (brand identity — non-negotiable):
1. BRAND NAME & LOGO: The brand name and logo on the label must be legible and IDENTICAL to the reference — same font, same color, same position on the packaging.
2. OVERALL SILHOUETTE: The bottle/packaging shape (tall vs. short, wide vs. narrow, round vs. angular, with or without cap) must match exactly.
3. COLOR PALETTE (ALL colors, not just primary): Match every color visible on the packaging — label colors, cap color, body color, any gradient or two-tone design.
4. CAP / PUMP / CLOSURE TYPE: If the reference shows a pump dispenser, show a pump — not a flip cap, not a screw cap. The closure type is part of the brand identity.
5. PRODUCT COUNT: Show exactly ${productCount} product(s) — the same number as in the reference image(s). Do not add extra units, do not remove any.
6. MATERIAL & SURFACE FINISH: Match the exact material appearance of the reference — glossy plastic stays glossy, frosted matte stays frosted matte, metallic stays metallic.
7. SECONDARY LABEL TEXT: Beyond the brand name, preserve all other legible text elements on the packaging (product line name, volume, tagline) — they must not be blank, blurred, or replaced with placeholder text.

## PRIORITY (if any constraints conflict, resolve in this order):
1. Correct product count
2. Accurate closure type and silhouette
3. Brand name/logo fidelity
4. Color palette fidelity (primary + secondary + gradients)
5. Material/finish accuracy
6. Secondary label text legibility

## FAILURE CONDITIONS (output will be rejected if any of these occur):
- Product looks like a DIFFERENT brand or a generic substitute
- Brand name / logo is missing, blurred, misspelled, or replaced
- Bottle shape is drastically different (e.g., reference is tall & slim → output is short & wide)
- Color is completely wrong, or a two-tone/gradient design is flattened into a single color
- Material/finish is wrong (e.g., reference is frosted matte → output is clear glossy)
- Secondary label text (product name, volume, tagline) is missing, blank, or replaced
- Fewer or more products shown than the number of reference images provided

Think of yourself as a commercial photographer: you choose the angle and light, but the product in front of your lens is fixed — you cannot swap it for a different one.`
        : "";

      // 先算好每格在拼版中的實際像素尺寸，讓副圖卡片以「格子比例」排版（避免拼版 cover 裁掉文字）
      const cellRects = getCellRects(multiLayoutId, n);
      const COLLAGE_PX = 1200;

      for (let i = 0; i < n; i++) {
        const c = cd[i];
        const hasOwnAsset = (c.assetUrls?.length ?? 0) > 0;
        // hero 走全產品真圖合成 → 場景完全不畫產品（不傳產品圖給 Gemini）
        const heroComposite = useProductComposite && i === 0;
        // [MULTI] 只用「這格自己上傳的產品」；沒上傳就不傳任何產品參考（不再拿活動層級產品硬塞）
        const cellAssets = heroComposite ? [] : (hasOwnAsset ? c.assetUrls : (activity.genMode === "perCell" ? [] : geminiProductUrls));
        const hasAsset = cellAssets.length > 0;
        const hasMustText = !!(c.mustText?.trim());

        // 主視覺(第1格)=B 強衝擊；其餘副圖一律用同一個 A 模板（確保副圖群組視覺統一）
        const cellLayoutType: "A" | "B" | "C" = i === 0 ? "B" : "A";

        // 只有 hero(第1格)由 AI 燒入文字；副圖生成乾淨場景圖，文字由程式(Sharp)後製合成
        const cellEnableText = i === 0;
        // 依本組版型預先「留位置給文字」：疊字型留出對應區塊，其餘（白卡/對話框）用置中構圖
        const reserveNote = OVERLAY_RESERVE_ZONE[chosenVariant] ?? CENTERED_COMPOSITION;
        const subImageNoText = i > 0
          ? `\n\nCRITICAL — NO TEXT IN THIS IMAGE: Do NOT render any text, headline, badge, label, price, watermark, or typography of any kind. Produce a CLEAN lifestyle/product scene photo only. All text will be added programmatically in post-processing.\nCOMPOSITION (overrides any conflicting layout in the description above): ${reserveNote}`
          : "";

        // 副圖只吃「原始產品圖」，不再帶入 hero 當參考：
        // 避免 hero 若已把產品畫走樣，該走樣產品被複製到每一張副圖（連鎖走樣）。
        // 色調一致改由下方文字（COLOR TEMPERATURE LOCK）維持。
        const styleRefs: string[] = i === 0
          ? (refImageUrls.length > 0 ? refImageUrls.slice(0, 1) : pastPostUrls.slice(0, 1))
          : [];
        const hasStyleRef = styleRefs.length > 0;

        // 副圖不再看 hero 圖，改用純文字鎖定色溫/影調（不引用任何圖片）
        const fontReferenceNote = i > 0
          ? `\nCOLOR & TONE LOCK: Match the same color temperature, film tone, and lighting mood used across this carousel (see the visual design system below). Keep warm scenes warm and cool scenes cool — do NOT drift the color temperature between cells.`
          : "";
        const layoutReferenceNote = "";
        // 只有真的附了風格參考圖時才提醒「產品圖 vs 風格圖」的角色分工（副圖已無風格圖）
        const imageRoleReminder = hasStyleRef && hasProductImages
          ? `\nIMAGE ROLE REMINDER FOR THIS CELL:
- The FIRST ${productCount} image(s) in this request = PRODUCT REFERENCE (ground truth for product appearance)
- The REMAINING image(s) in this request = STYLE REFERENCE ONLY (for color grade, font, layout — NOT product appearance)
If the style reference images show a product that looks slightly different from the product reference images, IGNORE the product appearance in the style references and follow the product reference images instead.`
          : "";

        // 沒有「交給 AI 畫的產品圖」→ 嚴禁 AI 自行幻覺生出產品（含刀類，刀之後真圖合成）
        const noProductWarning = !hasProductImages
          ? `\n\nCRITICAL — NO PRODUCT IN THIS CAROUSEL: Do NOT invent, generate, hallucinate, or add any product, packaging, bottle, box, razor, device, or branded object anywhere in the image. The scene must contain ONLY people, environment, and lifestyle elements. Any product that was not provided in the reference images is strictly forbidden — this is a serious error.`
          : "";
        // [MULTI] 逐格判斷：這格有上傳產品 → 必放且忠實還原；沒上傳 → 嚴禁畫任何產品（只出人物/場景）
        const cellNoProduct = hasOwnAsset
          ? `\nMANDATORY PRODUCT: The product image(s) uploaded for THIS cell MUST appear prominently and clearly — reproduce faithfully as a focal element. Do NOT omit them.`
          : `\nSTRICT: NO product, packaging, bottle, box, razor, device, or branded object of any kind in this cell. Person and environment ONLY. Do NOT invent or add any product that was not uploaded for this cell.`;
        // hero：整張不畫任何產品，右側留乾淨檯面供真圖合成
        const cellProductFreeNote = heroComposite
          ? `\n\nCRITICAL — NO PRODUCT DRAWN IN THIS IMAGE: Do NOT draw, render, or include ANY product, bottle, tube, jar, pump, razor, or packaging anywhere in this image. Generate ONLY the background scene/setting with beautiful commercial lighting. Leave the RIGHT ~48% of the frame a clean, uncluttered, well-lit flat surface (e.g. marble counter) with NOTHING on it — the real product(s) will be composited there afterward.`
          : "";
        // 副圖：瓶罐交給 Gemini，但刀類禁止 Gemini 畫（改真圖合成），右側留白供貼刀
        const razorExclusionNote = useRazorComposite && i > 0
          ? `\n\nRAZOR HANDLED SEPARATELY — DO NOT DRAW IT: Do NOT render, draw, sketch, or include any razor, shaver, blade cartridge, or hair-removal device anywhere in this image — not in hands, not on surfaces, not in the background. A real razor product photo will be composited in afterward. IMPORTANT: keep the RIGHT ~40% of the frame a clean, uncluttered surface (no clutter, no extra props) so the razor can be placed there cleanly.`
          : "";

        const lockBlocks: LockBlocks = {
          productIdentityLock: heroComposite ? "" : PRODUCT_IDENTITY_LOCK,
          typographyLock: TYPOGRAPHY_LOCK,
          colorTempLock: fontReferenceNote,
          noTextBlock: subImageNoText,
          reserveNote: "",
          productFreeNote: cellProductFreeNote,
          razorExclusionNote,
          noProductWarning,
          cellNoProduct,
          imageRoleReminder,
        };
        const variant: "A" | "B" = set.label.startsWith("B") ? "B" : "A";
        const seriesStyleGuide = set.framePlans
          ? buildMultiImagePrompt({
              globalSpec: set.globalSpec!,
              framePlan: set.framePlans[i],
              variantStyle: VARIANT_STYLE[variant],
              i, n, lockBlocks,
              artDirectionBlock: set.visualTemplateBlock,
            })
          : `${TYPOGRAPHY_LOCK}${fontReferenceNote}${layoutReferenceNote}

${heroComposite ? "" : PRODUCT_IDENTITY_LOCK}

VISUAL DESIGN SYSTEM — Apply to every cell in this carousel:

${designSpecPromptBlock(set.globalSpec!)}

CRITICAL CONSISTENCY RULES:
1. TYPOGRAPHY: follow the TYPOGRAPHY LOCK above — only FONT A (headline) + FONT B (subtitle), same text color palette as cell 1.
2. PERSON: Same model — identical face, hair style, skin tone. Different outfit is OK but same person.
3. PRODUCT: Follow the PRODUCT IDENTITY RULES above strictly. Do NOT invent, substitute, or alter any product in any way.
4. COLOR GRADE: Match cell 1's color temperature and film tone exactly.
5. LAYOUT STRUCTURE: Similar compositional logic to cell 1 — vary the scene but keep the layout grammar consistent.
6. COLOR TEMPERATURE LOCK: The overall image MUST use the same warm/cool temperature as cell 1. If cell 1 is warm beige/cream tones, ALL other cells must also be warm beige/cream — never shift to cool blue or grey tones regardless of the scene description.
7. SUB-IMAGE TEMPLATE UNIFORMITY: This image is part of a 1:1 (1200×1200) collage. Every supporting/secondary cell (the smaller images in the right-side or bottom group) MUST be treated as ONE identical, reusable layout component — same text placement, same text container/frame style, same composition grammar and spacing across all of them. Only the photo and the text content may change; the layout structure must NOT vary from one sub-image to another.${noProductWarning}
${imageRoleReminder}

${hasStyleRef ? `VISUAL REFERENCE: A style-reference image is provided — match its color grade, typography and layout aesthetic (but NOT its product appearance; product follows the PRODUCT REFERENCE images).` : ""}

CELL ${i + 1} OF ${n} ROLE:
${i === 0
  ? `HERO — most impactful. Headline: "${hasMustText ? c.mustText : activity.titleText || activity.theme}". Establish the typography and color system for the whole series.`
  : i === n - 1
  ? `CLOSING — ${hasMustText ? `Text: "${c.mustText}"` : "Warm call-to-action."}`
  : `SUPPORTING ${i} — different scene/angle from cell 1, same visual system. ${hasMustText ? `Caption: "${c.mustText}"` : "Let the visual speak."}`
}
Scene: ${c.description}
${i === 0
  // 主視覺：可用各自的副標/底框/構圖（AI 燒入文字）
  ? `${c.subtitle ? `Subtitle text to include: "${c.subtitle}"\n` : ""}${c.container_style ? `Text container style: ${c.container_style}\n` : ""}${c.composition_hint ? `Composition: ${c.composition_hint}` : ""}`
  // 副圖：只出乾淨場景圖，文字由程式後製（見下方 NO TEXT 規則）
  : `Produce a clean scene photo for this cell. No typography.`}
${cellNoProduct}${cellProductFreeNote}${razorExclusionNote}${subImageNoText}`;

        const cellPrompt = buildImagePrompt({
          theme: activity.theme, focusPoint: activity.focusPoint,
          userImagePrompt: set.stylePromptSuffix ? `${seriesStyleGuide}\n\n${set.stylePromptSuffix}` : seriesStyleGuide,
          primaryColor: client.primaryColor, secondaryColor: client.secondaryColor ?? undefined,
          toneLabels, compositionPrompt: "", layoutType: cellLayoutType,
          hasProductImage: hasAsset,
          styleReferenceDescription: brandStyleGuide ?? undefined,
          imageRatio: "1:1", enableTextOverlay: cellEnableText,
          headline: cellEnableText && hasMustText ? c.mustText : undefined,
          fontHint: client.commonText || undefined,
        });
        const cellAspect = ml?.cellAspects[i] ?? "1:1";
        const seed = `${activityId}-${seedKey}-cell${i}`;
        let url: string;
        if (useOR) {
          url = await generateImageOpenRouter(cellPrompt, seed, styleRefs, cellEnableText, undefined, hasAsset ? cellAssets : undefined, cellLayoutType, cellAspect, imageModel);
          if (url.includes("picsum")) url = await generateImageFal({ prompt: cellPrompt, imageRatio: cellAspect, seed });
        } else if (imageModel === "fal-ai/flux/schnell") {
          url = await generateImageFluxSchnell({ prompt: cellPrompt, imageRatio: cellAspect, seed });
        } else {
          url = await generateImageFal({ prompt: cellPrompt, imageRatio: cellAspect, seed });
        }
        // 產品真圖合成（保證與上傳一致）：hero 貼全部產品；副圖只貼刀（且場景適合時）
        if (useProductComposite) {
          try {
            let bufs: Buffer[] = [];
            let region: { x: number; y: number; w: number; h: number };
            if (i === 0) {
              bufs = productCleanBufs.filter((b): b is Buffer => !!b);
              region = { x: 0.5, y: 0.34, w: 0.47, h: 0.58 };  // hero 右側檯面
            } else if (razorCleanBuf && await sceneSuitsRazor(url)) {
              bufs = [razorCleanBuf];
              region = { x: 0.52, y: 0.08, w: 0.44, h: 0.5 };  // 副圖右上（避開文字卡、白卡裁切保留上緣）
            } else {
              region = { x: 0, y: 0, w: 0, h: 0 };
            }
            if (bufs.length) {
              let composed = url;
              const cnt = bufs.length;
              for (let k = 0; k < cnt; k++) {
                const sub = { x: region.x + (region.w / cnt) * k, y: region.y, w: region.w / cnt, h: region.h };
                composed = await overlayProduct({ sceneUrl: composed, productBuf: bufs[k], region: sub, align: "bottom", seed: `${seed}-prod${k}` });
              }
              url = composed;
              console.log(`[generate][multi][${seedKey}] cell ${i} composited ${cnt} real product(s)`);
            }
          } catch (e) {
            console.warn(`[generate][multi] cell ${i} product composite failed:`, e);
          }
        }

        if (i === 0) {
          cell0StyleUrl = url;  // hero（已含真圖產品）當色調參照
          // hero 完成後抓主色（版型已於組別建立時用輪換決定，不再用 vision 避免每次都同一種）
          heroAccentColor = await extractDominantColor(url, client.primaryColor || "#4A90D9")
            .catch(() => client.primaryColor || "#4A90D9");
          console.log(`[generate][multi][${seedKey}] hero accent=${heroAccentColor} variant=${chosenVariant}`);
          // 生成不再自動貼 logo，改喺生成完之後用 LogoPlacerModal 手動微調拖放（同單圖版一致）。
          cellUrls[0] = url;
          console.log(`[generate][multi][${seedKey}] cell 1/${n} done`);
        } else {
          // 副圖：先存乾淨底圖，等整組生成完再統一決定版型＋合成卡片（見迴圈後的第二階段）
          subPending.push({ i, url, c, hasMustText, seed });
        }
      }

      // ── 第二階段：整組一致地決定副圖版型，再統一合成卡片＋logo ──
      // corner-label / diagonal-ribbon 會疊在照片角落 → 若任一副圖對應角落太忙(可能有主體)，整組退回安全版型
      let effVariant: SubCardVariant = chosenVariant;
      const BUSY_THRESHOLD = 0.4;
      // [FULL-BLEED] 滿版 template：保持文字壓照片、不退回白卡（否則會變回圓角白卡＋留白）
      if (set.visualTemplateFullBleed) {
        // 不做 busy→白卡 fallback；直接用 template 指定的 text-over-photo 版型
      }
      // 角標型（角落偵測）
      else if (chosenVariant === "corner-label-card" || chosenVariant === "diagonal-ribbon-card") {
        const side = chosenVariant === "diagonal-ribbon-card" ? "right" : "left";
        for (const p of subPending) {
          const busy = await sampleCornerBusyness(p.url, side).catch(() => 0);
          if (busy > BUSY_THRESHOLD) {
            effVariant = "title-top-caption-bottom";
            console.log(`[generate][multi][${seedKey}] 整組退回 title-top（${chosenVariant} 角落偵測到主體, busy=${busy.toFixed(2)}）`);
            break;
          }
        }
      }
      // 疊字型（文字直接疊在照片上）：依版型對應的區域偵測忙碌度
      else {
        const zoneMap: Partial<Record<SubCardVariant, "top" | "bottom" | "left">> = {
          "badge-top-left": "top",
          "minimal-top": "top",
          "banner-bottom": "bottom",
          "gradient-bottom": "bottom",
          "side-accent": "left",
        };
        const zone = zoneMap[chosenVariant];
        if (zone) {
          for (const p of subPending) {
            const busy = await sampleRegionBusynessByZone(p.url, zone).catch(() => 0);
            if (busy > BUSY_THRESHOLD) {
              effVariant = "title-top-caption-bottom";
              console.log(`[generate][multi][${seedKey}] 整組退回 title-top（${chosenVariant} ${zone} 區偵測到主體, busy=${busy.toFixed(2)}）`);
              break;
            }
          }
        }
      }
      for (const p of subPending) {
        let u = p.url;
        const headline = (p.hasMustText ? p.c.mustText : p.c.subtitle) || "";
        const tagText = (p.c.tag || "").trim().slice(0, 6);  // AI 產的短分類標
        if (headline.trim()) {
          try {
            const rect = cellRects[p.i];
            u = await overlaySubImageCard({
              imageUrl: u,
              badgeText: tagText || inferBadgeLabel(p.c.subtitle || p.c.mustText || ""),
              tagText,
              headline,
              subtitle: p.c.subtitle && p.c.subtitle !== headline ? p.c.subtitle : undefined,
              accentColor: heroAccentColor,
              variant: effVariant,
              targetWidth: rect ? Math.round(rect.w * COLLAGE_PX) : undefined,
              targetHeight: rect ? Math.round(rect.h * COLLAGE_PX) : undefined,
              seed: `${p.seed}-card`,
            });
          } catch (e) {
            console.warn(`[generate][multi] cell ${p.i} sub-card overlay failed:`, e);
          }
        }
        cellUrls[p.i] = u;
        console.log(`[generate][multi][${seedKey}] cell ${p.i + 1}/${n} done`);
      }

      const plusBadge = multiLayoutId === "five-plus" && n > 5 ? `+${n - 5}` : undefined;
      const composite = await compositeCollage({
        cellUrls, rects: cellRects, canvasWidth: COLLAGE_PX, canvasHeight: COLLAGE_PX,
        seed: `${activityId}-${seedKey}`,
        plusOverlayText: plusBadge,
        // [FULL-BLEED] 滿版 template：gap=0 無格縫、無灰底；否則維持淡底＋格縫
        gap: set.visualTemplateFullBleed ? 0 : undefined,
        accentColor: set.visualTemplateFullBleed ? undefined : heroAccentColor,
      });
      void cell0StyleUrl;
      const copyText = (set.label ? `【${set.label}】` : "")
        + (cd.map((x) => x.mustText).filter(Boolean).join(" / ") || activity.theme);
      return db.generatedLayout.create({
        data: {
          activityId, layoutType: multiLayoutId, imageUrl: composite,
          copyText, textBurnedIn: true, cellImageUrls: JSON.stringify(cellUrls),
        },
      });
    };

    // 3. 依組數產出（1 組或 2 組），各存一筆
    const layouts: Awaited<ReturnType<typeof produceSet>>[] = [];
    for (let s = 0; s < sets.length; s++) {
      const seedKey = sets.length > 1 ? `${multiLayoutId}-v${s + 1}` : multiLayoutId;
      layouts.push(await produceSet(sets[s], seedKey));
    }

    await db.activity.update({ where: { id: activityId }, data: { status: "DONE" } });
    console.log(`[generate][multi] ✅ done — ${layouts.length} set(s)`);
    return NextResponse.json({ ok: true, layouts });
  } catch (err) {
    // 錯誤訊息萃取：若 provider 回傳 JSON（如 {"error":{"message":"..."}}），取內層訊息
    let msg = err instanceof Error ? err.message : String(err);
    try {
      const m = msg.match(/\{[\s\S]*\}/);
      if (m) {
        const parsed = JSON.parse(m[0]);
        const inner = parsed?.error?.message ?? parsed?.message;
        if (inner) msg = String(inner);
      }
    } catch {
      /* 保留原始 msg */
    }
    if (/credit balance|insufficient_quota|quota|too low/i.test(msg)) {
      msg = `API 額度不足：${msg}`;
    }
    const errorMessage = msg.slice(0, 500);
    console.error("[generate][multi] ❌ failed:", errorMessage);
    await db.activity.update({ where: { id: activityId }, data: { status: "FAILED", errorMessage } }).catch(() => {});
    return NextResponse.json({ error: errorMessage, errorMessage }, { status: 500 });
  }
}
