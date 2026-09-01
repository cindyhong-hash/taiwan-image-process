"use client";
/**
 * formParts — 單圖 (ActivityForm) / 多圖 (multi/page) 表單共用嘅視覺元件。
 * 抽出嚟自 ActivityForm.tsx（Figma 對齊嘅 source of truth），兩邊表單要維持
 * 視覺一致，改樣式淨改呢度一個地方即可。對齊 Figma step3-creation-form-v2 (263-974)。
 */
import { Label } from "@/components/ui/label";
import { X, Loader2, Images, Upload, Sparkles } from "lucide-react";

// ── SectionLabel：violet 數字圓圈 + 標題 + 必填 */選填 + 底線分隔 ─────────────
// divider 預設 true（多圖／素材庫表單靠底線分隔）；白卡片式版面傳 divider={false}。

export function SectionLabel({ step, title, hint, required, divider = true }: { step: string; title: string; hint?: string; required?: boolean; divider?: boolean }) {
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
      {divider && <div className="border-b border-gray-200" />}
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

// ── 卡片底部動作列（上傳圖片 | 從素材庫選擇），border-t 分隔 ────────────────────

function UploadActionBar({ onUpload, uploadDisabled, onPickLibrary, pickDisabled, multiple }: {
  onUpload: (files: FileList) => void; uploadDisabled?: boolean; onPickLibrary: () => void; pickDisabled?: boolean; multiple?: boolean;
}) {
  return (
    <div className="flex items-stretch border-t border-[#ebeff5] h-11 shrink-0">
      <label className={`flex-1 flex items-center justify-center gap-1.5 text-[13px] font-semibold whitespace-nowrap transition-colors
        ${uploadDisabled ? "text-gray-300 cursor-not-allowed" : "text-gray-800 hover:bg-gray-50 cursor-pointer"}`}>
        <Upload className="h-4 w-4 shrink-0" />上傳圖片
        {!uploadDisabled && (
          <input type="file" accept="image/*" multiple={multiple} className="hidden"
            onChange={(e) => e.target.files && onUpload(e.target.files)} />
        )}
      </label>
      <div className="w-px bg-[#ebeff5]" />
      <button type="button" onClick={onPickLibrary} disabled={pickDisabled}
        className="flex-1 flex items-center justify-center gap-1.5 text-[13px] font-semibold whitespace-nowrap text-violet-600 hover:bg-violet-50 disabled:text-gray-300 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors">
        <Images className="h-4 w-4 shrink-0" />從素材庫選擇
      </button>
    </div>
  );
}

// ── AssetUploadCards：素材上傳 3 卡（產品圖片 / 參考風格圖 / AI 反推提示詞）───

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

function Thumb({ url, onRemove }: { url: string; onRemove: () => void }) {
  return (
    <div className="relative w-12 h-12 shrink-0">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" className="w-12 h-12 object-cover rounded-md border border-[#ebeff5]" />
      <button type="button" onClick={onRemove}
        className="absolute -top-1 -right-1 bg-white rounded-full border shadow-sm p-0.5 hover:bg-red-50">
        <X className="h-2.5 w-2.5 text-gray-500" />
      </button>
    </div>
  );
}

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
      {/* 卡 1：產品圖片 */}
      <div className="rounded-xl border-[1.5px] border-[#ebeff5] bg-white flex flex-col overflow-hidden min-h-[190px]">
        <div className="flex-1 p-5 flex flex-col gap-3.5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-gray-900">產品圖片 <span className="font-normal text-gray-400">(最多 5 張)</span></p>
            {productUrls.length > 0 && (
              <p className="text-xs font-semibold text-violet-600">已選 {productUrls.length}/5 張</p>
            )}
          </div>
          {(productUrls.length > 0 || uploadingProduct) && (
            <div className="flex gap-2 flex-wrap">
              {productUrls.map((url, i) => <Thumb key={i} url={url} onRemove={() => onRemoveProduct(i)} />)}
              {uploadingProduct && <Loader2 className="h-5 w-5 text-gray-300 animate-spin self-center" />}
            </div>
          )}
        </div>
        <UploadActionBar
          onUpload={onAddProduct}
          uploadDisabled={productUrls.length >= PRODUCT_MAX}
          onPickLibrary={onPickProductLibrary}
          pickDisabled={productUrls.length >= PRODUCT_MAX}
          multiple
        />
      </div>

      {/* 卡 2：參考風格圖 */}
      <div className="rounded-xl border-[1.5px] border-[#ebeff5] bg-white flex flex-col overflow-hidden min-h-[190px]">
        <div className="flex-1 p-5 flex flex-col gap-3.5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-gray-900">參考風格圖 <span className="font-normal text-gray-400">(1 張)</span></p>
            {refUrls.length > 0 && <p className="text-xs text-gray-400">已上傳</p>}
          </div>
          {(refUrls.length > 0 || uploadingRef) && (
            <div className="flex items-center gap-3">
              {refUrls.map((url, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Thumb url={url} onRemove={() => onRemoveRef(i)} />
                  <p className="text-xs font-semibold text-gray-700">已上傳參考圖</p>
                </div>
              ))}
              {uploadingRef && <Loader2 className="h-5 w-5 text-gray-300 animate-spin" />}
            </div>
          )}
        </div>
        <UploadActionBar
          onUpload={onAddRef}
          uploadDisabled={refUrls.length >= REF_MAX}
          onPickLibrary={onPickRefLibrary}
        />
      </div>

      {/* 卡 3：AI 反推提示詞（填色卡）*/}
      <div className="rounded-xl border-[1.5px] border-[#ebe4f9] bg-[#f9f6ff] p-5 flex flex-col justify-between gap-4 min-h-[190px]">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-600" />
            <p className="text-sm font-bold text-violet-700">AI 反推提示詞</p>
          </div>
          <p className="text-xs leading-relaxed text-gray-500">
            偵測參考圖後，AI 智慧反推構圖、色調及場景等描述，並將其自動追加至下方 Prompt 中。
          </p>
        </div>
        <button type="button" onClick={onAnalyze} disabled={!canAnalyze || analyzing}
          className="w-full flex items-center justify-center gap-1.5 rounded-md bg-violet-600 text-white text-xs font-semibold py-2 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          {analyzing
            ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />分析中…</>
            : done
            ? "已帶入，重新生成"
            : "一鍵生成反推提示詞"}
        </button>
      </div>
    </div>
  );
}
