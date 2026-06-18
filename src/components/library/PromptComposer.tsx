"use client";
/**
 * PromptComposer — 生成圖片 tab 的積木組合台
 * Slots (構圖/配色/語氣/背景) 可點擊揀已有素材；可上傳產品圖（AI 描述填主體 / 直接合成）；
 * 色盤逐色開關；其他注意事項。生成走 POST /api/library/generate。
 */

import { useState, useEffect } from "react";
import {
  X, Copy, Check, Sparkles, LayoutTemplate, Palette,
  Image as ImageIcon, Target, StickyNote, Loader2, Upload, Plus, Trash2, Type, Lock, Wand2, RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PromptSlots, StyleComponent, ComponentCategory, PaletteColor, PaletteRole } from "@/types/library";
import { CATEGORY_META, getColors, PALETTE_ROLES, SHOW_SERIES_TEMPLATE } from "@/types/library";
import { ColorCards } from "./ColorCards";
import { SlotPickerModal } from "./SlotPickerModal";
import { INDUSTRY_PRESETS } from "@/types/presets";

type Prefill = { subject?: string; notes?: string; useFlags?: Record<string, boolean> };

type Props = {
  slots: PromptSlots;
  onClearSlot: (slot: keyof PromptSlots) => void;
  onPickSlot: (comp: StyleComponent) => void;
  clientId: string | null;
  onGenerated?: () => void;
  prefill?: Prefill;
  prefillNonce?: number;
};

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
  subject: string; layoutDesc: string; toneLabels: string[]; usedColors: PaletteColor[]; notes: string;
}): string {
  const lines: string[] = [];
  if (args.subject.trim()) lines.push(`主體：${args.subject.trim()}`);
  if (args.layoutDesc.trim()) lines.push(`構圖：${args.layoutDesc.trim()}`);
  if (args.usedColors.length) lines.push(`配色：${args.usedColors.map((c) => `${c.label} ${c.hex}`).join("、")}`);
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
      className={`rounded-xl border p-3 transition-all ${filled ? `${meta.bg} ${meta.border}` : "border-dashed border-gray-200 bg-gray-50 hover:border-gray-300 cursor-pointer hover:shadow-sm"}`}>
      {/* Header — click to (re)pick the source material */}
      <div className="flex items-center justify-between">
        <div className={`flex items-center gap-1.5 text-xs font-semibold cursor-pointer ${filled ? meta.color : "text-gray-400"}`} onClick={onPick}>
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
        <div onClick={onPick} className="text-xs text-gray-400 italic mt-2 cursor-pointer">{emptyLabel}</div>
      )}
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────
export function PromptComposer({ slots, onClearSlot, onPickSlot, clientId, onGenerated, prefill, prefillNonce }: Props) {
  const [subject, setSubject] = useState("");
  const [notes, setNotes] = useState("");
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [result, setResult] = useState<{ imageUrl: string; copyText: string } | null>(null);
  const [pickerCategory, setPickerCategory] = useState<ComponentCategory | null>(null);
  // #3 多輸出（合成）：一次生 N 張 draft（唔即刻入庫）→ 揀邊張保留。
  const [count, setCount] = useState(1);
  // draft 各自帶用咗嘅產品圖（系列圖時每張得一件）。
  const [drafts, setDrafts] = useState<{ imageUrl: string; copyText: string; mode: string; selected: boolean; productImageUrls: string[] }[] | null>(null);
  const [savingDrafts, setSavingDrafts] = useState(false);
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

  // Subject input mode — 二選一: "image" (上傳產品圖 → 合成，預設主選) or "text" (純 AI 生成，次選)
  const [inputMode, setInputMode] = useState<"text" | "image">("image");
  // 1–3 product photos for compositing together into one scene.
  const [productUrls, setProductUrls] = useState<string[]>([]);
  const MAX_PRODUCTS = 3;
  const [productUploading, setProductUploading] = useState(false);
  // Output size — 正方形 1200×1200 or 橫向 1800×1200.
  const [size, setSize] = useState<"square" | "landscape">("square");
  // 合成方式引擎（全部支援多產品）：flux2edit（主力）/ nano / seedream / qwen / paste（文字保真貼圖）。
  const [engine, setEngine] = useState<"flux2edit" | "nano" | "seedream" | "qwen" | "paste">("flux2edit");
  const [describing, setDescribing] = useState(false);
  const composite = inputMode === "image" && productUrls.length > 0;
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
  // The auto-built brief is Traditional Chinese; server translates it to English for FLUX.
  const autoPrompt = buildChineseBrief({ subject, layoutDesc: effLayoutDesc, toneLabels: effToneLabels, usedColors, notes });
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

  const copyPrompt = async () => {
    if (!effectiveBrief) return;
    await navigator.clipboard.writeText(effectiveBrief);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // 合成模式：場景描述（不含主體，避免合成時重畫產品）；含已選背景名（潤色會讀背景）。
  function buildSceneBrief(): string {
    const lines: string[] = [];
    if (effLayoutDesc.trim()) lines.push(`構圖：${effLayoutDesc.trim()}`);
    if (slots.background?.name) lines.push(`背景：${slots.background.name}`);
    if (usedColors.length) lines.push(`配色：${usedColors.map((c) => `${c.label} ${c.hex}`).join("、")}`);
    if (effToneLabels.length) lines.push(`風格語氣：${effToneLabels.join("、")}`);
    if (notes.trim()) lines.push(`其他要求：${notes.trim()}`);
    return lines.join("\n");
  }
  // 潤色來源：合成→場景 brief；文字→完整 brief（補上背景名，令潤色會讀背景文字）。
  function buildPolishSource(): string {
    if (composite) return buildSceneBrief();
    return slots.background?.name ? `${effectiveBrief}\n背景：${slots.background.name}` : effectiveBrief;
  }

  // #2 潤色寫手：擴寫目前 brief → 可編輯覆寫。
  async function polishBrief() {
    const source = buildPolishSource();
    if (!source.trim()) return;
    setPolishing(true);
    setGenError(null);
    try {
      const res = await fetch("/api/library/polish", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief: source }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "潤色失敗");
      setPolishedBrief(data.brief ?? source);
    } catch (e: unknown) {
      setGenError(e instanceof Error ? e.message : "潤色失敗");
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
    background: slots.background, // image-only asset, used as-is in 合成 mode
    color: slots.color ? { ...slots.color, data: { ...slots.color.data, colors: enabledColors } } : null,
    tone: slots.tone ? { ...slots.tone, data: { ...slots.tone.data, toneLabels: effToneLabels } } : null,
  });

  async function handleGenerate() {
    if (!canGenerate) return;
    setGenerating(true);
    setGenError(null);
    setResult(null);
    setDrafts(null);
    try {
      const palette = buildPalette();
      const effectiveSlots = buildEffectiveSlots();
      const baseBody = {
        clientId, subject, slots: effectiveSlots, palette, notes, size,
        engine: composite ? effEngine : undefined,
        productImageUrls: composite ? productUrls : undefined,
        productImageUrl: composite ? productUrls[0] : undefined,
        composite: composite && productUrls.length > 0,
        // 文字模式：送繁中 brief（潤色後 or 自動）→ server 翻英生圖，並存入結果 AI Prompt。
        customPrompt: composite ? undefined : effectiveBrief,
        // 合成模式：若用咗潤色，把擴寫後嘅「場景描述」作為合成場景覆寫（唔含主體，避免重畫產品）。
        sceneOverride: composite ? (polishedBrief ?? undefined) : undefined,
      };
      const postJson = (body: Record<string, unknown>) =>
        fetch("/api/library/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
      const post = (extra: Record<string, unknown>) => postJson({ ...baseBody, ...extra });

      // #4 系列圖 = 固定模板貼圖：共用背景 + 固定 placement，每件產品去背貼上 → 100% 一致。
      if (composite && seriesMode && productUrls.length >= 2) {
        let sharedBg = (slots.background?.data?.imageUrl as string | undefined) || undefined;
        if (!sharedBg) {
          const bgPrompt = `${buildSceneBrief() || "簡潔專業棚拍背景、柔光"}，純背景場景，無產品、無人物、無文字`;
          const bgRes = await postJson({ clientId, customPrompt: bgPrompt, size, draftOnly: true });
          sharedBg = bgRes.imageUrl;
          if (!sharedBg) throw new Error("共用背景生成失敗，請重試");
        }
        const results = await Promise.allSettled(productUrls.map((p) =>
          fetch("/api/library/template-paste", { method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ bgImageUrl: sharedBg, productImageUrl: p, placement, size, harmonize }) }).then((r) => r.json())));
        const ok = results
          .map((r, i) => r.status === "fulfilled" && r.value?.imageUrl
            ? { imageUrl: r.value.imageUrl as string, copyText: "", mode: "paste-template", selected: true, productImageUrls: [productUrls[i]] }
            : null)
          .filter((x): x is NonNullable<typeof x> => !!x);
        if (!ok.length) throw new Error("系列圖全部生成失敗，請重試");
        setDrafts(ok);
      } else if (composite && count > 1) {
        // #3 合成多輸出：平行生 N 張 draft（同一組產品）→ 揀。
        const results = await Promise.allSettled(Array.from({ length: count }, () => post({ draftOnly: true })));
        const ok = results
          .filter((r): r is PromiseFulfilledResult<{ imageUrl: string; copyText?: string; mode?: string }> => r.status === "fulfilled" && !!r.value?.imageUrl)
          .map((r) => ({ imageUrl: r.value.imageUrl, copyText: r.value.copyText ?? "", mode: r.value.mode ?? "flux2-edit", selected: true, productImageUrls: productUrls }));
        if (!ok.length) throw new Error("全部生成失敗，請重試");
        setDrafts(ok);
      } else {
        const data = await post({});
        if (data.error) throw new Error(data.error);
        setResult({ imageUrl: data.imageUrl, copyText: data.copyText ?? "" });
        onGenerated?.();
      }
    } catch (e: unknown) {
      setGenError(e instanceof Error ? e.message : "生成失敗，請重試");
    } finally {
      setGenerating(false);
    }
  }

  // #3 揀完 draft → 逐張存入圖庫（save-image，建 LibraryImage）。
  async function saveDrafts() {
    const sel = (drafts ?? []).filter((d) => d.selected);
    if (!sel.length) return;
    setSavingDrafts(true);
    setGenError(null);
    try {
      const palette = buildPalette();
      const effectiveSlots = buildEffectiveSlots();
      const promptStr = `[AI 合成] ${(polishedBrief || compiledPrompt || subject || "").trim()}`;
      await Promise.all(sel.map((d) =>
        fetch("/api/library/save-image", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientId, imageUrl: d.imageUrl, subject, prompt: promptStr, copyText: d.copyText,
            paramsJson: JSON.stringify({ slots: effectiveSlots, palette, notes, productImageUrl: d.productImageUrls[0], productImageUrls: d.productImageUrls, composite: true, mode: d.mode }),
          }),
        })));
      setDrafts(null);
      onGenerated?.();
    } catch (e: unknown) {
      setGenError(e instanceof Error ? e.message : "儲存失敗，請重試");
    } finally {
      setSavingDrafts(false);
    }
  }

  return (
    <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b bg-gradient-to-r from-gray-50 to-white flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-violet-500" />
        <h3 className="font-semibold text-sm">Prompt 積木組合台</h3>
        <span className="ml-auto text-xs text-gray-400">點積木揀素材，或從「風格組件」帶入</span>
      </div>

      <div className="p-5 space-y-5">
        {/* Industry preset quick-fill */}
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

        {/* Subject — 二選一: 文字主體 (純 AI) 或 產品圖 (合成用原圖) */}
        <div className="space-y-2">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600">
            <Target className="h-3.5 w-3.5 text-emerald-500" />主體物件（產品圖 或 文字，二選一）
          </label>

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

          {/* Text input — disabled when in image mode */}
          <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)}
            disabled={inputMode !== "text"}
            placeholder="例：冬季除毛、夏日防曬面膜、復古腳踏車…"
            className={`w-full rounded-lg border px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-400 transition ${
              inputMode === "text" ? "border-gray-200" : "border-gray-100 bg-gray-100 text-gray-400 cursor-not-allowed"}`} />

          {/* 文字模式提示：人像 / 插畫 已移至「素材生成」 */}
          {inputMode === "text" && (
            <p className="text-[10px] text-gray-400 leading-snug pt-0.5">
              產品文字 + 積木 → 生成場景圖（FLUX）。需要「真人 / 2D 插畫 / 純背景」請用右上「素材生成」。
            </p>
          )}

          {/* Product image area (1–3 photos) — full-width card (like a slot block); greyed in text mode */}
          <div className={`rounded-xl border p-3 transition-all ${
            inputMode === "image" ? "border-violet-200 bg-violet-50/30" : "border-dashed border-gray-200 bg-gray-50 opacity-40 pointer-events-none select-none"}`}>
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
            <p className="text-[10px] text-gray-400 leading-snug mt-1.5">
              可加最多 3 件產品，AI 會自動去背、打光並擺入所選背景（無需事先去背）。多件產品會一齊合成入同一場景。
            </p>
          </div>
        </div>

        {/* Style blocks — full-width stacked, placed below 主體物件. Each optional: 點卡片選取 / ✕ 移除 */}
        <div className="space-y-2.5">
          <label className="text-xs font-semibold text-gray-500 flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-violet-400" />風格積木（可選，按需增減：點卡片選取素材，右上 ✕ 移除）
          </label>

          <SlotCard category="COMPOSITION" icon={<LayoutTemplate className="h-4 w-4" />} emptyLabel="點擊選取構圖"
            component={slots.layout} onClear={() => onClearSlot("layout")} onPick={() => setPickerCategory("COMPOSITION")}
            descValue={effLayoutDesc} onDescChange={setLayoutDescOv} />

          <SlotCard category="COLOR_SCHEME" icon={<Palette className="h-4 w-4" />} emptyLabel="點擊選取配色"
            component={slots.color} onClear={() => onClearSlot("color")} onPick={() => setPickerCategory("COLOR_SCHEME")}
            colorsDisplay={enabledColors}
            footer={
              <div className="mt-3 pt-3 border-t border-rose-200/60" onClick={(e) => e.stopPropagation()}>
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
                          <div className="text-[10px] text-gray-400 leading-none mt-0.5 truncate">{hint}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            }
          />

          {/* 語氣積木已移除（合成唔需要）。語氣仍可由「風格組件」帶入影響文案。 */}

          <SlotCard category="BACKGROUND" icon={<ImageIcon className="h-4 w-4" />} labelOverride="背景"
            emptyLabel="點擊選擇背景"
            component={slots.background} onClear={() => onClearSlot("background")} onPick={() => setPickerCategory("BACKGROUND")} />
        </div>

        {/* Notes */}
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600">
            <StickyNote className="h-3.5 w-3.5 text-amber-500" />其他注意事項（選填）
          </label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
            placeholder="例：不要加入紅色、營造溫暖放鬆感、避免文字、產品要清晰…"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-400 transition" />
        </div>

        {/* Compiled prompt — 唯讀預覽，或潤色後可編輯 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-gray-500 flex items-center gap-1.5">
              {polishedBrief !== null
                ? <><Wand2 className="h-3 w-3 text-violet-500" />已潤色設計描述（可直接編輯，生成時會存入結果 AI Prompt）</>
                : <><Lock className="h-3 w-3" />設計描述預覽（唯讀 · 自動產生，請在上方欄位修改）</>}
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              {/* ✨潤色：手寫指令 → 擴寫成更豐富嘅中文 brief。合成模式潤色「場景描述」（含背景），文字模式潤色整段 brief。 */}
              {(() => {
                const canPolish = (composite ? buildSceneBrief().trim() : effectiveBrief.trim()).length > 0;
                return (
                  <button onClick={polishBrief} disabled={!canPolish || polishing}
                    className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border transition-all ${
                      canPolish && !polishing ? "bg-violet-50 border-violet-300 text-violet-700 hover:bg-violet-100"
                      : "opacity-40 cursor-not-allowed border-gray-200 text-gray-400"}`}
                    title={composite ? "把場景描述擴寫成更完整的中文 brief（不含產品，可再編輯）" : "把目前描述擴寫成更完整的中文設計 brief（可再編輯）"}>
                    {polishing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
                    {polishing ? "潤色中…" : "✨潤色"}
                  </button>
                );
              })()}
              {polishedBrief !== null && (
                <button onClick={() => setPolishedBrief(null)}
                  className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-500 hover:text-red-500 hover:border-red-200 transition-all"
                  title="還原成自動產生的描述">
                  <RotateCcw className="h-3 w-3" />還原
                </button>
              )}
              <button onClick={copyPrompt} disabled={!hasAnyContent}
                className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border transition-all ${
                  hasAnyContent ? (copied ? "bg-emerald-50 border-emerald-300 text-emerald-700" : "bg-white border-gray-200 text-gray-600 hover:border-gray-400")
                  : "opacity-30 cursor-not-allowed border-gray-200 text-gray-400"}`}>
                {copied ? <><Check className="h-3 w-3" />已複製</> : <><Copy className="h-3 w-3" />複製</>}
              </button>
            </div>
          </div>
          {polishedBrief !== null ? (
            // 潤色後：可編輯 textarea，用戶可微調再生圖
            <textarea value={polishedBrief} onChange={(e) => setPolishedBrief(e.target.value)} rows={6}
              className="w-full rounded-lg border border-violet-200 bg-violet-50/40 px-3 py-2.5 text-[12px] text-gray-700 leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-violet-300 whitespace-pre-wrap" />
          ) : (
            // Read-only display (NOT an input) — muted, caption-like so it never looks editable
            <div className="w-full rounded-lg bg-gray-100/70 px-3 py-2.5 text-[11px] text-gray-500 leading-relaxed whitespace-pre-wrap select-text">
              {compiledPrompt || (
                <span className="text-gray-400">選取積木或輸入主體後，這裡會自動組裝繁中設計描述；生成時自動翻譯成英文 prompt 餵圖像模型。也可手寫描述後按「✨潤色」擴寫。</span>
              )}
            </div>
          )}
          {/* Composite info — NOT part of the brief / not translated, just explains what will happen */}
          {(composite || (slots.background && (slots.background.data?.imageUrl || slots.background.previewUrl))) && (
            <div className="rounded-lg bg-violet-50 border border-violet-100 px-3 py-2 space-y-0.5">
              {composite && (
                <div className="text-[11px] text-violet-700 flex items-center gap-1.5">
                  <ImageIcon className="h-3 w-3 shrink-0" />合成模式：AI 自動去背 {productUrls.length} 件產品、打光並擺入場景
                </div>
              )}
              {slots.background && (slots.background.data?.imageUrl || slots.background.previewUrl) && (
                <div className="text-[11px] text-violet-700 flex items-center gap-1.5">
                  <ImageIcon className="h-3 w-3 shrink-0" />{productUrls.length >= 3
                    ? `背景：3 件產品時，背景「${slots.background!.name}」只作文字參考（不直接合成）`
                    : `背景：合成時將產品擺入背景「${slots.background!.name}」`}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Output size */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-gray-500">輸出尺寸</label>
          <div className="flex gap-1.5">
            <button type="button" onClick={() => setSize("square")}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                size === "square" ? "bg-violet-600 text-white border-violet-600" : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"}`}>
              <span className="inline-block w-3 h-3 border border-current rounded-[2px]" />正方形 1200×1200
            </button>
            <button type="button" onClick={() => setSize("landscape")}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                size === "landscape" ? "bg-violet-600 text-white border-violet-600" : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"}`}>
              <span className="inline-block w-4 h-3 border border-current rounded-[2px]" />橫向 1800×1200
            </button>
          </div>
        </div>

        {/* Composite engine — only in composite (產品圖) mode */}
        {inputMode === "image" && (
          <div className="space-y-2">
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
            <p className="text-[10px] text-gray-400 leading-snug">
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
                    {!slots.background && <span className="text-gray-400">；未揀背景會自動鎖一個共用 AI 背景</span>}
                  </span>
                </label>

                {/* 擺位編輯器：拖預覽定位置 + 滑桿調大小 */}
                {seriesMode && (
                  <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-3 space-y-2">
                    <div className="text-[11px] font-semibold text-violet-700">擺位（拖產品定位置・滑桿調大小）—— 所有產品共用</div>
                    <div
                      className={`relative w-full mx-auto rounded-lg overflow-hidden border bg-gray-100 select-none touch-none ${size === "landscape" ? "max-w-[360px] aspect-[3/2]" : "max-w-[280px] aspect-square"}`}
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
                        <div className="absolute inset-0 flex items-center justify-center text-[10px] text-gray-400 text-center px-2">未揀背景<br/>生成時自動鎖共用 AI 背景</div>
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

            {/* #3 生成數量：一次出多張俾你揀（系列模式時隱藏，張數＝產品件數）*/}
            {!(seriesMode && productUrls.length >= 2) && (
              <div className="flex items-center gap-3 pt-1">
                <label className="text-xs font-semibold text-gray-500 whitespace-nowrap">生成數量</label>
                <div className="flex gap-1.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button" onClick={() => setCount(n)}
                      className={`w-8 h-8 rounded-lg border text-sm font-medium transition-colors ${count === n ? "bg-violet-600 text-white border-violet-600" : "bg-white border-gray-200 text-gray-600 hover:border-violet-300"}`}>
                      {n}
                    </button>
                  ))}
                </div>
                {count > 1 && <span className="text-[10px] text-gray-400">出 {count} 張揀（成本 ×{count}）</span>}
              </div>
            )}
          </div>
        )}

        {/* Generate */}
        <Button onClick={handleGenerate} disabled={!canGenerate || generating || savingDrafts}
          className="w-full gap-2 bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-40">
          {(() => {
            const series = composite && seriesMode && productUrls.length >= 2;
            if (generating) return <><Loader2 className="h-4 w-4 animate-spin" />{series ? `生成系列中…（${productUrls.length} 張）` : composite ? `合成中…${count > 1 ? `（${count} 張）` : ""}` : "生成中…（約 10–40 秒）"}</>;
            return <><Sparkles className="h-4 w-4" />{series ? `生成系列 ${productUrls.length} 張` : composite ? (count > 1 ? `合成 ${count} 張俾你揀` : "合成產品圖到背景") : "用此 Prompt 生成新圖"}</>;
          })()}
        </Button>

        {genError && (
          <div className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">⚠️ {genError}</div>
        )}

        {/* Result（單張）*/}
        {result && (
          <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-3 flex gap-3 items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={result.imageUrl} alt="generated" className="w-32 h-32 object-contain rounded-lg border shrink-0 bg-white" />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-violet-700 flex items-center gap-1">
                <Check className="h-3.5 w-3.5" />完成，已加入圖片紀錄
              </div>
            </div>
          </div>
        )}

        {/* #3 多張 draft：揀邊張保留 */}
        {drafts && (
          <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-3 space-y-3">
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
}
