"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X, Loader2, ImagePlus, Wand2, Sparkles, Pencil, Trash2, Images, LayoutTemplate, Palette, Image as ImageIcon, Check, RefreshCw } from "lucide-react";
import { LibraryImagePickerModal } from "@/components/activities/LibraryImagePickerModal";
import { SlotPickerModal } from "@/components/library/SlotPickerModal";
import { getColors } from "@/types/library";
import type { StyleComponent, ComponentCategory } from "@/types/library";

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

const RATIOS: { value: string; label: string; w: number; h: number }[] = [
  { value: "1:1",  label: "1:1",  w: 20, h: 20 },
  { value: "4:5",  label: "4:5",  w: 16, h: 20 },
  { value: "3:4",  label: "3:4",  w: 15, h: 20 },
  { value: "2:3",  label: "2:3",  w: 13, h: 20 },
  { value: "9:16", label: "9:16", w: 11, h: 20 },
  { value: "4:3",  label: "4:3",  w: 20, h: 15 },
  { value: "3:2",  label: "3:2",  w: 20, h: 13 },
  { value: "16:9", label: "16:9", w: 20, h: 11 },
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
};

// ── Upload helper ─────────────────────────────────────────────────────────────

async function uploadFile(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: fd });
  return (await res.json()).url;
}

// ── Compact image upload strip ────────────────────────────────────────────────

function UploadZone({
  urls, max, uploading, onRemove, onAdd, disabled,
}: {
  urls: string[]; max: number; uploading: boolean;
  onRemove: (i: number) => void;
  onAdd: (files: FileList) => void;
  disabled?: boolean;
}) {
  const isEmpty = urls.length === 0;
  const [preview, setPreview] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      {urls.length > 0 && (
        <div className="flex gap-1.5 flex-wrap px-1">
          {urls.map((url, i) => (
            <div key={i} className="relative w-14 h-14 shrink-0 group/thumb">
              <img
                src={url}
                alt=""
                onClick={() => setPreview(url)}
                className="w-14 h-14 object-cover rounded-lg border border-gray-200 cursor-zoom-in transition-opacity group-hover/thumb:opacity-90"
              />
              <button type="button" onClick={(e) => { e.stopPropagation(); onRemove(i); }}
                className="absolute -top-1 -right-1 bg-white rounded-full border shadow-sm p-0.5 hover:bg-red-50">
                <X className="h-2.5 w-2.5 text-gray-500" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 放大預覽 lightbox */}
      {preview && (
        <div
          onClick={() => setPreview(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-6 cursor-zoom-out"
        >
          <img
            src={preview}
            alt="放大預覽"
            onClick={(e) => e.stopPropagation()}
            className="max-h-[85vh] max-w-[85vw] rounded-lg shadow-2xl object-contain cursor-default"
          />
          <button
            type="button"
            onClick={() => setPreview(null)}
            className="absolute top-4 right-4 bg-white/90 hover:bg-white rounded-full p-1.5 shadow"
          >
            <X className="h-5 w-5 text-gray-700" />
          </button>
        </div>
      )}
      {urls.length < max && (
        <label className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed transition-colors cursor-pointer
          ${disabled ? "border-gray-100 bg-gray-50 cursor-not-allowed" : "border-gray-200 hover:border-violet-300 hover:bg-violet-50/30"}
          ${isEmpty ? "h-32" : "h-16"}`}>
          {uploading
            ? <Loader2 className="h-5 w-5 text-gray-300 animate-spin" />
            : <ImagePlus className={`h-5 w-5 ${disabled ? "text-gray-200" : "text-gray-300"}`} />}
          {isEmpty && (
            <span className={`text-xs ${disabled ? "text-gray-300" : "text-gray-400"}`}>
              點擊或拖曳上傳
            </span>
          )}
          <span className="text-[10px] text-gray-300">{urls.length}/{max}</span>
          {!disabled && (
            <input type="file" accept="image/*" multiple className="hidden"
              onChange={(e) => e.target.files && onAdd(e.target.files)} />
          )}
        </label>
      )}
      {urls.length >= max && (
        <div className="text-[11px] text-gray-400 text-center">已上傳 {max}/{max} 張</div>
      )}
    </div>
  );
}

function ColLabel({ title, sub }: { title: string; sub: string }) {
  return (
    <div>
      <span className="text-xs font-medium text-gray-600">{title}</span>
      {sub && <span className="text-[11px] text-gray-400 ml-1">{sub}</span>}
    </div>
  );
}

// ── Main form ─────────────────────────────────────────────────────────────────

export function ActivityForm({
  clientId,
  initialValues,
  submitLabel = "建立活動並生成圖片",
  onSubmit,
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

  const [uploadingProduct, setUploadingProduct] = useState(false);
  const [uploadingRef,     setUploadingRef]     = useState(false);
  const [loading,          setLoading]          = useState(false);
  const [showLibPicker,    setShowLibPicker]    = useState(false); // 從素材庫揀參考圖
  const [showBasePicker,   setShowBasePicker]   = useState(false); // 底圖模式：重新揀另一張底圖（唔會跌落空白模式）
  const [confirmRemoveBase, setConfirmRemoveBase] = useState(false); // 移除底圖模式前要確認（避免手滑跌落空白模式）
  const [previewBase,      setPreviewBase]      = useState(false); // 底圖模式 banner 圖：click 放大
  // 由素材庫揀嗰張參考圖已有嘅 AI Prompt（有就直接用，免再 call analyze API）；上傳新圖時清空。
  const [refStylePrompt,   setRefStylePrompt]   = useState<string>("");
  // 03 風格積木（構圖 / 顏色 / 背景）— 揀完會把標籤直接寫入「畫面描述 Prompt」，可再喺嗰度改字。
  const [styleBlocks, setStyleBlocks] = useState<{ layout: StyleComponent | null; color: StyleComponent | null; background: StyleComponent | null }>({ layout: null, color: null, background: null });
  const [pickerCat, setPickerCat] = useState<ComponentCategory | null>(null);
  const CAT_META = {
    COMPOSITION:  { slot: "layout"     as const, label: "構圖" },
    COLOR_SCHEME: { slot: "color"      as const, label: "配色" },
    BACKGROUND:   { slot: "background" as const, label: "背景" },
  };
  // 由 block 砌出該類標籤內容，如 [構圖:…]
  const tagFor = (cat: keyof typeof CAT_META, comp: StyleComponent): string => {
    const { label } = CAT_META[cat];
    let body = "";
    if (cat === "COLOR_SCHEME") {
      const hexes = getColors(comp.data).map((c) => c.hex);
      body = hexes.length ? hexes.join("、") : (comp.aiPromptText || comp.name);
    } else {
      body = (comp.data?.description as string) || comp.aiPromptText || comp.name;
    }
    return body ? `[${label}:${body}]` : "";
  };
  // 揀 / 清除積木：更新 card 狀態 + 直接寫入畫面描述 Prompt（先移除舊同類標籤，再加返新）。
  const applyBlock = (cat: keyof typeof CAT_META, comp: StyleComponent | null) => {
    const { slot, label } = CAT_META[cat];
    setStyleBlocks((p) => ({ ...p, [slot]: comp }));
    setValues((prev) => {
      let txt = prev.imagePrompt.replace(new RegExp(`\\[${label}:[^\\]]*\\]`, "g"), "").replace(/\n{2,}/g, "\n").trim();
      if (comp) {
        const tag = tagFor(cat, comp);
        if (tag) txt = txt ? `${txt}\n${tag}` : tag;
      }
      return { ...prev, imagePrompt: txt };
    });
  };

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

  // 揀比例 → 自動填 W×H；改 W×H → 鎖住當前比例算另一邊（活動圖模型只收已知比例，故 aspect 保持標準）。
  const pickRatio = (r: string) => setValues((prev) => ({ ...prev, imageRatio: r, customW: RATIO_DIMS[r]?.w ?? prev.customW, customH: RATIO_DIMS[r]?.h ?? prev.customH }));
  const changeDim = (which: "w" | "h", v: number) => setValues((prev) => {
    const rd = RATIO_DIMS[prev.imageRatio];
    if (which === "w") return { ...prev, customW: v, customH: rd ? Math.round(v * rd.h / rd.w) : prev.customH };
    return { ...prev, customH: v, customW: rd ? Math.round(v * rd.w / rd.h) : prev.customW };
  });

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
        set("imagePrompt", data.optimizedPrompt);
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
        set("imagePrompt", data.optimizedPrompt);
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
    <form onSubmit={handleSubmit} className="space-y-8 max-w-2xl">

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
              呢張相會 <b>100% 做背景</b>，唔會重新生圖。填下面嘅文字內容，系統會幫你生成文案，再交排版加落圖上。
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
              呢張相會被移除，表單改做「由零開始」一般生成模式（可以再上傳素材 / 用 AI 生成）。想換另一張底圖的話，可以用「換一張底圖」代替。
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

      {/* ── 01 基本資訊 ─────────────────────────────────────── */}
      <div className="space-y-4">
        <SectionLabel step="01" title="基本資訊" />

        {/* 畫面描述 + AI 優化按鈕 */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">
              畫面描述 Prompt
              <span className="text-gray-400 font-normal ml-1.5 text-xs">你腦中的畫面，越具體越好</span>
            </Label>
            <div className="flex items-center gap-1.5">
              {/* AI 幫改 */}
              <button
                type="button"
                onClick={() => {
                  setEditingPrompt((prev) => !prev);
                  setEditInstruction("");
                }}
                disabled={!values.imagePrompt.trim()}
                className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border transition-all ${
                  !values.imagePrompt.trim()
                    ? "opacity-40 cursor-not-allowed border-gray-200 text-gray-400"
                    : editingPrompt
                    ? "border-blue-300 text-blue-600 bg-blue-50"
                    : "border-gray-200 text-gray-500 hover:bg-gray-50 cursor-pointer"
                }`}
              >
                <Pencil className="h-3 w-3" />
                AI 幫改
              </button>

              {/* AI 優化提示詞 */}
              <button
                type="button"
                onClick={handleOptimizePrompt}
                disabled={optimizingPrompt || !values.imagePrompt.trim()}
                className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border transition-all ${
                  optimizingPrompt || !values.imagePrompt.trim()
                    ? "opacity-40 cursor-not-allowed border-gray-200 text-gray-400"
                    : "border-violet-300 text-violet-600 hover:bg-violet-50 cursor-pointer"
                }`}
              >
                {optimizingPrompt
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : <Wand2 className="h-3 w-3" />}
                {optimizingPrompt ? "優化中…" : "AI 優化提示詞"}
              </button>
            </div>
          </div>
          <textarea
            value={values.imagePrompt}
            onChange={(e) => set("imagePrompt", e.target.value)}
            rows={4}
            placeholder="例：精緻女生在辦公室，側臉仰頭噴霧，大片窗光，質感時尚"
            className="w-full border border-input rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
          />
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

        <Field label="必放文字（選填）" hint="AI 文案會包含這些文字">
          <Input
            value={values.requiredText}
            onChange={(e) => set("requiredText", e.target.value)}
            placeholder="例：精緻女孩必帶✨ / 夏日清涼控油，一噴搞定"
          />
        </Field>
      </div>

      {/* 底圖模式唔重新生圖 → 唔需要素材上傳(02) / 風格積木(03) */}
      {!isBaseMode && (<>
      {/* ── 02 素材上傳 ─────────────────────────────────────── */}
      <div className="space-y-4">
        <SectionLabel step="02" title="素材上傳" />

        <div className="grid grid-cols-3 gap-4">
          {/* 欄 1：產品主圖 */}
          <div className="space-y-2">
            <div className="h-10">
              <span className="text-xs font-medium text-gray-600">產品主圖</span>
              <p className="text-[11px] text-gray-400 leading-snug mt-0.5">最多 5 張（選填）</p>
            </div>
            <UploadZone
              urls={values.productImageUrls} max={5} uploading={uploadingProduct}
              onRemove={(i) => removeImage("product", i)}
              onAdd={(f) => addImages("product", f, 5, values.productImageUrls)}
            />
          </div>

          {/* 欄 2：風格參考圖 */}
          <div className="space-y-2">
            <div className="h-10">
              <span className="text-xs font-medium text-gray-600">風格參考圖</span>
              <p className="text-[11px] text-gray-400 leading-snug mt-0.5">1 張（選填）</p>
            </div>
            <UploadZone
              urls={values.referenceImageUrls} max={1} uploading={uploadingRef}
              onRemove={(i) => removeImage("ref", i)}
              onAdd={(f) => addImages("ref", f, 1, values.referenceImageUrls)}
            />
            {/* 除咗上傳，仲可以由素材庫揀一張現有圖做參考 */}
            <button type="button" onClick={() => setShowLibPicker(true)}
              className="w-full flex items-center justify-center gap-1 text-[11px] font-medium text-violet-600 border border-violet-200 rounded-lg py-1.5 hover:bg-violet-50 transition-colors">
              <Images className="h-3 w-3" />從素材庫揀
            </button>
          </div>

          {/* 欄 3：AI 反推提示詞 */}
          <div className="space-y-2">
            <div className="h-10">
              <div className="flex items-center gap-1.5">
                <ColLabel title="AI 反推提示詞" sub="" />
                <span className="text-[10px] bg-violet-100 text-violet-600 font-semibold px-1.5 py-0.5 rounded-full">AI</span>
              </div>
              <p className="text-[11px] text-gray-400 leading-snug mt-0.5 truncate">從參考圖分析風格</p>
            </div>
            <button
              type="button"
              onClick={() => handleAnalyzeStyle()}
              disabled={!hasRefImages || analyzingImage}
              className={`w-full flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed transition-all h-32
                ${analyzedDone && !analyzingImage
                  ? "border-emerald-300 text-emerald-600 bg-emerald-50/40 cursor-pointer"
                  : hasRefImages && !analyzingImage
                  ? "border-violet-300 text-violet-600 hover:bg-violet-50 cursor-pointer"
                  : "border-gray-100 text-gray-300 cursor-not-allowed bg-gray-50"}`}
            >
              {analyzingImage ? (
                <><Loader2 className="h-5 w-5 animate-spin text-violet-500" /><span className="text-xs text-violet-500">分析中…</span></>
              ) : analyzedDone ? (
                <><Check className="h-5 w-5 text-emerald-500" /><span className="text-xs text-emerald-600 font-medium">已帶入提示詞</span><span className="text-[10px] text-emerald-500/70">可再撳重新帶入</span></>
              ) : (
                <><Sparkles className={`h-5 w-5 ${hasRefImages ? "text-violet-400" : "text-gray-200"}`} />
                <span className="text-xs font-medium">{!hasRefImages ? "需先加風格參考圖" : refStylePrompt.trim() ? "帶入參考圖提示詞" : "分析風格，帶入提示詞"}</span></>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ── 03 套用風格積木（構圖 / 顏色 / 背景）→ 內容注入 AI Prompt ─────────── */}
      <div className="space-y-3">
        <SectionLabel step="03" title="套用風格積木" hint="選填 · 揀咗會加入 AI Prompt 做生成參考" />
        <div className="grid grid-cols-3 gap-3">
          {([
            { cat: "COMPOSITION",  slot: "layout",     label: "構圖", icon: <LayoutTemplate className="h-4 w-4" /> },
            { cat: "COLOR_SCHEME", slot: "color",      label: "顏色", icon: <Palette className="h-4 w-4" /> },
            { cat: "BACKGROUND",   slot: "background", label: "背景", icon: <ImageIcon className="h-4 w-4" /> },
          ] as const).map(({ cat, slot, label, icon }) => {
            const comp = styleBlocks[slot];
            const colors = comp && slot === "color" ? getColors(comp.data) : [];
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
                  className={`w-full rounded-xl border overflow-hidden text-left transition-all ${comp ? "border-violet-200" : "border-dashed border-gray-200 hover:border-violet-300"}`}>
                  {comp ? (
                    <>
                      {/* 顏色：優先顯示色板（睇色 pattern）；其餘：優先顯示圖 */}
                      {slot === "color" && colors.length ? (
                        <div className="flex h-20">{colors.map((c, i) => <div key={i} style={{ background: c.hex }} className="flex-1" />)}</div>
                      ) : comp.previewUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={comp.previewUrl} alt={comp.name} className="w-full h-20 object-cover" />
                      ) : colors.length ? (
                        <div className="flex h-20">{colors.map((c, i) => <div key={i} style={{ background: c.hex }} className="flex-1" />)}</div>
                      ) : (
                        <div className="h-20 bg-violet-50" />
                      )}
                      {/* 三類卡統一：色板/圖 + 單行名稱（高度對齊；hex 已由色板呈現，唔另出灰字）*/}
                      <div className="px-2 py-1.5 text-[11px] text-gray-700 truncate">{comp.name}</div>
                    </>
                  ) : (
                    <div className="h-[109px] flex flex-col items-center justify-center gap-1 text-gray-400">
                      <span className="text-lg">＋</span>
                      <span className="text-[11px]">點擊選取{label}</span>
                    </div>
                  )}
                </button>
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-gray-400">揀咗會即時加入上方「畫面描述 Prompt」，可再喺嗰度改字。</p>
      </div>
      </>)}

      {/* ── 04 圖片尺寸比例（底圖模式冇 02/03 → 順延做 02）─────────── */}
      <div className="space-y-4">
        <SectionLabel step={isBaseMode ? "02" : "04"} title="圖片尺寸比例" />
        <div className="relative w-full max-w-md">
          <select
            value={values.imageRatio}
            onChange={(e) => pickRatio(e.target.value)}
            className="w-full appearance-none border border-gray-200 rounded-lg px-3 py-2 pr-8 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-gray-300 cursor-pointer"
          >
            {RATIOS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}（{RATIO_DIMS[r.value]?.w}×{RATIO_DIMS[r.value]?.h}）</option>
            ))}
          </select>
          <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
        {/* 可改實際輸出尺寸（維持所選比例）；生成會按此尺寸輸出 */}
        <div className="flex items-center gap-2">
          <input type="number" min={256} max={2400} value={values.customW} onChange={(e) => changeDim("w", Number(e.target.value))}
            className="w-24 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
          <span className="text-xs text-gray-400">×</span>
          <input type="number" min={256} max={2400} value={values.customH} onChange={(e) => changeDim("h", Number(e.target.value))}
            className="w-24 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
          <span className="text-[11px] text-gray-400">px · 改任一邊自動鎖 {values.imageRatio} 比例</span>
        </div>

        {/* 生圖模型（底圖模式唔重新生圖 → 唔顯示）*/}
        {!isBaseMode && (
        <div className="space-y-1">
          <Label className="text-sm font-medium">生圖模型</Label>
          <div className="relative w-full max-w-md">
            <select
              value={values.imageModel}
              onChange={(e) => set("imageModel", e.target.value)}
              className="w-full appearance-none border border-gray-200 rounded-lg px-3 py-2 pr-8 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-gray-300 cursor-pointer"
            >
              {IMAGE_MODELS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
            <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
          <p className="text-xs text-gray-400">
            {IMAGE_MODELS.find((m) => m.value === values.imageModel)?.hint ?? ""}
          </p>
        </div>
        )}
      </div>

      {/* ── Submit ──────────────────────────────────────────── */}
      <Button type="submit" disabled={loading} className="w-full">
        {loading
          ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />處理中…</>
          : (isBaseMode ? "建立活動（用此底圖生成文案）" : submitLabel)}
      </Button>

      {showLibPicker && (
        <LibraryImagePickerModal
          clientId={clientId}
          title="從素材庫揀參考圖"
          onPick={(url, promptText) => {
            set("referenceImageUrls", [url]);
            setRefStylePrompt(promptText ?? "");
            setShowLibPicker(false);
            handleAnalyzeStyle({ url, prompt: promptText ?? "" }); // 揀完自動反推提示詞
          }}
          onClose={() => setShowLibPicker(false)}
        />
      )}

      {/* 底圖模式：換一張底圖（唔會跌落空白/一般生成模式，留喺底圖模式換另一張）*/}
      {showBasePicker && (
        <LibraryImagePickerModal
          clientId={clientId}
          title="從素材庫揀底圖"
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

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionLabel({ step, title, hint }: { step: string; title: string; hint?: string }) {
  return (
    <div className="flex items-baseline gap-2 border-b pb-1.5">
      <span className="text-[10px] font-bold text-gray-400 tracking-widest">{step}</span>
      <span className="text-sm font-semibold text-gray-800">{title}</span>
      {hint && <span className="text-xs text-gray-400 font-normal">{hint}</span>}
    </div>
  );
}

function Field({ label, hint, required, children }: {
  label: string; hint?: string; required?: boolean; children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-sm font-medium">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
        {hint && <span className="text-gray-400 font-normal ml-1.5 text-xs">{hint}</span>}
      </Label>
      {children}
    </div>
  );
}
