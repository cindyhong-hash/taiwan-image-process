import type { LayoutConfig } from "@/types";

// ── Image prompt ──────────────────────────────────────────────────────────────

type ImagePromptParams = {
  theme: string;
  focusPoint: string;
  titleText?: string;
  subtitleText?: string;
  userImagePrompt?: string;
  primaryColor: string;
  secondaryColor?: string;
  toneLabels: string[];
  compositionPrompt: string;
  layoutType?: "A" | "B" | "C";  // 明確指定版型，避免靠字串偵測
  hasProductImage?: boolean;
  componentPrompts?: string;
  imageRatio?: string;
  styleReferenceDescription?: string;
  enableTextOverlay?: boolean;
  headline?: string;
  subtitle?: string;
  fontHint?: string;  // 品牌常用字體：作為圖上文字的字體風格提示
};

// ── 各 Layout 專屬的視覺設計語言 ────────────────────────────────────────────
const LAYOUT_VISUAL_LANGUAGE: Record<string, string> = {
  A: `
    COMPOSITION RULE (Layout A — Product Hero):
    - Product occupies right 55% of frame, slightly off-center, angled 10-15° for dynamism
    - Left 40% is reserved for typography hierarchy — do NOT crowd this zone with background elements
    - Depth: foreground prop (blurred), midground product (sharp), background scene (soft bokeh)
    - Lighting: 3-point product lighting — warm key light top-right, cool fill left, rim light behind product creating separation
    - Typography zone: left side, top-anchored, headline in LARGE bold weight, subtitle in medium, CTA pill at bottom-left
    - Overall feel: Apple product launch page, clean and premium
  `,
  B: `
    COMPOSITION RULE (Layout B — High Impact):
    - FULL BLEED dramatic scene — the entire frame is the story
    - Product is integrated INTO the environment, not placed on top of it
    - Typography: MASSIVE headline, minimum 35% of frame height, acting as a design element itself
    - Headline treatment: bold gradient fill (brand color to white/gold, or white text with colored stroke outline)
    - Each line of headline can break intentionally for rhythm — big/small alternating scale is encouraged
    - One dominant color temperature rules the entire image (either warm amber/gold OR cool blue/silver)
    - Energy: kinetic, bold, slightly asymmetric — like a Nike billboard or Red Bull ad
    - CTA at bottom: high-contrast pill button, punchy
  `,
  C: `
    COMPOSITION RULE (Layout C — Mood & Atmosphere):
    - Lifestyle-first: product exists naturally within an aspirational scene
    - Generous negative space — breathing room is the luxury signal
    - Lighting: soft, directional natural light (golden hour or north-facing studio window feel)
    - Color grading: slightly desaturated base with ONE accent color pop (e.g. brand color on product packaging)
    - Typography: elegant, airy — headline centered top with tracking +0.05em equivalent, thin-to-bold weight contrast
    - Texture: visible — fabric grain, skin texture, surface imperfections that signal "real photography"
    - Overall feel: Vogue editorial, high-end skincare or luxury travel advertising
  `,
};

// ── 文字燒入：專業廣告排版指令 ───────────────────────────────────────────────
function buildTypographyBlock(
  layout: string,
  headline?: string,
  subtitle?: string,
  fontHint?: string,
): string {
  if (!headline && !subtitle) return "";

  const layoutTypo: Record<string, string> = {
    A: `
      TYPOGRAPHY PLACEMENT (Layout A):
      - Headline: top-left zone, Chinese characters rendered in BOLD heavy weight, font-size equivalent to ~11% of image height
      - Headline color: pure white with a natural cast shadow that matches the scene's light direction (NOT a flat drop shadow box)
      - Optional: first character or key word in brand accent color
      - Subtitle: directly below headline, 55% the size, regular weight, off-white (#F0F0F0) with 90% opacity
      - Background behind text: organic gradient wash (NOT a solid rectangle) — dark-to-transparent vignette that emerges from the left edge
    `,
    B: `
      TYPOGRAPHY PLACEMENT (Layout B):
      - Headline: center-left, takes up 35-40% of image height — THIS IS THE HERO ELEMENT
      - Headline treatment: gradient fill from brand primary color to white/gold, OR white text with colored stroke outline
      - Each line of headline can break intentionally for rhythm — big/small alternating scale is encouraged
      - Subtitle: below headline, smaller, acts as supporting detail — white, semi-transparent
      - Price or key stat (if in subtitle): bold, larger, color accent — make the number POP
      - NO text box backgrounds needed — the scene contrast handles legibility
    `,
    C: `
      TYPOGRAPHY PLACEMENT (Layout C):
      - Headline: top-center, elegant wide tracking, mix of thin and bold weights within same headline
      - Headline color: can be brand color, gold (#C9A84C), or white — whichever reads cleanest against the scene
      - Layout: centered, generous line-height, feels like a magazine masthead
      - Subtitle: centered below, much smaller, refined — like an editorial caption
      - NO heavy overlays — text should feel like it belongs in the photograph, with natural shadow integration
    `,
  };

  const typoGuide = layoutTypo[layout] ?? layoutTypo["A"];

  return [
    `CRITICAL — BURN THESE CHINESE TEXT ELEMENTS DIRECTLY INTO THE IMAGE:`,
    headline ? `  Headline text: 「${headline}」` : "",
    subtitle ? `  Subtitle text: 「${subtitle}」` : "",
    typoGuide,
    `RENDERING REQUIREMENTS:`,
    `  - Text must cast REAL shadows consistent with the scene's light source direction`,
    fontHint
      ? `  - Render the Chinese characters in a typeface STYLE resembling "${fontHint}" (match its overall character — e.g. gothic/黑體, serif/明體, rounded/圓體, or handwriting — not necessarily the exact font file)`
      : `  - Characters must have proper Chinese font rendering — use a bold gothic/黑體 style`,
    `  - Text must be 100% legible — if contrast is insufficient, add a localized luminosity adjustment, NOT a flat semi-transparent box`,
    `  - The final result must look like a PROFESSIONAL DESIGNER spent hours on the typography, not like text was pasted on`,
    `  - DO NOT add any other text, watermarks, or Chinese characters besides the specified content above`,
    ``,
    `CRITICAL TEXT UNIQUENESS RULE:`,
    `- Each text element must appear EXACTLY ONCE in the entire image`,
    `- Do NOT repeat, duplicate, mirror, or echo any text element in any other location`,
    `- Do NOT render the same text in both large and small sizes simultaneously`,
    `- Do NOT add decorative repetitions, watermark versions, or secondary instances of any text`,
    `- If only a headline is provided with no subtitle, leave the subtitle area completely empty`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildImagePrompt(params: ImagePromptParams): string {
  const {
    theme, focusPoint, titleText, subtitleText, userImagePrompt,
    primaryColor, secondaryColor, toneLabels, compositionPrompt, layoutType,
    hasProductImage, componentPrompts, imageRatio, styleReferenceDescription,
    enableTextOverlay, headline, subtitle, fontHint,
  } = params;

  const colorDesc = secondaryColor
    ? `primary brand color ${primaryColor} with accent ${secondaryColor}`
    : `brand color ${primaryColor}`;
  const toneDesc = toneLabels.length > 0 ? toneLabels.join(", ") : "professional";

  // Layout 類型：優先用明確傳入的 layoutType，沒有才退回字串偵測（向下相容）
  const layoutKey =
    layoutType
      ?? (compositionPrompt.includes("Layout A") || compositionPrompt.includes("top-left")
        ? "A"
        : compositionPrompt.includes("Layout B") || compositionPrompt.includes("High Impact")
          ? "B"
          : compositionPrompt.includes("Layout C") || compositionPrompt.includes("Mood")
            ? "C"
            : "A");

  const layoutVisual = LAYOUT_VISUAL_LANGUAGE[layoutKey] ?? "";

  const qualityManifesto = [
    `You are generating a WORLD-CLASS commercial advertisement image.`,
    `Quality standard: indistinguishable from a top-tier advertising agency production (think Ogilvy, Dentsu, BBDO).`,
    ``,
    `PHOTOGRAPHY REQUIREMENTS:`,
    `  - Shot on Phase One medium format or Sony A1, 85mm f/1.4 lens`,
    `  - Real photography aesthetic: natural caustics, lens micro-flare, subtle chromatic aberration at edges`,
    `  - Depth of field: subject razor-sharp, background smoothly defocused (NOT artificially blurred)`,
    `  - Lighting: motivated by a real-world light source — NOT flat studio lighting, NOT artificial ring-light look`,
    `  - Surface detail: visible texture on every material, each rendered with its own true finish (fabric weave, skin pores, brushed metal, matte or glossy packaging as appropriate)`,
    ``,
    `WHAT TO AVOID (these make images look AI-generated):`,
    `  - Floating geometric objects, colorful spheres, or abstract shapes as background filler`,
    `  - Oversaturated, candy-colored palettes`,
    `  - Symmetrical, centered compositions that feel template-like`,
    `  - Plastic-looking skin or product surfaces with no texture`,
    `  - Generic stock photo compositions`,
    `  - 3D render look, CGI, illustration, cartoon`,
  ].join("\n");

  const parts: string[] = [qualityManifesto, ""];

  if (styleReferenceDescription) {
    parts.push(
      `BRAND VISUAL IDENTITY — match this aesthetic precisely:`,
      `  ${styleReferenceDescription}`,
      ``,
    );
  }

  if (hasProductImage) {
    parts.push(`CAMPAIGN: "${theme}" — professional lifestyle advertising photograph.`, ``);
    parts.push(`SCENE DIRECTION:`);
    if (userImagePrompt) {
      parts.push(`  ${userImagePrompt}`);
      // 畫面描述為主，品牌調性僅作次要氛圍提示
      parts.push(`  (Secondary mood hint — let the scene direction above lead, just nudge the overall vibe toward: ${toneDesc}.)`);
    } else {
      parts.push(
        `  Aspirational lifestyle setting that emotionally resonates with the product's promise.`,
        `  Mood and tone: ${toneDesc}.`,
        `  The scene should tell a story — the product is the hero, but the environment gives it meaning.`,
      );
    }
    if (focusPoint) parts.push(`  Key message to convey visually: ${focusPoint}`);
  } else {
    parts.push(`CAMPAIGN: "${theme}" — complete advertising creative, no separate product photo.`, ``);
    parts.push(`SCENE DIRECTION:`);
    if (userImagePrompt) parts.push(`  ${userImagePrompt}`);
    if (focusPoint)      parts.push(`  Visual narrative: ${focusPoint}`);
    if (userImagePrompt) {
      // 有畫面描述：品牌調性僅作次要氛圍提示
      parts.push(`  (Secondary mood hint — let the scene direction above lead, just nudge the overall vibe toward: ${toneDesc}.)`);
    } else {
      parts.push(`  Mood and tone: ${toneDesc}.`);
    }
  }

  parts.push("");
  parts.push(`COMPOSITION & LAYOUT:`);
  if (compositionPrompt) parts.push(`  ${compositionPrompt}`);
  parts.push(layoutVisual, "");

  parts.push(
    `COLOR DIRECTION:`,
    `  Brand colors: ${colorDesc}`,
    `  Apply brand color as: product packaging accent, CTA button, or selective color pop on ONE key element`,
    `  Overall color grading: sophisticated, magazine-quality — NOT oversaturated`,
    `  Color temperature should be consistent across the entire frame`,
    ``,
  );

  if (componentPrompts) parts.push(`STYLE COMPONENTS: ${componentPrompts}`, ``);

  parts.push(`ASPECT RATIO: ${imageRatio ?? "1:1"}. Compose with this ratio's safe zones in mind.`, ``);

  if (enableTextOverlay && (headline || subtitle)) {
    parts.push(buildTypographyBlock(layoutKey, headline, subtitle, fontHint));
  } else {
    parts.push(
      `TEXT: Absolutely NO text, letters, numbers, watermarks, logos, or Chinese characters anywhere in the image.`,
      `The image is a background plate — text will be added in post-production.`,
    );
  }

  parts.push(
    ``,
    `FINAL QUALITY CHECK: Before rendering, verify —`,
    `  ✓ Would a creative director at a top ad agency approve this?`,
    `  ✓ Does every element serve the campaign message?`,
    `  ✓ Is the composition dynamic and non-generic?`,
    `  ✓ Does the lighting feel real and motivated?`,
    `  ✓ Is the typography (if any) indistinguishable from professional design work?`,
  );

  return parts.join("\n");
}

// ── Copy prompt ───────────────────────────────────────────────────────────────

type CopyPromptParams = {
  theme: string;
  focusPoint: string;
  titleText?: string;
  subtitleText?: string;
  toneLabels: string[];
  layoutType: string;
  taboos: string[];
  forceTitle?: boolean;  // 主標題強制使用 titleText（鎖定版）
  productContext?: string;  // [底圖模式] vision 認出嘅產品/畫面描述，令冇 title 時文案唔會離題
  brandDescription?: string; // 品牌簡介（品牌記憶）：作品牌背景參考，讓文案更貼品牌
};

const LAYOUT_COPY_PERSONA: Record<string, { direction: string; examples: string }> = {
  A: {
    direction: "清晰有力。主標直接點出核心利益，副標補充使用場景或信任感，CTA 製造行動動力。",
    examples: `好的範例：主標「肌膚的一口呼吸」／副標「含 5% 玻尿酸，8 小時深層保濕，油肌敏肌都適用」／CTA「立即體驗」
避免：主標太長（超過10字）、副標太模糊（「高品質好產品」這種）`,
  },
  B: {
    direction: "視覺衝擊感。主標要有力量、有節奏感，像廣告標語。副標可以列出具體數字或對比。CTA 帶有急迫感。",
    examples: `好的範例：主標「飛機上，也要保養」／副標「Schick Salon 旅行套組 NT$999｜3款神器一次帶走」／CTA「滑到最後」
避免：主標太文藝、沒有衝擊力；副標沒有具體資訊`,
  },
  C: {
    direction: "情境代入感。讓人看到文案就想像自己在那個場景裡。主標有詩意但不虛。副標有畫面感。",
    examples: `好的範例：主標「落地，依然是你」／副標「機長不說的秘密：帶對保養品，下機後的狀態決定你的第一印象」／CTA「立即登機」
避免：太過推銷感、硬賣；主標太直白沒有情境`,
  },
};

export function buildCopyPrompt(params: CopyPromptParams): string {
  const { theme, focusPoint, titleText, toneLabels, layoutType, taboos, forceTitle, productContext, brandDescription } = params;
  const brandLine = brandDescription?.trim()
    ? `- 品牌簡介（背景參考，文案風格要貼合這個品牌）：${brandDescription.trim()}`
    : "";

  const persona = LAYOUT_COPY_PERSONA[layoutType] ?? LAYOUT_COPY_PERSONA["A"];

  // 主題清走構圖雜訊後可能係空 → 叫 AI 依產品+品牌發揮，唔好虛構無關題材（如「AI/科技」）
  const themeLine = theme.trim()
    ? `- 主題：${theme.trim()}`
    : `- 主題：（未指定 — 請依下方「產品／畫面」同品牌調性發揮，切勿虛構無關題材）`;
  const productLine = productContext?.trim()
    ? `- 產品／畫面內容（AI 睇圖認出，文案要扣住呢個產品）：${productContext.trim()}`
    : "";

  // requiredText 是「訊息方向參考」，不是要原封不動放上去的文字
  const messageDirection = titleText || focusPoint
    ? `\n【核心訊息方向】（請理解這個訊息的精髓，用更精煉的方式表達，不要原文照用）：\n「${titleText || focusPoint}」`
    : "";

  // 鎖定版：使用者指定文字「一字不增刪改」，但允許拆成主標+副標並做大小層次；自由版：AI 發揮
  const titleInstruction = forceTitle && titleText?.trim()
    ? `【文字鎖定指示】以下是必須完整出現在圖上的指定文字，每一個字都不可增加、刪減或修改：「${titleText}」
請把這段文字「重新分配」成「主標題」與「圖上副標」兩段，做出有設計感的視覺層次：
- 把最有力、最吸睛的關鍵短句（約 6-10 字）放進「主標題」，讓它可以放大、成為視覺主角
- 其餘文字放進「圖上副標」，作為補充說明
- 兩段加起來必須「剛好等於」指定文字的全部字句，順序維持通順，不可漏字、不可加字、不可改字
- 標點可在斷句處自然調整，但文字內容本身不變
- 目標：像 B、C 版型那樣有主次大小對比，而不是一整句平鋪直敘`
    : `主標題請根據活動主題與重點自由發揮，目標吸睛有力，10 字以內。`;

  return `你是台灣頂尖廣告公司的資深文案總監，擅長把品牌訊息提煉成讓人停下來看的廣告語。

【任務】
為以下活動撰寫廣告文案，需同時產出「圖上文字」和「發文文案」兩個版本。
${messageDirection}

【活動資訊】
${themeLine}
${productLine ? productLine + "\n" : ""}${brandLine ? brandLine + "\n" : ""}- 品牌調性：${toneLabels.join("、") || "專業、親切"}
- 版型方向：${persona.direction}
- 禁忌事項：${taboos.length > 0 ? taboos.join("、") : "無特別限制"}

【圖上文字原則】——想像這些字會被放大印在廣告看板上
- ${titleInstruction}
- 圖上副標：最多12字，一行，是主標的情境補充，不要列功能清單
- CTA：3-6字，有行動感

【發文文案原則】
- FB/IG 貼文用，可較詳細（50-100字）
- 可以列具體功效、場景、數字

【參考範例】
${persona.examples}

【輸出格式】（嚴格遵守，不要加任何解釋或前言）
主標題：（10字以內）
圖上副標：（12字以內，一行）
CTA：（3-6字）
發文文案：（50-100字完整貼文）`;
}
