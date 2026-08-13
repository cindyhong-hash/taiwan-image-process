/**
 * typography.ts — 底圖模式「AI 特效字」生成（研究過程見 docs/TYPOGRAPHY-RESEARCH.md）。
 *
 * 做法（v7）：將底圖餵 Gemini，叫佢直接喺圖上加特效字（主字特效 hero + 副字樸素），
 *   若空間唔夠 → 擴展背景 + 產品移低、保留完整產品；用 raw output。失敗回 null → 上層 fallback Sharp 疊字。
 *
 * 風格 align：唔硬指定 mood，而係將 3 個信號一齊俾 Gemini 綜合 —
 *   ① 底圖 vibe（Gemini edit 直接睇到）② 品牌語氣 ③ 活動主題/prompt。
 *   叫佢自己揀最襯嘅風格。用戶亦可 UI 手揀（styleOverride）override。
 */
import sharp from "sharp";
import { loadBuffer, saveBuffer } from "@/lib/storage";

const OR = "https://openrouter.ai/api/v1/chat/completions";
const IMG_MODEL = "google/gemini-3-pro-image-preview";

/**
 * UI 手揀風格 palette（key → 中文 label + 俾 Gemini 嘅 mood 描述 + 對應品牌 archetype / tone 關鍵字）。
 * auto = 交 Gemini 綜合底圖+品牌+主題。research 見 docs/TYPOGRAPHY-RESEARCH.md（風格 palette 一節）。
 * `tones` = 用嚟建議風格嘅 tone 關鍵字（auto hint / UI 建議 / 將來 mapping 用）。
 */
export const STYLE_OPTIONS: { key: string; label: string; mood: string; tones: string[] }[] = [
  { key: "auto",       label: "自動（睇底圖＋品牌＋主題）", mood: "", tones: [] },
  // ── 通用 / 美妝 / 生活 ──
  { key: "luxury",     label: "高級質感", mood: "luxurious, premium, refined metallic gold texture, high-end, glossy",                 tones: ["專業", "精緻", "質感", "奢華", "高級", "信賴", "尊榮", "金融", "珠寶", "名錶", "旗艦", "尊貴"] },
  { key: "elegant",    label: "高貴優雅", mood: "elegant, noble, graceful, refined gold accents, classic serif sophistication",        tones: ["高貴", "優雅", "典雅", "尊貴", "經典", "格調", "時尚", "精品", "禮品"] },
  { key: "cozy",       label: "舒適溫柔", mood: "soft, cozy, gentle, comfortable, warm pastel, rounded friendly",                      tones: ["溫柔", "舒適", "柔和", "療癒", "溫暖", "呵護", "家居", "嬰兒", "寵物", "母嬰"] },
  { key: "natural",    label: "自然純淨", mood: "natural, organic, pure, eco, botanical green, soft watercolour, calm, balanced",      tones: ["自然", "純淨", "永續", "環保", "植物", "平衡", "重啟", "無添加", "有機", "保健", "農產", "健康", "草本"] },
  { key: "fresh",      label: "清新活潑", mood: "fresh, vibrant, youthful, playful, colourful sparkle, energetic, summery",            tones: ["活潑", "年輕", "清新", "夏", "動感", "繽紛", "元氣", "戶外", "旅遊", "休閒"] },
  { key: "romantic",   label: "浪漫夢幻", mood: "romantic, dreamy, sweet, feminine, floral petals, soft glow, delicate sparkle",       tones: ["浪漫", "夢幻", "少女", "甜美", "花香", "美肌", "保濕", "水潤", "婚禮"] },
  { key: "bold",       label: "自信力量", mood: "bold, powerful, confident, strong heavy display, dynamic, high-impact",               tones: ["自信", "力量", "大膽", "突破", "勇敢", "強效", "動力", "運動", "健身", "能量", "電競", "挑戰"] },
  { key: "minimal",    label: "簡約現代", mood: "minimalist, modern, clean, sleek sans-serif, geometric, generous spacing",            tones: ["簡約", "極簡", "現代", "俐落", "設計", "建築", "家電", "3C"] },
  { key: "clean",      label: "簡約無特效（純排版）", mood: "clean sophisticated refined typography, elegant restraint, tasteful colour, great spacing — beautiful WITHOUT heavy effects", tones: ["純粹", "質樸", "乾淨", "留白", "低調", "高級簡約"] },
  { key: "friendly",   label: "親和信賴", mood: "friendly, approachable, safe, warm, simple, trustworthy, cheerful rounded",           tones: ["親和", "安全", "貼心", "日常", "輕鬆", "簡單", "放心", "服務", "零售", "連鎖", "便利", "家庭"] },
  // ── 行業向 ──
  { key: "tech",       label: "科技未來", mood: "futuristic, hi-tech, digital, geometric sci-fi, neon glow, circuit lines, sleek metallic", tones: ["科技", "未來", "智能", "數碼", "AI", "創新", "電子", "晶片", "雲端", "軟件", "應用", "工程"] },
  { key: "appetizing", label: "美味誘人", mood: "warm, appetizing, delicious, juicy, mouth-watering, rounded chunky, steam, rich food colours", tones: ["美味", "鮮", "香濃", "食", "飲", "餐廳", "小食", "甜品", "飲品", "零食", "惹味", "滋味", "食品"] },
  { key: "mechanical", label: "機械動力", mood: "industrial, mechanical, powerful, forged metal, sparks, speed motion lines, bold condensed, high-octane", tones: ["機械", "引擎", "馬力", "性能", "工業", "速度", "汽車", "電單車", "五金", "工具", "強勁", "重工"] },
];

/** 由品牌 tone 關鍵字建議一個風格 key（auto 時俾 Gemini 做 hint；撞唔到回 "auto"）。 */
export function suggestStyleFromTones(tones: string[]): string {
  const joined = (tones || []).join(" ");
  let best = "auto", hit = 0;
  for (const s of STYLE_OPTIONS) {
    if (!s.tones.length) continue;
    const n = s.tones.filter((t) => joined.includes(t)).length;
    if (n > hit) { hit = n; best = s.key; }
  }
  return best;
}

// effect 程度：plain=純文字清晰 / effect=華麗特效 / styled=有 style 冇 effect
export type EffectLevel = "plain" | "effect" | "styled";

function editPrompt(opts: {
  title: string; sub: string; brandTones: string; theme: string; userPrompt: string; suggestedMood?: string; effectLevel: EffectLevel;
  preReserved?: boolean;  // true = B1 已喺頂部預留空帶；false = 原圖（唔可以當頂部係空）
  ratio?: string;         // 目標比例（e.g. "4:3"）；空 / "1:1" = 正方
}): string {
  const aspect = opts.ratio && opts.ratio !== "1:1"
    ? `Compose the output at ${opts.ratio} aspect ratio (match the given canvas shape exactly), full product inside. `
    : `Compose SQUARE 1:1 with full product inside. `;
  // mood（顏色/氛圍設計）永遠由 AI 綜合底圖+品牌+主題自選（唔再有 UI override）
  const styleLine = `STYLE: ${opts.suggestedMood ? `lean towards a "${opts.suggestedMood}" feel (it matches the brand tone), but ` : ``}pick the look that BEST fits the photo's visual vibe (colours, mood, lighting) + brand tone (${opts.brandTones || "—"}) + campaign theme (${[opts.theme, opts.userPrompt].filter(Boolean).join("; ") || "—"}). Decide the final look yourself so the lettering aligns with the whole image. `;
  const effectLine =
    opts.effectLevel === "plain"
      ? `HEADLINE treatment = PLAIN & CLEAR: simple clean bold lettering, high legibility, minimal styling — NO effects, NO 3D, NO glow, NO decorations. `
      : opts.effectLevel === "styled"
      ? `HEADLINE treatment = CLEAN yet sophisticated: elegant refined typographic design, tasteful colour & spacing, at most a very subtle shadow — NO 3D extrude, NO glow, NO decorations. `
      : `HEADLINE treatment = RICH special-effect: glossy colour-gradient strokes, depth, glow, tasteful thematic decorations matching the product. `;
  return (
    `This is a product advertising photo — treat it as ONE continuous full-bleed scene whose background reaches all four edges; do NOT add any frame, border, vignette, inner panel or picture-in-picture. ` +
    `The scene and its background texture must continue SEAMLESSLY to every edge; the typography sits directly on this one continuous photo, NEVER on a separate inset / card / panel. Blend the product naturally into the background. ` +
    `Add Traditional Chinese advertising typography with a CLEAR hierarchy: ` +
    `HEADLINE "${opts.title}" = the main hero line with well-designed lettering. ` +
    effectLine + styleLine +
    (opts.sub ? `SUBTITLE "${opts.sub}" = keep it SIMPLE, clean and plain so it contrasts the headline, but CLEARLY READABLE — about half the headline height, NOT tiny. ` : ``) +
    `SIZE: moderate — headline height ≈ 12-15% of the image; do not oversize. ` +
    (opts.preReserved
      ? `LAYOUT: the upper part of the image is empty background intentionally reserved for text — place the WHOLE text block (headline + subtitle) there, in the clear space above the product. Text must NOT cover/touch/overlap the product; keep the product EXACTLY as given — do NOT move, rescale, crop, or duplicate it. `
      : `LAYOUT: place the WHOLE text block (headline + subtitle) in the CLEANEST empty background area — the largest open negative space (usually near the top, or a clear gap) AWAY from the product. It must NEVER cover, touch or overlap the product or ANY part of it (cap, head, blade, handle, leaves on it, etc.). If the top is not clear enough, use another open area rather than sitting on the product. Keep the whole product visible; do not crop it. `) +
    `KEEP THE WHOLE PRODUCT VISIBLE incl. its very top (hanging hook/header) and bottom — do NOT crop any part. ` + aspect +
    `Keep the PRODUCT 100% identical in design/shape/label/colours (only position may move). Render the Chinese EXACTLY, correct strokes, no gibberish.`
  );
}

/**
 * 偵測底圖「頂部中央」有冇主體迫到頂（→ 要 B1 騰空間）。
 * 做法：以四角上方做背景參考色，數頂部 15%×中央 60% 區域內明顯異於背景嘅像素比例。
 * >35% = 產品迫頂（要加）；否則本身有頂部空位（唔使加，避免無謂縮細）。純本地，零 API。
 */
async function needsHeadroom(buf: Buffer): Promise<boolean> {
  try {
    const S = 256;
    const { data } = await sharp(buf).resize(S, S, { fit: "cover" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const at = (x: number, y: number) => { const i = (y * S + x) * 3; return [data[i], data[i + 1], data[i + 2]] as const; };
    const patch = (x0: number, y0: number) => {
      let r = 0, g = 0, b = 0, n = 0;
      for (let y = y0; y < y0 + 24; y++) for (let x = x0; x < x0 + 24; x++) { const p = at(x, y); r += p[0]; g += p[1]; b += p[2]; n++; }
      return [r / n, g / n, b / n] as const;
    };
    const tl = patch(4, 4), tr = patch(S - 28, 4);
    const bg = [(tl[0] + tr[0]) / 2, (tl[1] + tr[1]) / 2, (tl[2] + tr[2]) / 2];
    const y1 = Math.round(S * 0.15), x0 = Math.round(S * 0.2), x1 = Math.round(S * 0.8);
    let far = 0, tot = 0;
    for (let y = 0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const p = at(x, y);
      const d = Math.abs(p[0] - bg[0]) + Math.abs(p[1] - bg[1]) + Math.abs(p[2] - bg[2]);
      if (d > 90) far++;
      tot++;
    }
    return tot > 0 && far / tot > 0.35;
  } catch { return false; }   // 偵測失敗 → 保守唔加，維持原圖
}

async function readImageBuffer(url: string): Promise<Buffer | null> {
  try {
    if (url.startsWith("data:")) return Buffer.from(url.split(",")[1], "base64");
    if (url.startsWith("/")) return await loadBuffer(url.split("?")[0]);
    return Buffer.from(await (await fetch(url)).arrayBuffer());
  } catch { return null; }
}

/**
 * B1 預處理：底圖產品可能填滿 frame（泵頭貼頂）→ Gemini 一係唔夠位、一係索性切走產品。
 * 解決：喺 code 度先砌好構圖 —— 完整底圖縮細、貼底置中（保證 100% 唔 crop），
 * 其餘位置用「同一底圖放大 + 重模糊」做柔焦背景填滿（cover 全畫面、無硬框），
 * 頂部自然騰出乾淨文字帶。純本地 sharp，零額外 API 成本。
 */
async function padBaseForText(buf: Buffer, W = 1024, H = 1024): Promise<Buffer> {
  const bottomMargin = Math.round(H * 0.03);     // 留少少底邊，唔好黐死底
  // 產品 fit 入「寬 90% × 高 76%」框 → 頂部騰約 21% 文字帶（任意比例都啱）
  const fg = await sharp(buf)
    .resize(Math.round(W * 0.9), Math.round(H * 0.76), { fit: "inside" })
    .toBuffer();
  const m = await sharp(fg).metadata();
  const fgW = m.width ?? Math.round(W * 0.9);
  const fgH = m.height ?? Math.round(H * 0.76);
  const left = Math.round((W - fgW) / 2);
  const top = Math.max(0, H - fgH - bottomMargin);
  // 羽化遮罩：中心不透明、邊緣柔化 → 前景融入柔焦背景，避免硬框（似相中相）
  const feather = 80;
  const innerW = Math.max(1, fgW - feather * 2);
  const innerH = Math.max(1, fgH - feather * 2);
  const inner = await sharp({ create: { width: innerW, height: innerH, channels: 3, background: "#ffffff" } }).png().toBuffer();
  const mask = await sharp({ create: { width: fgW, height: fgH, channels: 3, background: "#000000" } })
    .composite([{ input: inner, left: feather, top: feather }])
    .blur(feather / 2)
    .toColourspace("b-w")
    .png()
    .toBuffer();
  const fgFeathered = await sharp(fg).removeAlpha().joinChannel(mask).png().toBuffer();
  const bg = await sharp(buf)
    .resize(W, H, { fit: "cover" })
    .blur(30)
    .modulate({ brightness: 1.05 })
    .toBuffer();
  return sharp(bg).composite([{ input: fgFeathered, left, top }]).jpeg({ quality: 92 }).toBuffer();
}

/**
 * 驗「相框感」：搵左右兩條跨大部分高度嘅垂直直線（相中相內邊）。
 * 回 0~1：無框圖 ≤0.30、有框圖 ≥0.66（實測 + 合成校準）→ 門檻 0.45。跳過頂部文字帶。
 */
async function frameScore(buf: Buffer): Promise<number> {
  try {
    const W = 512, H = 512;
    const { data } = await sharp(buf).resize(W, H, { fit: "fill" }).greyscale().raw().toBuffer({ resolveWithObject: true });
    const L = (x: number, y: number) => data[y * W + x];
    const y0 = Math.round(H * 0.35), y1 = Math.round(H * 0.92);
    let best = 0;
    for (const r of [0.06, 0.08, 0.10, 0.12, 0.14]) {
      const xL = Math.round(W * r), xR = Math.round(W * (1 - r));
      let hitL = 0, hitR = 0, tot = 0;
      for (let y = y0; y < y1; y++) {
        if (Math.abs(L(xL + 3, y) - L(xL - 3, y)) > 18) hitL++;
        if (Math.abs(L(xR + 3, y) - L(xR - 3, y)) > 18) hitR++;
        tot++;
      }
      best = Math.max(best, Math.min(hitL / tot, hitR / tot));
    }
    return best;
  } catch { return 0; }
}

/**
 * 驗「相中相」嘅另一種常見表現：一條跨幾乎成個闊度嘅**水平**硬邊（矩形嘅頂邊）——
 * B1 padBaseForText 個 feather 冇融合好時，Gemini 有時會將個複合圖直接當「一張相入面
 * 貼咗第二張相」處理，喺產品開始嗰行畫一條清晰水平線，而唔係前後兩條垂直側邊
 * （舊 `frameScore` 淨查垂直線，捉唔到呢種）。用真實生成圖校準：正常圖呢個分 <0.3，
 * 出現呢種硬邊嘅圖 ~0.79-0.80，分辨度好高，門檻同 `frameScore` 睇齊 0.45。
 */
async function horizontalFrameScore(buf: Buffer): Promise<number> {
  try {
    const W = 512, H = 512;
    const { data } = await sharp(buf).resize(W, H, { fit: "fill" }).greyscale().raw().toBuffer({ resolveWithObject: true });
    const L = (x: number, y: number) => data[y * W + x];
    const x0 = Math.round(W * 0.1), x1 = Math.round(W * 0.9);
    let best = 0;
    for (let yc = Math.round(H * 0.3); yc < Math.round(H * 0.75); yc += 4) {
      let hit = 0, tot = 0;
      for (let x = x0; x < x1; x++) {
        if (Math.abs(L(x, yc + 3) - L(x, yc - 3)) > 18) hit++;
        tot++;
      }
      best = Math.max(best, hit / tot);
    }
    return best;
  } catch { return 0; }
}

/** 單次 Gemini edit：回 resize 到 outW×outH 嘅 buffer；任何失敗回 null。 */
async function geminiEdit(dataUrl: string, prompt: string, outW = 1024, outH = 1024): Promise<Buffer | null> {
  try {
    const res = await fetch(OR, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
      body: JSON.stringify({
        model: IMG_MODEL,
        messages: [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: dataUrl } }] }],
        modalities: ["image", "text"],
      }),
    });
    const data = await res.json();
    const out: string | undefined = data?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!out) { console.warn("[typography] 冇圖:", JSON.stringify(data?.error ?? {}).slice(0, 150)); return null; }
    const raw = out.startsWith("data:")
      ? Buffer.from(out.split(",")[1], "base64")
      : Buffer.from(await (await fetch(out)).arrayBuffer());
    return await sharp(raw).resize(outW, outH, { fit: "cover" }).jpeg({ quality: 92 }).toBuffer();
  } catch (e) { console.warn("[typography] gen 失敗:", e); return null; }
}

/** 喺底圖上生成特效字廣告圖。成功回圖片 URL；任何失敗回 null（上層 fallback）。 */
export async function generateTypographyImage(opts: {
  baseImageUrl: string;
  title: string;
  subtitle?: string;
  brandTones?: string;   // 品牌語氣（toneLabels join）
  theme?: string;        // 活動主題
  userPrompt?: string;   // 用戶畫面描述
  effectLevel?: EffectLevel; // plain / effect / styled（3 款隨機分配）
  width?: number;            // 目標輸出寬（跟活動尺寸設定）；預設 1024
  height?: number;           // 目標輸出高；預設 1024
  ratio?: string;            // 目標比例 label（e.g. "4:3"）；俾 prompt 提示
  seed: string;
}): Promise<string | null> {
  if (!process.env.OPENROUTER_API_KEY || !opts.title.trim()) return null;
  try {
    const W = opts.width && opts.width > 0 ? Math.round(opts.width) : 1024;
    const H = opts.height && opts.height > 0 ? Math.round(opts.height) : 1024;
    const baseBuf = await readImageBuffer(opts.baseImageUrl);
    if (!baseBuf) return null;
    // B1：只喺產品迫到頂（冇文字空間）時先預處理；本身有頂部空位嘅底圖維持原樣（唔縮細）。
    // 兩路都輸出到目標 W×H（跟活動尺寸設定）：pad = 目標畫布騰文字帶；非 pad = cover 到目標比例。
    const didPad = await needsHeadroom(baseBuf);
    const normalized = didPad
      ? await padBaseForText(baseBuf, W, H)
      : await sharp(baseBuf).resize(W, H, { fit: "cover" }).jpeg({ quality: 92 }).toBuffer();
    const dataUrl = `data:image/jpeg;base64,${normalized.toString("base64")}`;
    // mood 永遠 AI 綜合：由品牌 tone 建議一個做 soft hint，再交 Gemini 睇底圖+主題微調
    const suggestedKey = suggestStyleFromTones((opts.brandTones ?? "").split(/[、,\s]+/).filter(Boolean));
    const suggestedMood = STYLE_OPTIONS.find((s) => s.key === suggestedKey)?.mood ?? "";
    const promptOpts = {
      title: opts.title, sub: opts.subtitle ?? "",
      brandTones: opts.brandTones ?? "", theme: opts.theme ?? "", userPrompt: opts.userPrompt ?? "",
      suggestedMood, effectLevel: opts.effectLevel ?? "effect" as EffectLevel, ratio: opts.ratio,
    };
    let final = await geminiEdit(dataUrl, editPrompt({ ...promptOpts, preReserved: didPad }), W, H);
    if (!final) return null;
    // 相框感有兩種表現：左右垂直側邊（frameScore）／頂邊一條橫跨闊度嘅水平線
    // （horizontalFrameScore——B1 padBaseForText 個 feather 冇融合好、Gemini 將複合圖當
    // 「相入面貼多一張相」處理時最常見，實測 3 張真實生成圖都撞到，舊 frameScore 淨查
    // 垂直線完全捉唔到）。兩個都要驗，攞較高嗰個分數。
    const combinedFrameScore = async (buf: Buffer) => Math.max(await frameScore(buf), await horizontalFrameScore(buf));
    // 逐級去框（只 pad case 驗）：① B1 → 有框 ② B1 re-roll → 仲有框 ③ B2 生成式 outpaint。
    // 多數 ① 就無框；框咗先 +1；頑固先再 +2（B2）。揀框分最低嗰張。
    if (didPad) {
      let bestScore = await combinedFrameScore(final);
      // ② B1 re-roll（加強禁框）
      if (bestScore > 0.45) {
        const retry = editPrompt({ ...promptOpts, preReserved: didPad }) + ` CRITICAL: output MUST be one seamless full-bleed photo — absolutely NO border/frame/inset; the background bleeds to all four edges.`;
        const alt = await geminiEdit(dataUrl, retry, W, H);
        if (alt) { const s = await combinedFrameScore(alt); console.warn(`[typography] re-roll seed=${opts.seed} ${bestScore.toFixed(2)}→${s.toFixed(2)}`); if (s < bestScore) { final = alt; bestScore = s; } }
      }
      // ③ B2 生成式 outpaint：原底圖 → AI 生成真實背景騰位（唔加字）→ 再 typography
      if (bestScore > 0.45) {
        const baseDataUrl = `data:image/jpeg;base64,${(await sharp(baseBuf).jpeg({ quality: 92 }).toBuffer()).toString("base64")}`;
        const outpaintPrompt = `Zoom OUT this product photo: make the product smaller and fully visible with clear empty space AROUND and ABOVE it. Generate MORE of the same realistic background (same style, colours, lighting, props) to fill the opened space so it looks like one natural photo shot with extra room. Keep the PRODUCT 100% identical (design/label/shape/colours); do NOT crop it; do NOT add ANY text. Output a seamless full-bleed photo — NO border, frame or vignette.`;
        const outpainted = await geminiEdit(baseDataUrl, outpaintPrompt, W, H);
        if (outpainted) {
          const opDataUrl = `data:image/jpeg;base64,${outpainted.toString("base64")}`;
          const b2 = await geminiEdit(opDataUrl, editPrompt({ ...promptOpts, preReserved: true }), W, H);
          if (b2) { const s = await combinedFrameScore(b2); console.warn(`[typography] B2 outpaint seed=${opts.seed} ${bestScore.toFixed(2)}→${s.toFixed(2)}`); if (s < bestScore) { final = b2; bestScore = s; } }
        }
      }
    }
    return await saveBuffer(final, "jpg", `ai-${opts.seed}-typo-`);
  } catch (e) {
    console.warn("[typography] 生成失敗:", e);
    return null;
  }
}
