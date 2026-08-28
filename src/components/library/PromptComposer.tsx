"use client";
/**
 * PromptComposer — 生成圖片 tab 的積木組合台
 * Slots (構圖/配色/語氣/背景) 可點擊揀已有素材；可上傳產品圖（AI 描述填主體 / 直接合成）；
 * 色盤逐色開關；其他注意事項。生成走 POST /api/library/generate。
 */

import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { useUndoRedo } from "@/hooks/useUndoRedo";
import {
  X, Check, Sparkles, LayoutTemplate, SwatchBook, Mountain, Layers, RotateCcw, RotateCw,
  Loader2, Upload, Trash2, Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PromptSlots, StyleComponent, ComponentCategory, PaletteColor, PaletteRole } from "@/types/library";
import { getColors, PALETTE_ROLES, SHOW_SERIES_TEMPLATE } from "@/types/library";
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
// present = 呢隻色喺揀嗰個配色組件度係咪真係有定義（冇定義嘅唔畫 chip，唔係得個「未開」樣）。
type PalRow = { role: PaletteRole; label: string; hex: string; enabled: boolean; present: boolean };

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
      present: r.role === "primary" ? true : !!found,
    };
  });
}

// 積木分類 → designText 內嘅標籤前綴（同 ActivityForm.tsx 嘅 CAT_META/tagFor 一致做法）。
const BLOCK_TAG_META: Record<"COMPOSITION" | "COLOR_SCHEME" | "BACKGROUND", { slot: keyof PromptSlots; label: string }> = {
  COMPOSITION: { slot: "layout", label: "構圖" },
  COLOR_SCHEME: { slot: "color", label: "配色" },
  BACKGROUND: { slot: "background", label: "背景" },
};

// 標籤之間嘅固定次序，同版面次序對齊：01 產品圖片（主體）→ 02 套用風格積木（構圖→配色→背景）。
const TAG_ORDER = ["主體", "構圖", "配色", "背景"];
// 每個標籤一行「標籤：內容」（用全形冒號、冇方括號，睇落似正常一句話），方便用正則識別／更新。
const TAG_LINE_RE = new RegExp(`^(${TAG_ORDER.join("|")})：(.*)$`);
const stripTagLines = (text: string) => text.replace(new RegExp(`^(?:${TAG_ORDER.join("|")})：.*$`, "gm"), "").trim();

/** 更新／移除 designText 入面嘅「標籤：內容」一行，並將已知標籤按 TAG_ORDER 排好次序
 *  （唔理邊個標籤先撳，讀出嚟永遠都係 主體→構圖→配色→背景）；自由打字嘅內容維持喺原本位置。 */
function replaceTag(text: string, label: string, body: string): string {
  const lines = text.split("\n");
  const tagMap = new Map<string, string>();
  const restLines: string[] = [];
  let insertAt = -1;
  for (const line of lines) {
    const m = line.match(TAG_LINE_RE);
    if (m) {
      if (insertAt === -1) insertAt = restLines.length;
      tagMap.set(m[1], m[2]);
    } else if (line.trim()) {
      restLines.push(line);
    }
  }
  if (body.trim()) tagMap.set(label, body.trim());
  else tagMap.delete(label);
  const tagLines = TAG_ORDER.filter((l) => tagMap.has(l)).map((l) => `${l}：${tagMap.get(l)}`);
  if (insertAt === -1) insertAt = restLines.length;
  return [...restLines.slice(0, insertAt), ...tagLines, ...restLines.slice(insertAt)].join("\n").trim();
}

/** 取得「主體」文字：優先用「主體：...」一行（AI 讀圖產生）；文字模式冇嗰行時，
 *  用扣除所有風格標籤行後餘低嘅自由文字（使用者直接打字嘅產品描述）。 */
function extractSubject(text: string, isComposite: boolean): string {
  const tagMatch = text.match(/^主體：(.*)$/m);
  if (tagMatch) return tagMatch[1].trim();
  if (isComposite) return "";
  return stripTagLines(text).slice(0, 60);
}

// ─── Compact block picker card（同 ActivityForm.tsx 嘅「套用風格積木」一致樣式）──
// 純粹「揀邊個素材」：圖／色板預覽 + 名，冇 inline 文字編輯——內容一律去 designText 度改。
function BlockCard({
  label, icon, component, preview, onPick, onClear,
}: {
  label: string;
  icon: React.ReactNode;
  component: StyleComponent | null;
  preview: React.ReactNode;
  onPick: () => void;
  onClear: () => void;
}) {
  const filled = !!component;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="flex items-center gap-1 text-xs font-medium text-gray-600">{icon}{label}</span>
        {filled && (
          <button type="button" onClick={onClear} className="text-gray-400 hover:text-red-500" title="清除">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <button type="button" onClick={onPick}
        className={`w-full rounded-xl border overflow-hidden text-left transition-all ${filled ? "border-violet-200" : "border-dashed border-gray-200 hover:border-violet-300"}`}>
        {filled ? (
          <>
            {preview ?? <div className="h-20 bg-violet-50" />}
            <div className="px-2 py-1.5 text-xs text-gray-700 truncate bg-white">{component!.name}</div>
          </>
        ) : (
          <div className="h-20 flex items-center justify-center text-xs text-gray-400">點擊選取{label}</div>
        )}
      </button>
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
  // 統一設計描述——主體／構圖／配色／背景／其他注意事項全部喺呢一個 textarea 度，
  // 由頭到尾都可編輯（唔再有「唯讀預覽」／「潤色先解鎖」兩個階段）。積木揀選會將
  // `構圖：...` 呢類一行插入呢個文字（冇方括號，睇落自然啲；同 ActivityForm.tsx 嘅 applyBlock 概念一致）。
  const [designText, setDesignText] = useState("");
  // AI優化提示詞嘅上一步/重做棧（見 src/hooks/useUndoRedo.ts）。
  const designTextHistory = useUndoRedo(designText, setDesignText);
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
  // #2 潤色寫手：擴寫 designText（直接覆寫，唔再係獨立 state）。
  const [polishing, setPolishing] = useState(false);
  // Editable compiled prompt override
  const [activePreset, setActivePreset] = useState<string | null>(null);

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
  const composite = productUrls.length > 0;
  const genHint = useRotatingHint(generating, GEN_HINTS);
  // 五個引擎全部支援多產品，毋須單圖限制。
  const effEngine = engine;

  // Palette as a fixed 5-role table (same model as QuickAddModal): checkbox enables/disables.
  const [paletteRows, setPaletteRows] = useState<PalRow[] | null>(null);

  const effRows = paletteRows ?? buildPaletteRows(slots.color);
  const enabledColors: PaletteColor[] = effRows.filter((r) => r.enabled).map((r) => ({ hex: r.hex, role: r.role, label: r.label }));
  // 有冇「臨時改咗」色盤（用嚟決定儲存嗰陣要唔要起一個新 block，唔好靜雞雞冒認舊 id）。
  const colorEdited = paletteRows !== null && JSON.stringify(paletteRows) !== JSON.stringify(buildPaletteRows(slots.color));

  // Reset palette override when the color slot's source material changes — using React's
  // documented "adjust state during render by comparing to previous state" pattern.
  const [prevColorId, setPrevColorId] = useState(slots.color?.id);
  if (prevColorId !== slots.color?.id) { setPrevColorId(slots.color?.id); setPaletteRows(null); }

  // Prefill from 重新生成 (#5) —— 上層將上次生成用嘅 slots（構圖/配色/背景）直接塞落嚟做
  // prop（唔經呢個 component 自己嘅 picker onPick），所以之前冇補返對應嘅「構圖：/配色：/
  // 背景：」呢幾行標籤入 designText——slots 本身冇死（block card 揀好緊嗰個仍然會顯示），
  // 但設計描述文字入面冇咗嗰幾行，令呢次重新生成實際上冇跟到原本嘅風格積木。而家補返：
  // 同 SlotPickerModal 嘅 onPick 用返一致嘅 tag body 邏輯，喺 prefill 嗰刻由 slots 直接砌返標籤。
  useEffect(() => {
    if (prefillNonce === undefined) return;
    const lines: string[] = [];
    if (prefill?.subject?.trim()) lines.push(`主體：${prefill.subject.trim()}`);
    if (slots.layout) {
      const body = (slots.layout.data?.description as string) || slots.layout.aiPromptText || slots.layout.name;
      if (body) lines.push(`構圖：${body}`);
    }
    if (slots.color) {
      const rows = buildPaletteRows(slots.color);
      const body = rows.filter((r) => r.enabled).map((r) => `${r.label} ${r.hex}`).join("、");
      if (body) lines.push(`配色：${body}`);
    }
    // slots.background 儲存嗰陣，作文字參考模式一律會存做 null（見 buildEffectiveSlots），
    // 所以呢度會揀返嚟嘅一定係「直接合成」用嗰張——冇文字標籤，但要補返 bgAsImage 狀態。
    if (slots.background) setBgAsImage(true);
    if (prefill?.notes?.trim()) lines.push(prefill.notes.trim());
    if (lines.length) setDesignText(lines.join("\n"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillNonce]);

  // 背景用法：預設「作為文字參考」（把背景 AI Prompt 拉入設計描述、不合成圖）；可切換「直接合成」。
  const bgText = ((slots.background?.data?.description as string) || slots.background?.aiPromptText || slots.background?.name || "").trim();
  const hasAnyContent = designText.trim().length > 0;
  // 軟鎖：必須有「主體」——圖片（已上傳產品圖）或文字（設計描述中扣除風格標籤後仍有內容）其中一樣，
  // 否則唔准生成（純粹只有構圖/配色/背景呢類風格標籤、冇實際主體，生成出嚟冇意義）。
  const hasSubjectText = stripTagLines(designText).length > 0;
  const hasSubject = composite || hasSubjectText;
  const canGenerate = hasSubject;
  // 合成模式潤色來源：去咗「主體：...」嗰行先潤色（唔想 AI 連產品本身描述都一齊擴寫重畫）。
  function buildPolishSource(): string {
    if (!composite) return designText;
    return designText.replace(/^主體：.*$/m, "").replace(/\n{2,}/g, "\n").trim();
  }

  // 潤色 AI 會將成段文字改寫做敘事段落，冇保證會保留「構圖：/配色：/背景：」呢啲標籤行
  // （見過整段色碼喺潤色後消失）。潤色完之後強制按目前實際揀嘅積木/色板重新插番啲標籤，
  // 唔理 AI 有冇原文保留——同揀積木/切換顏色用緊嗰套 replaceTag() 邏輯一致，確保唔會流失。
  function reinjectStyleTags(text: string): string {
    let t = text;
    if (slots.layout) {
      const body = (slots.layout.data?.description as string) || slots.layout.aiPromptText || slots.layout.name;
      t = replaceTag(t, "構圖", body);
    }
    const colorBody = effRows.filter((r) => r.enabled).map((r) => `${r.label} ${r.hex}`).join("、");
    if (colorBody) t = replaceTag(t, "配色", colorBody);
    if (slots.background) {
      const body = bgAsImage ? "" : ((slots.background.data?.description as string) || slots.background.aiPromptText || slots.background.name);
      t = replaceTag(t, "背景", body);
    }
    return t;
  }

  // 配色改做開關 chip（冇 hex 輸入，色碼要去素材庫改）：撳一下即刻反映入設計描述。
  function toggleColorEnabled(role: PaletteRole) {
    const newRows = effRows.map((r) => (r.role === role ? { ...r, enabled: !r.enabled } : r));
    setPaletteRows(newRows);
    const body = newRows.filter((r) => r.enabled).map((r) => `${r.label} ${r.hex}`).join("、");
    setDesignText((t) => replaceTag(t, "配色", body));
  }

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

  // #2 潤色寫手：擴寫目前 designText → 直接覆寫（唔再係獨立 state）；覆寫前推一步落 undo 棧。
  async function polishBrief() {
    const source = buildPolishSource();
    if (!source.trim()) return;
    setPolishing(true);
    setGenError(null);
    try {
      const res = await fetch("/api/library/polish", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brief: source,
          clientId,
          ...(productUrls.length > 0 ? { productImageUrls: productUrls } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "潤色失敗");
      const polished = (data.brief ?? source).trim();
      if (composite) {
        // 合成模式：source 冇包主體，攞返原本「主體：...」嗰行補返喺前面。
        const subjectTag = designText.match(/^主體：.*$/m)?.[0];
        designTextHistory.commit(reinjectStyleTags(subjectTag ? `${subjectTag}\n${polished}` : polished));
      } else {
        designTextHistory.commit(reinjectStyleTags(polished));
      }
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
          if (dr.ok && dd.subject) setDesignText((prev) => replaceTag(prev, "主體", dd.subject));
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
      if (data.subject) setDesignText((prev) => replaceTag(prev, "主體", data.subject));
    } catch (e: unknown) {
      setGenError(e instanceof Error ? e.message : "讀圖失敗");
    } finally {
      setDescribing(false);
    }
  }

  const buildPalette = () => effRows.map((r) => ({ hex: r.hex, role: r.role, label: r.label, use: r.enabled }));
  // Build effective slots reflecting the inline edits (so copy/tone uses the latest values).
  const buildEffectiveSlots = (): PromptSlots => ({
    layout: slots.layout,
    background: bgAsImage ? slots.background : null, // 直接用背景圖→送圖合成；作文字參考→唔送圖（由 designText 描述生成場景）
    color: slots.color ? { ...slots.color, data: { ...slots.color.data, colors: enabledColors, primaryColor: enabledColors.find((c) => c.role === "primary")?.hex, secondaryColor: enabledColors.find((c) => c.role === "secondary")?.hex } } : null,
    tone: slots.tone,
  });

  async function handleGenerate() {
    if (!canGenerate) return;
    setGenerating(true);
    setGenError(null);
    setDrafts(null);
    try {
      const palette = buildPalette();
      const effectiveSlots = buildEffectiveSlots();
      const derivedSubject = extractSubject(designText, composite);
      const baseBody = {
        clientId, subject: derivedSubject, slots: effectiveSlots, palette, notes: "",
        size: "custom", customW: outDims.w, customH: outDims.h,
        // 文字模式後端淨係識 engine:"nano"（觸發純文字 nano-banana）；其他值當預設 FLUX 場景生成處理。
        engine: composite ? effEngine : (engine === "nano" ? "nano" : undefined),
        productImageUrls: composite ? productUrls : undefined,
        productImageUrl: composite ? productUrls[0] : undefined,
        composite: composite && productUrls.length > 0,
        // 文字模式：送繁中 designText → server 翻英生圖，並存入結果 AI Prompt。
        customPrompt: composite ? undefined : designText,
        // 合成模式：designText 去咗主體之後嘅場景部分作為合成場景覆寫（唔含主體，避免重畫產品）。
        sceneOverride: composite ? (buildPolishSource() || undefined) : undefined,
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
          const bgPrompt = `${buildPolishSource() || "簡潔專業棚拍背景、柔光"}，純背景場景，無產品、無人物、無文字`;
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
    setDesignText("");
    setProductUrls([]);
    setActivePreset(null);
    setSeriesMode(false);
    setBgAsImage(false);
    setPaletteRows(null);
    designTextHistory.reset();
    (["layout", "color", "tone", "background"] as (keyof PromptSlots)[]).forEach((k) => onClearSlot(k));
  }

  // 暴露 reset 俾 modal header 調用；並通知上層「有冇內容」（決定 header「清空重來」掣顯示）。
  useImperativeHandle(ref, () => ({ reset: resetComposer }));
  const composerDirty = !!(designText || productUrls.length > 0 || slots.layout || slots.color || slots.tone || slots.background || activePreset);
  useEffect(() => { onDirtyChange?.(composerDirty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composerDirty]);

  // 臨時改咗先生成 → 儲存嗰陣：改咗就起一個新 StyleComponent（新 id），未改就照用原本嗰個 id，
  // 唔好用返舊 id 夾帶新內容（否則個 id 會同 library 入面「真身」對唔上，見 docs 討論）。
  // previewUrl = 生成出嚟嗰張圖 → picker card 顯示返該產品圖（唔止色塊）。
  // 構圖已經冇 inline edit（一律喺 designText 度改），淨係色盤仲有結構化編輯，值得 materialize。
  async function materializeEditedSlots(ownerImageUrl?: string): Promise<PromptSlots> {
    const base = buildEffectiveSlots();
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
      const derivedSubject = extractSubject(designText, composite);
      // 用第一張選定 draft 嘅圖做 owner（materialize 出嚟嘅 block 由呢批 draft 共用）。
      const effectiveSlots = await materializeEditedSlots(sel[0]?.imageUrl);
      await Promise.all(sel.map((d) => {
        const isComposite = d.productImageUrls.length > 0;
        const promptStr = isComposite ? `[AI 合成] ${designText.trim()}` : designText.trim();
        const params = isComposite
          ? { slots: effectiveSlots, palette, productImageUrl: d.productImageUrls[0], productImageUrls: d.productImageUrls, composite: true, mode: d.mode }
          : { slots: effectiveSlots, palette, customPrompt: designText, mode: d.mode };
        if (d.id) {
          return fetch(`/api/library/images/${d.id}`, {
            method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ subject: derivedSubject, copyText: d.copyText, paramsJson: JSON.stringify(params) }),
          });
        }
        return fetch("/api/library/save-image", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId, imageUrl: d.imageUrl, subject: derivedSubject, prompt: promptStr, copyText: d.copyText, paramsJson: JSON.stringify(params) }),
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
    <div className="pb-20">
      <div className="space-y-5">
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

        {/* ── 01 產品圖片 ── */}
        <SectionLabel step="01" title="產品圖片" hint="選填 · AI 可代讀圖填入下面設計描述" />
        <div className="rounded-xl border border-violet-200 bg-violet-50/30 p-3 transition-all">
          <input id="composer-product" type="file" accept="image/*" className="hidden"
            onChange={(e) => { if (e.target.files?.[0]) uploadProduct(e.target.files[0]); e.currentTarget.value = ""; }} />
          {productUrls.length === 0 ? (
            // 空狀態：整個盒做 dropzone（全幅可點，唔再有死框）
            <button onClick={() => document.getElementById("composer-product")?.click()} disabled={productUploading}
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
                <button onClick={() => document.getElementById("composer-product")?.click()} disabled={productUploading}
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
                {describing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}AI 讀取產品圖，填入設計描述
              </button>
            </div>
          )}
          <p className="text-[11px] text-gray-400 leading-snug mt-1.5">
            可加最多 3 件產品，AI 會自動去背、打光並擺入所選背景（無需事先去背）。多件產品會一齊合成入同一場景。
          </p>
        </div>

        {/* ── 02 套用風格積木 ── 3 欄小卡片（與活動圖頁一致），選取後即時加入下面設計描述；
            配色／背景的細節操作一律做成 checkbox（不再是常駐大面板），勾選後即時反映入設計描述 */}
        <SectionLabel step="02" title="參考過往貼文風格" hint="選填 · 選取後會加入下面設計描述" />
        <div className="grid grid-cols-3 gap-3">
          <div>
            <BlockCard label="構圖" icon={<LayoutTemplate className="h-4 w-4" />} component={slots.layout}
              preview={slots.layout?.previewUrl ? <img src={slots.layout.previewUrl} alt={slots.layout.name} className="w-full h-20 object-cover" /> : null}
              onPick={() => setPickerCategory("COMPOSITION")}
              onClear={() => { onClearSlot("layout"); setDesignText((t) => replaceTag(t, "構圖", "")); }} />
          </div>

          <div>
            <BlockCard label="配色" icon={<SwatchBook className="h-4 w-4" />} component={slots.color}
              preview={enabledColors.length ? <div className="h-20"><ColorCards colors={enabledColors} height="h-20" interactive={false} showLock /></div> : null}
              onPick={() => setPickerCategory("COLOR_SCHEME")}
              onClear={() => { onClearSlot("color"); setPaletteRows(null); setDesignText((t) => replaceTag(t, "配色", "")); }} />
            {/* 配色開關 chip：只顯示可以開關嘅顏色。主色永遠鎖定必用，最多 4 個可撳 role
                （輔色/強調色/中性色/點綴色），3 欄格仔闊度夠位一行擺晒。 */}
            {slots.color && (
              <div className="flex flex-wrap gap-0.5 mt-1.5">
                {effRows.filter((r) => r.present && r.role !== "primary").map((r) => (
                  <button key={r.role} type="button" onClick={() => toggleColorEnabled(r.role)}
                    title="啟用／停用（色碼要到素材庫修改）"
                    className={`flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full border transition-colors ${
                      r.enabled ? "bg-violet-50 border-violet-300 text-violet-700" : "bg-white border-gray-200 text-gray-400"}`}>
                    <span className={`w-2 h-2 rounded-full border border-black/10 shrink-0 ${r.enabled ? "" : "opacity-40"}`} style={{ background: r.hex }} />
                    {r.label}
                  </button>
                ))}
              </div>
            )}
            {slots.color && (
              <p className="text-[10px] text-gray-400 leading-snug mt-1">
                • 勾選：套用該顏色<br />
                • 取消勾選：生成時不參考該顏色<br />
                • 主色：必定使用，固定鎖定
              </p>
            )}
          </div>

          <div>
            <BlockCard label="背景" icon={<Mountain className="h-4 w-4" />} component={slots.background}
              preview={
                (slots.background?.data?.imageUrl || slots.background?.previewUrl)
                  ? <img src={(slots.background!.data?.imageUrl as string) || slots.background!.previewUrl!} alt={slots.background!.name} className="w-full h-20 object-cover" />
                  : null
              }
              onPick={() => setPickerCategory("BACKGROUND")}
              onClear={() => { onClearSlot("background"); setDesignText((t) => replaceTag(t, "背景", "")); }} />
            {/* 背景用法：單一 checkbox，標籤本身已經講清楚勾咗會點——唔使額外一句 caption。 */}
            {slots.background && (
              <label className={`flex items-center gap-1.5 mt-1.5 text-[10.5px] ${
                productUrls.length >= 3 ? "opacity-40 cursor-not-allowed text-gray-400" : "cursor-pointer text-gray-600"}`}
                title={productUrls.length >= 3 ? "3 件產品時只支援作為文字參考" : undefined}>
                <button type="button" disabled={productUrls.length >= 3}
                  onClick={() => setBgAsImage((v) => {
                    const next = !v;
                    setDesignText((t) => replaceTag(t, "背景", next ? "" : bgText));
                    return next;
                  })}
                  className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${bgAsImage ? "bg-violet-600 border-violet-600" : "border-gray-300 bg-white"}`}>
                  {bgAsImage && <Check className="h-2.5 w-2.5 text-white" />}
                </button>
                將產品直接合成進背景圖
              </label>
            )}
          </div>
        </div>

        {/* ── 03 設計描述 ── 由頭到尾都可編輯，主體／構圖／配色／背景／注意事項全部在這一個文字框；
            上面已經集齊積木注入的內容，這裡做最後定稿 */}
        <SectionLabel step="03" title="設計描述" hint="最後定稿 · 隨時可改" />
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-gray-600">設計描述 Prompt</span>
              {/* 目前模式標示：解釋點解 04「合成方式」有時會顯示／隱藏，同「主體」內容來源 */}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${composite ? "border-violet-300 text-violet-600 bg-violet-50" : "border-gray-200 text-gray-500 bg-gray-50"}`}>
                {composite ? "🖼 圖片合成模式" : "✍️ 文字生成模式"}
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button onClick={polishBrief} disabled={!hasAnyContent || polishing}
                className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border transition-all ${
                  hasAnyContent && !polishing ? "bg-violet-50 border-violet-300 text-violet-700 hover:bg-violet-100"
                  : "opacity-40 cursor-not-allowed border-gray-200 text-gray-400"}`}
                title="把目前描述擴寫成更完整的中文設計 brief（可再編輯）">
                {polishing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
                {polishing ? "AI優化提示詞中…" : "AI優化提示詞"}
              </button>
              {/* 上一步/重做：一齊出現一齊收埋（未撳過 AI優化提示詞 之前完全唔顯示），
                  唔會各自獨立顯示/隱藏——否則逐步 undo/redo 嗰陣兩粒掣會此消彼長咁跳位置。 */}
              {(designTextHistory.canUndo || designTextHistory.canRedo) && (
                <>
                  <button onClick={designTextHistory.undo} disabled={!designTextHistory.canUndo}
                    className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border transition-all ${
                      designTextHistory.canUndo ? "bg-white border-gray-200 text-gray-600 hover:border-gray-400"
                      : "opacity-30 cursor-not-allowed border-gray-200 text-gray-400"}`}
                    title="上一步">
                    <RotateCcw className="h-3 w-3" />上一步
                  </button>
                  <button onClick={designTextHistory.redo} disabled={!designTextHistory.canRedo}
                    className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border transition-all ${
                      designTextHistory.canRedo ? "bg-white border-gray-200 text-gray-600 hover:border-gray-400"
                      : "opacity-30 cursor-not-allowed border-gray-200 text-gray-400"}`}
                    title="重做">
                    <RotateCw className="h-3 w-3" />重做
                  </button>
                </>
              )}
            </div>
          </div>
          {/* 常駐提示：唔會好似 placeholder 咁一有內容就消失，等有主體/積木內容之後都仲提你可以補注意事項 */}
          <p className="text-[11px] text-gray-400 mt-0.5 mb-1.5">其他注意事項（例如：不要加入紅色、營造溫暖放鬆感）也可以直接寫在下面的文字框裡。</p>
          <textarea value={designText} onChange={(e) => setDesignText(e.target.value)} rows={5}
            placeholder="例：秋冬保濕面霜，質地清爽好推開……（可直接打字，或上傳產品圖片／選取風格積木自動幫你填入）"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-gray-300 placeholder:text-gray-400 whitespace-pre-wrap" />
          {/* Composite info — NOT part of the brief / not translated, just explains what will happen.
              背景狀態喺 02 checkbox 隔籬已經即時反映一次；呢度做「生成前總覽」，兩處保留（唔同時刻，唔算重複）。
              擺喺警告上面：先睇「已經設定咗咩」，最後先見「仲欠咩先撳得掣」，貼近生成掣個位。 */}
          {(composite || slots.background) && (
            <div className="rounded-lg bg-violet-50 border border-violet-100 px-3 py-2 space-y-0.5">
              {composite && (
                <div className="text-[11px] text-violet-700 flex items-center gap-1.5">
                  <Layers className="h-3 w-3 shrink-0" />合成模式：AI 自動去背 {productUrls.length} 件產品、打光並擺入場景
                </div>
              )}
              {slots.background && (
                <div className="text-[11px] text-violet-700 flex items-center gap-1.5">
                  <Mountain className="h-3 w-3 shrink-0" />背景：{bgAsImage ? "直接合成，AI 會把產品擺入這張圖" : "作為文字參考，AI 依描述生成場景"}
                </div>
              )}
            </div>
          )}
          {!hasSubject && (
            <p className="text-[11px] text-amber-600">請先上傳產品圖片，或在上方填寫產品主體描述，才能生成。</p>
          )}
        </div>

        {/* ── 04 輸出設定 ── 最重要嘅決定（合成方式/AI 引擎）行先，尺寸／數量做微調殿後 */}
        <SectionLabel step="04" title="輸出設定" hint="引擎 · 尺寸 · 數量" />
        {/* 文字生成模式都要有引擎揀擇——之前淨係喺合成模式先出現，變相文字模式冇得揀，
            但後端其實一早支援 nano-banana 純文字生圖，唔應該收埋。 */}
        {!composite && (
          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-500">生成引擎</label>
            <div className="flex gap-1.5 flex-wrap">
              {([
                { key: "flux2edit", title: "FLUX · 預設", sub: "場景與文字排版最穩定" },
                { key: "nano", title: "nano-banana", sub: "畫面更自然，唯文字排版偶爾失準" },
              ] as const).map((e) => (
                <button key={e.key} type="button" onClick={() => setEngine(e.key)}
                  className={`flex-1 min-w-[30%] text-left text-xs px-3 py-2 rounded-lg border transition-colors ${effEngine === e.key ? "bg-violet-600 text-white border-violet-600" : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"}`}>
                  <div className="font-semibold">{e.title}</div>
                  <div className={`text-[10px] leading-snug ${effEngine === e.key ? "text-violet-100" : "text-gray-400"}`}>{e.sub}</div>
                </button>
              ))}
            </div>
          </div>
        )}
        {/* Composite engine — only when at least one product image uploaded */}
        {composite && (
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
                    <b>固定模板系列</b>：每件產品貼在固定背景的固定位置／大小（{productUrls.length} 件 → {productUrls.length} 張，100% 一致、真實像素、不會失真）
                    {!slots.background && <span className="text-gray-400">；未選背景時會自動鎖定一張共用 AI 背景</span>}
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
                        <div className="absolute inset-0 flex items-center justify-center text-[11px] text-gray-400 text-center px-2">未選背景<br/>生成時會自動鎖定共用 AI 背景</div>
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
                      <span className="leading-snug">AI 融合打光（貼上後重新打光，令光影更自然；每張會多一次 AI 運算、有些微飄移風險、文字可能被移動）</span>
                    </label>
                  </div>
                )}
              </>
            )}

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
        {!(seriesMode && productUrls.length >= 2) && (
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
            {count > 1 && <span className="text-[11px] text-gray-400">生成 {count} 張供選擇（成本 ×{count}）</span>}
          </div>
        )}

        {genError && (
          <div className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">⚠️ {genError}</div>
        )}

        {/* 多張 draft：揀邊張保留（單張亦行此 path → 確認後先入庫，唔自動落 gallery）*/}
        {drafts && (
          <div ref={resultRef} className="scroll-mt-2 rounded-xl border border-violet-200 bg-violet-50/40 p-3 space-y-3">
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
          </div>
        )}
      </div>

      {/* Actions — fixed 貼實 viewport 底（跟 QuickAddForm/GenerateAssetForm 同一套處理，
          因為外層 <main class="overflow-auto"> 令 sticky 失效，見 QuickAddForm 註解）。 */}
      <div className="fixed bottom-0 left-60 right-0 z-30 bg-white border-t">
        <div className="max-w-3xl ml-6 py-3 flex items-center gap-3">
          {!drafts ? (
            <Button onClick={handleGenerate} disabled={!canGenerate || generating || savingDrafts}
              className="w-full gap-2 bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-40">
              {(() => {
                const series = composite && seriesMode && productUrls.length >= 2;
                if (generating) { const suffix = series ? `（${productUrls.length} 張）` : composite && count > 1 ? `（${count} 張）` : "（約 10–40 秒）"; return <><Loader2 className="h-4 w-4 animate-spin" />{genHint}{suffix}</>; }
                return <><Sparkles className="h-4 w-4" />{series ? `生成系列 ${productUrls.length} 張` : composite ? (count > 1 ? `合成 ${count} 張供選擇` : "合成產品圖到背景") : "用此 Prompt 生成新圖"}</>;
              })()}
            </Button>
          ) : (
            <>
              <button onClick={() => setDrafts(null)} disabled={savingDrafts}
                className="px-3 py-2 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50">
                取消
              </button>
              <button onClick={saveDrafts} disabled={savingDrafts || !drafts.some((d) => d.selected)}
                className="flex-1 py-2 rounded-lg bg-violet-600 text-white text-xs font-medium hover:bg-violet-700 disabled:opacity-50 flex items-center justify-center gap-1.5 transition-colors">
                {savingDrafts ? <><Loader2 className="h-4 w-4 animate-spin" />儲存中…</> : <><Check className="h-4 w-4" />保留 {drafts.filter((d) => d.selected).length} 張 → 圖庫</>}
              </button>
            </>
          )}
        </div>
      </div>

      {pickerCategory && (
        <SlotPickerModal
          clientId={clientId}
          category={pickerCategory}
          onPick={(comp) => {
            onPickSlot(comp);
            const meta = (BLOCK_TAG_META as Record<string, { slot: keyof PromptSlots; label: string }>)[pickerCategory];
            if (!meta) return;
            let body = "";
            if (pickerCategory === "COMPOSITION") {
              body = (comp.data?.description as string) || comp.aiPromptText || comp.name;
            } else if (pickerCategory === "COLOR_SCHEME") {
              const rows = buildPaletteRows(comp);
              body = rows.filter((r) => r.enabled).map((r) => `${r.label} ${r.hex}`).join("、");
            } else if (pickerCategory === "BACKGROUND") {
              body = bgAsImage ? "" : ((comp.data?.description as string) || comp.aiPromptText || comp.name);
            }
            setDesignText((t) => replaceTag(t, meta.label, body));
          }}
          onClose={() => setPickerCategory(null)}
        />
      )}
    </div>
  );
});
