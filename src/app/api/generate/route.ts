import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateImageFal, generateImageFluxSchnell, describeStyle, describeProduct, editImageFal } from "@/lib/fal";
import { generateImageOpenRouter, chatTextOpenRouter } from "@/lib/openrouter";
import { loadBuffer, saveBuffer } from "@/lib/storage";

/** 背景生成：優先 OpenRouter Gemini（更寫實），備援 Fal FLUX */
async function generateBackground(opts: {
  prompt: string;
  imageRatio: string;
  styleReferenceUrl?: string;
  styleReferenceImages?: string[];
  seed: string;
  useTextOverlay?: boolean;        // 是否啟用文字燒入
}): Promise<string> {
  if (process.env.OPENROUTER_API_KEY) {
    console.log("[generate] Using OpenRouter Gemini for background");
    const url = await generateImageOpenRouter(
      opts.prompt,
      opts.seed,
      opts.styleReferenceImages,
      opts.useTextOverlay           // 傳遞給 Gemini
    );
    if (!url.includes("picsum")) return url;
    console.log("[generate] OpenRouter returned placeholder → FLUX fallback");
  }
  console.log("[generate] Using Fal FLUX for background");
  return generateImageFal({
    prompt:            opts.prompt,
    imageRatio:        opts.imageRatio,
    styleReferenceUrl: opts.styleReferenceUrl,
    seed:              opts.seed,
    // Fal 的文字燒入由任務四處理，這裡不需額外參數
  });
}
import { compositeImage, overlayLogo } from "@/lib/composite";
import { generateTypographyImage } from "@/lib/typography";
import { buildCopyPrompt, buildImagePrompt } from "@/lib/prompts";
import { extractStyleComponents, buildAiPromptText } from "@/lib/extract-components";
import { LAYOUT_CONFIGS } from "@/types";
import type { LayoutType } from "@/types";
import { generateMulti } from "@/lib/generate-multi";  // [MULTI] 多圖拼版流程（獨立模組）

export const maxDuration = 180;

/** 清掉 AI 填的「無 / 沒有 / none / N/A / -」等佔位字，視為空字串 */
function sanitizeText(s: string): string {
  const t = s.trim().replace(/^[（(]\s*|\s*[）)]$/g, "").trim();  // 去掉外層括號
  if (!t) return "";
  if (/^(無|沒有|不需要|留空|空|none|no|n\/a|na|null|-|—|–)$/i.test(t)) return "";
  return s.trim();
}

/** 取出圖上專用短文字 */
function parseImageText(raw: string): { title: string; imageSubtitle: string } {
  const titleMatch  = raw.match(/(?:主標題|標題)[：:]\s*(.+)/);
  const imgSubMatch = raw.match(/圖上副標[：:]\s*(.+)/);
  return {
    title:         sanitizeText(titleMatch?.[1]?.trim()  ?? ""),
    imageSubtitle: sanitizeText(imgSubMatch?.[1]?.trim() ?? ""),
  };
}

/** 讀圖片實際像素尺寸（底圖模式供後續文字排版用）；失敗回 0×0，唔阻斷流程。 */
async function readImageSize(url: string): Promise<{ w: number; h: number }> {
  try {
    const sharp = (await import("sharp")).default;
    const buf = url.startsWith("/")
      ? await loadBuffer(url.split("?")[0])
      : Buffer.from(await (await fetch(url)).arrayBuffer());
    const m = await sharp(buf).metadata();
    return { w: m.width ?? 0, h: m.height ?? 0 };
  } catch {
    return { w: 0, h: 0 };
  }
}

/** 取出完整發文文案 */
function parsePostCopy(raw: string): string {
  const match = raw.match(/發文文案[：:]\s*([\s\S]+)/);
  return match?.[1]?.trim() ?? "";
}

/** parse 用戶輸入嘅必放文字「主標題：X 副標題：Y」→ {title, sub}；冇格式就整句做主標。 */
function parseUserTitle(raw: string): { title: string; sub: string } {
  const t = (raw ?? "").trim();
  if (!t) return { title: "", sub: "" };
  // 支援多種寫法：主標題 / 主標 / 標題 / 主 ＋ 副標題 / 副標 / 副（全形或半形冒號）。
  // 否則成串「主：… 副：…」會原封塞入 headline，令 Gemini 畫重複／亂排。
  const both = t.match(/(?:主標題|主標|標題|主)[：:]\s*([\s\S]+?)\s*(?:副標題|副標|副)[：:]\s*([\s\S]+)/);
  if (both) return { title: both[1].trim(), sub: both[2].trim() };
  const only = t.match(/(?:主標題|主標|標題|主)[：:]\s*([\s\S]+)/);
  if (only) return { title: only[1].trim(), sub: "" };
  return { title: t, sub: "" };
}

// [底圖模式 ②] 清走「構圖/配色/技術」雜訊，免文案 AI 被「[AI 合成]」等字帶去離題（tech/AI）。
// 例：「[AI 合成] 構圖：商品居中，字放上方，花草點景下方 配色」→ 清空 → 交由產品+品牌發揮。
function cleanCampaignTheme(raw: string): string {
  return (raw ?? "")
    .replace(/[\[【][^\]】]*[\]】]/g, " ")       // [AI 合成]、【…】
    .replace(/構圖\s*[:：][^。\n]*/g, " ")       // 構圖：…
    .replace(/配色\s*[:：]?[^。\n]*/g, " ")      // 配色…
    .replace(/版面\s*[:：]?[^。\n]*/g, " ")      // 版面…
    .replace(/#[0-9A-Fa-f]{3,8}\b/g, " ")        // hex 色碼
    .replace(/[\[\]【】]/g, " ")                  // 散落嘅括號（unclosed）
    .replace(/\s+/g, " ")
    .trim();
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

  const synthesized = await chatTextOpenRouter(
    `Below are visual style descriptions of a brand's past posts. Synthesize them into ONE concise brand visual style guide (2-3 sentences) for an image generation AI. English only.\n\n${valid.map((d, i) => `Post ${i + 1}: ${d}`).join("\n")}`,
    200,
  );
  return synthesized ?? valid[0];
}

export async function POST(request: Request) {
  const { activityId } = await request.json();
  if (!activityId) {
    return NextResponse.json({ error: "activityId required" }, { status: 400 });
  }

  const activity = await db.activity.findUnique({
    where: { id: activityId },
    include: { client: true },
  });
  if (!activity) {
    return NextResponse.json({ error: "Activity not found" }, { status: 404 });
  }

  // [MULTI] 多圖版型 → 走獨立的多圖拼版流程（單圖/底圖仍走下方原流程）
  if (activity.layoutId && activity.layoutId !== "single") {
    return generateMulti(activityId);
  }

  await db.activity.update({ where: { id: activityId }, data: { status: "GENERATING" } });

  const { client } = activity;

  // ── [2b] 底圖模式：成張相 100% 做背景，唔重新生圖 ──────────────────────────
  //     只生成文案 + 打包一份「文字層 schema」交俾後續文字排版階段。
  if (activity.baseImageUrl) {
    try {
      const tones: string[] = client.toneLabels ? JSON.parse(client.toneLabels) : [];
      const baseUrl = activity.baseImageUrl;

      // 讀底圖尺寸 + 品牌資料（3 款共用）
      const dims = await readImageSize(baseUrl);
      const size = (activity.customW > 0 && activity.customH > 0)
        ? { w: activity.customW, h: activity.customH }
        : { w: dims.w || 1024, h: dims.h || 1024 };
      const brand = {
        name:           client.name,
        primaryColor:   client.primaryColor,
        secondaryColor: client.secondaryColor ?? null,
        logoUrl:        client.logoUrl ?? null,
        fontHint:       client.commonText || "",
      };
      type TextEl = { role: string; content: string; zone: string; emphasis: string };

      // 3 款（1+3）：每款各自 AI 生唔同文案（款1 鎖用戶必放文字；款2/3 AI 自由發揮）。
      // 每款用「AI 特效字」（Gemini 喺底圖上加特效字 + 擴展背景，見 lib/typography.ts）；
      // 失敗就 fallback Sharp 疊字（唔會出空白）。
      // mood（顏色/氛圍）由 Gemini 綜合「底圖 vibe + 品牌語氣 + 主題」自選（唔再有 UI 揀）。
      // effect 程度：3 款隨機分配「純文字 / 特效 / 風格字（有 style 冇 effect）」，唔鎖款號。
      const levels = (["plain", "effect", "styled"] as const).slice().sort(() => Math.random() - 0.5);
      const VARIANTS: { type: string; copyLayout: "A" | "B" | "C"; effectLevel: "plain" | "effect" | "styled" }[] = [
        { type: "BASE-1", copyLayout: "A", effectLevel: levels[0] },  // 鎖用戶必放文字
        { type: "BASE-2", copyLayout: "B", effectLevel: levels[1] },  // AI 自由發揮
        { type: "BASE-3", copyLayout: "C", effectLevel: levels[2] },  // AI 自由發揮
      ];
      // ③ 冇 title 時文案 AI 睇唔到產品 → 先用 vision 認底圖產品做 context（1 次，3 款共用）
      const productDesc = await describeProduct(baseUrl);
      // ② 主題來源判斷：
      //    有必放文字 → activity.theme 係用戶訊息 → 清雜訊後用。
      //    冇必放文字 → activity.theme 係由「畫面描述(imagePrompt)」嚟 = 純圖像指示
      //      （構圖/配色/lighting/lens…，甚至 AI 優化後成段英文 photography prompt）→ 唔做文案題材，
      //      索性清空，靠 ③ 產品 + 品牌調性寫文案（唔追住中/英 keyword 去 strip）。
      const copyTheme = activity.titleText?.trim() ? cleanCampaignTheme(activity.theme) : "";

      // 有填必放文字 → 3 款主標都鎖定用戶那段文字（只差視覺處理），AI 只負責補副標；
      // 冇填 → 3 款文字全部由 AI 自由發揮。（避免「填咗但只有一款用到」令使用者困惑）
      const hasRequired = !!activity.titleText?.trim();

      const saved: Awaited<ReturnType<typeof db.generatedLayout.create>>[] = [];
      for (const v of VARIANTS) {
        // ── 每款各自生文案 ──
        const copyPrompt = buildCopyPrompt({
          theme:      copyTheme,
          focusPoint: activity.focusPoint ?? "",
          titleText:  activity.titleText  ?? "",
          toneLabels: tones,
          layoutType: v.copyLayout,
          taboos:     [],
          forceTitle: false, // 一律讓 AI 寫（有必放文字時只取佢嘅副標，主標用戶鎖定）
          productContext: productDesc ?? undefined,
        });
        const rawCopy = (await chatTextOpenRouter(copyPrompt, 500)) ?? "";
        const { title: aiTitle, imageSubtitle: aiSub } = parseImageText(rawCopy);
        // 有必放文字：3 款主標都鎖用戶文字（用戶有寫副標就用佢嘅，冇寫 → AI 補，3 款各異）；
        // 冇必放文字：主副標全部 AI 自由發揮。
        let headline: string, subtitle: string;
        if (hasRequired) {
          const u = parseUserTitle(activity.titleText ?? "");
          headline = u.title || activity.titleText!.trim();
          subtitle = u.sub || aiSub;
        } else {
          headline = aiTitle;
          subtitle = aiSub;
        }
        const ctaText = rawCopy.match(/CTA[：:]\s*(.+)/)?.[1]?.trim() || "";
        const postCopy = parsePostCopy(rawCopy) || rawCopy;

        // ── AI 特效字（主字特效 + 副字樸素 + 擴展背景保留完整產品）──
        let finalUrl = baseUrl;
        let burnedIn = false;
        if (headline || subtitle) {
          const typoUrl = await generateTypographyImage({
            baseImageUrl: baseUrl, title: headline, subtitle: subtitle || undefined,
            brandTones: tones.join("、"),
            theme: activity.theme,
            userPrompt: activity.imagePrompt ?? undefined,
            effectLevel: v.effectLevel,
            width: size.w, height: size.h, ratio: activity.imageRatio ?? undefined, // 跟活動尺寸設定
            seed: `${activityId}-${v.type}`,
          });
          if (typoUrl) {
            finalUrl = typoUrl; burnedIn = true;
          } else {
            // fallback：Sharp 像素疊字（唔會出空白）
            try {
              finalUrl = await compositeImage({
                backgroundUrl: baseUrl, layoutType: "A",
                textZone: v.copyLayout === "C" ? "bottom-full" : "top-left",
                primaryColor: client.primaryColor, canvasWidth: size.w, canvasHeight: size.h,
                titleText: headline || undefined, subtitleText: subtitle || undefined,
                seed: `${activityId}-${v.type}`,
              });
              burnedIn = true;
              if (client.logoUrl && finalUrl !== baseUrl) {
                finalUrl = await overlayLogo({ imageUrl: finalUrl, logoUrl: client.logoUrl, textZone: "top-left", seed: `${activityId}-${v.type}-logo` });
              }
            } catch (e) {
              console.warn(`[generate] 底圖 fallback 疊字失敗(${v.type}):`, e);
              finalUrl = baseUrl; burnedIn = false;
            }
          }
        }

        // ── 每款各自打包 schema（文字層契約，俾後續文字排版階段）──
        const textElements: TextEl[] = [
          headline ? { role: "headline", content: headline, zone: "top",    emphasis: "high"   } : null,
          subtitle ? { role: "subtitle", content: subtitle, zone: "top",    emphasis: "medium" } : null,
          ctaText  ? { role: "cta",      content: ctaText,  zone: "bottom", emphasis: "high"   } : null,
        ].filter((x): x is TextEl => x !== null);
        const variantLayer = {
          version: "0.1",
          jobId: activityId,
          mode: "BASE_IMAGE",
          baseImage: { url: baseUrl, width: dims.w, height: dims.h, ratio: activity.imageRatio ?? "1:1" },
          brand,
          textElements,
          postCopy,
          templateHint: "ai-typography",
          styleHint: v.effectLevel,   // 純文字 / 特效 / 風格字
        };
        const layout = await db.generatedLayout.create({
          data: {
            activityId,
            layoutType: v.type,
            imageUrl: finalUrl,
            copyText: postCopy,
            textLayerJson: JSON.stringify(variantLayer),
            textBurnedIn: burnedIn,
          },
        });
        saved.push(layout);
      }

      await db.activity.update({ where: { id: activityId }, data: { status: "DONE" } });
      return NextResponse.json({ layouts: saved, mode: "BASE_IMAGE" });
    } catch (err) {
      console.error("[generate] ❌ 底圖模式失敗:", err);
      await db.activity.update({ where: { id: activityId }, data: { status: "FAILED" } });
      return NextResponse.json({ error: String(err) }, { status: 500 });
    }
  }

  // ── JSON 防呆解析 ──────────────────────────────────────────────────────────
  const toneLabels: string[]      = client.toneLabels        ? JSON.parse(client.toneLabels)        : [];
  const taboos: string[]          = [];
  const pastPostUrls: string[]    = client.pastPostImageUrls ? JSON.parse(client.pastPostImageUrls) : [];
  const refImageUrls: string[]    = activity.referenceImageUrls  ? JSON.parse(activity.referenceImageUrls)  : [];
  const productImageUrls: string[]= activity.productImageUrls    ? JSON.parse(activity.productImageUrls)    : [];
  const selectedIds: string[]     = activity.selectedComponentIds? JSON.parse(activity.selectedComponentIds): [];

  const firstProductImage = productImageUrls[0] ?? activity.productImageUrl ?? undefined;
  const hasProductImage   = !!firstProductImage;

  // 風格參考：優先用活動上傳的參考圖，其次用品牌過往貼文
  const styleReferenceUrl = refImageUrls[0] ?? pastPostUrls[0] ?? undefined;

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

  // ── 風格組件（迴圈外查一次）──────────────────────────────────────────────
  const selectedComponents = selectedIds.length > 0
    ? await db.styleComponent.findMany({ where: { id: { in: selectedIds } } })
    : [];
  const componentPrompts = selectedComponents.map((c) => c.aiPromptText).filter(Boolean).join(", ");

  try {
    const layouts: Awaited<ReturnType<typeof db.generatedLayout.create>>[] = [];

    for (const layoutConfig of LAYOUT_CONFIGS) {
      console.log(`[generate] Starting layout ${layoutConfig.type}`);

      // ── 1. Claude 文案 ──────────────────────────────────────────────────────
      // 有填必放文字 → 三款主標都鎖定用戶那段文字（AI 只補副標）；冇填 → 三款全部 AI 自由發揮。
      const hasRequired = !!activity.titleText?.trim();
      const copyPrompt = buildCopyPrompt({
        theme:      activity.theme,
        focusPoint: activity.focusPoint ?? "",
        titleText:  activity.titleText  ?? "",
        toneLabels,
        layoutType: layoutConfig.type,
        taboos,
        forceTitle: false, // 一律讓 AI 寫（有必放文字時只取佢嘅副標，主標用戶鎖定）
      });
      const rawCopy = (await chatTextOpenRouter(copyPrompt, 500)) ?? "";

      // 圖上文字（短版）：主標題 + 圖上副標
      const { title: aiTitle, imageSubtitle: aiImageSubtitle } = parseImageText(rawCopy);

      // 有必放文字：三款主標都鎖用戶文字（用戶有寫副標就用佢嘅，冇寫 → AI 補，三款各異）；
      // 冇必放文字：主副標全部 AI 自由發揮。
      const uReq = hasRequired ? parseUserTitle(activity.titleText ?? "") : { title: "", sub: "" };
      const finalTitle = hasRequired ? (uReq.title || activity.titleText!.trim()) : aiTitle;
      const finalImageSubtitle = hasRequired ? (uReq.sub || aiImageSubtitle) : aiImageSubtitle;
      // 發文文案（長版）
      const postCopy = parsePostCopy(rawCopy) || rawCopy;
      console.log(`[generate] ✅ Copy | title="${finalTitle}" imgSub="${finalImageSubtitle}" post="${postCopy.slice(0, 40)}…"`);

      // ── 2. 圖片背景生成 ─────────────────────────────────────────────────────
      const ratio = activity.imageRatio ?? "1:1";

      // 整合 requiredText + 風格組件 prompt 供 flux/schnell 使用
      const requiredTextForImage = activity.titleText ?? "";
      const schnellPromptParts: string[] = [];
      if (activity.imagePrompt)   schnellPromptParts.push(activity.imagePrompt);
      if (componentPrompts)       schnellPromptParts.push(componentPrompts);
      if (requiredTextForImage)   schnellPromptParts.push(`with the text "${requiredTextForImage}" written clearly on the image`);
      schnellPromptParts.push("high quality commercial photography, photorealistic");
      const schnellPrompt = schnellPromptParts.join(", ");

      // 統一由 Gemini 負責文字燒入，移除 Sharp 後製貼字
      const enableTextOverlay = true;
      const ctaText = rawCopy.match(/CTA[：:]\s*(.+)/)?.[1]?.trim() || undefined;

      console.log(`[generate] enableTextOverlay=${enableTextOverlay} headline="${finalTitle}" imgSub="${finalImageSubtitle}" cta="${ctaText}"`);

      const styleImages = refImageUrls.length > 0
        ? refImageUrls.slice(0, 2)
        : pastPostUrls.slice(0, 2);

      const SIZE_MAP: Record<string, { w: number; h: number }> = {
        "1:1": { w: 1024, h: 1024 }, "4:5": { w: 820,  h: 1024 },
        "3:4": { w: 768,  h: 1024 }, "2:3": { w: 683,  h: 1024 },
        "9:16":{ w: 576,  h: 1024 }, "4:3": { w: 1024, h: 768  },
        "3:2": { w: 1024, h: 683  }, "16:9":{ w: 1024, h: 576  },
      };
      // 使用者設定咗輸出尺寸就用佢（同產品圖一致）；否則用比例預設。
      const size = (activity.customW > 0 && activity.customH > 0)
        ? { w: activity.customW, h: activity.customH }
        : (SIZE_MAP[ratio] ?? { w: 1024, h: 1024 });

      // 使用者選擇的生圖模型：fal-ai/* 走 Fal，其餘（gemini/gpt）走 OpenRouter
      const imageModel  = activity.imageModel || "google/gemini-3-pro-image-preview";
      const isFalModel  = imageModel.startsWith("fal-ai/");
      const isSchnell   = imageModel === "fal-ai/flux/schnell";
      const useOpenRouter = !isFalModel && !!process.env.OPENROUTER_API_KEY;
      console.log(`[generate] model=${imageModel} → ${useOpenRouter ? "OpenRouter" : "Fal"}`);

      let imageUrl: string;

      // 用 Claude Vision 分析產品圖，加入 prompt（迴圈內每個版型都分析）
      let productDesc: string | null = null;
      if (productImageUrls.length > 0) {
        const descs = await Promise.all(
          productImageUrls.slice(0, 3).map(url => describeProduct(url))
        );
        const valid = descs.filter(Boolean) as string[];
        if (valid.length === 1) {
          productDesc = valid[0];
        } else if (valid.length > 1) {
          productDesc = valid.map((d, i) => `Product ${i + 1}: ${d}`).join(" ");
        }
        console.log(`[generate] Product descs (${valid.length} items): ${productDesc?.slice(0, 120)}`);
      }

      if (hasProductImage) {
        // ── 有產品圖流程 ──────────────────────────────────────────────────────
        if (useOpenRouter) {
          // Gemini/GPT one-shot：產品圖當參考，模型同時畫背景＋產品＋文字
          const fullPrompt = buildImagePrompt({
            theme:           activity.theme,
            focusPoint:      activity.focusPoint,
            userImagePrompt: `${productDesc ? productDesc + ". " : ""}${activity.imagePrompt ?? ""}`.trim() || undefined,
            primaryColor:    client.primaryColor,
            secondaryColor:  client.secondaryColor ?? undefined,
            toneLabels,
            compositionPrompt:         layoutConfig.compositionPrompt,
            layoutType:                layoutConfig.type,
            fontHint:                  client.commonText || undefined,
            hasProductImage:           true,
            componentPrompts:          componentPrompts || undefined,
            styleReferenceDescription: brandStyleGuide  ?? undefined,
            imageRatio:                ratio,
            enableTextOverlay:         true,
            headline:  finalTitle         || undefined,
            subtitle:  finalImageSubtitle || undefined,
          });
          console.log(`[generate] Gemini one-shot prompt (first 120): ${fullPrompt.slice(0, 120)}`);

          imageUrl = await generateImageOpenRouter(
            fullPrompt,
            `${activityId}-${layoutConfig.type}`,
            styleImages,
            true,                // 讓 Gemini 燒入設計感文字
            undefined,           // baseImageUrl
            productImageUrls,    // 產品圖當參考（最多 3 張）
            layoutConfig.type,   // 只套用當前版型規則
            ratio,               // 圖片比例（9:16 等）
            imageModel,          // 使用者選擇的模型
          );
          if (imageUrl.includes("picsum")) {
            console.warn("[generate] OpenRouter one-shot failed → Fal fallback");
            imageUrl = await generateImageFal({ prompt: fullPrompt, imageRatio: ratio, seed: `${activityId}-${layoutConfig.type}` });
          }
        } else {
          // 沒有 OpenRouter → 舊版 Sharp 合成流程（背景帶產品調性）
          const bgPrompt = buildImagePrompt({
            theme:           activity.theme,
            focusPoint:      activity.focusPoint,
            userImagePrompt: productDesc
              ? `${productDesc}. ${activity.imagePrompt ?? ""}`.trim()
              : activity.imagePrompt ?? undefined,
            primaryColor:    client.primaryColor,
            secondaryColor:  client.secondaryColor ?? undefined,
            toneLabels,
            compositionPrompt:         layoutConfig.compositionPrompt,
            layoutType:                layoutConfig.type,
            fontHint:                  client.commonText || undefined,
            hasProductImage:           true,
            componentPrompts:          componentPrompts || undefined,
            styleReferenceDescription: brandStyleGuide  ?? undefined,
            imageRatio:                ratio,
            enableTextOverlay:         false,
          });
          // 沒有 OpenRouter → Sharp 合成流程
          const bgUrl = await generateImageFal({ prompt: bgPrompt, imageRatio: ratio, seed: `${activityId}-${layoutConfig.type}-bg` });
          imageUrl = await compositeImage({
            backgroundUrl: bgUrl, productImageUrl: firstProductImage,
            layoutType: layoutConfig.type, canvasWidth: size.w, canvasHeight: size.h,
            titleText: finalTitle || undefined, subtitleText: finalImageSubtitle || undefined,
            seed: `${activityId}-${layoutConfig.type}`,
          });
        }

      } else {
        // ── 無產品圖：Gemini 一次生成含文字的完整廣告圖 ────────────────────
        const fullPrompt = buildImagePrompt({
          theme:           activity.theme,
          focusPoint:      activity.focusPoint,
          titleText:       activity.titleText    ?? undefined,
          userImagePrompt: activity.imagePrompt  ?? undefined,
          primaryColor:    client.primaryColor,
          secondaryColor:  client.secondaryColor ?? undefined,
          toneLabels,
          compositionPrompt:         layoutConfig.compositionPrompt,
            layoutType:                layoutConfig.type,
            fontHint:                  client.commonText || undefined,
          hasProductImage:           false,
          componentPrompts:          componentPrompts || undefined,
          styleReferenceDescription: brandStyleGuide  ?? undefined,
          imageRatio:                ratio,
          enableTextOverlay,
          headline:  finalTitle         || undefined,
          subtitle:  finalImageSubtitle || undefined,
        });

        if (useOpenRouter) {
          imageUrl = await generateImageOpenRouter(fullPrompt, `${activityId}-${layoutConfig.type}`, styleImages, enableTextOverlay, undefined, undefined, layoutConfig.type, ratio, imageModel);
          if (imageUrl.includes("picsum")) imageUrl = await generateImageFal({ prompt: fullPrompt, imageRatio: ratio, seed: `${activityId}-${layoutConfig.type}` });
        } else if (isSchnell) {
          imageUrl = await generateImageFluxSchnell({ prompt: fullPrompt, imageRatio: ratio, seed: `${activityId}-${layoutConfig.type}` });
        } else {
          imageUrl = await generateImageFal({ prompt: fullPrompt, imageRatio: ratio, seed: `${activityId}-${layoutConfig.type}` });
        }
      }

      console.log(`[generate] ✅ Image done: ${imageUrl.slice(0, 55)}`);

      // ── 3.4 輸出尺寸：使用者設定咗就把成圖 resize 到該尺寸（比例已鎖＝純縮放）。
      //     包 try/catch：任何失敗都保留原圖，絕不阻斷生成。
      if (activity.customW > 0 && activity.customH > 0 && !imageUrl.includes("picsum")) {
        try {
          const sharp = (await import("sharp")).default;
          const buf = await loadBuffer(imageUrl.split("?")[0]);
          const resized = await sharp(buf).resize(size.w, size.h, { fit: "cover" }).toBuffer();
          const ext = imageUrl.split("?")[0].split(".").pop()?.toLowerCase() || "jpg";
          imageUrl = await saveBuffer(resized, ext, "resized-");
        } catch (e) {
          console.warn("[generate] 輸出尺寸 resize 失敗，保留原圖:", e);
        }
      }

      // ── 3.5 品牌 Logo 合成（像素級精準，疊在右下角）────────────────────────
      if (client.logoUrl && !imageUrl.includes("picsum")) {
        try {
          imageUrl = await overlayLogo({
            imageUrl,
            logoUrl: client.logoUrl,
            textZone: layoutConfig.textZone,
            seed: `${activityId}-${layoutConfig.type}-logo`,
          });
          console.log(`[generate] ✅ Logo overlaid: ${imageUrl.slice(0, 55)}`);
        } catch (e) {
          console.warn("[generate] logo overlay failed:", e);
        }
      }

      // ── 4. 存 DB ────────────────────────────────────────────────────────────
      const styleComponents = extractStyleComponents({
        layoutType:     layoutConfig.type as LayoutType,
        primaryColor:   client.primaryColor,
        secondaryColor: client.secondaryColor ?? undefined,
        toneLabels,
      });

      const savedLayout = await db.generatedLayout.create({
        data: {
          activityId,
          layoutType: layoutConfig.type,
          imageUrl,
          copyText: postCopy,
          styleComponents: JSON.stringify(styleComponents),
          textBurnedIn: enableTextOverlay,  // 記錄文字是否燒入圖片
        },
      });

      const today = new Date().toLocaleDateString("zh-TW");
      const aiPrompts = buildAiPromptText({
        layoutType:     layoutConfig.type as LayoutType,
        primaryColor:   client.primaryColor,
        secondaryColor: client.secondaryColor ?? undefined,
        toneLabels,
      });
      await db.styleComponent.createMany({
        data: [
          { name: `構圖-${layoutConfig.label}-${today}`, type: "COMPOSITION", data: JSON.stringify(styleComponents.composition), sourceLayoutId: savedLayout.id, clientId: activity.clientId, aiPromptText: aiPrompts.composition },
          { name: `配色-${client.primaryColor}-${today}`, type: "COLOR_SCHEME", data: JSON.stringify(styleComponents.colorScheme), sourceLayoutId: savedLayout.id, clientId: activity.clientId, aiPromptText: aiPrompts.color },
          { name: `語氣-${toneLabels[0] ?? "標準"}-${layoutConfig.label}`, type: "COPY_TONE", data: JSON.stringify(styleComponents.copyTone), sourceLayoutId: savedLayout.id, clientId: activity.clientId, aiPromptText: aiPrompts.tone },
        ],
      });

      layouts.push(savedLayout);
      console.log(`[generate] ✅ Layout ${layoutConfig.type} saved`);
    }

    await db.activity.update({ where: { id: activityId }, data: { status: "DONE" } });
    return NextResponse.json({ layouts });

  } catch (err) {
    console.error("[generate] ❌ Fatal error:", err);
    await db.activity.update({ where: { id: activityId }, data: { status: "FAILED" } });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
