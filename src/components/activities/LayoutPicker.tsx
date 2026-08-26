"use client";
import { useState } from "react";
import { Check, BookmarkPlus, BookmarkCheck, BookmarkX, Loader2, Download } from "lucide-react";
import { getMultiLayout } from "@/types/multiLayout";

type Layout = {
  id: string;
  layoutType: string;
  imageUrl: string;
  copyText: string;
  textBurnedIn?: boolean;  // 文字是否已由 AI 燒入圖片
  savedToLibrary?: boolean; // 是否已加入素材庫
  effectLevel?: string | null; // 底圖模式（BASE-*）文字視覺處理：plain/effect/styled
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

// 下載檔名：主標題/文案（攞唔到就用版型代號）+ 版型 + 副檔名，比原本嘅
// 儲存亂碼檔名（時間戳+random）易讀。副檔名跟返圖片本身（URL 最後一截）。
function buildDownloadFilename(layout: Layout): string {
  const ext = (layout.imageUrl.split(".").pop() || "jpg").split("?")[0].slice(0, 5);
  const { headline, subtitle } = parseCopyDisplay(layout.copyText || "");
  const label = LAYOUT_META[layout.layoutType]?.label ?? layout.layoutType;
  const base = (headline || subtitle || layout.copyText || "").trim();
  const safe = base.replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, " ").trim().slice(0, 24);
  return `${safe ? `${safe}-${label}` : `活動圖-${label}`}.${ext}`;
}

type Props = {
  layouts: Layout[];
  selectedId?: string;
  activityId: string;
  clientId: string;
  onSelect: (layoutId: string) => void;
};

export function LayoutPicker({ layouts, selectedId, onSelect }: Props) {
  // 已加入素材庫的 layout id 集合（初始來自 props）
  const [saved, setSaved] = useState<Set<string>>(
    () => new Set((layouts ?? []).filter((l) => l.savedToLibrary).map((l) => l.id))
  );
  const [savingId, setSavingId] = useState<string | null>(null);

  // 下載該款生成圖。本機圖片存喺同源 /uploads，download attribute 直接生效；
  // 但 Vercel 上圖片存喺 *.public.blob.vercel-storage.com（跨域），瀏覽器會無視
  // download attribute 直接開新分頁顯示。所以改為 fetch 圖片轉做 blob:// URL
  // 先落 download attribute，兩種情況都真正觸發下載。
  const handleDownload = async (e: React.MouseEvent, layout: Layout) => {
    e.preventDefault();
    e.stopPropagation();
    const filename = buildDownloadFilename(layout);
    try {
      const res = await fetch(layout.imageUrl);
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
      window.open(layout.imageUrl, "_blank");
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

                {/* 卡底動作（方案 B）：下載（主，左）+ 加入素材庫（次，右）並排一行 */}
                <div className="mt-3 flex items-center gap-2">
                  <button
                    onClick={(e) => handleDownload(e, layout)}
                    className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium border border-gray-200 text-gray-600 hover:border-gray-400 hover:bg-gray-50 rounded-lg py-2 transition-all"
                  >
                    <Download className="h-3.5 w-3.5" />下載圖片
                  </button>
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
