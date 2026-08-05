"use client";
import { useState } from "react";
import { Check, Flame, BookmarkPlus, BookmarkCheck, BookmarkX, Loader2, Download } from "lucide-react";

type Layout = {
  id: string;
  layoutType: string;
  imageUrl: string;
  copyText: string;
  textBurnedIn?: boolean;  // 文字是否已由 AI 燒入圖片
  savedToLibrary?: boolean; // 是否已加入素材庫
};

const LAYOUT_META: Record<string, { label: string }> = {
  A: { label: "產品置中" },
  B: { label: "視覺強烈" },
  C: { label: "氣氛感" },
  // 底圖模式 3 款：AI 特效字（款1 鎖必放文字，款2/3 AI 發揮）
  "BASE-1": { label: "特效字 · 主文案" },
  "BASE-2": { label: "特效字 · AI 發揮①" },
  "BASE-3": { label: "特效字 · AI 發揮②" },
};

// 解析 Claude 原始文案，移除「主標題：」等標籤
function parseCopyDisplay(raw: string) {
  const headline = raw.match(/(?:主標題|標題)[：:]\s*(.+)/)?.[1]?.trim() ?? "";
  const subtitle = raw.match(/(?:副標題|副標)[：:]\s*(.+)/)?.[1]?.trim() ?? "";
  const cta      = raw.match(/CTA[：:]\s*(.+)/)?.[1]?.trim() ?? "";
  return { headline, subtitle, cta };
}

type Props = {
  layouts: Layout[];
  selectedId?: string;
  activityId: string;
  clientId: string;
  /** 用戶有冇填「必放文字」——冇填時款1 其實都係 AI 生成，唔應該標「文字鎖定」。 */
  hasLockedText?: boolean;
  onSelect: (layoutId: string) => void;
};

export function LayoutPicker({ layouts, selectedId, hasLockedText, onSelect }: Props) {
  // 已加入素材庫的 layout id 集合（初始來自 props）
  const [saved, setSaved] = useState<Set<string>>(
    () => new Set((layouts ?? []).filter((l) => l.savedToLibrary).map((l) => l.id))
  );
  const [savingId, setSavingId] = useState<string | null>(null);

  // 直接下載該款生成圖（同源 /uploads → download attribute 生效；唔行壞咗嘅 /api/export）
  const handleDownload = (e: React.MouseEvent, layout: Layout) => {
    e.preventDefault();
    e.stopPropagation();
    const a = document.createElement("a");
    a.href = layout.imageUrl;
    a.download = layout.imageUrl.split("/").pop() || `layout-${layout.layoutType}.jpg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
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
          const meta = LAYOUT_META[layout.layoutType];
          const isSelected = layout.id === selectedId;
          const { headline, subtitle, cta } = parseCopyDisplay(layout.copyText);
          // 款1（A / BASE-1）只喺用戶真係有填必放文字先算「鎖定」；否則同款2/3 一樣係 AI 自由發揮
          const isLocked = (layout.layoutType === "A" || layout.layoutType === "BASE-1") && !!hasLockedText;

          return (
            <div
              key={layout.id}
              onClick={() => onSelect(layout.id)}
              className={`cursor-pointer rounded-xl border-2 overflow-hidden transition-all ${
                isSelected ? "border-black shadow-lg" : "border-gray-200 hover:border-gray-400"
              }`}
            >
              <div className="relative">
                <img
                  src={layout.imageUrl}
                  alt={`Layout ${layout.layoutType}`}
                  className="block mx-auto w-auto max-w-full max-h-[calc(100vh-330px)] object-contain bg-gray-50"
                />
                {isSelected && (
                  <div className="absolute top-2 right-2 bg-black text-white rounded-full p-1">
                    <Check className="h-3 w-3" />
                  </div>
                )}
              </div>

              <div className="p-3">
                {/* badge 放卡底（唔再 overlay 圖上，避免遮住圖上文字）。
                    兩個維度分開顯示：① 圖片來源（底圖）② 文案來源（款1 鎖用戶文字 / 款2·3 AI 發揮）③ 文字燒入狀態。 */}
                <div className="flex flex-wrap items-center gap-1 mb-1.5">
                  {/* ① 底圖模式標記（BASE-* 都係用戶原圖做背景）*/}
                  {layout.layoutType.startsWith("BASE") && (
                    <span className="flex items-center gap-1 rounded-full bg-violet-500 px-2 py-0.5 text-[10px] font-medium text-white">🖼️ 底圖</span>
                  )}
                  {/* ② 文案來源：款1（A / BASE-1）且用戶有填必放文字先叫「文字鎖定」；否則都係 AI 發揮 */}
                  {isLocked ? (
                    <span className="flex items-center gap-1 rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-medium text-white">🔒 文字鎖定</span>
                  ) : (
                    <span className="flex items-center gap-1 rounded-full bg-indigo-500 px-2 py-0.5 text-[10px] font-medium text-white">✨ AI 發揮</span>
                  )}
                  {/* ③ 文字已由 AI 燒入圖片像素（底圖 typography）*/}
                  {layout.textBurnedIn && (
                    <span className="flex items-center gap-1 bg-rose-500/90 text-white text-[10px] px-2 py-0.5 rounded-full"><Flame className="h-2.5 w-2.5" />文字已燒入</span>
                  )}
                </div>
                <div className="font-medium text-sm">
                  Layout {layout.layoutType} — {meta?.label}
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
                    {cta && (
                      <div className="inline-block text-[10px] bg-yellow-400 text-gray-800 font-bold px-2 py-0.5 rounded-full mt-1">
                        {cta}
                      </div>
                    )}
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
