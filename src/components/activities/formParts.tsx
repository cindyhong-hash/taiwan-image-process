"use client";
/**
 * formParts — 單圖 (ActivityForm) / 多圖 (multi/page) 表單共用嘅視覺元件。
 * 抽出嚟自 ActivityForm.tsx（Figma 對齊嘅 source of truth），兩邊表單要維持
 * 視覺一致，改樣式淨改呢度一個地方即可。
 */
import { Label } from "@/components/ui/label";
import { X, Loader2, Images, Check, RefreshCw, UploadCloud } from "lucide-react";

// ── SectionLabel：violet 數字圓圈 + 標題 + 必填 */選填 + 底線分隔 ─────────────

export function SectionLabel({ step, title, hint, required }: { step: string; title: string; hint?: string; required?: boolean }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-600 text-xs font-bold text-white">
          {step}
        </span>
        <span className="text-sm font-bold text-gray-800">{title}</span>
        {required
          ? <span className="text-red-500 font-semibold">*</span>
          : <span className="text-xs text-gray-400">（選填）</span>}
        {hint && <span className="text-xs text-gray-400 font-normal">{hint}</span>}
      </div>
      <div className="border-b border-gray-200" />
    </div>
  );
}

// ── Field：label + required */ optional（選填）+ hint ────────────────────────

export function Field({ label, hint, required, optional, children }: {
  label: string; hint?: string; required?: boolean; optional?: boolean; children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-sm font-medium">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
        {optional && <span className="text-xs text-gray-400 font-normal ml-1">（選填）</span>}
        {hint && <span className="text-gray-400 font-normal ml-1.5 text-xs">{hint}</span>}
      </Label>
      {children}
    </div>
  );
}

// ── AssetUploadCards：素材上傳 3 卡（產品主圖 / 風格參考圖 / AI 反推提示詞）───

export type AssetUploadCardsProps = {
  productUrls: string[];
  refUrls: string[];
  onAddProduct: (files: FileList) => void;
  onRemoveProduct: (i: number) => void;
  onPickProductLibrary: () => void;
  onAddRef: (files: FileList) => void;
  onRemoveRef: (i: number) => void;
  onPickRefLibrary: () => void;
  uploadingProduct?: boolean;
  uploadingRef?: boolean;
  analyzeState: "idle" | "analyzing" | "done";
  onAnalyze: () => void;
  canAnalyze: boolean; // = hasRefImages
};

const PRODUCT_MAX = 5;
const REF_MAX = 1;

export function AssetUploadCards({
  productUrls, refUrls,
  onAddProduct, onRemoveProduct, onPickProductLibrary,
  onAddRef, onRemoveRef, onPickRefLibrary,
  uploadingProduct, uploadingRef,
  analyzeState, onAnalyze, canAnalyze,
}: AssetUploadCardsProps) {
  const analyzing = analyzeState === "analyzing";
  const done = analyzeState === "done";
  return (
    <div className="grid grid-cols-3 gap-4 items-stretch">
      {/* 欄 1：產品主圖 */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 flex flex-col items-center text-center gap-3">
        <UploadCloud className="h-7 w-7 text-gray-400" />
        <div>
          <p className="text-sm font-bold text-gray-800">產品主圖 最多 5 張<span className="text-xs text-gray-400 font-normal ml-1">（選填）</span></p>
          <p className="text-xs text-gray-400 mt-0.5">去背產品圖效果更佳</p>
        </div>
        {(productUrls.length > 0 || uploadingProduct) && (
          <div className="flex gap-1.5 flex-wrap justify-center">
            {productUrls.map((url, i) => (
              <div key={i} className="relative w-12 h-12 shrink-0 group/thumb">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="w-12 h-12 object-cover rounded-lg border border-gray-200" />
                <button type="button" onClick={() => onRemoveProduct(i)}
                  className="absolute -top-1 -right-1 bg-white rounded-full border shadow-sm p-0.5 hover:bg-red-50">
                  <X className="h-2.5 w-2.5 text-gray-500" />
                </button>
              </div>
            ))}
            {uploadingProduct && <Loader2 className="h-5 w-5 text-gray-300 animate-spin self-center" />}
          </div>
        )}
        <div className="flex items-center gap-2 w-full mt-auto">
          <label className={`flex-1 flex items-center justify-center gap-1 text-xs font-medium rounded-lg py-1.5 border transition-colors
            ${productUrls.length >= PRODUCT_MAX ? "border-gray-100 text-gray-300 cursor-not-allowed" : "border-gray-200 text-gray-600 hover:bg-gray-50 cursor-pointer"}`}>
            上傳圖片
            {productUrls.length < PRODUCT_MAX && (
              <input type="file" accept="image/*" multiple className="hidden"
                onChange={(e) => e.target.files && onAddProduct(e.target.files)} />
            )}
          </label>
          <button type="button" onClick={onPickProductLibrary}
            disabled={productUrls.length >= PRODUCT_MAX}
            className="flex-1 flex items-center justify-center gap-1 text-xs font-medium text-violet-600 border border-violet-200 rounded-lg py-1.5 hover:bg-violet-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            <Images className="h-3 w-3" />從素材庫選擇
          </button>
        </div>
      </div>

      {/* 欄 2：風格參考圖 */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 flex flex-col items-center text-center gap-3">
        <UploadCloud className="h-7 w-7 text-gray-400" />
        <div>
          <p className="text-sm font-bold text-gray-800">風格參考圖 1 張<span className="text-xs text-gray-400 font-normal ml-1">（選填）</span></p>
          <p className="text-xs text-gray-400 mt-0.5">指定你想要的排版或氛圍</p>
        </div>
        {(refUrls.length > 0 || uploadingRef) && (
          <div className="flex gap-1.5 flex-wrap justify-center">
            {refUrls.map((url, i) => (
              <div key={i} className="relative w-12 h-12 shrink-0 group/thumb">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="w-12 h-12 object-cover rounded-lg border border-gray-200" />
                <button type="button" onClick={() => onRemoveRef(i)}
                  className="absolute -top-1 -right-1 bg-white rounded-full border shadow-sm p-0.5 hover:bg-red-50">
                  <X className="h-2.5 w-2.5 text-gray-500" />
                </button>
              </div>
            ))}
            {uploadingRef && <Loader2 className="h-5 w-5 text-gray-300 animate-spin self-center" />}
          </div>
        )}
        <div className="flex items-center gap-2 w-full mt-auto">
          <label className={`flex-1 flex items-center justify-center gap-1 text-xs font-medium rounded-lg py-1.5 border transition-colors
            ${refUrls.length >= REF_MAX ? "border-gray-100 text-gray-300 cursor-not-allowed" : "border-gray-200 text-gray-600 hover:bg-gray-50 cursor-pointer"}`}>
            上傳圖片
            {refUrls.length < REF_MAX && (
              <input type="file" accept="image/*" multiple className="hidden"
                onChange={(e) => e.target.files && onAddRef(e.target.files)} />
            )}
          </label>
          <button type="button" onClick={onPickRefLibrary}
            className="flex-1 flex items-center justify-center gap-1 text-xs font-medium text-violet-600 border border-violet-200 rounded-lg py-1.5 hover:bg-violet-50 transition-colors">
            <Images className="h-3 w-3" />從素材庫選擇
          </button>
        </div>
      </div>

      {/* 欄 3：AI 反推提示詞 */}
      <button
        type="button"
        onClick={onAnalyze}
        disabled={!canAnalyze || analyzing}
        className={`rounded-xl border-2 border-dashed p-5 flex flex-col items-center justify-center text-center gap-3 transition-all
          ${done && !analyzing
            ? "border-emerald-300 bg-emerald-50/40 cursor-pointer"
            : canAnalyze && !analyzing
            ? "border-violet-300 hover:bg-violet-50 cursor-pointer"
            : "border-violet-100 bg-gray-50 cursor-not-allowed"}`}
      >
        {analyzing ? (
          <>
            <Loader2 className="h-7 w-7 text-violet-500 animate-spin" />
            <div>
              <p className="text-sm font-bold text-gray-800">AI 反推提示詞</p>
              <p className="text-xs text-violet-500 mt-0.5">分析中…</p>
            </div>
          </>
        ) : done ? (
          <>
            <Check className="h-7 w-7 text-emerald-500" />
            <div>
              <p className="text-sm font-bold text-gray-800">AI 反推提示詞</p>
              <p className="text-xs text-emerald-600 mt-0.5">已帶入提示詞，可再撳重新帶入</p>
            </div>
          </>
        ) : (
          <>
            <RefreshCw className={`h-7 w-7 ${canAnalyze ? "text-violet-400" : "text-gray-300"}`} />
            <div>
              <p className={`text-sm font-bold ${canAnalyze ? "text-gray-800" : "text-gray-400"}`}>AI 反推提示詞</p>
              <p className="text-xs text-gray-400 mt-0.5">{canAnalyze ? "從參考圖智能分析風格並套用" : "需先加風格參考圖"}</p>
            </div>
          </>
        )}
      </button>
    </div>
  );
}
