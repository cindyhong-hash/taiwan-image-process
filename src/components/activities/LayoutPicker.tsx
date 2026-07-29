"use client";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Check, Flame, BookmarkPlus, BookmarkCheck, BookmarkX, Loader2 } from "lucide-react";

type Layout = {
  id: string;
  layoutType: string;
  imageUrl: string;
  copyText: string;
  textBurnedIn?: boolean;  // 文字是否已由 AI 燒入圖片
  savedToLibrary?: boolean; // 是否已加入素材庫
};

const LAYOUT_META: Record<string, { label: string; description: string }> = {
  A: { label: "產品置中", description: "清晰展示" },
  B: { label: "視覺強烈", description: "設計感強" },
  C: { label: "氣氛感", description: "品牌形象" },
  // 底圖模式 3 款：位置拉開 + 唔同字效
  "BASE-TOP": { label: "品牌漸層", description: "品牌色漸層 · 頂部" },
  "BASE-MID": { label: "柔和陰影", description: "白字陰影 · 左上" },
  "BASE-BOT": { label: "描邊白字", description: "白字描邊 · 底部" },
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
  onSelect: (layoutId: string) => void;
};

export function LayoutPicker({ layouts, selectedId, activityId, clientId, onSelect }: Props) {
  // 已加入素材庫的 layout id 集合（初始來自 props）
  const [saved, setSaved] = useState<Set<string>>(
    () => new Set((layouts ?? []).filter((l) => l.savedToLibrary).map((l) => l.id))
  );
  const [savingId, setSavingId] = useState<string | null>(null);

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
      <div className="grid grid-cols-3 gap-4">
        {(layouts ?? []).map((layout) => {
          const meta = LAYOUT_META[layout.layoutType];
          const isSelected = layout.id === selectedId;
          const { headline, subtitle, cta } = parseCopyDisplay(layout.copyText);

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
                  className="w-full h-auto object-contain bg-gray-50"
                />
                {isSelected && (
                  <div className="absolute top-2 right-2 bg-black text-white rounded-full p-1">
                    <Check className="h-3 w-3" />
                  </div>
                )}
                {/* 左上角標籤群：文字鎖定/AI 發揮 + 文字已燒入 */}
                <div className="absolute top-2 left-2 flex flex-col items-start gap-1">
                  {layout.layoutType.startsWith("BASE") ? (
                    <span className="flex items-center gap-1 rounded-full bg-violet-500 px-2 py-0.5 text-[10px] font-medium text-white shadow">
                      🖼️ 底圖
                    </span>
                  ) : layout.layoutType === "A" ? (
                    <span className="flex items-center gap-1 rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-medium text-white shadow">
                      🔒 文字鎖定
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 rounded-full bg-indigo-500 px-2 py-0.5 text-[10px] font-medium text-white shadow">
                      ✨ AI 發揮
                    </span>
                  )}
                  {layout.textBurnedIn && (
                    <span className="flex items-center gap-1 bg-orange-500/90 text-white text-[10px] px-2 py-0.5 rounded-full">
                      <Flame className="h-2.5 w-2.5" />
                      文字已燒入
                    </span>
                  )}
                </div>
              </div>

              <div className="p-3">
                <div className="font-medium text-sm">
                  Layout {layout.layoutType} — {meta?.label}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">{meta?.description}</div>

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

                {/* 加入素材庫（可切換、可撤回）*/}
                {saved.has(layout.id) ? (
                  <button
                    onClick={(e) => handleToggleLibrary(e, layout.id)}
                    disabled={savingId === layout.id}
                    className="group/lib mt-3 w-full flex items-center justify-center gap-1.5 text-xs font-medium border border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-red-200 hover:bg-red-50 hover:text-red-600 rounded-lg py-2 transition-all disabled:opacity-50"
                  >
                    {savingId === layout.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <>
                        <BookmarkCheck className="h-3.5 w-3.5 group-hover/lib:hidden" />
                        <BookmarkX className="h-3.5 w-3.5 hidden group-hover/lib:block" />
                      </>
                    )}
                    <span className="group-hover/lib:hidden">已加入素材庫</span>
                    <span className="hidden group-hover/lib:inline">撤回</span>
                  </button>
                ) : (
                  <button
                    onClick={(e) => handleToggleLibrary(e, layout.id)}
                    disabled={savingId === layout.id}
                    className="mt-3 w-full flex items-center justify-center gap-1.5 text-xs font-medium border border-gray-200 text-gray-600 hover:border-gray-400 hover:bg-gray-50 rounded-lg py-2 transition-all disabled:opacity-50"
                  >
                    {savingId === layout.id
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <BookmarkPlus className="h-3.5 w-3.5" />}
                    {savingId === layout.id ? "加入中…" : "加入素材庫"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {selectedId && (
        <div className="flex justify-end">
          <Link href={`/clients/${clientId}/activities/${activityId}/editor`}>
            <Button>進入微調畫布 →</Button>
          </Link>
        </div>
      )}
    </div>
  );
}
