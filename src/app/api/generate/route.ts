import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { anthropic } from "@/lib/anthropic";
import { generateImageFal, generateImageFluxSchnell, describeStyle, describeProduct, editImageFal } from "@/lib/fal";
import { generateImageOpenRouter } from "@/lib/openrouter";

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
import { buildCopyPrompt, buildImagePrompt } from "@/lib/prompts";
import { extractStyleComponents, buildAiPromptText } from "@/lib/extract-components";
import { LAYOUT_CONFIGS } from "@/types";
import type { LayoutType } from "@/types";

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

/** 取出完整發文文案 */
function parsePostCopy(raw: string): string {
  const match = raw.match(/發文文案[：:]\s*([\s\S]+)/);
  return match?.[1]?.trim() ?? "";
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

  await db.activity.update({ where: { id: activityId }, data: { status: "GENERATING" } });

  const { client } = activity;

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
      const requiredText = activity.titleText ?? activity.focusPoint ?? "";
      // Layout A 鎖定使用者填入的文字；B、C 讓 AI 自由發揮
      const isLockedLayout = layoutConfig.type === "A";
      const copyPrompt = buildCopyPrompt({
        theme:      activity.theme,
        focusPoint: activity.focusPoint ?? "",
        titleText:  activity.titleText  ?? "",
        toneLabels,
        layoutType: layoutConfig.type,
        taboos,
        forceTitle: isLockedLayout,
      });
      const copyResponse = await anthropic.messages.create({
        model: "claude-opus-4-5",
        max_tokens: 500,
        messages: [{ role: "user", content: copyPrompt }],
      });
      const rawCopy = (copyResponse.content[0] as { text: string }).text;

      // 圖上文字（短版）：主標題 + 圖上副標
      const { title: aiTitle, imageSubtitle: aiImageSubtitle } = parseImageText(rawCopy);

      // Layout A（鎖定）：prompt 已要求 AI 把使用者指定文字「不增刪改字」拆成主標+副標並做層次
      //                  → 直接採用 AI 拆分結果，保留設計感；AI 萬一沒給才降級用原文
      // Layout B/C：完全採用 AI 發想結果
      const finalTitle = aiTitle || (isLockedLayout ? (activity.titleText?.trim() ?? "") : "");
      const finalImageSubtitle = aiImageSubtitle;
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
      if (activity.customW > 0 && activity.customH > 0 && imageUrl.startsWith("/uploads/") && !imageUrl.includes("picsum")) {
        try {
          const sharp = (await import("sharp")).default;
          const { join } = await import("path");
          const { writeFile } = await import("fs/promises");
          const fp = join(process.cwd(), "public", imageUrl.split("?")[0]);
          const resized = await sharp(fp).resize(size.w, size.h, { fit: "cover" }).toBuffer();
          await writeFile(fp, resized);
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
