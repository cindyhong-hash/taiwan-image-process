"use client";
import { useState } from "react";
import { Check, BookmarkPlus, BookmarkCheck, BookmarkX, Loader2, Download } from "lucide-react";
import { getMultiLayout } from "@/types/multiLayout";
import { buildDownloadFilename as buildFilename } from "@/lib/download-filename";

type Layout = {
  id: string;
  layoutType: string;
  imageUrl: string;
  copyText: string;
  textBurnedIn?: boolean;  // 文字是否已由 AI 燒入圖片
  savedToLibrary?: boolean; // 是否已加入素材庫
  effectLevel?: string | null; // 底圖模式（BASE-*）文字視覺處理：plain/effect/styled
  cellImageUrls?: string; // [MULTI] 多圖拼版：各格子圖 URL（JSON string），imageUrl 淨係已合併嘅拼圖
};

const LAYOUT_META: Record<string, { label: string }> = {
  A: { label: "產品置中" },
  B: { label: "視覺強烈" },
  C: { label: "氣氛感" },
};

// 底圖模式（BASE-1/2/3）真正嘅差異：填咗必放文字（而家已經必填）之後，3 款主標
// 題其實一定一樣（刻意設計，避免用戶填咗但得一款用到），唯一必然唔同嘅係文字
// 視覺處理程度——用返呢個嚟做標籤，唔再假裝分得出「邊款鎖文字／邊款 AI 發揮」。
// 「文字效果」呢個分類詞中性，「有效果」定「冇效果」都啱用，唔似「特效字/設計」
// 咁同「簡約/純文字」自相矛盾。
const EFFECT_LEVEL_LABEL: Record<string, string> = {
  plain:  "簡約",
  effect: "特效",
  styled: "風格",
};
const BASE_LETTER: Record<string, string> = {
  "BASE-1": "A",
  "BASE-2": "B",
  "BASE-3": "C",
};

// 解析 Claude 原始文案，移除「主標題：」等標籤；多圖仲有「【A 導購版】」呢類生成
// 款式前綴（見 generate-multi.ts 嘅 set.label），一齊攞埋。
function parseCopyDisplay(raw: string) {
  const headline = raw.match(/(?:主標題|標題)[：:]\s*(.+)/)?.[1]?.trim() ?? "";
  const subtitle = raw.match(/(?:副標題|副標)[：:]\s*(.+)/)?.[1]?.trim() ?? "";
  const cta      = raw.match(/CTA[：:]\s*(.+)/)?.[1]?.trim() ?? "";
  const variant  = raw.match(/^【(.+?)】/)?.[1]?.trim() ?? "";
  return { headline, subtitle, cta, variant };
}

type Props = {
  layouts: Layout[];
  selectedId?: string;
  activityId: string;
  clientId: string;
  clientName?: string | null;
  onSelect: (layoutId: string) => void;
};

export function LayoutPicker({ layouts, selectedId, clientName, onSelect }: Props) {
  // 已加入素材庫的 layout id 集合（初始來自 props）
  const [saved, setSaved] = useState<Set<string>>(
    () => new Set((layouts ?? []).filter((l) => l.savedToLibrary).map((l) => l.id))
  );
  const [savingId, setSavingId] = useState<string | null>(null);
  // 下載檔名用嘅原始 px 尺寸，key=layout.id（GeneratedLayout 冇存 WxH，靠 <img onLoad> 攞）。
  const [dims, setDims] = useState<Record<string, { w: number; h: number }>>({});

  // 下載該款生成圖。本機圖片存喺同源 /uploads，download attribute 直接生效；
  // 但 Vercel 上圖片存喺 *.public.blob.vercel-storage.com（跨域），瀏覽器會無視
  // download attribute 直接開新分頁顯示。所以改為 fetch 圖片轉做 blob:// URL
  // 先落 download attribute，兩種情況都真正觸發下載。
  const downloadOne = async (url: string, filename: string) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
    } catch {
      // fetch 失敗（例如 CORS 被擋）就 fallback 返開新分頁，起碼睇到張圖
      window.open(url, "_blank");
    }
  };

  // 檔名：{品牌名}-{類型}-{寬x高}-{可讀標題}.ext（見 src/lib/download-filename.ts），
  // 缺邊截就跳過，同 ImageDetailModal 等其他生成類型一致嘅命名格式。
  const handleDownload = async (e: React.MouseEvent, layout: Layout) => {
    e.preventDefault();
    e.stopPropagation();
    const { headline, subtitle } = parseCopyDisplay(layout.copyText || "");
    const label = LAYOUT_META[layout.layoutType]?.label ?? layout.layoutType;
    const base = (headline || subtitle || layout.copyText || "").trim();
    const d = dims[layout.id];
    const filename = buildFilename({
      url: layout.imageUrl, label, readableText: base, brand: clientName,
      size: d ? `${d.w}x${d.h}` : null,
    });
    await downloadOne(layout.imageUrl, filename);
  };

  // [MULTI] 逐張下載每格原圖（唔係已合併嘅拼圖）。瀏覽器會擋連續觸發嘅多個下載，
  // 要逐張加少少延遲，唔可以用 Promise.all 一次過起晒。個別格仔冇獨立 WxH 記錄，
  // 淨係用返個合併圖嘅尺寸做近似值（唔會嚴重錯——同一批生成通常同一輸出尺寸）。
  const handleDownloadCells = async (e: React.MouseEvent, layout: Layout) => {
    e.preventDefault();
    e.stopPropagation();
    let cells: string[] = [];
    try { cells = JSON.parse(layout.cellImageUrls || "[]"); } catch { cells = []; }
    if (cells.length === 0) return;
    const { headline, subtitle } = parseCopyDisplay(layout.copyText || "");
    const base = (headline || subtitle || layout.copyText || "").trim();
    const d = dims[layout.id];
    for (let i = 0; i < cells.length; i++) {
      const filename = buildFilename({
        url: cells[i], label: `多圖${String(i + 1).padStart(2, "0")}`, readableText: base, brand: clientName,
        size: d ? `${d.w}x${d.h}` : null,
      });
      await downloadOne(cells[i], filename);
      if (i < cells.length - 1) await new Promise((r) => setTimeout(r, 300));
    }
  };

  const handleToggleLibrary = async (e: React.MouseEvent, layoutId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (savingId) return;
    const isSaved = saved.has(layoutId);
    const next = !isSaved;
    setSavingId(layoutId);
    try {
      await fetch(`/api/layouts/${layoutId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ savedToLibrary: next }),
      });
      setSaved((prev) => {
        const s = new Set(prev);
        if (next) s.add(layoutId);
        else s.delete(layoutId);
        return s;
      });
    } catch {
      alert(next ? "加入素材庫失敗，請稍後再試" : "撤回失敗，請稍後再試");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="font-medium text-gray-700">選擇一款版型</h2>
      <div className="grid grid-cols-3 gap-4 items-start">
        {(layouts ?? []).map((layout) => {
          const singleMeta = LAYOUT_META[layout.layoutType];
          const multiMeta = singleMeta ? undefined : getMultiLayout(layout.layoutType);
          const isMulti = !!multiMeta;
          const isBaseVariant = layout.layoutType.startsWith("BASE");
          let cellCount = 0;
          if (isMulti && layout.cellImageUrls) {
            try { cellCount = (JSON.parse(layout.cellImageUrls) as string[]).length; } catch { cellCount = 0; }
          }
          const effectLabel = layout.effectLevel ? EFFECT_LEVEL_LABEL[layout.effectLevel] : undefined;
          const isSelected = layout.id === selectedId;
          const { headline, subtitle, cta, variant } = parseCopyDisplay(layout.copyText);

          return (
            <div
              key={layout.id}
              onClick={() => onSelect(layout.id)}
              className={`cursor-pointer rounded-xl border-2 overflow-hidden transition-all ${
                isSelected ? "border-violet-500 shadow-lg" : "border-gray-200 hover:border-gray-400"
              }`}
            >
              <div className="relative">
                <img
                  src={layout.imageUrl}
                  alt={`Layout ${layout.layoutType}`}
                  onLoad={(e) => {
                    const t = e.currentTarget;
                    setDims((prev) => prev[layout.id] ? prev : { ...prev, [layout.id]: { w: t.naturalWidth, h: t.naturalHeight } });
                  }}
                  className="block mx-auto w-auto max-w-full max-h-[calc(100vh-330px)] object-contain bg-gray-50"
                />
                {isSelected && (
                  <div className="absolute top-2 right-2 bg-violet-600 text-white rounded-full p-1">
                    <Check className="h-3 w-3" />
                  </div>
                )}
              </div>

              <div className="p-3">
                <div className="font-medium text-sm">
                  {isMulti ? (
                    <>{multiMeta?.label ?? layout.layoutType}{variant && ` · ${variant}`}</>
                  ) : isBaseVariant ? (
                    <>文字效果 {BASE_LETTER[layout.layoutType] ?? layout.layoutType}{effectLabel ? ` — ${effectLabel}` : ""}</>
                  ) : (
                    <>設計 {layout.layoutType} — {singleMeta?.label}</>
                  )}
                </div>

                {layout.textBurnedIn ? (
                  // 文字已燒入圖片 → 顯示乾淨的文案摘要（不顯示原始標籤）
                  <div className="mt-2 space-y-0.5">
                    {headline && (
                      <div className="text-xs font-semibold text-gray-800 line-clamp-1">{headline}</div>
                    )}
                    {subtitle && (
                      <div className="text-xs text-gray-500 line-clamp-2">{subtitle}</div>
                    )}
                    {cta && <div className="text-xs text-gray-400">→ {cta}</div>}
                  </div>
                ) : (
                  // 一般模式 → 顯示完整 copy（去掉標籤後）
                  <div className="text-xs text-gray-600 mt-2 space-y-0.5">
                    {headline && <div className="font-medium">{headline}</div>}
                    {subtitle && <div className="line-clamp-2">{subtitle}</div>}
                    {cta && <div className="text-gray-400">→ {cta}</div>}
                  </div>
                )}

                {/* 多圖：拼合圖 + 逐張原圖分開兩粒掣，唔再淨得已合併嗰張先落得到 */}
                {cellCount > 0 && (
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      onClick={(e) => handleDownload(e, layout)}
                      className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium border border-gray-200 text-gray-600 hover:border-gray-400 hover:bg-gray-50 rounded-lg py-2 transition-all"
                    >
                      <Download className="h-3.5 w-3.5" />下載合併圖
                    </button>
                    <button
                      onClick={(e) => handleDownloadCells(e, layout)}
                      title="逐張下載每格原圖（非合併版）"
                      className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium border border-gray-200 text-gray-600 hover:border-gray-400 hover:bg-gray-50 rounded-lg py-2 transition-all"
                    >
                      <Download className="h-3.5 w-3.5" />下載全部（{cellCount}張）
                    </button>
                  </div>
                )}

                {/* 卡底動作（方案 B）：下載（主，左）+ 加入素材庫（次，右）並排一行 */}
                <div className="mt-3 flex items-center gap-2">
                  {cellCount === 0 && (
                    <button
                      onClick={(e) => handleDownload(e, layout)}
                      className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium border border-gray-200 text-gray-600 hover:border-gray-400 hover:bg-gray-50 rounded-lg py-2 transition-all"
                    >
                      <Download className="h-3.5 w-3.5" />下載圖片
                    </button>
                  )}
                  {saved.has(layout.id) ? (
                    <button
                      onClick={(e) => handleToggleLibrary(e, layout.id)}
                      disabled={savingId === layout.id}
                      title="已加入素材庫（按可撤回）"
                      className="group/lib flex-1 flex items-center justify-center gap-1.5 text-xs font-medium border border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-red-200 hover:bg-red-50 hover:text-red-600 rounded-lg py-2 transition-all disabled:opacity-50"
                    >
                      {savingId === layout.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <>
                          <BookmarkCheck className="h-3.5 w-3.5 group-hover/lib:hidden" />
                          <BookmarkX className="h-3.5 w-3.5 hidden group-hover/lib:block" />
                        </>
                      )}
                      <span className="group-hover/lib:hidden">已加入</span>
                      <span className="hidden group-hover/lib:inline">撤回</span>
                    </button>
                  ) : (
                    <button
                      onClick={(e) => handleToggleLibrary(e, layout.id)}
                      disabled={savingId === layout.id}
                      className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium border border-gray-200 text-gray-600 hover:border-gray-400 hover:bg-gray-50 rounded-lg py-2 transition-all disabled:opacity-50"
                    >
                      {savingId === layout.id
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <BookmarkPlus className="h-3.5 w-3.5" />}
                      {savingId === layout.id ? "加入中…" : "加入素材庫"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
}
