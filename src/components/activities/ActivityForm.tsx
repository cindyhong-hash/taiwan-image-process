"use client";
import { useState, useEffect } from "react";
import { useUndoRedo } from "@/hooks/useUndoRedo";
import { Button } from "@/components/ui/button";
import { X, Loader2, Wand2, Pencil, Trash2, LayoutTemplate, SwatchBook, Mountain, Image as ImageIcon, Lock, RefreshCw, RotateCcw, RotateCw, Sparkles, ChevronDown } from "lucide-react";
import { LibraryImagePickerModal } from "@/components/activities/LibraryImagePickerModal";
import { InspireButton } from "@/components/activities/InspireButton";
import { AssetUploadCards, FormSection } from "@/components/activities/formParts";
import { SlotPickerModal } from "@/components/library/SlotPickerModal";
import { getColors, PALETTE_ROLES } from "@/types/library";
import { readableText } from "@/components/library/ColorCards";
import type { StyleComponent, ComponentCategory, PaletteRole } from "@/types/library";

// ── Types ────────────────────────────────────────────────────────────────────

export type ActivityFormValues = {
  requiredText: string;
  imagePrompt: string;
  imageRatio: string;
  customW: number;
  customH: number;
  imageModel: string;
  productImageUrls: string[];
  referenceImageUrls: string[];
  selectedComponentIds: string[];
  /** [2b] 底圖模式：成張相 100% 做背景，唔重新生圖。空 = 一般 AI 生成流程。 */
  baseImageUrl?: string;
};

// ── 可選生圖模型 ───────────────────────────────────────────────────────────────
export const IMAGE_MODELS: { value: string; label: string; hint: string }[] = [
  { value: "google/gemini-3-pro-image-preview", label: "Gemini 3 Pro Image（Nano Banana Pro）⭐ 推薦", hint: "中文字最強、產品還原好、支援比例控制" },
  { value: "openai/gpt-5.4-image-2",            label: "GPT-5.4 Image",                              hint: "風格不同、構圖強，但較慢" },
  { value: "fal-ai/flux-pro/v1.1",              label: "FLUX Pro 1.1（快速）",                        hint: "寫實照片感佳，中文字較弱" },
  { value: "fal-ai/flux/schnell",               label: "FLUX Schnell（極速草稿）",                    hint: "最快，品質較低" },
];

// ── Ratio selector ────────────────────────────────────────────────────────────

// 圖片尺寸比例 pills（step3-creation-form 設計：四個常用比例，取代舊 select + 自訂 W×H）。
const RATIO_PILLS: { value: string; sub: string }[] = [
  { value: "1:1",  sub: "正方形 (1080×1080)" },
  { value: "4:5",  sub: "直式貼文 (1080×1350)" },
  { value: "16:9", sub: "橫式廣告 (1920×1080)" },
  { value: "9:16", sub: "限動 / Reels (1080×1920)" },
];

// 比例 → 實際輸出尺寸（同產品圖生成台一致）；W×H 可改，改時鎖住比例。
const RATIO_DIMS: Record<string, { w: number; h: number }> = {
  "1:1": { w: 1200, h: 1200 }, "4:5": { w: 1200, h: 1500 }, "3:4": { w: 1200, h: 1600 },
  "2:3": { w: 1200, h: 1800 }, "9:16": { w: 1080, h: 1920 }, "4:3": { w: 1600, h: 1200 },
  "3:2": { w: 1800, h: 1200 }, "16:9": { w: 1920, h: 1080 },
};

type Props = {
  clientId: string;
  initialValues?: Partial<ActivityFormValues>;
  submitLabel?: string;
  onSubmit: (values: ActivityFormValues) => Promise<void>;
  /** 底圖模式（isBaseMode）狀態變化時通知上層——上層要靠呢個嚟決定「已選版型」
   * 切換器顯唔顯示（底圖模式唔支援多圖版型），初始 prop 唔夠：用戶可以喺表單入面
   * 撳「移除底圖」跌返做一般生成模式，呢個 state 只喺表單內部，上層要靠呢個 callback 先追得到。 */
  onBaseModeChange?: (isBase: boolean) => void;
  /** [UX] 表單目前值變化時通知上層——切版型時上層要把共用欄位（主題/必放文字/產品圖）帶去多圖頁，唔可以淨靠初始值。 */
  onValuesChange?: (values: ActivityFormValues) => void;
};

// ── Upload helper ─────────────────────────────────────────────────────────────

async function uploadFile(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: fd });
  return (await res.json()).url;
}

// ── Main form ─────────────────────────────────────────────────────────────────

export function ActivityForm({
  clientId,
  initialValues,
  submitLabel = "AI 開始生成",
  onSubmit,
  onBaseModeChange,
  onValuesChange,
}: Props) {
  const [values, setValues] = useState<ActivityFormValues>({
    requiredText:         initialValues?.requiredText         ?? "",
    imagePrompt:          initialValues?.imagePrompt          ?? "",
    imageRatio:           initialValues?.imageRatio           ?? "1:1",
    customW:              initialValues?.customW || RATIO_DIMS[initialValues?.imageRatio ?? "1:1"]?.w || 1200,
    customH:              initialValues?.customH || RATIO_DIMS[initialValues?.imageRatio ?? "1:1"]?.h || 1200,
    imageModel:           initialValues?.imageModel           ?? "google/gemini-3-pro-image-preview",
    productImageUrls:     initialValues?.productImageUrls     ?? [],
    referenceImageUrls:   initialValues?.referenceImageUrls   ?? [],
    selectedComponentIds: initialValues?.selectedComponentIds ?? [],
    baseImageUrl:         initialValues?.baseImageUrl,
  });

  // 底圖模式：成張相做背景、唔重新生圖 → 收起生圖模型/積木/參考圖等生成相關 UI。
  const isBaseMode = !!values.baseImageUrl;
  useEffect(() => { onBaseModeChange?.(isBaseMode); }, [isBaseMode, onBaseModeChange]);
  // [UX] 目前值同步俾上層（切版型時帶去多圖頁，唔會丟資料）
  useEffect(() => { onValuesChange?.(values); }, [values, onValuesChange]);

  // 生成前必填檢查：一般模式靠「畫面描述 Prompt」（AI 生圖嘅核心輸入）；
  // 底圖模式唔重新生圖，靠「必放文字」先夠料生成文案（跟 GenerateAssetForm/
  // PromptComposer 嗰套「鎖住呢個場景嘅核心輸入」做法一致）。
  const canSubmit = isBaseMode ? !!values.requiredText.trim() : !!values.imagePrompt.trim();

  const [uploadingProduct, setUploadingProduct] = useState(false);
  const [uploadingRef,     setUploadingRef]     = useState(false);
  const [loading,          setLoading]          = useState(false);
  const [showLibPicker,    setShowLibPicker]    = useState(false); // 從素材庫揀參考圖
  const [showProductLibPicker, setShowProductLibPicker] = useState(false); // 從素材庫揀產品主圖
  const [showBasePicker,   setShowBasePicker]   = useState(false); // 底圖模式：重新揀另一張底圖（唔會跌落空白模式）
  const [confirmRemoveBase, setConfirmRemoveBase] = useState(false); // 移除底圖模式前要確認（避免手滑跌落空白模式）
  const [previewBase,      setPreviewBase]      = useState(false); // 底圖模式 banner 圖：click 放大
  // 由素材庫揀嗰張參考圖已有嘅 AI Prompt（有就直接用，免再 call analyze API）；上傳新圖時清空。
  const [refStylePrompt,   setRefStylePrompt]   = useState<string>("");
  // 03 風格積木（構圖 / 顏色 / 背景）— 揀完會把標籤直接寫入「畫面描述 Prompt」，可再喺嗰度改字。
  const [styleBlocks, setStyleBlocks] = useState<{ layout: StyleComponent | null; color: StyleComponent | null; background: StyleComponent | null }>({ layout: null, color: null, background: null });
  const [pastStyleOpen, setPastStyleOpen] = useState(true); // 「參考過往貼文風格」收合（Figma v2）

  const [pickerCat, setPickerCat] = useState<ComponentCategory | null>(null);
  const CAT_META = {
    COMPOSITION:  { slot: "layout"     as const, label: "構圖" },
    COLOR_SCHEME: { slot: "color"      as const, label: "配色" },
    BACKGROUND:   { slot: "background" as const, label: "背景" },
  };
  // 配色開關 chip 狀態（同素材庫 PromptComposer 一致）：主色必用鎖定，其餘可撳開關；
  // null = 用返揀嗰個組件嘅預設（每隻有定義嘅色都開）。組件一換就要重置（下面 render 期間 check）。
  type PalRow = { role: PaletteRole; label: string; hex: string; enabled: boolean; present: boolean };
  const [paletteRows, setPaletteRows] = useState<PalRow[] | null>(null);
  function buildPaletteRows(comp: StyleComponent | null): PalRow[] {
    const cols = comp ? getColors(comp.data) : [];
    return PALETTE_ROLES.map((r) => {
      const found = cols.find((c) => c.role === r.role);
      return {
        role: r.role,
        label: r.label,
        hex: found?.hex ?? "#e5e7eb",
        enabled: r.role === "primary" ? true : !!found,
        present: r.role === "primary" ? true : !!found,
      };
    });
  }
  const effRows = paletteRows ?? buildPaletteRows(styleBlocks.color);
  const [prevColorId, setPrevColorId] = useState(styleBlocks.color?.id);
  if (prevColorId !== styleBlocks.color?.id) { setPrevColorId(styleBlocks.color?.id); setPaletteRows(null); }
  // 由 block 砌出該類標籤內容，如「構圖：…」（自然一句，冇方括號）
  const tagFor = (cat: keyof typeof CAT_META, comp: StyleComponent): string => {
    const { label } = CAT_META[cat];
    let body = "";
    if (cat === "COLOR_SCHEME") {
      const hexes = buildPaletteRows(comp).filter((r) => r.enabled).map((r) => r.hex);
      body = hexes.length ? hexes.join("、") : (comp.aiPromptText || comp.name);
    } else {
      body = (comp.data?.description as string) || comp.aiPromptText || comp.name;
    }
    return body ? `${label}：${body}` : "";
  };
  // 揀 / 清除積木：更新 card 狀態 + 直接寫入畫面描述 Prompt（先移除舊同類標籤，再加返新）+
  // 同步 selectedComponentIds（隨表單一齊存落 DB），唔係淨係印咗喺文字度——冇呢步嘅話，
  // 儲存後返嚟編輯，card 揀嘅狀態冇嘢可以還原（畫面描述文字有可能俾用戶自己再改到面目全非，
  // 唔可靠），會睇落好似「積木不見咗」。
  const applyBlock = (cat: keyof typeof CAT_META, comp: StyleComponent | null) => {
    const { slot, label } = CAT_META[cat];
    const prevComp = styleBlocks[slot];
    setStyleBlocks((p) => ({ ...p, [slot]: comp }));
    setValues((prev) => {
      let txt = prev.imagePrompt.replace(new RegExp(`^${label}：.*$`, "gm"), "").replace(/\n{2,}/g, "\n").trim();
      if (comp) {
        const tag = tagFor(cat, comp);
        if (tag) txt = txt ? `${txt}\n${tag}` : tag;
      }
      const selectedComponentIds = prev.selectedComponentIds.filter((id) => id !== prevComp?.id);
      if (comp) selectedComponentIds.push(comp.id);
      return { ...prev, imagePrompt: txt, selectedComponentIds };
    });
  };
  // 配色開關 chip：撳一下即刻反映入畫面描述（唔經 applyBlock，因為組件本身冇換）。
  function toggleColorEnabled(role: PaletteRole) {
    const newRows = effRows.map((r) => (r.role === role ? { ...r, enabled: !r.enabled } : r));
    setPaletteRows(newRows);
    const hexes = newRows.filter((r) => r.enabled).map((r) => r.hex);
    setValues((prev) => {
      let txt = prev.imagePrompt.replace(/^配色：.*$/m, "").replace(/\n{2,}/g, "\n").trim();
      if (hexes.length) { const tag = `配色：${hexes.join("、")}`; txt = txt ? `${txt}\n${tag}` : tag; }
      return { ...prev, imagePrompt: txt };
    });
  }

  // 編輯已存在嘅活動時，用已存嘅 selectedComponentIds 攞返實際 StyleComponent，
  // 重新掛落 styleBlocks，等 03 積木 card 顯示返上次揀咗嘅嗰件（否則永遠得返
  // 畫面描述入面嘅純文字標籤，card 會一直顯示「未選取」）。
  useEffect(() => {
    const ids = initialValues?.selectedComponentIds;
    if (!ids || ids.length === 0) return;
    fetch(`/api/components?ids=${ids.join(",")}`)
      .then((r) => r.json())
      .then((comps: StyleComponent[]) => {
        if (!Array.isArray(comps)) return;
        setStyleBlocks((prev) => {
          const next = { ...prev };
          for (const c of comps) {
            if (c.type === "COMPOSITION") next.layout = c;
            else if (c.type === "COLOR_SCHEME") next.color = c;
            else if (c.type === "BACKGROUND") next.background = c;
          }
          return next;
        });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // AI 輔助狀態
  const [optimizingPrompt,  setOptimizingPrompt]  = useState(false);
  const [analyzingImage,    setAnalyzingImage]    = useState(false);
  const [analyzedDone,      setAnalyzedDone]      = useState(false);
  const [editingPrompt,     setEditingPrompt]     = useState(false);
  const [editInstruction,   setEditInstruction]   = useState("");
  const [applyingEdit,      setApplyingEdit]      = useState(false);

  const hasRefImages = values.referenceImageUrls.length > 0;

  const set = <K extends keyof ActivityFormValues>(k: K, v: ActivityFormValues[K]) =>
    setValues((prev) => ({ ...prev, [k]: v }));

  // 畫面描述 Prompt 嘅上一步/重做棧（AI 幫改／AI 優化提示詞都會記一步）。
  const imagePromptHistory = useUndoRedo(values.imagePrompt, (v) => set("imagePrompt", v));

  // 揀比例 → 自動填 W×H；改 W×H → 鎖住當前比例算另一邊（活動圖模型只收已知比例，故 aspect 保持標準）。
  const pickRatio = (r: string) => setValues((prev) => ({ ...prev, imageRatio: r, customW: RATIO_DIMS[r]?.w ?? prev.customW, customH: RATIO_DIMS[r]?.h ?? prev.customH }));

  const addImages = async (kind: "product" | "ref", files: FileList, max: number, current: string[]) => {
    const toUpload = Array.from(files).slice(0, max - current.length);
    if (!toUpload.length) return;
    kind === "product" ? setUploadingProduct(true) : setUploadingRef(true);
    const urls = await Promise.all(toUpload.map(uploadFile));
    set(kind === "product" ? "productImageUrls" : "referenceImageUrls", [...current, ...urls].slice(0, max));
    kind === "product" ? setUploadingProduct(false) : setUploadingRef(false);
    if (kind === "ref") {
      setRefStylePrompt(""); setAnalyzedDone(false);
      if (urls[0]) handleAnalyzeStyle({ url: urls[0] }); // 上傳完自動反推（冇現成 prompt → call vision API）
    }
  };

  const removeImage = (kind: "product" | "ref", i: number) => {
    const key = kind === "product" ? "productImageUrls" : "referenceImageUrls";
    set(key, values[key].filter((_, idx) => idx !== i));
    if (kind === "ref") { setRefStylePrompt(""); setAnalyzedDone(false); }
  };

  // ── AI 功能一：優化 Prompt ───────────────────────────────────────────────────
  const handleOptimizePrompt = async () => {
    if (!values.imagePrompt.trim()) return;
    setOptimizingPrompt(true);
    try {
      const res = await fetch("/api/ai/optimize-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // restrained：只喺底圖模式（gallery 圖做底圖）先克制，從 0 開始嘅活動維持原本冗長版
        body: JSON.stringify({ prompt: values.imagePrompt, restrained: isBaseMode }),
      });
      const data = await res.json();
      if (data.optimizedPrompt) {
        imagePromptHistory.commit(data.optimizedPrompt);
      } else {
        alert(data.error ?? "優化失敗，請稍後再試");
      }
    } catch (err) {
      alert("網路錯誤，請稍後再試");
    } finally {
      setOptimizingPrompt(false);
    }
  };

  // ── AI 功能：指令式修改 Prompt（AI 幫改）────────────────────────────────────
  const handleEditPrompt = async () => {
    if (!editInstruction.trim() || !values.imagePrompt.trim()) return;
    setApplyingEdit(true);
    try {
      const res = await fetch("/api/ai/optimize-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: values.imagePrompt,
          instruction: editInstruction,
          restrained: isBaseMode,
        }),
      });
      const data = await res.json();
      if (data.optimizedPrompt) {
        imagePromptHistory.commit(data.optimizedPrompt);
        setEditInstruction("");
        setEditingPrompt(false);
      } else {
        alert(data.error ?? "修改失敗，請稍後再試");
      }
    } catch {
      alert("網路錯誤，請稍後再試");
    } finally {
      setApplyingEdit(false);
    }
  };

  // ── AI 功能二：解析參考圖風格並附加到 Prompt ─────────────────────────────────
  //  opts.url / opts.prompt：由「揀完參考圖自動觸發」傳（state 未更新，直接用），手撳就讀 state。
  const handleAnalyzeStyle = async (opts?: { url?: string; prompt?: string }) => {
    const refUrl = opts?.url ?? values.referenceImageUrls[0];
    if (!refUrl) return;
    const preset = (opts?.prompt ?? refStylePrompt).trim();
    const appendStyle = (desc: string) => {
      setValues((prev) => {
        const separator = prev.imagePrompt.trim() ? "\n\n風格參考：" : "風格參考：";
        return { ...prev, imagePrompt: prev.imagePrompt + separator + desc };
      });
    };
    setAnalyzedDone(false);
    setAnalyzingImage(true);
    try {
      let desc = preset;
      if (!desc) {
        // 冇現成 prompt（上傳圖）→ call analyze API
        const res = await fetch("/api/ai/analyze-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageUrl: refUrl }),
        });
        const data = await res.json();
        desc = data.styleDescription ?? "";
        if (!desc) { alert(data.error ?? "解析失敗，請稍後再試"); return; }
      } else {
        // 由素材庫揀嘅圖已有 AI Prompt → 短暫延遲俾用戶睇到 loading → done
        await new Promise((r) => setTimeout(r, 450));
      }
      appendStyle(desc);
      setAnalyzedDone(true);
    } catch {
      alert("網路錯誤，請稍後再試");
    } finally {
      setAnalyzingImage(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // 積木標籤已經即時寫入 values.imagePrompt（見 applyBlock），直接送。
    try { await onSubmit(values); } finally { setLoading(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8 pb-4">

      {/* ── 底圖模式 banner（成張相做背景，唔重新生圖）─────────── */}
      {isBaseMode && (
        <div className="flex items-start gap-3 rounded-xl border border-violet-200 bg-violet-50 p-3.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={values.baseImageUrl}
            alt="活動圖底圖"
            onClick={() => setPreviewBase(true)}
            className="w-28 h-28 rounded-lg border object-cover bg-white shrink-0 cursor-zoom-in hover:opacity-90 transition-opacity"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-violet-700">
              <ImageIcon className="h-4 w-4" />活動圖底圖模式
            </div>
            <p className="text-[11px] text-violet-600/90 mt-1 leading-relaxed">
              這張相片會 <b>100% 做背景</b>，不會重新生成圖片。填寫下面的文字內容，系統會幫你生成文案，再交由排版加到圖上。
            </p>
            <button type="button" onClick={() => setShowBasePicker(true)}
              className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-violet-600 border border-violet-200 rounded-lg px-2 py-1 hover:bg-violet-100 transition-colors">
              <RefreshCw className="h-3 w-3" />換一張底圖
            </button>
          </div>
          <button type="button" onClick={() => setConfirmRemoveBase(true)}
            className="text-violet-400 hover:text-red-500 shrink-0" title="移除底圖模式（改做一般由零生成）">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* 移除底圖模式前確認——避免手滑撳 X 就跌落空白模式 */}
      {confirmRemoveBase && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-5">
            <h3 className="text-sm font-semibold text-gray-800">移除底圖模式？</h3>
            <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
              這張相片會被移除，表單改為「從零開始」的一般生成模式（可以再上傳素材／用 AI 生成）。想換另一張底圖的話，可以用「換一張底圖」代替。
            </p>
            <div className="flex items-center justify-end gap-2 mt-4">
              <button type="button" onClick={() => setConfirmRemoveBase(false)}
                className="text-xs font-medium text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors">
                取消
              </button>
              <button type="button"
                onClick={() => { set("baseImageUrl", undefined); setConfirmRemoveBase(false); }}
                className="text-xs font-medium text-white bg-red-500 rounded-lg px-3 py-1.5 hover:bg-red-600 transition-colors">
                確認移除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 底圖 banner 圖放大預覽 */}
      {previewBase && values.baseImageUrl && (
        <div
          onClick={() => setPreviewBase(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-6 cursor-zoom-out"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={values.baseImageUrl}
            alt="活動圖底圖放大預覽"
            onClick={(e) => e.stopPropagation()}
            className="max-h-[85vh] max-w-[85vw] rounded-lg shadow-2xl object-contain cursor-default"
          />
          <button type="button" onClick={() => setPreviewBase(false)}
            className="absolute top-4 right-4 bg-white/90 hover:bg-white rounded-full p-1.5 shadow">
            <X className="h-5 w-5 text-gray-700" />
          </button>
        </div>
      )}

      {/* ── 01 想做什麼？ ─────────────────────────────────────── */}
      <FormSection step="01" title="想做什麼？" required>

        {/* 畫面描述 + AI 按鈕 */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-bold text-gray-900">畫面描述 Prompt</span>
              <span className="text-xs text-gray-400 font-normal">用日常語言描述想要的場景、主體與氛圍</span>
            </div>
            <div className="flex items-center gap-2">
              {/* 靈感：依品牌想選題，點了直接填入畫面描述 */}
              <InspireButton
                clientId={clientId}
                field="scene"
                onPick={(text) => set("imagePrompt", text)}
              />
              {/* AI 改寫（要有 Prompt 先可用；disabled 時外層 span 帶 tooltip）*/}
              <span title={!values.imagePrompt.trim() ? "輸入畫面描述後即可使用" : undefined} className="inline-flex">
                <button
                  type="button"
                  onClick={() => {
                    setEditingPrompt((prev) => !prev);
                    setEditInstruction("");
                  }}
                  disabled={!values.imagePrompt.trim()}
                  className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-md border transition-all ${
                    !values.imagePrompt.trim()
                      ? "cursor-not-allowed border-[#E5E7EB] text-[#868D99] bg-[#F8F9FB]"
                      : editingPrompt
                      ? "border-violet-400 text-violet-700 bg-violet-100 cursor-pointer"
                      : "border-[#ebe4f9] text-violet-600 bg-[#f9f6ff] hover:bg-violet-100 cursor-pointer"
                  }`}
                >
                  <Pencil className="h-3 w-3" />
                  AI 改寫
                </button>
              </span>

              {/* 優化 Prompt */}
              <span title={!values.imagePrompt.trim() ? "輸入畫面描述後即可使用" : undefined} className="inline-flex">
                <button
                  type="button"
                  onClick={handleOptimizePrompt}
                  disabled={optimizingPrompt || !values.imagePrompt.trim()}
                  className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-md border transition-all ${
                    optimizingPrompt || !values.imagePrompt.trim()
                      ? "cursor-not-allowed border-[#E5E7EB] text-[#868D99] bg-[#F8F9FB]"
                      : "border-violet-600 text-white bg-violet-600 hover:bg-violet-700 cursor-pointer"
                  }`}
                >
                  {optimizingPrompt
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : <Wand2 className="h-3 w-3" />}
                  {optimizingPrompt ? "優化中…" : "優化 Prompt"}
                </button>
              </span>

              {/* 上一步/重做：一齊出現一齊收埋，唔會各自獨立顯示/隱藏（見 PromptComposer 同一注釋）。 */}
              {(imagePromptHistory.canUndo || imagePromptHistory.canRedo) && (
                <>
                  <button type="button" onClick={imagePromptHistory.undo} disabled={!imagePromptHistory.canUndo}
                    className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border transition-all ${
                      imagePromptHistory.canUndo ? "bg-white border-gray-200 text-gray-600 hover:border-gray-400"
                      : "opacity-30 cursor-not-allowed border-gray-200 text-gray-400"}`}
                    title="上一步">
                    <RotateCcw className="h-3 w-3" />上一步
                  </button>
                  <button type="button" onClick={imagePromptHistory.redo} disabled={!imagePromptHistory.canRedo}
                    className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border transition-all ${
                      imagePromptHistory.canRedo ? "bg-white border-gray-200 text-gray-600 hover:border-gray-400"
                      : "opacity-30 cursor-not-allowed border-gray-200 text-gray-400"}`}
                    title="重做">
                    <RotateCw className="h-3 w-3" />重做
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="relative">
            <textarea
              value={values.imagePrompt}
              onChange={(e) => set("imagePrompt", e.target.value)}
              rows={4}
              maxLength={500}
              placeholder="例：精緻女生在辦公室，側臉仰頭噴霧，大片窗光，質感時尚"
              className="w-full bg-white border-[1.5px] border-[#ebeff5] rounded-lg px-4 py-3 pb-7 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
            />
            <span className="pointer-events-none absolute bottom-2.5 right-3 text-[11px] text-gray-400">{values.imagePrompt.length}/500</span>
          </div>
          {editingPrompt && (
            <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-3 space-y-2">
              <p className="text-xs font-medium text-blue-700">✏️ 想怎麼改？</p>
              <input
                type="text"
                value={editInstruction}
                onChange={(e) => setEditInstruction(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleEditPrompt();
                  }
                }}
                placeholder="例：品牌改為 Apple / 加入黃金時段光線"
                className="w-full border border-blue-200 rounded-md px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-300 placeholder:text-gray-400"
                autoFocus
              />
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => { setEditingPrompt(false); setEditInstruction(""); }}
                  className="p-1 text-gray-400 hover:text-red-400 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleEditPrompt}
                  disabled={applyingEdit || !editInstruction.trim()}
                  className={`flex items-center gap-1 text-xs px-3 py-1 rounded-md transition-all ${
                    applyingEdit || !editInstruction.trim()
                      ? "opacity-40 cursor-not-allowed bg-blue-300 text-white"
                      : "bg-blue-500 text-white hover:bg-blue-600 cursor-pointer"
                  }`}
                >
                  {applyingEdit
                    ? <><Loader2 className="h-3 w-3 animate-spin" />套用中…</>
                    : "應用"}
                </button>
              </div>
            </div>
          )}
          {optimizingPrompt && (
            <p className="text-xs text-violet-500 flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Gemini AI 正在優化提示詞…
            </p>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-bold text-gray-900">必放文字</span>
            <span className="text-xs text-gray-400 font-normal">（選填）— 確保 AI 文案或圖中準確包含這些文字</span>
          </div>
          <div className="relative">
            <input
              type="text"
              value={values.requiredText}
              onChange={(e) => set("requiredText", e.target.value)}
              maxLength={200}
              placeholder="例：精緻女孩必帶✨ / 夏日清涼控油，一噴搞定"
              className="w-full h-11 bg-white border-[1.5px] border-[#ebeff5] rounded-lg px-4 pr-14 text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
            />
            <span className="pointer-events-none absolute top-1/2 -translate-y-1/2 right-3 text-[11px] text-gray-400">{values.requiredText.length}/200</span>
          </div>
        </div>
      </FormSection>

      {/* 底圖模式唔重新生圖 → 唔需要素材上傳/風格積木 */}
      {!isBaseMode && (
      <FormSection step="02" title="加入素材" optional>
        <AssetUploadCards
          productUrls={values.productImageUrls}
          refUrls={values.referenceImageUrls}
          onAddProduct={(files) => addImages("product", files, 5, values.productImageUrls)}
          onRemoveProduct={(i) => removeImage("product", i)}
          onPickProductLibrary={() => setShowProductLibPicker(true)}
          onAddRef={(files) => addImages("ref", files, 1, values.referenceImageUrls)}
          onRemoveRef={(i) => removeImage("ref", i)}
          onPickRefLibrary={() => setShowLibPicker(true)}
          uploadingProduct={uploadingProduct}
          uploadingRef={uploadingRef}
          analyzeState={analyzingImage ? "analyzing" : analyzedDone ? "done" : "idle"}
          onAnalyze={() => handleAnalyzeStyle()}
          canAnalyze={hasRefImages}
        />

        {/* 參考過往貼文風格（收合）→ 內容注入 AI Prompt */}
        <div className="space-y-4 border-t border-[#ebeff5] pt-2">
          <button type="button" onClick={() => setPastStyleOpen((o) => !o)}
            className="flex w-full items-center justify-between gap-3 py-1.5 text-left">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-gray-900">參考過往貼文風格 <span className="font-normal text-gray-400">（選填）</span></span>
              <span className="text-xs text-gray-400 font-normal">選擇您以前成效優良的圖文，AI 將智能套用相同排版、色彩特徵作為本次生成參考</span>
            </div>
            <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${pastStyleOpen ? "" : "-rotate-90"}`} />
          </button>
          {pastStyleOpen && (<>
          <div className="grid grid-cols-3 gap-3">
          {([
            { cat: "COMPOSITION",  slot: "layout",     label: "構圖", icon: <LayoutTemplate className="h-4 w-4" /> },
            { cat: "COLOR_SCHEME", slot: "color",      label: "配色", icon: <SwatchBook className="h-4 w-4" /> },
            { cat: "BACKGROUND",   slot: "background", label: "背景", icon: <Mountain className="h-4 w-4" /> },
          ] as const).map(({ cat, slot, label, icon }) => {
            const comp = styleBlocks[slot];
            // 顏色卡嘅色板預覽淨係顯示已勾選（enabled）嘅色，同下面 chip 狀態一致。
            const colors = comp && slot === "color" ? effRows.filter((r) => r.enabled).map((r) => ({ hex: r.hex, role: r.role })) : [];
            return (
              <div key={cat}>
                <div className="flex items-center justify-between mb-1">
                  <span className="flex items-center gap-1 text-xs font-medium text-gray-600">{icon}{label}</span>
                  {comp && (
                    <button type="button" onClick={() => applyBlock(cat, null)}
                      className="text-gray-400 hover:text-red-500" title="清除"><X className="h-3.5 w-3.5" /></button>
                  )}
                </div>
                <button type="button" onClick={() => setPickerCat(cat)}
                  className={`w-full bg-white rounded-xl border overflow-hidden text-left transition-all ${comp ? "border-violet-200" : "border-dashed border-gray-200 hover:border-violet-300"}`}>
                  {comp ? (
                    <>
                      {/* 顏色：優先顯示色板（睇色 pattern）；其餘：優先顯示圖 */}
                      {slot === "color" && colors.length ? (
                        <div className="flex h-20">{colors.map((c, i) => (
                          <div key={i} style={{ background: c.hex }} className="flex-1 relative">
                            {c.role === "primary" && <Lock className="absolute inset-0 m-auto h-3.5 w-3.5" style={{ color: readableText(c.hex) }} />}
                          </div>
                        ))}</div>
                      ) : comp.previewUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={comp.previewUrl} alt={comp.name} className="w-full h-20 object-cover" />
                      ) : colors.length ? (
                        <div className="flex h-20">{colors.map((c, i) => (
                          <div key={i} style={{ background: c.hex }} className="flex-1 relative">
                            {c.role === "primary" && <Lock className="absolute inset-0 m-auto h-3.5 w-3.5" style={{ color: readableText(c.hex) }} />}
                          </div>
                        ))}</div>
                      ) : (
                        <div className="h-20 bg-violet-50" />
                      )}
                      {/* 三類卡統一：色板/圖 + 單行名稱（高度對齊；hex 已由色板呈現，唔另出灰字）*/}
                      <div className="px-2 py-1.5 text-[11px] text-gray-700 truncate">{comp.name}</div>
                    </>
                  ) : (
                    <div className="h-[109px] flex flex-col items-center justify-center gap-1 text-gray-400">
                      <span className="text-lg text-violet-500 font-semibold">＋</span>
                      <span className="text-[11px]">點擊選取{label}</span>
                    </div>
                  )}
                </button>
                {/* 配色開關 chip：只顯示可以開關嘅顏色（主色已經 present:true 但唔會出現喺呢個
                    filter，因為佢一定 enabled、唔使畀人撳）。主色永遠鎖定必用，最多 4 個可撳
                    role（輔色/強調色/中性色/點綴色），3 欄格仔闊度夠位一行擺晒。 */}
                {slot === "color" && comp && (
                  <>
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
                    <p className="text-[10px] text-gray-400 leading-snug mt-1">
                      • 勾選：套用該顏色<br />
                      • 取消勾選：生成時不參考該顏色<br />
                      • 主色：必定使用，固定鎖定
                    </p>
                  </>
                )}
              </div>
            );
          })}
          </div>
          <p className="text-[11px] text-gray-400">選取後會即時加入上方「畫面描述 Prompt」，可以再到那裡修改文字。</p>
          </>)}
        </div>
      </FormSection>
      )}

      {/* ── 03 生成設定（比例 + 生圖模型）─────────── */}
      <FormSection step={isBaseMode ? "02" : "03"} title="生成設定" required>
        {/* 圖片尺寸比例 */}
        <div className="space-y-3">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-bold text-gray-900">圖片尺寸比例</span>
            <span className="text-red-500 text-sm">*</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {RATIO_PILLS.map((r) => {
              const active = values.imageRatio === r.value;
              return (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => pickRatio(r.value)}
                  className={`flex flex-col items-center gap-1 rounded-lg border-[1.5px] px-4 py-3 transition-colors ${
                    active ? "bg-violet-50 border-violet-600" : "bg-white border-[#ebeff5] hover:border-violet-300"
                  }`}
                >
                  <span className={`text-sm font-bold ${active ? "text-violet-700" : "text-gray-900"}`}>{r.value}</span>
                  <span className={`text-xs ${active ? "text-violet-600" : "text-gray-400"}`}>{r.sub}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 生圖模型（底圖模式唔重新生圖 → 唔顯示）*/}
        {!isBaseMode && (
        <div className="space-y-2">
          <div className="relative w-full">
            <select
              value={values.imageModel}
              onChange={(e) => set("imageModel", e.target.value)}
              className="w-full h-11 appearance-none border border-[#ebeff5] rounded-lg px-4 pr-9 text-[13px] font-semibold text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
            >
              {IMAGE_MODELS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
          </div>
          <p className="text-xs text-gray-400">
            {IMAGE_MODELS.find((m) => m.value === values.imageModel)?.hint ?? ""}
          </p>
        </div>
        )}
      </FormSection>

      {/* ── Submit — fixed 貼實 viewport 底（跟其他生成 flow 同一套 pattern，
          外層 <main class="overflow-auto"> 令 sticky 失效，見 QuickAddForm 註解）。
          呢頁外層 wrapper 同呢個 form 自己都用 max-w-3xl（兩處要一致，唔可以淨改
          外層——form 自己嘅 max-width 唔跟住闊會變返窄嗰個先生效），令 footer 同
          頁面實際欄闊對齊。掣跟返多圖版本嘅 w-full + Button 預設高度，全部生成
          流程一致。
          ml-6（唔係 px-6）：呢個 fixed bar 唔經過 <MainLayout> 個 <main class="p-6">，
          冇跟到嗰 24px 嘅左邊距，所以要手動補返 ml-6，等個掣個左邊同真正內容欄
          （max-w-3xl 個 div，冇自己嘅左右 padding）啱啱好對齊，唔會偏咗。 ── */}
      {/* AI 開始生成：置中大圓角按鈕（Figma step3-creation-form-v2）*/}
      <div className="flex flex-col items-center pt-2">
        <Button type="submit" disabled={loading || !canSubmit}
          className="inline-flex h-auto items-center justify-center gap-2 rounded-full bg-violet-600 hover:bg-violet-700 text-white px-16 py-4 text-base font-bold shadow-[0_8px_8px_rgba(124,58,237,0.15)] disabled:opacity-50">
          {loading
            ? <><Loader2 className="h-5 w-5 animate-spin" />處理中…</>
            : <><Sparkles className="h-[18px] w-[18px]" />{isBaseMode ? "建立活動（用此底圖生成文案）" : submitLabel}</>}
        </Button>
      </div>

      {showLibPicker && (
        <LibraryImagePickerModal
          clientId={clientId}
          title="從素材庫選取參考圖"
          onPick={(url, promptText) => {
            set("referenceImageUrls", [url]);
            setRefStylePrompt(promptText ?? "");
            setShowLibPicker(false);
            handleAnalyzeStyle({ url, prompt: promptText ?? "" }); // 揀完自動反推提示詞
          }}
          onClose={() => setShowLibPicker(false)}
        />
      )}

      {/* 從素材庫選取產品主圖（最多 5 張，逐張加入）*/}
      {showProductLibPicker && (
        <LibraryImagePickerModal
          clientId={clientId}
          title="從素材庫選取產品主圖"
          onPick={(url) => {
            set("productImageUrls", [...values.productImageUrls, url].slice(0, 5));
            setShowProductLibPicker(false);
          }}
          onClose={() => setShowProductLibPicker(false)}
        />
      )}

      {/* 底圖模式：換一張底圖（唔會跌落空白/一般生成模式，留喺底圖模式換另一張）*/}
      {showBasePicker && (
        <LibraryImagePickerModal
          clientId={clientId}
          title="從素材庫選取底圖"
          onPick={(url, promptText) => {
            setValues((prev) => ({ ...prev, baseImageUrl: url, imagePrompt: promptText?.trim() || prev.imagePrompt }));
            setShowBasePicker(false);
          }}
          onClose={() => setShowBasePicker(false)}
        />
      )}

      {/* 03 積木選取 picker（同素材庫一致）*/}
      {pickerCat && (
        <SlotPickerModal
          category={pickerCat}
          clientId={clientId}
          onPick={(comp) => { applyBlock(pickerCat as keyof typeof CAT_META, comp); setPickerCat(null); }}
          onClose={() => setPickerCat(null)}
        />
      )}
    </form>
  );
}
