"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X, Loader2, ImagePlus, Wand2, Sparkles, Pencil, Trash2, Images } from "lucide-react";
import { ComponentSelector } from "@/components/activities/ComponentSelector";
import { LibraryImagePickerModal } from "@/components/activities/LibraryImagePickerModal";

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
  });

  const [uploadingProduct, setUploadingProduct] = useState(false);
  const [uploadingRef,     setUploadingRef]     = useState(false);
  const [loading,          setLoading]          = useState(false);
  const [showLibPicker,    setShowLibPicker]    = useState(false); // 從素材庫揀參考圖
  // 由素材庫揀嗰張參考圖已有嘅 AI Prompt（有就直接用，免再 call analyze API）；上傳新圖時清空。
  const [refStylePrompt,   setRefStylePrompt]   = useState<string>("");

  // AI 輔助狀態
  const [optimizingPrompt,  setOptimizingPrompt]  = useState(false);
  const [analyzingImage,    setAnalyzingImage]    = useState(false);
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
    if (kind === "ref") setRefStylePrompt(""); // 上傳新參考圖 → 無現成 prompt，改用 analyze API
    kind === "product" ? setUploadingProduct(false) : setUploadingRef(false);
  };

  const removeImage = (kind: "product" | "ref", i: number) => {
    const key = kind === "product" ? "productImageUrls" : "referenceImageUrls";
    set(key, values[key].filter((_, idx) => idx !== i));
    if (kind === "ref") setRefStylePrompt("");
  };

  // ── AI 功能一：優化 Prompt ───────────────────────────────────────────────────
  const handleOptimizePrompt = async () => {
    if (!values.imagePrompt.trim()) return;
    setOptimizingPrompt(true);
    try {
      const res = await fetch("/api/ai/optimize-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: values.imagePrompt }),
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
  const handleAnalyzeStyle = async () => {
    const refUrl = values.referenceImageUrls[0];
    if (!refUrl) return;
    const appendStyle = (desc: string) => {
      const separator = values.imagePrompt.trim() ? "\n\n風格參考：" : "風格參考：";
      set("imagePrompt", values.imagePrompt + separator + desc);
    };
    // 由素材庫揀嘅圖已有 AI Prompt → 直接用，唔使再 call analyze API（即時、慳一次呼叫）。
    if (refStylePrompt.trim()) {
      appendStyle(refStylePrompt.trim());
      return;
    }
    setAnalyzingImage(true);
    try {
      const res = await fetch("/api/ai/analyze-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: refUrl }),
      });
      const data = await res.json();
      if (data.styleDescription) {
        appendStyle(data.styleDescription);
      } else {
        alert(data.error ?? "解析失敗，請稍後再試");
      }
    } catch {
      alert("網路錯誤，請稍後再試");
    } finally {
      setAnalyzingImage(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try { await onSubmit(values); } finally { setLoading(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8 max-w-2xl">

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
              onClick={handleAnalyzeStyle}
              disabled={!hasRefImages || analyzingImage}
              className={`w-full flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed transition-all h-32
                ${hasRefImages && !analyzingImage
                  ? "border-violet-300 text-violet-600 hover:bg-violet-50 cursor-pointer"
                  : "border-gray-100 text-gray-300 cursor-not-allowed bg-gray-50"}`}
            >
              {analyzingImage ? (
                <><Loader2 className="h-5 w-5 animate-spin text-violet-500" /><span className="text-xs text-violet-500">分析中…</span></>
              ) : (
                <><Sparkles className={`h-5 w-5 ${hasRefImages ? "text-violet-400" : "text-gray-200"}`} />
                <span className="text-xs font-medium">{!hasRefImages ? "需先加風格參考圖" : refStylePrompt.trim() ? "帶入參考圖提示詞" : "分析風格，帶入提示詞"}</span></>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ── 03 風格組件（暫時隱藏；要叫回來把下面整段 {false && (...)} 改回 true 或移除外層即可）─── */}
      {false && (
      <div className="space-y-3">
        <SectionLabel step="03" title="套用風格組件" hint="選填，AI 會沿用已有的視覺設定" />
        <ComponentSelector
          clientId={clientId}
          selectedIds={values.selectedComponentIds}
          onChange={(ids) => set("selectedComponentIds", ids)}
        />
      </div>
      )}

      {/* ── 03 圖片比例與生圖模型（原 04；因 03 風格組件已隱藏，順序補上）─────────── */}
      <div className="space-y-4">
        <SectionLabel step="03" title="圖片尺寸比例" />
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

        {/* 生圖模型 */}
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
      </div>

      {/* ── Submit ──────────────────────────────────────────── */}
      <Button type="submit" disabled={loading} className="w-full">
        {loading
          ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />處理中…</>
          : submitLabel}
      </Button>

      {showLibPicker && (
        <LibraryImagePickerModal
          clientId={clientId}
          onPick={(url, promptText) => { set("referenceImageUrls", [url]); setRefStylePrompt(promptText ?? ""); setShowLibPicker(false); }}
          onClose={() => setShowLibPicker(false)}
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
