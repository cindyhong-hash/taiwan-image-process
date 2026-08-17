"use client";
/**
 * PromptComposer — 生成圖片 tab 的積木組合台
 * Slots (構圖/配色/語氣/背景) 可點擊揀已有素材；可上傳產品圖（AI 描述填主體 / 直接合成）；
 * 色盤逐色開關；其他注意事項。生成走 POST /api/library/generate。
 */

import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import {
  X, Check, Sparkles, LayoutTemplate, Palette,
  Image as ImageIcon, Loader2, Upload, Plus, Trash2, Type, Wand2, ChevronDown, Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PromptSlots, StyleComponent, ComponentCategory, PaletteColor, PaletteRole } from "@/types/library";
import { CATEGORY_META, getColors, PALETTE_ROLES, SHOW_SERIES_TEMPLATE } from "@/types/library";
import { ColorCards } from "./ColorCards";
import { SlotPickerModal } from "./SlotPickerModal";
import { INDUSTRY_PRESETS } from "@/types/presets";
import { useRotatingHint } from "@/hooks/useRotatingHint";
import { pollLibraryImage } from "@/lib/pollLibraryImage";

// 生成 loading 輪播提示（保留時間估計，額外報進度）
const GEN_HINTS = ["正在生成 AI 圖片…", "分析構圖 / 配色…", "合成場景中…", "處理光影細節…", "快好喇，請稍候…"];

type Prefill = { subject?: string; notes?: string; useFlags?: Record<string, boolean> };

type Props = {
  slots: PromptSlots;
  onClearSlot: (slot: keyof PromptSlots) => void;
  onPickSlot: (comp: StyleComponent) => void;
  clientId: string | null;
  onGenerated?: () => void;
  /** 撳「生成」送出去 server 嗰刻（未等生成完）即刻通知上層 —— 令主畫廊即刻見到「生成中」佔位卡。 */
  onStarted?: () => void;
  prefill?: Prefill;
  prefillNonce?: number;
  // 通知上層（modal header）：組裝台有冇內容（用嚟決定 header「清空重來」掣顯示與否）。
  onDirtyChange?: (dirty: boolean) => void;
};

// 暴露俾上層（ProductComposeModal header）調用嘅 handle。
export type PromptComposerHandle = { reset: () => void };

// A palette row mirrors QuickAddModal: fixed 5 roles, checkbox toggles enabled.
type PalRow = { role: PaletteRole; label: string; hex: string; enabled: boolean };

/** Build the 5-role palette table from a COLOR_SCHEME component (absent roles default + disabled). */
function buildPaletteRows(comp: StyleComponent | null): PalRow[] {
  const cols = comp ? getColors(comp.data) : [];
  return PALETTE_ROLES.map((r, idx) => {
    const found = cols.find((c) => c.role === r.role);
    return {
      role: r.role,
      label: r.label,
      hex: found?.hex ?? (idx === 0 ? "#3b82f6" : idx === 1 ? "#1f2937" : "#e5e7eb"),
      enabled: r.role === "primary" ? true : !!found,
    };
  });
}

/** Build the Traditional-Chinese design brief (this is what the user edits; server translates → English).
 *  NOTE: 背景 is an image asset used only in 合成 mode, so it is intentionally NOT part of the text brief. */
function buildChineseBrief(args: {
  subject: string; layoutDesc: string; toneLabels: string[]; usedColors: PaletteColor[]; notes: string; backgroundDesc?: string;
}): string {
  const lines: string[] = [];
  if (args.subject.trim()) lines.push(`主體：${args.subject.trim()}`);
  if (args.layoutDesc.trim()) lines.push(`構圖：${args.layoutDesc.trim()}`);
  if (args.usedColors.length) lines.push(`配色：${args.usedColors.map((c) => `${c.label} ${c.hex}`).join("、")}`);
  if (args.backgroundDesc?.trim()) lines.push(`背景：${args.backgroundDesc.trim()}`);
  if (args.toneLabels.length) lines.push(`風格語氣：${args.toneLabels.join("、")}`);
  if (args.notes.trim()) lines.push(`其他要求：${args.notes.trim()}`);
  return lines.join("\n");
}

// ─── Tone tag editor ─────────────────────────────────────────────────────────
function ToneTagEditor({ tags, onChange }: { tags: string[]; onChange: (t: string[]) => void }) {
  const [input, setInput] = useState("");
  const add = () => {
    const v = input.trim();
    if (v && !tags.includes(v)) onChange([...tags, v]);
    setInput("");
  };
  return (
    <div className="mt-2">
      <div className="flex flex-wrap gap-1.5 mb-1.5">
        {tags.length === 0 && <span className="text-xs text-gray-400 italic">未設定語氣，可新增</span>}
        {tags.map((t, i) => (
          <span key={i} className="flex items-center gap-1 bg-amber-100 text-amber-700 text-[11px] px-2 py-0.5 rounded-full border border-amber-200">
            {t}
            <button onClick={() => onChange(tags.filter((_, j) => j !== i))} className="hover:text-red-500" title="移除"><X className="h-2.5 w-2.5" /></button>
          </span>
        ))}
      </div>
      <div className="flex gap-1.5">
        <input value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder="輸入語氣後按 Enter（例：溫柔、專業）"
          className="flex-1 border border-amber-200 rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white" />
        <button onClick={add} className="px-2 py-1 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg text-xs hover:bg-amber-100"><Plus className="h-3.5 w-3.5" /></button>
      </div>
    </div>
  );
}

// ─── Single slot card (full-width, inline-editable) ──────────────────────────
function SlotCard({
  category, icon, emptyLabel, component, onClear, onPick,
  descValue, onDescChange, tags, onTagsChange, colorsDisplay, footer, labelOverride,
}: {
  category: ComponentCategory;
  icon: React.ReactNode;
  emptyLabel: string;
  /** Override the category's default label for this card only (global CATEGORY_META unchanged). */
  labelOverride?: string;
  component: StyleComponent | null;
  onClear: () => void;
  onPick: () => void;
  /** COMPOSITION / BACKGROUND: editable description (繁中). */
  descValue?: string;
  onDescChange?: (v: string) => void;
  /** COPY_TONE: editable tags. */
  tags?: string[];
  onTagsChange?: (t: string[]) => void;
  /** COLOR_SCHEME: palette to display (with live edits). */
  colorsDisplay?: PaletteColor[];
  /** COLOR_SCHEME: palette editor rendered below the swatches. */
  footer?: React.ReactNode;
}) {
  const meta = CATEGORY_META[category];
  const filled = !!component;

  return (
    <div
      onClick={!filled ? onPick : undefined}
      className={`rounded-xl border p-3 transition-all ${filled ? `${meta.bg} ${meta.border}` : "border-dashed border-violet-300 bg-white hover:border-violet-500 hover:bg-violet-50/50 cursor-pointer hover:shadow-sm"}`}>
      {/* Header — click to (re)pick the source material */}
      <div className="flex items-center justify-between">
        <div className={`flex items-center gap-1.5 text-xs font-semibold cursor-pointer ${filled ? meta.color : "text-violet-600"}`} onClick={onPick}>
          {icon}
          {labelOverride ?? meta.label}
          {filled && <span className="text-[10px] font-normal text-gray-400">（點此更換素材）</span>}
        </div>
        {filled && (
          <button onClick={(e) => { e.stopPropagation(); onClear(); }} className="text-gray-400 hover:text-red-500 transition-colors" title="移除此積木">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {filled ? (
        <div className="mt-2">
          <div className="text-sm font-medium text-gray-800 leading-snug">{component.name}</div>

          {category === "COMPOSITION" && onDescChange && (
            <textarea value={descValue ?? ""} onChange={(e) => onDescChange(e.target.value)} rows={2}
              placeholder="構圖描述（繁中，可改）…"
              className="mt-1.5 w-full rounded-lg border border-indigo-200 bg-white/70 px-2.5 py-1.5 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300 leading-relaxed" />
          )}

          {category === "BACKGROUND" && (
            (component.data.imageUrl || component.previewUrl) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={(component.data.imageUrl as string) || component.previewUrl!} alt="bg" className="mt-2 w-full h-28 object-cover rounded-md border" />
            ) : (
              <div className="mt-1 text-[11px] text-gray-400 italic">此背景無圖片（請改選有圖片的背景）</div>
            )
          )}

          {category === "COPY_TONE" && onTagsChange && (
            <ToneTagEditor tags={tags ?? []} onChange={onTagsChange} />
          )}

          {category === "COLOR_SCHEME" && (
            <>
              {(colorsDisplay?.length ?? 0) > 0 && (
                <div className="mt-2 overflow-hidden">
                  <ColorCards colors={colorsDisplay!} height="h-16" />
                </div>
              )}
              {footer}
            </>
          )}
        </div>
      ) : (
        <div onClick={onPick} className="flex items-center gap-1 text-xs text-violet-500 mt-2 cursor-pointer"><Plus className="h-3.5 w-3.5" />{emptyLabel}</div>
      )}
    </div>
  );
}

// 編號分段標題（同活動圖頁 ActivityForm 一致）
function SectionLabel({ step, title, hint }: { step: string; title: string; hint?: string }) {
  return (
    <div className="flex items-baseline gap-2 border-b pb-1.5">
      <span className="text-[10px] font-bold text-gray-400 tracking-widest">{step}</span>
      <span className="text-sm font-semibold text-gray-800">{title}</span>
      {hint && <span className="text-xs text-gray-400 font-normal">{hint}</span>}
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────
export const PromptComposer = forwardRef<PromptComposerHandle, Props>(function PromptComposer(
  { slots, onClearSlot, onPickSlot, clientId, onGenerated, onStarted, prefill, prefillNonce, onDirtyChange }, ref) {
  const [subject, setSubject] = useState("");
  const [notes, setNotes] = useState("");
  const [generating, setGenerating] = useState(false);
  const [bgAsImage, setBgAsImage] = useState(false); // 背景：false=作文字參考(預設) / true=直接用背景圖合成
  const [genError, setGenError] = useState<string | null>(null);
  const [pickerCategory, setPickerCategory] = useState<ComponentCategory | null>(null);
  // #3 多輸出（合成）：一次生 N 張 draft（唔即刻入庫）→ 揀邊張保留。
  const [count, setCount] = useState(1);
  // draft 各自帶用咗嘅產品圖（系列圖時每張得一件）。
  const [drafts, setDrafts] = useState<{ imageUrl: string; copyText: string; mode: string; selected: boolean; productImageUrls: string[]; id?: string }[] | null>(null);
  const [savingDrafts, setSavingDrafts] = useState(false);
  // 生成完成（drafts 一出）自動 scroll 落揀圖區（同素材生成一致）。
  // ref 擺喺真正嘅 drafts 容器（唔再用 0 高度空錨點）+ block:"start"；draft 圖 async load，
  // 用 setTimeout 等 layout settle 先 scroll，否則塊區仲未有高度，scroll 唔到位。
  const resultRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!drafts) return;
    const t = setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
    return () => clearTimeout(t);
  }, [drafts]);
  // #4 系列圖：固定模板貼圖（方案 A）—— 每件產品貼喺固定背景嘅固定位置/尺寸，100% 一致。
  const [seriesMode, setSeriesMode] = useState(false);
  // 擺位：scale=產品高度佔比，x/y=產品中心（0–1）。可拖預覽 + 滑桿調大小。
  const [placement, setPlacement] = useState({ scale: 0.6, x: 0.5, y: 0.62 });
  // AI 融合打光（opt-in）：貼好後 relight，更自然但有少少 drift 風險。
  const [harmonize, setHarmonize] = useState(false);
  // #2 潤色寫手：擴寫後嘅繁中 brief 覆寫（opt-in，可編輯；null = 用自動產生嘅）。
  const [polishedBrief, setPolishedBrief] = useState<string | null>(null);
  const [polishing, setPolishing] = useState(false);
  // Editable compiled prompt override
  const [activePreset, setActivePreset] = useState<string | null>(null);
  // [UX 精簡] 純顯示用折疊狀態（不影響生成）：進階設定(引擎/系列) 與 自動組裝設計描述 預設收合
  const [showAdvanced, setShowAdvanced] = useState(true);  // 依 mockup 預設展開 Model

  // Subject input mode — 二選一: "image" (上傳產品圖 → 合成，預設主選) or "text" (純 AI 生成，次選)
  const [inputMode, setInputMode] = useState<"text" | "image">("image");
  // 1–3 product photos for compositing together into one scene.
  const [productUrls, setProductUrls] = useState<string[]>([]);
  const MAX_PRODUCTS = 3;
  const [productUploading, setProductUploading] = useState(false);
  // Output size — 8 比例（同活動圖頁一致）+ 自訂；底層一律換算成確切 W×H 送 size:"custom"（後端 line 63 用 exact dims，毋須改後端）。
  const RATIO_DIMS: Record<string, { w: number; h: number }> = {
    "1:1": { w: 1200, h: 1200 }, "4:5": { w: 1200, h: 1500 }, "3:4": { w: 1200, h: 1600 },
    "2:3": { w: 1200, h: 1800 }, "9:16": { w: 1080, h: 1920 }, "4:3": { w: 1600, h: 1200 },
    "3:2": { w: 1800, h: 1200 }, "16:9": { w: 1920, h: 1080 },
  };
  const [ratio, setRatio] = useState<string>("1:1");
  const [customW, setCustomW] = useState(1200);
  const [customH, setCustomH] = useState(1200);
  // 揀比例 → 自動填 W×H（可再改，改時鎖住比例）；自訂 → 自由 W×H。outDims 一律用 customW/H。
  const outDims = { w: customW, h: customH };
  const pickRatio = (r: string) => { setRatio(r); if (r !== "custom") { setCustomW(RATIO_DIMS[r].w); setCustomH(RATIO_DIMS[r].h); } };
  const changeDim = (which: "w" | "h", v: number) => {
    const rd = RATIO_DIMS[ratio];
    if (which === "w") { setCustomW(v); if (ratio !== "custom" && rd) setCustomH(Math.round(v * rd.h / rd.w)); }
    else { setCustomH(v); if (ratio !== "custom" && rd) setCustomW(Math.round(v * rd.w / rd.h)); }
  };
  // 合成方式引擎（全部支援多產品）：flux2edit（主力）/ nano / seedream / qwen / paste（文字保真貼圖）。
  const [engine, setEngine] = useState<"flux2edit" | "nano" | "seedream" | "qwen" | "paste">("flux2edit");
  const [describing, setDescribing] = useState(false);
  const composite = inputMode === "image" && productUrls.length > 0;
  const genHint = useRotatingHint(generating, GEN_HINTS);
  // 五個引擎全部支援多產品，毋須單圖限制。
  const effEngine = engine;

  // ── Inline-edit overrides (local; never overwrite the library component) ──
  const [layoutDescOv, setLayoutDescOv] = useState<string | null>(null);
  const [toneLabelsOv, setToneLabelsOv] = useState<string[] | null>(null);
  // Palette as a fixed 5-role table (same model as QuickAddModal): checkbox enables/disables.
  const [paletteRows, setPaletteRows] = useState<PalRow[] | null>(null);

  const effRows = paletteRows ?? buildPaletteRows(slots.color);
  const enabledColors: PaletteColor[] = effRows.filter((r) => r.enabled).map((r) => ({ hex: r.hex, role: r.role, label: r.label }));
  const effLayoutDesc = layoutDescOv ?? ((slots.layout?.data?.description as string) ?? "");
  const effToneLabels = toneLabelsOv ?? ((slots.tone?.data?.toneLabels as string[]) ?? []);
  // 有冇「臨時改咗」揀落嗰個 block（用嚟決定儲存嗰陣要唔要起一個新 block，唔好靜雞雞冒認舊 id）。
  const colorEdited = paletteRows !== null && JSON.stringify(paletteRows) !== JSON.stringify(buildPaletteRows(slots.color));
  const layoutEdited = layoutDescOv !== null && layoutDescOv !== ((slots.layout?.data?.description as string) ?? "");

  // Reset overrides when a slot's source material changes — using React's documented
  // "adjust state during render by comparing to previous state" pattern (no effects),
  // which avoids the cascading re-renders that made the composer feel laggy / hard to click.
  const [prevColorId, setPrevColorId] = useState(slots.color?.id);
  const [prevLayoutId, setPrevLayoutId] = useState(slots.layout?.id);
  const [prevToneId, setPrevToneId] = useState(slots.tone?.id);
  if (prevColorId !== slots.color?.id) { setPrevColorId(slots.color?.id); setPaletteRows(null); }
  if (prevLayoutId !== slots.layout?.id) { setPrevLayoutId(slots.layout?.id); setLayoutDescOv(null); }
  if (prevToneId !== slots.tone?.id) { setPrevToneId(slots.tone?.id); setToneLabelsOv(null); }

  // Prefill from 重新生成 (#5)
  useEffect(() => {
    if (prefillNonce === undefined) return;
    if (prefill?.subject !== undefined) setSubject(prefill.subject);
    if (prefill?.notes !== undefined) setNotes(prefill.notes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillNonce]);

  const usedColors = enabledColors;
  // 背景用法：預設「作文字參考」（把背景 AI Prompt 拉入設計描述、唔合成圖）；可切「直接用背景圖」合成。
  const bgText = ((slots.background?.data?.description as string) || slots.background?.aiPromptText || slots.background?.name || "").trim();
  // The auto-built brief is Traditional Chinese; server translates it to English for FLUX.
  const autoPrompt = buildChineseBrief({ subject, layoutDesc: effLayoutDesc, toneLabels: effToneLabels, usedColors, notes, backgroundDesc: !bgAsImage ? bgText : "" });
  // Read-only preview: the brief is fully derived from the fields above (no manual edit here).
  const compiledPrompt = autoPrompt;
  // 潤色後用擴寫版（可編輯）做最終 brief；否則用自動產生嘅。呢個 brief 會存入結果嘅 AI Prompt。
  const effectiveBrief = polishedBrief ?? compiledPrompt;
  const hasAnyContent = compiledPrompt.length > 0;
  const canGenerate = inputMode === "image" ? productUrls.length > 0 : hasAnyContent;

  // Update one palette role (toggle enable, or change hex).
  const updateRow = (role: PaletteRole, patch: Partial<PalRow>) =>
    setPaletteRows(effRows.map((r) => (r.role === role ? { ...r, ...patch } : r)));

  // Apply an industry preset: fill all 4 slots with virtual components (not saved to DB)
  function applyPreset(p: typeof INDUSTRY_PRESETS[0]) {
    setActivePreset(p.key);
    const makeComp = (type: ComponentCategory, name: string, data: Record<string, unknown>, aiPromptText: string): StyleComponent => ({
      id: `preset-${p.key}-${type}`, type, name, data, aiPromptText,
      previewUrl: null, clientId: null, sourceLayoutId: "", createdAt: new Date().toISOString(),
    });
    // Fold the preset's background description into the composition so the scene is still
    // described in the (text) brief — 背景 slot is now image-only, so we don't fill it from a preset.
    const compositionDesc = [p.composition.description, p.background.description].filter(Boolean).join("，");
    onPickSlot(makeComp("COMPOSITION", p.composition.name, { description: compositionDesc }, p.composition.aiPromptText));
    onPickSlot(makeComp("COLOR_SCHEME", p.color.name, { colors: p.color.colors, primaryColor: p.color.colors[0]?.hex }, p.color.aiPromptText));
    onPickSlot(makeComp("COPY_TONE", p.tone.name, { toneLabels: p.tone.toneLabels }, p.tone.aiPromptText));
  }


  // 合成模式：場景描述（不含主體，避免合成時重畫產品）；含已選背景名（潤色會讀背景）。
  function buildSceneBrief(): string {
    const lines: string[] = [];
    if (effLayoutDesc.trim()) lines.push(`構圖：${effLayoutDesc.trim()}`);
    // 文字參考模式：用背景嘅完整 AI Prompt 描述場景；直接用圖模式：只放名做提示（圖會合成）。
    if (bgText) lines.push(`背景：${bgAsImage ? (slots.background?.name ?? bgText) : bgText}`);
    if (usedColors.length) lines.push(`配色：${usedColors.map((c) => `${c.label} ${c.hex}`).join("、")}`);
    if (effToneLabels.length) lines.push(`風格語氣：${effToneLabels.join("、")}`);
    if (notes.trim()) lines.push(`其他要求：${notes.trim()}`);
    return lines.join("\n");
  }
  // [UX] AI 幫我優化提示詞：把「產品圖描述」(subject) 擴寫優化，結果寫回描述欄（可再編輯）。
  async function optimizeSubject() {
    const source = subject.trim();
    if (!source) return;
    setPolishing(true);
    setGenError(null);
    try {
      const res = await fetch("/api/library/polish", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief: source, clientId, ...(productUrls.length > 0 ? { productImageUrls: productUrls } : {}) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "優化失敗");
      setSubject(data.brief ?? source);
    } catch (e: unknown) {
      setGenError(e instanceof Error ? e.message : "優化失敗");
    } finally {
      setPolishing(false);
    }
  }


  async function uploadProduct(file: File) {
    if (productUrls.length >= MAX_PRODUCTS) return;
    setProductUploading(true);
    setGenError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const { url } = await res.json();
      const isFirst = productUrls.length === 0;
      setProductUrls((prev) => (prev.length >= MAX_PRODUCTS ? prev : [...prev, url]));
      // Auto-describe from the FIRST product only (fills 主體 as a reference).
      if (isFirst) {
        setDescribing(true);
        try {
          const dr = await fetch("/api/library/describe", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ imageUrl: url }),
          });
          const dd = await dr.json();
          if (dr.ok && dd.subject) setSubject(dd.subject);
        } catch { /* non-critical */ } finally {
          setDescribing(false);
        }
      }
    } finally {
      setProductUploading(false);
    }
  }

  function removeProduct(url: string) {
    setProductUrls((prev) => prev.filter((u) => u !== url));
  }

  async function describeProduct() {
    if (!productUrls.length) return;
    setDescribing(true);
    setGenError(null);
    try {
      const res = await fetch("/api/library/describe", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: productUrls[0] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "讀圖失敗");
      if (data.subject) setSubject(data.subject);
    } catch (e: unknown) {
      setGenError(e instanceof Error ? e.message : "讀圖失敗");
    } finally {
      setDescribing(false);
    }
  }

  const buildPalette = () => effRows.map((r) => ({ hex: r.hex, role: r.role, label: r.label, use: r.enabled }));
  // Build effective slots reflecting the inline edits (so copy/tone uses the latest values).
  const buildEffectiveSlots = (): PromptSlots => ({
    layout: slots.layout ? { ...slots.layout, data: { ...slots.layout.data, description: effLayoutDesc } } : null,
    background: bgAsImage ? slots.background : null, // 直接用背景圖→送圖合成；作文字參考→唔送圖（由 brief 文字生成場景）
    color: slots.color ? { ...slots.color, data: { ...slots.color.data, colors: enabledColors, primaryColor: enabledColors.find((c) => c.role === "primary")?.hex, secondaryColor: enabledColors.find((c) => c.role === "secondary")?.hex } } : null,
    tone: slots.tone ? { ...slots.tone, data: { ...slots.tone.data, toneLabels: effToneLabels } } : null,
  });

  async function handleGenerate() {
    if (!canGenerate) return;
    setGenerating(true);
    setGenError(null);
    setDrafts(null);
    try {
      const palette = buildPalette();
      const effectiveSlots = buildEffectiveSlots();
      const baseBody = {
        clientId, subject, slots: effectiveSlots, palette, notes,
        size: "custom", customW: outDims.w, customH: outDims.h,
        engine: composite ? effEngine : undefined,
        productImageUrls: composite ? productUrls : undefined,
        productImageUrl: composite ? productUrls[0] : undefined,
        composite: composite && productUrls.length > 0,
        // 文字模式：送繁中 brief（潤色後 or 自動）→ server 翻英生圖，並存入結果 AI Prompt。
        customPrompt: composite ? undefined : effectiveBrief,
        // 合成模式：若用咗潤色，把擴寫後嘅「場景描述」作為合成場景覆寫（唔含主體，避免重畫產品）。
        sceneOverride: composite ? (polishedBrief ?? undefined) : undefined,
      };
      const batchId = `pc-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      // 送出即刻落 DB（status:GENERATING），poll 到完成先攞返 imageUrl——即刻安全，
      // 就算中途關咗 popup，server 都會用 after() 繼續生成完，唔會流失。
      // 呢個 flag 淨係俾同一個 batch 觸發一次 onStarted——如果每張圖各自 call 一次
      // （count 張 = N 次 refresh），主畫廊會喺短時間內連續跳幾次，好唐突。
      let notifiedStart = false;
      const postJson = async (body: Record<string, unknown>) => {
        const { id } = await fetch("/api/library/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, batchId }) }).then((r) => r.json());
        if (!id) throw new Error("生成請求送出失敗");
        if (!notifiedStart) { notifiedStart = true; onStarted?.(); } // 呢個 batch 已經有記錄落咗 DB → 通知主畫廊 refresh 一次
        const item = await pollLibraryImage(id);
        if (item.status !== "DONE") throw new Error(item.errorMessage ?? "生成失敗");
        const mode = (() => { try { return JSON.parse(item.paramsJson ?? "{}").mode as string | undefined; } catch { return undefined; } })();
        return { id: item.id, imageUrl: item.imageUrl, copyText: item.copyText ?? "", mode };
      };
      const post = (extra: Record<string, unknown>) => postJson({ ...baseBody, ...extra });

      // #4 系列圖 = 固定模板貼圖：共用背景 + 固定 placement，每件產品去背貼上 → 100% 一致。
      if (composite && seriesMode && productUrls.length >= 2) {
        let sharedBg = (slots.background?.data?.imageUrl as string | undefined) || undefined;
        let sharedBgId: string | undefined;
        if (!sharedBg) {
          const bgPrompt = `${buildSceneBrief() || "簡潔專業棚拍背景、柔光"}，純背景場景，無產品、無人物、無文字`;
          const bgRes = await postJson({ clientId, customPrompt: bgPrompt, size: "custom", customW: outDims.w, customH: outDims.h });
          sharedBg = bgRes.imageUrl;
          sharedBgId = bgRes.id;
          if (!sharedBg) throw new Error("共用背景生成失敗，請重試");
        }
        const results = await Promise.allSettled(productUrls.map((p) =>
          fetch("/api/library/template-paste", { method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ bgImageUrl: sharedBg, productImageUrl: p, placement, size: ratio, harmonize }) }).then((r) => r.json())));
        const ok = results
          .map((r, i) => r.status === "fulfilled" && r.value?.imageUrl
            ? { imageUrl: r.value.imageUrl as string, copyText: "", mode: "paste-template", selected: true, productImageUrls: [productUrls[i]] }
            : null)
          .filter((x): x is NonNullable<typeof x> => !!x);
        if (!ok.length) throw new Error("系列圖全部生成失敗，請重試");
        setDrafts(ok);
        // 共用背景淨係內部中間步驟，唔係俾用戶揀嘅候選圖——用完即刪，唔留喺畫廊。
        if (sharedBgId) fetch(`/api/library/images/${sharedBgId}`, { method: "DELETE" }).catch(() => {});
      } else {
        // 送出即刻落 DB，poll 到完成 → 跳結果俾你揀/確認 → saveDrafts 先確認保留（其他刪走）。
        const results = await Promise.allSettled(Array.from({ length: count }, () => post({})));
        const ok = results
          .filter((r): r is PromiseFulfilledResult<{ id: string; imageUrl: string; copyText: string; mode: string | undefined }> => r.status === "fulfilled" && !!r.value?.imageUrl)
          .map((r) => ({ id: r.value.id, imageUrl: r.value.imageUrl, copyText: r.value.copyText ?? "", mode: r.value.mode ?? (composite ? "flux2-edit" : "flux"), selected: true, productImageUrls: composite ? productUrls : [] }));
        if (!ok.length) throw new Error("全部生成失敗，請重試");
        setDrafts(ok);
      }
    } catch (e: unknown) {
      setGenError(e instanceof Error ? e.message : "生成失敗，請重試");
    } finally {
      setGenerating(false);
    }
  }

  // 清空成個組裝台，返初始空白狀態（開新設計）。
  // 兩處會 call：① saveDrafts 儲存成功後自動清；② header「清空重來」手動掣。
  // 只清設計內容（主體/產品圖/積木/說明/潤色/範本），保留輸出設定（比例/引擎/數量）。
  function resetComposer() {
    setSubject("");
    setNotes("");
    setProductUrls([]);
    setPolishedBrief(null);
    setActivePreset(null);
    setInputMode("image");
    setSeriesMode(false);
    setBgAsImage(false);
    setLayoutDescOv(null);
    setToneLabelsOv(null);
    setPaletteRows(null);
    (["layout", "color", "tone", "background"] as (keyof PromptSlots)[]).forEach((k) => onClearSlot(k));
  }

  // 暴露 reset 俾 modal header 調用；並通知上層「有冇內容」（決定 header「清空重來」掣顯示）。
  useImperativeHandle(ref, () => ({ reset: resetComposer }));
  const composerDirty = !!(subject || notes || productUrls.length > 0 || slots.layout || slots.color || slots.tone || slots.background || polishedBrief || activePreset);
  useEffect(() => { onDirtyChange?.(composerDirty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composerDirty]);

  // 臨時改咗先生成 → 儲存嗰陣：改咗就起一個新 StyleComponent（新 id），未改就照用原本嗰個 id，
  // 唔好用返舊 id 夾帶新內容（否則個 id 會同 library 入面「真身」對唔上，見 docs 討論）。
  // previewUrl = 生成出嚟嗰張圖 → picker card 顯示返該產品圖（唔止色塊）。
  async function materializeEditedSlots(ownerImageUrl?: string): Promise<PromptSlots> {
    const base = buildEffectiveSlots();
    if (layoutEdited && base.layout) {
      const res = await fetch("/api/components", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `${base.layout.name}（已調整）`, type: "COMPOSITION", clientId, data: base.layout.data, aiPromptText: base.layout.aiPromptText, previewUrl: ownerImageUrl }),
      });
      if (res.ok) { const saved = await res.json(); base.layout = { ...base.layout, id: saved.id, name: saved.name, previewUrl: saved.previewUrl ?? null }; }
    }
    if (colorEdited && base.color) {
      const res = await fetch("/api/components", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `${base.color.name}（已調整）`, type: "COLOR_SCHEME", clientId, data: base.color.data, aiPromptText: base.color.aiPromptText, previewUrl: ownerImageUrl }),
      });
      if (res.ok) { const saved = await res.json(); base.color = { ...base.color, id: saved.id, name: saved.name, previewUrl: saved.previewUrl ?? null }; }
    }
    return base;
  }

  // #3 揀完 draft →「揀」嗰幾張已經係真素材（生成嗰刻已經落 DB），呢步只係更新最終
  // metadata；冇揀嗰幾張（已經生成完、真係存在 DB）就刪走。有 id（composite/文字模式）
  // 用 PATCH 完善現有記錄；冇 id（系列圖 template-paste，本身唔經呢套即時落 DB 機制）
  // 先用 save-image 補建。
  async function saveDrafts() {
    const all = drafts ?? [];
    const sel = all.filter((d) => d.selected);
    if (!sel.length) return;
    setSavingDrafts(true);
    setGenError(null);
    try {
      const palette = buildPalette();
      // 用第一張選定 draft 嘅圖做 owner（materialize 出嚟嘅 block 由呢批 draft 共用）。
      const effectiveSlots = await materializeEditedSlots(sel[0]?.imageUrl);
      await Promise.all(sel.map((d) => {
        const isComposite = d.productImageUrls.length > 0;
        const promptStr = isComposite
          ? `[AI 合成] ${(polishedBrief || compiledPrompt || subject || "").trim()}`
          : (effectiveBrief || compiledPrompt || subject || "").trim();
        const params = isComposite
          ? { slots: effectiveSlots, palette, notes, productImageUrl: d.productImageUrls[0], productImageUrls: d.productImageUrls, composite: true, mode: d.mode }
          : { slots: effectiveSlots, palette, notes, customPrompt: effectiveBrief, mode: d.mode };
        if (d.id) {
          return fetch(`/api/library/images/${d.id}`, {
            method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ subject, copyText: d.copyText, paramsJson: JSON.stringify(params) }),
          });
        }
        return fetch("/api/library/save-image", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId, imageUrl: d.imageUrl, subject, prompt: promptStr, copyText: d.copyText, paramsJson: JSON.stringify(params) }),
        });
      }));
      // 冇揀嗰幾張：早已經生成完、真係存在 DB，用戶明確唔要 → 刪走，唔留喺畫廊佔位。
      await Promise.all(
        all.filter((d) => !d.selected && d.id).map((d) => fetch(`/api/library/images/${d.id}`, { method: "DELETE" }))
      );
      setDrafts(null);
      resetComposer(); // 儲存後自動清空成個組裝台（開新設計）；亦可撳 header「清空重來」手動清。
      onGenerated?.();
    } catch (e: unknown) {
      setGenError(e instanceof Error ? e.message : "儲存失敗，請重試");
    } finally {
      setSavingDrafts(false);
    }
  }

  return (
    <div>
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-6 items-start">
        {/* 套用行業範本：暫隱藏（hide · no use now）— 內部 header 已移除（modal 標題已表示） */}
        {false && (
        <div>
          <label className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-violet-400" />套用行業範本（一鍵填入所有積木）
          </label>
          <div className="flex flex-wrap gap-1.5">
            {INDUSTRY_PRESETS.map((p) => (
              <button key={p.key} type="button" onClick={() => applyPreset(p)}
                className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-full border transition-colors ${
                  activePreset === p.key
                    ? "bg-violet-600 text-white border-violet-600"
                    : "bg-white border-gray-200 text-gray-600 hover:border-violet-300 hover:text-violet-600"}`}>
                <span>{p.emoji}</span>{p.label}
              </button>
            ))}
            {activePreset && (
              <button type="button" onClick={() => { setActivePreset(null); ["layout","color","tone","background"].forEach((k) => onClearSlot(k as keyof PromptSlots)); }}
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-full border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-200 transition-colors">
                <X className="h-3 w-3" />清除範本
              </button>
            )}
          </div>
        </div>
        )}

        {/* ── 左欄：輸入（主體 / 積木 / 注意事項）── */}
        <div className="space-y-5 min-w-0">

        {/* ── 01 主體物件 ── */}
        <SectionLabel step="01" title="主體物件" hint="產品圖 或 文字，二選一" />
        <div className="space-y-2">

          {/* Mode toggle */}
          <div className="flex gap-1.5">
            <button type="button" onClick={() => setInputMode("image")}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                inputMode === "image" ? "bg-violet-600 text-white border-violet-600" : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"}`}>
              <ImageIcon className="h-3.5 w-3.5" />產品圖（合成用原圖）
            </button>
            <button type="button" onClick={() => setInputMode("text")}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                inputMode === "text" ? "bg-violet-600 text-white border-violet-600" : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"}`}>
              <Type className="h-3.5 w-3.5" />文字主體（AI 生成）
            </button>
          </div>

          {/* 產品圖描述（兩種模式都可編輯）+ AI 幫改 / AI 優化提示詞 */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-semibold text-gray-600">產品圖描述</label>
              <div className="flex items-center gap-1.5 shrink-0">
                <button type="button" onClick={describeProduct} disabled={describing || productUrls.length === 0}
                  className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-600 hover:border-gray-400 transition-colors disabled:opacity-40"
                  title={productUrls.length === 0 ? "先上傳產品圖，AI 讀圖幫你寫描述" : "AI 讀首張產品圖，幫你把描述寫出來"}>
                  {describing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Pencil className="h-3 w-3" />}AI 幫改
                </button>
                <button type="button" onClick={optimizeSubject} disabled={polishing || !subject.trim()}
                  className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border border-violet-300 bg-violet-50 text-violet-700 hover:bg-violet-100 transition-colors disabled:opacity-40"
                  title="AI 把描述擴寫優化成更完整的提示詞（可再編輯）">
                  {polishing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}AI 幫我優化提示詞
                </button>
              </div>
            </div>
            <textarea value={subject} onChange={(e) => setSubject(e.target.value)} rows={3}
              placeholder="描述你想要的產品圖，例：舒適牌女刀｜夏日除毛必備，清新日系、乾淨明亮的生活情境"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-y placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-400 transition leading-relaxed" />
          </div>

          {/* 文字模式提示：人像 / 插畫 已移至「素材生成」 */}
          {inputMode === "text" && (
            <p className="text-[11px] text-gray-400 leading-snug pt-0.5">
              產品文字 + 積木 → 生成場景圖（FLUX）。需要「真人 / 2D 插畫 / 純背景」請用右上「素材生成」。
            </p>
          )}

          {/* Product image area (1–3 photos) — 文字主題時整塊收起（收合上傳區，減少壓迫感） */}
          {inputMode === "image" && (
          <div className="rounded-xl border border-violet-200 bg-violet-50/30 p-3 transition-all">
            <input id="composer-product" type="file" accept="image/*" className="hidden"
              onChange={(e) => { if (e.target.files?.[0]) uploadProduct(e.target.files[0]); e.currentTarget.value = ""; }} />
            {productUrls.length === 0 ? (
              // 空狀態：整個盒做 dropzone（全幅可點，唔再有死框）
              <button onClick={() => document.getElementById("composer-product")?.click()} disabled={productUploading || inputMode !== "image"}
                className="w-full flex flex-col items-center justify-center gap-1.5 py-8 text-xs text-gray-500 border-2 border-dashed border-gray-300 rounded-lg hover:border-violet-400 hover:text-violet-600 hover:bg-violet-50/40 transition-colors">
                {productUploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
                {productUploading ? "上傳中…" : "點此上傳產品圖（可加最多 3 件）"}
              </button>
            ) : (
              <div className="flex flex-wrap gap-2">
                {productUrls.map((url) => (
                  <div key={url} className="relative w-24 h-24 rounded-md border bg-[repeating-conic-gradient(#f3f4f6_0_25%,#fff_0_50%)] bg-[length:12px_12px]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="product" className="w-full h-full object-contain rounded-md" />
                    <button onClick={() => removeProduct(url)} title="移除"
                      className="absolute -top-1.5 -right-1.5 p-1 rounded-full bg-white text-gray-400 hover:text-red-500 border shadow-sm transition-colors">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                {productUrls.length < MAX_PRODUCTS && (
                  <button onClick={() => document.getElementById("composer-product")?.click()} disabled={productUploading || inputMode !== "image"}
                    className="w-24 h-24 flex flex-col items-center justify-center gap-1 text-[11px] text-gray-500 border-2 border-dashed border-gray-200 rounded-md hover:border-violet-300 hover:text-violet-500 transition-colors">
                    {productUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    {productUploading ? "上傳中…" : `加產品 (${productUrls.length}/${MAX_PRODUCTS})`}
                  </button>
                )}
              </div>
            )}
            {productUrls.length > 0 && (
              <div className="flex items-center gap-2 mt-2">
                <button onClick={describeProduct} disabled={describing}
                  className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg border border-violet-200 text-violet-600 hover:bg-violet-50 transition-colors disabled:opacity-60">
                  {describing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}AI 讀首張產品圖填主體
                </button>
              </div>
            )}
            <p className="text-[11px] text-gray-400 leading-snug mt-1.5">
              可加最多 3 件產品，AI 會自動去背、打光並擺入所選背景（無需事先去背）。多件產品會一齊合成入同一場景。
            </p>
          </div>
          )}
        </div>

        {/* ── 02 風格積木（三欄並排）── */}
        <SectionLabel step="02" title="風格積木" hint="選填 · 套用會加入 AI Prompt 做生成參考" />
        <div className="grid grid-cols-3 gap-3 items-start">
          <SlotCard category="COMPOSITION" icon={<LayoutTemplate className="h-4 w-4" />} emptyLabel="點擊選取"
            component={slots.layout} onClear={() => onClearSlot("layout")} onPick={() => setPickerCategory("COMPOSITION")}
            descValue={effLayoutDesc} onDescChange={setLayoutDescOv} />

          <SlotCard category="COLOR_SCHEME" icon={<Palette className="h-4 w-4" />} emptyLabel="點擊選取"
            component={slots.color} onClear={() => onClearSlot("color")} onPick={() => setPickerCategory("COLOR_SCHEME")}
            colorsDisplay={enabledColors} />

          <SlotCard category="BACKGROUND" icon={<ImageIcon className="h-4 w-4" />} labelOverride="背景" emptyLabel="點擊選取"
            component={slots.background} onClear={() => onClearSlot("background")} onPick={() => setPickerCategory("BACKGROUND")} />
        </div>

        {/* 配色使用（選了配色才出現，三欄下方全寬）*/}
        {slots.color && (
          <div className="rounded-xl border border-rose-200/60 bg-rose-50/30 p-3">
            <div className="text-[11px] font-semibold text-gray-600 mb-2 flex items-center gap-1.5">
              <Palette className="h-3.5 w-3.5 text-rose-500" />配色使用（主色必用，其餘勾選啟用 · 可改色）
            </div>
            <div className="space-y-1.5">
              {effRows.map((r) => {
                const locked = r.role === "primary";
                const hint = PALETTE_ROLES.find((x) => x.role === r.role)?.hint ?? "";
                return (
                  <div key={r.role} className={`flex items-center gap-2 ${r.enabled ? "" : "opacity-45"}`}>
                    <button type="button" disabled={locked} onClick={() => updateRow(r.role, { enabled: !r.enabled })}
                      className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${r.enabled ? "bg-rose-500 border-rose-500" : "border-gray-300 bg-white"} ${locked ? "cursor-default" : ""}`}
                      title={locked ? "主色必用" : "啟用 / 停用"}>
                      {r.enabled && <Check className="h-3 w-3 text-white" />}
                    </button>
                    <input type="color" value={r.hex} onChange={(e) => updateRow(r.role, { hex: e.target.value })}
                      className="w-8 h-8 rounded-lg border border-gray-200 cursor-pointer p-0.5 shrink-0" />
                    <input value={r.hex} onChange={(e) => { const v = e.target.value.trim(); if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) updateRow(r.role, { hex: v }); }}
                      className="w-24 border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-rose-400 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-gray-700 leading-none">{r.label}</div>
                      <div className="text-[11px] text-gray-400 leading-none mt-0.5 truncate">{hint}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 背景用法（選了背景才出現）：作文字參考（預設）／ 直接用背景圖 */}
        {slots.background && (
          <div className="space-y-1">
            <div className="flex gap-1.5">
              <button type="button" onClick={() => setBgAsImage(false)}
                className={`flex-1 text-[11px] px-2 py-1.5 rounded-lg border transition-colors ${!bgAsImage ? "bg-violet-600 text-white border-violet-600" : "bg-white border-gray-200 text-gray-600 hover:border-violet-300"}`}>
                作文字參考（預設）
              </button>
              <button type="button" onClick={() => setBgAsImage(true)}
                className={`flex-1 text-[11px] px-2 py-1.5 rounded-lg border transition-colors ${bgAsImage ? "bg-violet-600 text-white border-violet-600" : "bg-white border-gray-200 text-gray-600 hover:border-violet-300"}`}>
                直接用背景圖
              </button>
            </div>
            <p className="text-[11px] text-gray-400 leading-snug">
              {bgAsImage ? "合成時把產品擺入呢張背景圖。" : "把背景嘅描述拉入右邊「設計描述」，AI 依文字生成場景（可再改／潤色）；唔會直接用張圖。"}
            </p>
          </div>
        )}

        </div>{/* ── /左欄 ── */}

        {/* ── 右欄：輸出預覽 + 設定 + 生成（sticky，永遠見到生成鍵）── */}
        <div className="space-y-4 min-w-0 lg:sticky lg:top-0 lg:border-l lg:border-gray-100 lg:pl-6">
        {/* 風格與輸出預覽已依需求移除（太雜亂）；設計描述改由左欄「產品圖描述」直接編輯。 */}

        {/* ── 04 輸出設定 ── */}
        <SectionLabel step="04" title="輸出設定" hint="尺寸 · 引擎 · 數量" />
        {/* Composite engine + 系列 — 收進「進階設定」預設收合（UX 精簡；預設 FLUX.2 edit 不變） */}
        {inputMode === "image" && (
          <div className="space-y-2">
            <button type="button" onClick={() => setShowAdvanced((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-700 transition-colors">
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showAdvanced ? "" : "-rotate-90"}`} />
              進階設定
              <span className="font-normal text-gray-400">合成引擎：{effEngine === "flux2edit" ? "FLUX.2 edit · 主力" : effEngine === "nano" ? "nano-banana" : effEngine === "seedream" ? "Seedream 4.5" : "自動"}</span>
            </button>
            {showAdvanced && (<>
            <label className="text-xs font-semibold text-gray-500">合成方式</label>
            <div className="flex gap-1.5 flex-wrap">
              {([
                { key: "flux2edit", title: "FLUX.2 edit · 主力", sub: "中文字最清晰；產品多於 1 張時字會微糊" },
                { key: "nano", title: "nano-banana", sub: "場景最自然；字會糊，適合無產品文字合成" },
                { key: "seedream", title: "Seedream 4.5", sub: "多圖文字效果優於 FLUX；偶有機率出錯字" },
              ] as const).map((e) => (
                <button key={e.key} type="button" onClick={() => setEngine(e.key)}
                  className={`flex-1 min-w-[30%] text-left text-xs px-3 py-2 rounded-lg border transition-colors ${effEngine === e.key ? "bg-violet-600 text-white border-violet-600" : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"}`}>
                  <div className="font-semibold">{e.title}</div>
                  <div className={`text-[10px] leading-snug ${effEngine === e.key ? "text-violet-100" : "text-gray-400"}`}>{e.sub}</div>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-gray-400 leading-snug">
              主力 FLUX.2 edit 中文字保真最好（已自動餵高清原圖）。三者皆支援多產品；不加背景圖、由 AI 生成場景會更自然。
            </p>

            {/* #4 固定模板系列：≥2 件產品先有意義（報告期間用 SHOW_SERIES_TEMPLATE 收起）*/}
            {SHOW_SERIES_TEMPLATE && productUrls.length >= 2 && (
              <>
                <label className="flex items-start gap-2 text-xs text-gray-600 cursor-pointer pt-1">
                  <button type="button" onClick={() => setSeriesMode((v) => !v)}
                    className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 ${seriesMode ? "bg-violet-600 border-violet-600" : "border-gray-300 bg-white"}`}>
                    {seriesMode && <Check className="h-3 w-3 text-white" />}
                  </button>
                  <span className="leading-snug">
                    <b>固定模板系列</b>：每件產品貼喺固定背景嘅固定位置／大小（{productUrls.length} 件 → {productUrls.length} 張，100% 一致、真像素、零腦補）
                    {!slots.background && <span className="text-gray-400">；未選背景會自動鎖定一個共用 AI 背景</span>}
                  </span>
                </label>

                {/* 擺位編輯器：拖預覽定位置 + 滑桿調大小 */}
                {seriesMode && (
                  <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-3 space-y-2">
                    <div className="text-[11px] font-semibold text-violet-700">擺位（拖產品定位置・滑桿調大小）—— 所有產品共用</div>
                    <div
                      className={`relative w-full mx-auto rounded-lg overflow-hidden border bg-gray-100 select-none touch-none ${outDims.w > outDims.h ? "max-w-[360px] aspect-[3/2]" : "max-w-[280px] aspect-square"}`}
                      style={slots.background?.data?.imageUrl ? { backgroundImage: `url(${slots.background.data.imageUrl as string})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
                      onPointerDown={(e) => {
                        const box = e.currentTarget.getBoundingClientRect();
                        const move = (cx: number, cy: number) => setPlacement((p) => ({ ...p, x: Math.min(1, Math.max(0, (cx - box.left) / box.width)), y: Math.min(1, Math.max(0, (cy - box.top) / box.height)) }));
                        move(e.clientX, e.clientY);
                        const onMove = (ev: PointerEvent) => move(ev.clientX, ev.clientY);
                        const onUp = () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
                        window.addEventListener("pointermove", onMove); window.addEventListener("pointerup", onUp);
                      }}>
                      {!slots.background?.data?.imageUrl && (
                        <div className="absolute inset-0 flex items-center justify-center text-[11px] text-gray-400 text-center px-2">未選背景<br/>生成時自動鎖定共用 AI 背景</div>
                      )}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={productUrls[0]} alt="placement" draggable={false}
                        className="absolute object-contain pointer-events-none drop-shadow-lg"
                        style={{ height: `${placement.scale * 100}%`, left: `${placement.x * 100}%`, top: `${placement.y * 100}%`, transform: "translate(-50%, -50%)" }} />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-[11px] text-gray-500 whitespace-nowrap">大小 {Math.round(placement.scale * 100)}%</label>
                      <input type="range" min={20} max={90} value={Math.round(placement.scale * 100)}
                        onChange={(e) => setPlacement((p) => ({ ...p, scale: Number(e.target.value) / 100 }))}
                        className="flex-1 accent-violet-600" />
                    </div>
                    <label className="flex items-start gap-2 text-[11px] text-gray-600 cursor-pointer">
                      <button type="button" onClick={() => setHarmonize((v) => !v)}
                        className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 ${harmonize ? "bg-violet-600 border-violet-600" : "border-gray-300 bg-white"}`}>
                        {harmonize && <Check className="h-3 w-3 text-white" />}
                      </button>
                      <span className="leading-snug">AI 融合打光（貼好後 relight 令光影更自然；每張多一次 AI、有少少 drift 風險、文字可能被郁）</span>
                    </label>
                  </div>
                )}
              </>
            )}
            </>)}

          </div>
        )}

        {/* 輸出尺寸（比例）— 揀比例自動填 W×H，可再改（非自訂會鎖比例）；text/image 模式都 show */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-gray-500">輸出尺寸（比例）</label>
          <div className="relative w-full">
            <select value={ratio} onChange={(e) => pickRatio(e.target.value)}
              className="w-full appearance-none border border-gray-200 rounded-lg px-3 py-2 pr-8 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-gray-300 cursor-pointer">
              {["1:1", "4:5", "3:4", "2:3", "9:16", "4:3", "3:2", "16:9"].map((r) => (
                <option key={r} value={r}>{r}（{RATIO_DIMS[r].w}×{RATIO_DIMS[r].h}）</option>
              ))}
              <option value="custom">自訂…</option>
            </select>
            <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
          <div className="flex items-center gap-2 pt-1.5">
            <input type="number" min={256} max={2400} value={customW} onChange={(e) => changeDim("w", Number(e.target.value))}
              className="w-24 border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-violet-400" />
            <span className="text-xs text-gray-400">×</span>
            <input type="number" min={256} max={2400} value={customH} onChange={(e) => changeDim("h", Number(e.target.value))}
              className="w-24 border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-violet-400" />
            <span className="text-[11px] text-gray-400">px · {ratio === "custom" ? "自由尺寸（256–2400）" : `改任一邊自動鎖 ${ratio} 比例`}</span>
          </div>
        </div>

        {/* 生成數量（合成模式；系列模式時隱藏）— 04 最後 */}
        {inputMode === "image" && !(seriesMode && productUrls.length >= 2) && (
          <div className="flex items-center gap-3">
            <label className="text-xs font-semibold text-gray-500 whitespace-nowrap">生成數量</label>
            <div className="flex gap-1.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" onClick={() => setCount(n)}
                  className={`w-8 h-8 rounded-lg border text-sm font-medium transition-colors ${count === n ? "bg-violet-600 text-white border-violet-600" : "bg-white border-gray-200 text-gray-600 hover:border-violet-300"}`}>
                  {n}
                </button>
              ))}
            </div>
            {count > 1 && <span className="text-[11px] text-gray-400">出 {count} 張揀（成本 ×{count}）</span>}
          </div>
        )}

        {/* Generate */}
        <Button onClick={handleGenerate} disabled={!canGenerate || generating || savingDrafts}
          className="w-full gap-2 bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-40">
          {(() => {
            const series = composite && seriesMode && productUrls.length >= 2;
            if (generating) { const suffix = series ? `（${productUrls.length} 張）` : composite && count > 1 ? `（${count} 張）` : "（約 10–40 秒）"; return <><Loader2 className="h-4 w-4 animate-spin" />{genHint}{suffix}</>; }
            return <><Sparkles className="h-4 w-4" />{series ? `生成系列 ${productUrls.length} 張` : composite ? (count > 1 ? `合成 ${count} 張俾你揀` : "合成產品圖到背景") : "用此 Prompt 生成新圖"}</>;
          })()}
        </Button>

        {genError && (
          <div className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">⚠️ {genError}</div>
        )}

        </div>{/* ── /右欄 ── */}

        {/* 多張 draft：揀邊張保留（單張亦行此 path → 確認後先入庫，唔自動落 gallery）；兩欄下方全寬 */}
        {drafts && (
          <div ref={resultRef} className="lg:col-span-2 scroll-mt-2 rounded-xl border border-violet-200 bg-violet-50/40 p-3 space-y-3">
            <div className="text-xs font-semibold text-violet-700">
              點擊選取要保留的圖（已選 {drafts.filter((d) => d.selected).length}/{drafts.length}）
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {drafts.map((d, i) => (
                <div key={d.imageUrl}
                  onClick={() => setDrafts((prev) => prev!.map((x, idx) => idx === i ? { ...x, selected: !x.selected } : x))}
                  className={`relative rounded-lg border-2 overflow-hidden cursor-pointer transition-all ${d.selected ? "border-violet-500 shadow-md" : "border-gray-200 opacity-50"}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={d.imageUrl} alt="draft" className="w-full aspect-square object-contain bg-white" />
                  {d.selected && (
                    <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-violet-600 flex items-center justify-center shadow">
                      <Check className="h-3 w-3 text-white" />
                    </span>
                  )}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setDrafts(null)} disabled={savingDrafts}
                className="px-3 py-2 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50">
                取消
              </button>
              <button onClick={saveDrafts} disabled={savingDrafts || !drafts.some((d) => d.selected)}
                className="flex-1 py-2 rounded-lg bg-violet-600 text-white text-xs font-medium hover:bg-violet-700 disabled:opacity-50 flex items-center justify-center gap-1.5 transition-colors">
                {savingDrafts ? <><Loader2 className="h-4 w-4 animate-spin" />儲存中…</> : <><Check className="h-4 w-4" />保留 {drafts.filter((d) => d.selected).length} 張 → 圖庫</>}
              </button>
            </div>
          </div>
        )}
      </div>

      {pickerCategory && (
        <SlotPickerModal
          clientId={clientId}
          category={pickerCategory}
          onPick={(comp) => onPickSlot(comp)}
          onClose={() => setPickerCategory(null)}
        />
      )}
    </div>
  );
});
