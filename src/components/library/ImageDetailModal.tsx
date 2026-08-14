"use client";
/**
 * ImageDetailModal
 * ────────────────
 * Popup shown when a brand-gallery image OR a component card is clicked.
 * Displays the image and its linked 構圖 / 配色 / 語氣 / 背景 components, each with
 * a 「帶入生成」 button. For library-generated images (no linked components) it shows
 * the generated copy and offers 「分析此圖加入素材」.
 */
import { useEffect, useState } from "react";
import { X, ArrowRightCircle, Sparkles, ScanSearch, Pencil, RefreshCw, Trash2, Download, Check, Loader2, Image as ImageIcon, Target } from "lucide-react";
import type { StyleComponent, ComponentCategory } from "@/types/library";
import { CATEGORY_META, getColors } from "@/types/library";
import { ColorCards } from "./ColorCards";

type Props = {
  imageUrl: string | null;
  /** When provided, skip fetching and show exactly these components. */
  presetComponents?: StyleComponent[];
  copyText?: string | null;
  subject?: string | null;
  prompt?: string | null;
  libraryImageId?: string;
  /** 生成類型（人像/插畫）→ 純成圖，popup 唔顯示積木/分析。 */
  genType?: string;
  /** 生成時的引擎 mode（e.g. "flux-scene", "nano-banana"）— 用於「重新生成」時預填引擎。 */
  mode?: string;
  /** 生成時使用的參考風格圖 URL（可能是 /uploads 本地路徑）。 */
  refImageUrl?: string;
  /** 合成時用咗嘅產品來源圖（喺 popup 顯示返）。 */
  sourceImages?: string[];
  /** 從 popup 觸發「重新生成/調整」，傳回預填資料讓父層打開 GenerateAssetModal。 */
  onOpenGenerateAsset?: (init: { description: string; refImageUrl: string; type: "background" | "person" | "illustration"; engine: "flux" | "nano" }) => void;
  injectedIds?: Set<string>;
  onInject: (comp: StyleComponent) => void;
  /** 一次過帶入全部積木（構圖/配色/語氣/背景）到生成圖片並切 tab。 */
  onInjectAll?: (comps: StyleComponent[]) => void;
  onAnalyze?: (imageUrl: string, libraryImageId?: string) => void;
  /** Image-based edit: adjust this image's 構圖/配色/語氣 together.
   *  libraryImageId is forwarded so a generated image saves back into its paramsJson snapshot. */
  onAdjust?: (imageUrl: string, components: StyleComponent[], libraryImageId?: string) => void;
  onRegenerate?: () => void;
  onDelete?: (id: string) => void;
  /** Delete StyleComponents by id (used for 背景素材 in the popup). */
  onDeleteComponents?: (ids: string[]) => void;
  /** Called after the photo title is edited — lets the parent refresh its grids. */
  onRefresh?: () => void;
  /** 帶入此圖去「新增活動」（經 sessionStorage 傳 URL + AI prompt，唔會喺網址外露）。 */
  onUseAsActivityRef?: (imageUrl: string, prompt?: string) => void;
  onClose: () => void;
};

// 語氣（COPY_TONE）已從 UI 移除（wireframe ⑧）——詳情彈窗只顯示 構圖/配色/背景。
const ORDER: ComponentCategory[] = ["COMPOSITION", "COLOR_SCHEME", "BACKGROUND"];

// popup（詳細檢視）尺寸 label：比例 · 原始像素，如「1:1 · 1200×1200」；非標準比例只顯示像素。
const STD_RATIOS: [string, number][] = [
  ["1:1", 1], ["4:5", 0.8], ["3:4", 0.75], ["2:3", 2 / 3],
  ["9:16", 9 / 16], ["4:3", 4 / 3], ["3:2", 1.5], ["16:9", 16 / 9],
];
function sizeLabel(w: number, h: number): string {
  if (!w || !h) return "";
  const r = w / h;
  let bestLabel = "", bestVal = 1, diff = Infinity;
  for (const [lbl, val] of STD_RATIOS) { const d = Math.abs(val - r); if (d < diff) { diff = d; bestLabel = lbl; bestVal = val; } }
  return diff / bestVal < 0.03 ? `${bestLabel} · ${w}×${h}` : `${w}×${h}`;
}

// 主圖 + 右下角尺寸 pill（比例 · 原始尺寸）
function ImageWithSize({ src, alt, className }: { src: string; alt?: string; className?: string }) {
  const [dims, setDims] = useState("");
  return (
    <div className="relative">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt ?? "preview"} className={className}
        onLoad={(e) => { const t = e.currentTarget; setDims(sizeLabel(t.naturalWidth, t.naturalHeight)); }} />
      {dims && (
        <span className="absolute bottom-2 right-2 text-[10px] font-medium bg-black/55 text-white px-1.5 py-0.5 rounded shadow pointer-events-none">{dims}</span>
      )}
    </div>
  );
}

export function ImageDetailModal({
  imageUrl,
  presetComponents,
  subject,
  prompt,
  libraryImageId,
  genType,
  mode,
  refImageUrl,
  sourceImages,
  injectedIds,
  onInject,
  onInjectAll,
  onAnalyze,
  onAdjust,
  onRegenerate,
  onDelete,
  onDeleteComponents,
  onRefresh,
  onOpenGenerateAsset,
  onUseAsActivityRef,
  onClose,
}: Props) {
  const [confirmDel, setConfirmDel] = useState(false);
  const [components, setComponents] = useState<StyleComponent[]>(presetComponents ?? []);
  const [loading, setLoading] = useState(!presetComponents && !!imageUrl);
  // Editable photo title (generated images only — persisted to LibraryImage.subject).
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [savedTitle, setSavedTitle] = useState<string | null>(null);
  const [savingTitle, setSavingTitle] = useState(false);
  const displaySubject = savedTitle ?? subject;

  async function saveTitle() {
    if (!libraryImageId) return;
    const v = titleDraft.trim();
    setSavingTitle(true);
    try {
      const res = await fetch(`/api/library/images/${libraryImageId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: v }),
      });
      if (res.ok) { setSavedTitle(v); setEditingTitle(false); onRefresh?.(); }
    } finally { setSavingTitle(false); }
  }

  // Download the displayed image (same-origin /uploads → the `download` attribute is honored).
  function handleDownload() {
    if (!imageUrl) return;
    const a = document.createElement("a");
    a.href = imageUrl;
    a.download = imageUrl.split("/").pop() || "image";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // 「移到 / 換專案」已從 popup 移除（重複功能）——改用「調整→編輯素材」入面個專案下拉，或 gallery 長按多選移到。
  // Header 「刪除」 — what it removes depends on the image kind:
  //  • generated (has libraryImageId) → delete the LibraryImage row
  //  • uploaded / 背景素材 (only linked components) → delete all of this image's components
  const canDelete = (!!onDelete && !!libraryImageId) || (!!onDeleteComponents && components.length > 0);
  function handleHeaderDelete() {
    if (onDelete && libraryImageId) onDelete(libraryImageId);
    else if (onDeleteComponents && components.length > 0) onDeleteComponents(components.map((c) => c.id));
    onClose();
  }

  useEffect(() => {
    setEditingTitle(false);
    setSavedTitle(null);
    if (presetComponents) {
      setComponents(presetComponents);
      return;
    }
    if (!imageUrl) return;
    setLoading(true);
    // cache-bust + no-store: when re-opening the SAME image after an edit, the browser must
    // not serve a stale cached component list (this caused "編輯後內容唔 update").
    fetch(`/api/components?previewUrl=${encodeURIComponent(imageUrl)}&_t=${Date.now()}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((comps: StyleComponent[]) => setComponents(Array.isArray(comps) ? comps : []))
      .finally(() => setLoading(false));
  }, [imageUrl, presetComponents]);

  // Ref image: prop takes priority; fallback to bgComp.data for background assets.
  const bgComp = components.find((c) => c.type === "BACKGROUND");
  const effectiveRefImageUrl = refImageUrl || (bgComp?.data?.refImageUrl as string | undefined);
  const effectiveMode = mode || (bgComp?.data?.mode as string | undefined);
  const derivedEngine: "flux" | "nano" = effectiveMode === "nano-banana" ? "nano" : "flux";
  const sorted = [...components]
    .filter((c) => c.type !== "BACKGROUND" && c.type !== "COPY_TONE") // 語氣已移除（wireframe ⑧）
    .sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type));

  // 背景素材 popup：genType==="material" hint 讓 popup 從第一格 render 就用正確框（避免先出主 popup 再縮）。
  if (genType === "material" || (!loading && bgComp && sorted.length === 0)) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
        <div className="relative w-full max-w-2xl max-h-[92vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b shrink-0 gap-3 min-w-0">
            <h2 className="text-sm font-semibold flex items-center gap-1.5 min-w-0 truncate">
              <ScanSearch className="h-4 w-4 text-teal-500 shrink-0" />
              <span className="truncate">背景</span>
            </h2>
            {!loading && (
              <div className="flex items-center gap-1.5 shrink-0">
                {/* 重新生成（紫）統一擺 header（IMG_02）*/}
                {onOpenGenerateAsset && (
                  <button onClick={() => onOpenGenerateAsset({ description: prompt ?? "", refImageUrl: effectiveRefImageUrl ?? "", type: "background", engine: derivedEngine })}
                    title="重新生成 / 調整（帶入素材生成）"
                    className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg whitespace-nowrap bg-violet-600 text-white hover:bg-violet-700 transition-colors">
                    <RefreshCw className="h-3.5 w-3.5" />重新生成背景
                  </button>
                )}
                {imageUrl && (
                  <button onClick={handleDownload} title="下載圖片"
                    className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border whitespace-nowrap bg-white border-gray-200 text-gray-600 hover:border-teal-300 hover:text-teal-600 transition-colors">
                    <Download className="h-3.5 w-3.5" />下載
                  </button>
                )}
                {canDelete && (
                  <button
                    onClick={() => {
                      if (confirmDel) handleHeaderDelete();
                      else { setConfirmDel(true); setTimeout(() => setConfirmDel(false), 3000); }
                    }}
                    className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border whitespace-nowrap transition-colors
                      ${confirmDel ? "bg-red-500 text-white border-red-500" : "bg-white border-gray-200 text-gray-500 hover:border-red-300 hover:text-red-500"}`}
                    title={confirmDel ? "再按確認刪除" : "刪除此背景素材"}>
                    <Trash2 className="h-3.5 w-3.5" />{confirmDel ? "確認刪除" : "刪除"}
                  </button>
                )}
                <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors shrink-0">
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
            {loading && (
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors shrink-0">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="p-5 overflow-y-auto flex-1 min-h-0">
            {loading ? (
              <div className="text-sm text-gray-400 py-10 text-center">載入中…</div>
            ) : imageUrl ? (
              <ImageWithSize src={imageUrl} alt={bgComp?.name} className="w-full max-h-[60vh] object-contain rounded-xl border bg-gray-50" />
            ) : null}
            {!loading && prompt && (
              <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50 p-3">
                <div className="text-[11px] font-semibold text-violet-700 mb-1 flex items-center gap-1">
                  <Sparkles className="h-3 w-3" />AI Prompt
                </div>
                <p className="text-[11px] font-mono text-gray-600 leading-relaxed break-all">{prompt}</p>
              </div>
            )}
            {!loading && effectiveRefImageUrl && (
              <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
                <div className="text-[11px] font-semibold text-gray-500 mb-2 flex items-center gap-1">
                  <Sparkles className="h-3 w-3" />參考風格圖
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={effectiveRefImageUrl} alt="參考風格圖" className="w-full max-h-64 object-contain rounded-lg border bg-white" />
                {effectiveRefImageUrl.startsWith("http") && (
                  <div className="mt-1.5 text-center">
                    <a href={effectiveRefImageUrl} target="_blank" rel="noopener noreferrer"
                      className="text-[10px] text-violet-500 hover:text-violet-700 break-all font-mono leading-relaxed underline">
                      {effectiveRefImageUrl}
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>
          {/* 固定 footer：帶入掣永遠可見（唔會被高圖 push 走）；兩條統一 outline 風格 */}
          {!loading && imageUrl && (onUseAsActivityRef || bgComp) && (
            <div className="px-5 py-3 border-t shrink-0 space-y-2">
              {bgComp && (
                <button onClick={() => onInject(bgComp)} disabled={injectedIds?.has(bgComp.id)}
                  className={`w-full flex items-center justify-center gap-1.5 text-xs font-medium px-3 py-2 rounded-xl border transition-colors
                    ${injectedIds?.has(bgComp.id) ? "bg-gray-100 border-gray-200 text-gray-400 cursor-default" : "bg-teal-600 border-teal-600 text-white hover:bg-teal-700"}`}>
                  <ArrowRightCircle className="h-3.5 w-3.5" />{injectedIds?.has(bgComp.id) ? "已帶入產品圖生成" : "帶入產品圖生成"}
                </button>
              )}
              {onUseAsActivityRef && (
                <button onClick={() => onUseAsActivityRef(imageUrl, prompt ?? undefined)}
                  className="w-full flex items-center justify-center gap-1.5 text-xs font-medium px-3 py-2 rounded-xl bg-violet-600 text-white hover:bg-violet-700 transition-colors">
                  <Target className="h-3.5 w-3.5" />帶入活動圖生成
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }


  // 人像 / 插畫：純最終成圖 — 全圖 + AI Prompt，唔顯示積木 / 分析。
  if (genType === "person" || genType === "illustration") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
        <div className="relative w-full max-w-2xl max-h-[92vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b shrink-0 gap-3 min-w-0">
            <h2 className="text-sm font-semibold flex items-center gap-1.5 min-w-0 truncate">
              <ScanSearch className={`h-4 w-4 shrink-0 ${genType === "person" ? "text-rose-500" : "text-amber-500"}`} />
              <span className="truncate">{genType === "person" ? "人像" : "插畫"}</span>
            </h2>
            <div className="flex items-center gap-1.5 shrink-0">
              {/* 重新生成（紫）統一擺 header（IMG_02）*/}
              {onOpenGenerateAsset && (
                <button onClick={() => onOpenGenerateAsset({ description: prompt ?? "", refImageUrl: effectiveRefImageUrl ?? "", type: genType as "person" | "illustration", engine: derivedEngine })}
                  title="重新生成 / 調整（帶入素材生成）"
                  className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg whitespace-nowrap bg-violet-600 text-white hover:bg-violet-700 transition-colors">
                  <RefreshCw className="h-3.5 w-3.5" />重新生成{genType === "person" ? "人像" : "插畫"}
                </button>
              )}
              {imageUrl && (
                <button onClick={handleDownload} title="下載圖片"
                  className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border whitespace-nowrap bg-white border-gray-200 text-gray-600 hover:border-violet-300 hover:text-violet-600 transition-colors">
                  <Download className="h-3.5 w-3.5" />下載
                </button>
              )}
              {canDelete && (
                <button
                  onClick={() => { if (confirmDel) handleHeaderDelete(); else { setConfirmDel(true); setTimeout(() => setConfirmDel(false), 3000); } }}
                  className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border whitespace-nowrap transition-colors
                    ${confirmDel ? "bg-red-500 text-white border-red-500" : "bg-white border-gray-200 text-gray-500 hover:border-red-300 hover:text-red-500"}`}
                  title={confirmDel ? "再按確認刪除" : "刪除此圖"}>
                  <Trash2 className="h-3.5 w-3.5" />{confirmDel ? "確認刪除" : "刪除"}
                </button>
              )}
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors shrink-0">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="p-5 overflow-y-auto flex-1 min-h-0">
            {imageUrl && (
              <ImageWithSize src={imageUrl} alt="preview" className="w-full max-h-[60vh] object-contain rounded-xl border bg-gray-50" />
            )}
            {prompt && (
              <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50 p-3">
                <div className="text-[11px] font-semibold text-violet-700 mb-1 flex items-center gap-1"><Sparkles className="h-3 w-3" />AI Prompt</div>
                <p className="text-[11px] font-mono text-gray-600 leading-relaxed break-all">{prompt}</p>
              </div>
            )}
            {effectiveRefImageUrl && (
              <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
                <div className="text-[11px] font-semibold text-gray-500 mb-2 flex items-center gap-1">
                  <Sparkles className="h-3 w-3" />參考風格圖
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={effectiveRefImageUrl} alt="參考風格圖" className="w-full max-h-64 object-contain rounded-lg border bg-white" />
                {effectiveRefImageUrl.startsWith("http") && (
                  <div className="mt-1.5 text-center">
                    <a href={effectiveRefImageUrl} target="_blank" rel="noopener noreferrer"
                      className="text-[10px] text-violet-500 hover:text-violet-700 break-all font-mono leading-relaxed underline">
                      {effectiveRefImageUrl}
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>
          {onUseAsActivityRef && imageUrl && (
            <div className="px-5 py-3 border-t shrink-0">
              <button onClick={() => onUseAsActivityRef(imageUrl, prompt ?? undefined)}
                className="w-full flex items-center justify-center gap-1.5 text-xs font-medium px-3 py-2 rounded-xl bg-violet-600 text-white hover:bg-violet-700 transition-colors">
                <Target className="h-3.5 w-3.5" />帶入活動圖生成
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-5xl max-h-[92vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b shrink-0 gap-3 min-w-0">
          {/* 標題只 show 類別（唔再用生成文字 / 唔可改名）*/}
          <h2 className="text-sm font-semibold flex items-center gap-1.5 min-w-0">
            <ScanSearch className={`h-4 w-4 shrink-0 ${genType === "reference" || !libraryImageId ? "text-blue-500" : "text-violet-500"}`} />
            <span>{genType === "reference" || !libraryImageId ? "參考圖" : "產品成圖"}</span>
          </h2>
          <div className="flex items-center gap-1.5 shrink-0">
            {/* header 順序統一（IMG_02）：[重新生成][調整]│[下載]│[刪除][✕]
                重新生成 = 有 paramsJson 就 reload 原參數；冇就用呢張圖嘅積木（構圖/配色/背景）重組去生成台。*/}
            {(onRegenerate || (onInjectAll && (sorted.length > 0 || bgComp))) && (
              <button
                onClick={onRegenerate ?? (() => onInjectAll?.([...sorted, ...(bgComp ? [bgComp] : [])]))}
                title="重新生成（用這張圖的原參數 / 積木帶到生成台）"
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg whitespace-nowrap bg-violet-600 text-white hover:bg-violet-700 transition-colors">
                <RefreshCw className="h-3.5 w-3.5" />重新生成{genType === "reference" || !libraryImageId ? "參考圖" : "產品圖"}
              </button>
            )}
            {/* Image-based adjust — edit this image's 構圖/配色/語氣 together（內含「專案」下拉可換資料夾）*/}
            {onAdjust && imageUrl && sorted.length > 0 && (
              <button onClick={() => onAdjust(imageUrl, sorted, libraryImageId)}
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border whitespace-nowrap bg-white border-gray-200 text-gray-600 hover:border-violet-300 hover:text-violet-600 transition-colors">
                <Pencil className="h-3.5 w-3.5" />調整
              </button>
            )}
            {/* Download the image */}
            {imageUrl && (
              <button onClick={handleDownload} title="下載圖片"
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border whitespace-nowrap bg-white border-gray-200 text-gray-600 hover:border-violet-300 hover:text-violet-600 transition-colors">
                <Download className="h-3.5 w-3.5" />下載
              </button>
            )}
            {canDelete && (
              <button
                onClick={() => {
                  if (confirmDel) handleHeaderDelete();
                  else { setConfirmDel(true); setTimeout(() => setConfirmDel(false), 3000); }
                }}
                className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border whitespace-nowrap transition-colors
                  ${confirmDel ? "bg-red-500 text-white border-red-500" : "bg-white border-gray-200 text-gray-500 hover:border-red-300 hover:text-red-500"}`}
                title={confirmDel ? "再按確認刪除" : (libraryImageId ? "刪除此生成圖" : "刪除此圖（連同其構圖/配色/語氣素材）")}>
                <Trash2 className="h-3.5 w-3.5" />
                {confirmDel ? "確認刪除" : "刪除"}
              </button>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors shrink-0">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5 grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Image */}
          <div>
            {imageUrl && (
              <ImageWithSize src={imageUrl} alt="preview" className="w-full max-h-[70vh] rounded-xl border object-contain bg-gray-50" />
            )}
            {/* 參考文案 intentionally hidden (not needed). AI Prompt is shown below. */}
            {prompt && (
              <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50 p-3">
                <div className="text-[11px] font-semibold text-violet-700 mb-1 flex items-center gap-1"><Sparkles className="h-3 w-3" />AI Prompt</div>
                <p className="text-[11px] font-mono text-gray-600 leading-relaxed break-all">{prompt}</p>
              </div>
            )}
            {effectiveRefImageUrl && (
              <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
                <div className="text-[11px] font-semibold text-gray-500 mb-2 flex items-center gap-1">
                  <Sparkles className="h-3 w-3" />參考風格圖
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={effectiveRefImageUrl} alt="參考風格圖" className="w-full max-h-64 object-contain rounded-lg border bg-white" />
                {effectiveRefImageUrl.startsWith("http") && (
                  <div className="mt-1.5 text-center">
                    <a href={effectiveRefImageUrl} target="_blank" rel="noopener noreferrer"
                      className="text-[10px] text-violet-500 hover:text-violet-700 break-all font-mono leading-relaxed underline">
                      {effectiveRefImageUrl}
                    </a>
                  </div>
                )}
              </div>
            )}
            {/* 「重新生成 / 調整」已搬上右上 header（避免被長 AI prompt 推到落底）*/}
          </div>

          {/* Linked components — 構圖/配色/語氣 + 背景（合成會直接用到，所以顯示出嚟）。 */}
          <div className="flex flex-col gap-3">
            {/* 「全部帶入生成圖片」已併入 header 嘅「重新生成」（同一動作：積木 → 生成台），避免兩粒紫掣重複。 */}
            {/* 來源產品圖：合成時用咗邊張（如有）。 */}
            {sourceImages && sourceImages.length > 0 && (
              <div className="rounded-xl border border-violet-200 bg-violet-50 p-3">
                <div className="text-[11px] font-semibold text-violet-700 mb-2 flex items-center gap-1">
                  <ImageIcon className="h-3 w-3" />來源產品圖（{sourceImages.length}）
                </div>
                <div className="flex flex-wrap gap-2">
                  {sourceImages.map((u) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={u} src={u} alt="source product" loading="lazy" decoding="async"
                      className="w-32 h-32 object-contain rounded-lg border bg-white" />
                  ))}
                </div>
              </div>
            )}
            {loading ? (
              <div className="text-sm text-gray-400 py-6 text-center">載入中…</div>
            ) : sorted.length === 0 && !bgComp ? (
              <div className="flex-1 min-h-[260px] flex flex-col items-center justify-center text-center py-8 px-4 rounded-xl border border-dashed border-gray-200 bg-gray-50">
                <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-violet-100 text-violet-500">
                  <Sparkles className="h-5 w-5" />
                </span>
                <div className="text-sm font-medium text-gray-600 mb-1">此圖尚未分析風格</div>
                <p className="text-xs text-gray-400 mb-4 max-w-[220px] leading-relaxed">分析後可取得構圖・配色・語氣，加入素材庫，之後生成時就能直接套用。</p>
                {imageUrl && onAnalyze && (
                  <button
                    onClick={() => onAnalyze(imageUrl, libraryImageId)}
                    className="inline-flex items-center gap-1.5 text-xs font-medium bg-violet-600 text-white px-3 py-1.5 rounded-lg hover:bg-violet-700 transition-colors"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    分析此圖加入素材
                  </button>
                )}
              </div>
            ) : (
              <>
                {/* 構圖/配色 + 背景 全部行同一個 ComponentRow（Plan B：統一 block，背景 teal 主題 + 大預覽圖）*/}
                {sorted.map((comp) => (
                  <ComponentRow
                    key={comp.id}
                    comp={comp}
                    injected={injectedIds?.has(comp.id) ?? false}
                    onInject={onInject}
                    onDelete={onDeleteComponents ? (id) => onDeleteComponents([id]) : undefined}
                  />
                ))}
                {bgComp && (
                  <ComponentRow
                    key={bgComp.id}
                    comp={bgComp}
                    injected={injectedIds?.has(bgComp.id) ?? false}
                    onInject={onInject}
                    onDelete={onDeleteComponents ? (id) => onDeleteComponents([id]) : undefined}
                  />
                )}
              </>
            )}
          </div>
        </div>
        {onUseAsActivityRef && imageUrl && (
          <div className="px-5 py-3 border-t shrink-0">
            <button onClick={() => onUseAsActivityRef(imageUrl, prompt ?? undefined)}
              className="w-full flex items-center justify-center gap-1.5 text-xs font-medium px-3 py-2 rounded-xl bg-violet-600 text-white hover:bg-violet-700 transition-colors">
              <Target className="h-3.5 w-3.5" />帶入活動圖生成
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ComponentRow({
  comp,
  injected,
  onInject,
  onDelete,
}: {
  comp: StyleComponent;
  injected: boolean;
  onInject: (comp: StyleComponent) => void;
  /** Delete this style component from the library (two-click confirm). */
  onDelete?: (id: string) => void;
}) {
  const meta = CATEGORY_META[comp.type];
  const [confirmDel, setConfirmDel] = useState(false);

  return (
    <div className={`rounded-xl border p-3 ${meta.bg} ${meta.border}`}>
      <div className="flex items-center justify-between mb-1.5">
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${meta.bg} ${meta.border} ${meta.color}`}>
          {meta.label}
        </span>
        <span className="text-xs font-semibold text-gray-800 truncate ml-2 flex-1 text-right">{comp.name}</span>
      </div>

      {/* Type-specific preview */}
      {comp.type === "COLOR_SCHEME" && <ColorCards colors={getColors(comp.data)} height="h-14" />}
      {comp.type === "COMPOSITION" && (
        <p className="text-xs text-gray-600 leading-relaxed">{(comp.data.description as string) ?? ""}</p>
      )}
      {comp.type === "COPY_TONE" && (
        <div className="flex flex-wrap gap-1">
          {((comp.data.toneLabels as string[]) ?? []).map((t, i) => (
            <span key={i} className="text-[11px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200">{t}</span>
          ))}
        </div>
      )}
      {comp.type === "BACKGROUND" && Boolean(comp.data.imageUrl || comp.previewUrl) && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={(comp.data.imageUrl as string) || comp.previewUrl!} alt="bg" loading="lazy" decoding="async" className="w-full aspect-square max-h-56 object-contain bg-gray-50 rounded-lg border" />
      )}

      {/* 小說明文字（aiPromptText）唔喺方塊度展示 */}

      {/* Actions */}
      <div className="flex items-center gap-1.5 mt-2">
        <button
          onClick={() => onInject(comp)}
          disabled={injected}
          className={`flex-1 flex items-center justify-center gap-1 text-[11px] font-medium py-1.5 rounded-lg border transition-colors
            ${injected
              ? "bg-gray-100 border-gray-200 text-gray-400"
              : "bg-white border-gray-200 text-gray-700 hover:border-gray-400"}`}
        >
          <ArrowRightCircle className="h-3 w-3" />
          {injected ? "已帶入" : "帶入產品圖生成"}
        </button>
        {onDelete && (
          <button
            onClick={() => {
              if (confirmDel) onDelete(comp.id);
              else { setConfirmDel(true); setTimeout(() => setConfirmDel(false), 3000); }
            }}
            className={`flex items-center justify-center gap-1 text-[11px] py-1.5 px-2.5 rounded-lg border transition-colors
              ${confirmDel ? "bg-red-500 text-white border-red-500" : "bg-white border-gray-200 text-gray-500 hover:border-red-300 hover:text-red-500"}`}
            title={confirmDel ? "再按確認刪除此素材" : "刪除此素材"}>
            <Trash2 className="h-3 w-3" />{confirmDel ? "確認" : ""}
          </button>
        )}
      </div>
    </div>
  );
}
