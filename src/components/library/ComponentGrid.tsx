"use client";
/**
 * ComponentGrid (merged 風格組件 tab)
 * ──────────────────────────────────
 * Default view = brand image gallery (uploaded analyzed images + generated images).
 * Sub-tabs 全部 / 構圖 / 配色 / 語氣 / 背景 list style-component cards.
 *   • Click a gallery tile OR a component card → ImageDetailModal popup
 *     (image + its 構圖/配色/語氣/背景 + 帶入生成). No hover preview.
 *   • Card actions: 複製 Prompt / 帶入生成 / 刪除 (stopPropagation).
 */

import { useEffect, useState, useCallback, useImperativeHandle, forwardRef, useRef } from "react";
import {
  ArrowRightCircle, LayoutTemplate, Palette, MessageSquare,
  LayoutGrid, Plus, Trash2, Mountain,
  Paperclip, UserRound, Package, Sparkles, Search, SlidersHorizontal,
  CheckCircle2, Circle, X, ImagePlus, List,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { StyleComponent, ComponentCategory, PromptSlots, GalleryItem, ImageDetail } from "@/types/library";
import { CATEGORY_META, getColors, engineLabel, SHOW_SERIES_TEMPLATE } from "@/types/library";
import { ColorCards } from "./ColorCards";

type FilterTab = "GALLERY" | "ALL" | ComponentCategory;

const FILTER_TABS: { key: FilterTab; label: string; icon?: React.ReactNode }[] = [
  { key: "GALLERY", label: "圖庫", icon: <LayoutGrid className="h-3.5 w-3.5" /> },
  { key: "ALL", label: "全部" },
  { key: "COMPOSITION", label: "構圖", icon: <LayoutTemplate className="h-3.5 w-3.5" /> },
  { key: "COLOR_SCHEME", label: "配色", icon: <Palette className="h-3.5 w-3.5" /> },
  { key: "COPY_TONE", label: "語氣", icon: <MessageSquare className="h-3.5 w-3.5" /> },
  { key: "BACKGROUND", label: "背景", icon: <Mountain className="h-3.5 w-3.5" /> },
];

// ─── Gallery search / engine helpers (wireframe ⑥⑦) ─────────────────────────
function galleryItemEngine(item: GalleryItem): string | null {
  if (item.kind === "generated") return engineLabel(item.paramsJson);
  if (item.kind === "material" && item.mode) return engineLabel(JSON.stringify({ mode: item.mode }));
  return null;
}
function galleryItemText(item: GalleryItem): string {
  if (item.kind === "generated") return [item.subject, item.prompt, item.copyText].filter(Boolean).join(" ").toLowerCase();
  return [item.name, item.aiPromptText].filter(Boolean).join(" ").toLowerCase();
}

// ─── Component card (image-led, like SlotPicker) ─────────────────────────────
function ComponentCard({
  comp, isInjected, onInject, onDelete, onOpen,
}: {
  comp: StyleComponent;
  isInjected: boolean;
  onInject: (comp: StyleComponent) => void;
  onDelete: (id: string) => void;
  onOpen: (comp: StyleComponent) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const meta = CATEGORY_META[comp.type];
  const img = comp.previewUrl || (comp.data.imageUrl as string | undefined);

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirmDelete) onDelete(comp.id);
    else { setConfirmDelete(true); setTimeout(() => setConfirmDelete(false), 3000); }
  };

  return (
    <div
      onClick={() => onOpen(comp)}
      className={`relative rounded-xl border overflow-hidden transition-all duration-200 cursor-pointer select-none
        ${isInjected ? `${meta.border} ring-2 ring-offset-1 ring-current ${meta.color}` : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-md"}`}
    >
      {/* Image header with name overlay (falls back to a coloured header when no image) */}
      {img ? (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={img} alt={comp.name} loading="lazy" decoding="async" className={`w-full ${comp.type === "BACKGROUND" ? "aspect-square object-contain bg-gray-100" : "h-32 object-cover"}`} />
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 to-black/10" />
          <span className={`absolute top-2 left-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${meta.bg} ${meta.color} ${meta.border} border`}>{meta.label}</span>
          <div className="absolute top-2 left-2 right-2 mt-6">
            <div className="text-sm font-semibold text-white leading-snug drop-shadow line-clamp-2">{comp.name}</div>
          </div>
        </div>
      ) : (
        <div className={`px-3 pt-3 ${meta.bg}`}>
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${meta.color} ${meta.border} border bg-white`}>{meta.label}</span>
          <div className="text-sm font-semibold text-gray-800 leading-snug mt-1.5 line-clamp-2">{comp.name}</div>
        </div>
      )}

      {/* Content preview */}
      <div className="px-3 pt-2 pb-3">
        {comp.type === "COLOR_SCHEME" && (() => {
          const colors = getColors(comp.data);
          return colors.length ? <ColorCards colors={colors} height="h-12" /> : null;
        })()}
        {comp.type === "COMPOSITION" && (
          <p className="text-xs text-gray-600 leading-relaxed line-clamp-2">{(comp.data.description as string) ?? ""}</p>
        )}
        {comp.type === "COPY_TONE" && (
          <div className="flex flex-wrap gap-1">
            {((comp.data.toneLabels as string[]) ?? []).length
              ? (comp.data.toneLabels as string[]).map((t, i) => (
                  <span key={i} className="text-[11px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200">{t}</span>
                ))
              : <span className="text-xs text-gray-500">標準語氣</span>}
          </div>
        )}

        {/* Action bar: 帶入生成 + 刪除 (no pencil — edit via the image pop-up) */}
        <div className="flex items-center gap-1.5 mt-3">
          <button onClick={(e) => { e.stopPropagation(); onInject(comp); }} disabled={isInjected}
            className={`flex-1 flex items-center justify-center gap-1 text-[11px] font-medium py-1.5 rounded-lg transition-colors
              ${isInjected ? "bg-gray-100 border border-gray-200 text-gray-400" : `${meta.bg} border ${meta.border} ${meta.color} hover:opacity-80`}`}
            title="帶入生成台">
            <ArrowRightCircle className="h-3 w-3" />
            {isInjected ? "已帶入" : "帶入生成"}
          </button>
          <button onClick={handleDeleteClick}
            className={`flex items-center justify-center text-[11px] py-1.5 px-2 rounded-lg border transition-colors
              ${confirmDelete ? "bg-red-500 border-red-500 text-white" : "bg-white border-gray-200 text-gray-400 hover:border-red-300 hover:text-red-500"}`}
            title={confirmDelete ? "再按一次確認刪除" : "刪除"}>
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

// 尺寸 tag：對齊新尺寸設定（8 標準比例）。夠近標準比例就顯示比例（1:1 / 9:16…），否則 fallback 顯示像素。
const STD_RATIOS: [string, number][] = [
  ["1:1", 1], ["4:5", 0.8], ["3:4", 0.75], ["2:3", 2 / 3],
  ["9:16", 9 / 16], ["4:3", 4 / 3], ["3:2", 1.5], ["16:9", 16 / 9],
];
function sizeTag(w: number, h: number): string {
  if (!w || !h) return "";
  const r = w / h;
  let bestLabel = "", bestVal = 1, diff = Infinity;
  for (const [lbl, val] of STD_RATIOS) {
    const d = Math.abs(val - r);
    if (d < diff) { diff = d; bestLabel = lbl; bestVal = val; }
  }
  return diff / bestVal < 0.03 ? bestLabel : `${w}×${h}`;
}

// 卡片頁腳／清單列標題＋日期。
function itemTitle(item: GalleryItem): string {
  if (item.kind === "generated") return item.subject || "未命名素材";
  return item.name || "未命名素材";
}
function itemDateStr(item: GalleryItem): string {
  try { return new Date(item.createdAt).toLocaleDateString("zh-TW"); } catch { return ""; }
}

// ─── Gallery tile（grid 卡片 / list 列，共用同一套點擊·長按·多選·刪除邏輯） ──
function GalleryTile({ item, onOpen, onDelete, selectMode, selected, onToggleSelect, onLongPress, view = "grid" }: {
  item: GalleryItem;
  onOpen: (item: GalleryItem) => void;
  onDelete: (item: GalleryItem) => void;
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onLongPress: () => void;
  view?: "grid" | "list";
}) {
  const [confirmDel, setConfirmDel] = useState(false);
  const [dims, setDims] = useState("");
  const [retrying, setRetrying] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  // 長按（~0.5s）入多選：手機相簿式操作。pointer 事件兼容滑鼠 + 觸控。
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longFired = useRef(false);
  const startPress = () => {
    longFired.current = false;
    pressTimer.current = setTimeout(() => { longFired.current = true; onLongPress(); }, 500);
  };
  const cancelPress = () => { if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; } };

  // 生成中／生成失敗：呢個 tile 仲冇真正圖片——顯示佔位卡，唔開大圖 modal。
  const isGenerating = item.kind === "generated" && item.status === "GENERATING";
  const isFailed = item.kind === "generated" && item.status === "FAILED";

  const retry = async () => {
    if (item.kind !== "generated") return;
    setRetrying(true);
    try {
      let body: Record<string, unknown> = {};
      try { body = JSON.parse(item.paramsJson || "{}"); } catch { /* keep {} */ }
      await fetch("/api/library/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, batchId: item.batchId ?? undefined }),
      });
      await fetch(`/api/library/images/${item.libraryImageId}`, { method: "DELETE" });
      onDelete(item); // 觸發上層 refresh（已刪走舊嗰筆，新嗰筆會自動 poll 出嚟）
    } finally {
      setRetrying(false);
    }
  };

  const meta = FILTER_META[tileFilterKey(item)];
  const Icon = meta.Icon;
  const model = item.kind === "generated"
    ? engineLabel(item.paramsJson)
    : item.kind === "material"
      ? (item.mode ? (engineLabel(JSON.stringify({ mode: item.mode })) ?? "AI生成") : "AI生成")
      : null;
  const badge = (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${meta.badge}`}>
      <Icon className="h-3 w-3" />{meta.label}
    </span>
  );

  if (isGenerating || isFailed) {
    if (view === "list") {
      return (
        <div className={`relative flex items-center gap-4 p-3 border-b bg-gray-50 ${isFailed ? "border-red-100" : "border-gray-100"}`}>
          <div className="h-14 w-14 shrink-0 rounded-lg border border-gray-200 bg-white flex items-center justify-center">
            {isGenerating
              ? <div className="h-5 w-5 rounded-full border-2 border-gray-300 border-t-gray-500 animate-spin" />
              : <span className="text-red-400 text-lg">!</span>}
          </div>
          <div className="min-w-0 flex-1">
            {isGenerating
              ? <span className="text-xs text-gray-500">生成中…</span>
              : (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-red-500 truncate">{item.errorMessage || "生成失敗"}</span>
                  <button onClick={retry} disabled={retrying}
                    className="shrink-0 text-xs px-2 py-0.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors">
                    {retrying ? "重試中…" : "重試"}
                  </button>
                </div>
              )}
          </div>
          <button onClick={() => onDelete(item)}
            className="shrink-0 p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
            title="移除">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      );
    }
    return (
      <div className={`relative rounded-2xl overflow-hidden border bg-white flex flex-col items-center justify-center gap-2 aspect-square ${isFailed ? "border-red-200" : "border-gray-200"}`}>
        {isGenerating ? (
          <>
            <div className="h-6 w-6 rounded-full border-2 border-gray-300 border-t-gray-500 animate-spin" />
            <span className="text-xs text-gray-500">生成中…</span>
          </>
        ) : (
          <>
            <span className="text-xs text-red-500 px-3 text-center">{item.errorMessage || "生成失敗"}</span>
            <button onClick={retry} disabled={retrying}
              className="text-xs px-2.5 py-1 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors">
              {retrying ? "重試中…" : "重試"}
            </button>
          </>
        )}
        <button
          onClick={() => onDelete(item)}
          className="absolute top-2 right-2 p-1 rounded-lg text-[10px] bg-white/90 text-gray-500 hover:bg-red-50 hover:text-red-500 shadow transition-colors"
          title="移除">
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    );
  }

  const selectAffordance = selectMode ? (
    <button onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
      className="shrink-0 rounded-full bg-white shadow"
      title={selected ? "取消選取" : "選取"}>
      {selected
        ? <CheckCircle2 className="h-5 w-5 text-violet-600" />
        : <Circle className="h-5 w-5 text-gray-400" />}
    </button>
  ) : (
    <button
      onClick={(e) => {
        e.stopPropagation();
        if (confirmDel) { onDelete(item); }
        else { setConfirmDel(true); setTimeout(() => setConfirmDel(false), 3000); }
      }}
      className={`shrink-0 p-1.5 rounded-lg transition-colors
        ${confirmDel ? "bg-red-500 text-white" : "text-gray-400 hover:bg-red-50 hover:text-red-500"}`}
      title={confirmDel ? "再按確認刪除" : "刪除"}>
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );

  const pressHandlers = {
    onPointerDown: startPress,
    onPointerUp: cancelPress,
    onPointerLeave: cancelPress,
    onPointerCancel: cancelPress,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    onClick: () => {
      // 長按啱啱觸發過 → 食咗呢下 click，唔好開大圖
      if (longFired.current) { longFired.current = false; return; }
      if (selectMode) onToggleSelect(); else onOpen(item);
    },
  };

  if (view === "list") {
    return (
      <div className={`group flex items-center gap-4 p-4 transition-colors select-none ${selected ? "bg-violet-50/40 ring-2 ring-inset ring-violet-500" : "bg-white hover:bg-gray-50"}`}>
        <button {...pressHandlers} className="flex items-center gap-4 flex-1 min-w-0 text-left" style={{ touchAction: "manipulation" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.imageUrl} alt="brand" loading="lazy" decoding="async"
            onLoad={(e) => { const t = e.currentTarget; setDims((d) => d || sizeTag(t.naturalWidth, t.naturalHeight)); }}
            className="h-14 w-14 shrink-0 rounded-lg object-cover border border-gray-200 bg-gray-50" />
          {badge}
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-gray-800 truncate">{itemTitle(item)}</div>
            <div className="text-xs text-gray-400 truncate">{[itemDateStr(item), dims].filter(Boolean).join(" · ")}</div>
          </div>
        </button>
        {selectAffordance}
      </div>
    );
  }

  return (
    <div className={`group relative rounded-2xl overflow-hidden border bg-white transition-all select-none flex flex-col ${selected ? "border-violet-500 ring-1 ring-violet-500" : "border-gray-200 hover:shadow-md hover:border-gray-300"}`}>
      <div className="relative">
        <button
          {...pressHandlers}
          className="w-full text-left"
          style={{ touchAction: "manipulation" }}>
          {/* Show the FULL image (no crop) — object-contain, letterboxed in a square box.
              淡入而唔係一出現就即刻硬切（尤其生成中 → 完成嗰刻剛好由佔位卡換成呢個 tile）。 */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.imageUrl} alt="brand" loading="lazy" decoding="async"
            ref={(el) => { if (el?.complete) setImgLoaded(true); }}
            onLoad={(e) => { const t = e.currentTarget; setDims((d) => d || sizeTag(t.naturalWidth, t.naturalHeight)); setImgLoaded(true); }}
            className={`w-full aspect-square object-contain bg-gray-50 transition-opacity duration-500 ${imgLoaded ? "opacity-100" : "opacity-0"}`} />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors pointer-events-none" />
        </button>
        {dims && (
          <span className="absolute bottom-2 right-2 text-[10px] font-medium bg-black/55 text-white px-1.5 py-0.5 rounded shadow pointer-events-none">{dims}</span>
        )}
        {/* pastel 分類標籤；AI 生成圖另加 model 深色小 pill。 */}
        <div className="absolute top-2 left-2 flex items-center gap-1 pointer-events-none">
          <span className={`shadow-sm ${meta.badge} inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap`}>
            <Icon className="h-3 w-3" />{meta.label}
          </span>
          {model && (
            <span className="flex items-center gap-0.5 text-[10px] font-medium bg-black/55 text-white px-1.5 py-0.5 rounded-full shadow whitespace-nowrap">
              <Sparkles className="h-2.5 w-2.5" />{model}
            </span>
          )}
        </div>
        {/* 選取模式：右上角勾選圈（取代逐張刪除掣） */}
        {selectMode ? (
          <button onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
            className="absolute top-2 right-2 rounded-full bg-white/90 shadow"
            title={selected ? "取消選取" : "選取"}>
            {selected
              ? <CheckCircle2 className="h-5 w-5 text-violet-600" />
              : <Circle className="h-5 w-5 text-gray-400" />}
          </button>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (confirmDel) { onDelete(item); }
              else { setConfirmDel(true); setTimeout(() => setConfirmDel(false), 3000); }
            }}
            className={`absolute top-2 right-2 p-1 rounded-lg text-[10px] shadow transition-all opacity-0 group-hover:opacity-100
              ${confirmDel ? "bg-red-500 text-white" : "bg-white/90 text-gray-500 hover:bg-red-50 hover:text-red-500"}`}
            title={confirmDel ? "再按確認刪除" : "刪除"}>
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>
      {/* 白色頁腳：標題 + 日期·尺寸 */}
      <div className="p-3">
        <div className="text-sm font-semibold text-gray-800 line-clamp-1">{itemTitle(item)}</div>
        <div className="text-xs text-gray-400 mt-0.5">{[itemDateStr(item), dims].filter(Boolean).join(" · ")}</div>
      </div>
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────
export type ComponentGridHandle = { refresh: () => void };

type GalleryFilter = "ALL" | "uploaded" | "material" | "person" | "illustration" | "product";

// 用 lucide icon（取代 emoji）。分類 chip 已統一用同一套紫色（active/inactive），
// 呢度淨留返 badge（每類 pastel 底色，貼喺卡片/列上做類型標籤）+ cls（生成中 tile 舊式深色 pill，保留兼容）。
const FILTER_META: Record<GalleryFilter, { label: string; Icon: LucideIcon; cls: string; badge: string }> = {
  ALL:          { label: "全部",     Icon: LayoutGrid, cls: "bg-gray-700",  badge: "bg-gray-100 text-gray-600" },
  uploaded:     { label: "參考圖",   Icon: Paperclip,  cls: "bg-blue-500",  badge: "bg-blue-100 text-blue-600" },
  material:     { label: "背景",     Icon: Mountain,   cls: "bg-teal-600",  badge: "bg-emerald-100 text-emerald-700" },
  person:       { label: "人像",     Icon: UserRound,  cls: "bg-rose-500",  badge: "bg-violet-100 text-violet-700" },
  illustration: { label: "插畫",     Icon: Palette,    cls: "bg-amber-500", badge: "bg-rose-100 text-rose-600" },
  product:      { label: "產品成圖", Icon: Package,    cls: "bg-[#C9A227]", badge: "bg-gray-100 text-gray-600" },
};

/** #4 系列圖成圖（mode=paste-template）—— 報告期間隱藏。 */
function isSeriesTemplate(item: GalleryItem): boolean {
  if (item.kind !== "generated") return false;
  try { return JSON.parse(item.paramsJson ?? "{}").mode === "paste-template"; } catch { return false; }
}

/** Generated tiles split by genType: person / illustration / reference(=參考圖,活動成品) / 其餘=product。 */
function generatedKind(item: GalleryItem): "person" | "illustration" | "product" | "uploaded" | null {
  if (item.kind !== "generated") return null;
  try {
    const g = JSON.parse(item.paramsJson ?? "{}").genType;
    if (g === "person") return "person";
    if (g === "illustration") return "illustration";
    if (g === "reference") return "uploaded"; // 活動圖儲存 = 參考圖（wireframe ⑦）
    return "product";
  } catch { return "product"; }
}

/** 每格對應嘅 filter 類型 key（決定類型標籤色/icon）。 */
function tileFilterKey(item: GalleryItem): GalleryFilter {
  if (item.kind === "uploaded") return "uploaded";
  if (item.kind === "material") return "material";
  return generatedKind(item) ?? "product";
}

/** Does a gallery item match the active filter pill? */
function matchesGalleryFilter(item: GalleryItem, f: GalleryFilter): boolean {
  if (f === "ALL") return true;
  if (f === "uploaded") return item.kind === "uploaded" || generatedKind(item) === "uploaded";
  if (f === "material") return item.kind === "material";
  return generatedKind(item) === f; // person | illustration | product
}

type Props = {
  clientId: string | null;
  unassigned?: boolean;   // 未分組視圖：clientId 為 null 嘅素材
  injectedSlots: PromptSlots;
  onInject: (comp: StyleComponent) => void;
  onOpenQuickAdd?: () => void;
  onOpenGenerateAsset?: () => void;
  onOpenImage: (detail: ImageDetail) => void;
  reloadKey?: number;
  clients?: { id: string; name: string }[];  // 批次「移到客戶 / 設公用」用
  /** 生成 popup 開住嗰陣（AddAssetModal 等）：暫停背景刷新，
   * 唔好喺用戶專注揀選項嗰陣悄悄重排/插入新 tile 令背景「跳動」。Popup 關咗即刻補刷新一次。 */
  paused?: boolean;
};

export const ComponentGrid = forwardRef<ComponentGridHandle, Props>(function ComponentGrid(
  { clientId, unassigned = false, injectedSlots, onInject, onOpenQuickAdd, onOpenGenerateAsset, onOpenImage, reloadKey = 0, clients = [], paused = false }, ref,
) {
  const [components, setComponents] = useState<StyleComponent[]>([]);
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [galleryFilter, setGalleryFilter] = useState<GalleryFilter>("ALL");
  // wireframe ⑥⑦：圖庫搜尋 / 引擎 filter / 排序（日期 range 拎走，改輕量排序）
  const [gallerySearch, setGallerySearch] = useState("");
  const [galleryEngine, setGalleryEngine] = useState<string>("ALL");
  const [gallerySort, setGallerySort] = useState<"newest" | "oldest">("newest");
  const [view, setView] = useState<"grid" | "list">("grid");

  // Internal tick for imperative refresh (via ref.refresh())
  const [localTick, setLocalTick] = useState(0);

  // Fetch helper stored in ref so delete handlers always call the latest version
  const doFetch = useCallback(() => {
    const cq = clientId ? `?clientId=${clientId}` : unassigned ? `?unassigned=1` : "";
    const bust = `${cq ? "&" : "?"}_t=${Date.now()}`;
    return Promise.all([
      fetch(`/api/components${cq}${bust}`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/library/gallery${cq}${bust}`, { cache: "no-store" }).then((r) => r.json()),
    ]);
  }, [clientId, unassigned]);

  const applyFetched = useCallback(([comps, gal]: [unknown, unknown]) => {
    setComponents(Array.isArray(comps) ? comps : []);
    // 報告期間隱藏 #4 系列圖成圖（SHOW_SERIES_TEMPLATE=false）。
    const galArr: GalleryItem[] = Array.isArray(gal) ? gal : [];
    setGallery(SHOW_SERIES_TEMPLATE ? galArr : galArr.filter((g) => !isSeriesTemplate(g)));
  }, []);

  // 首次載入／換品牌（clientId、reloadKey 變）：可以顯示「載入中」全版佔位——呢個係真係新畫面。
  useEffect(() => {
    let active = true;
    setLoading(true);
    doFetch()
      .then((res) => { if (active) applyFetched(res); })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, reloadKey]);

  // 靜默背景刷新（生成中 poll / popup onStarted / onGenerated 觸發嘅 localTick）：
  // 唔可以再 setLoading(true) —— 之前呢度同上面共用一個 effect，令每次刷新（包括生成中
  // 期間每 3 秒一次嘅 poll）都會將成個畫廊 swap 去「載入中…」文字再切返嚟，睇落成個背景
  // 不斷閃/跳（用戶回報：popup 開住生成、或者關 popup 嗰刻，背景會閃爍/彈返成頁載入中）。
  // 淨係靜默更新 data，個別 tile（生成中 spinner → 真圖）先變，其他已載入嘅圖唔會重新渲染。
  //
  // paused（生成 popup 開住）嗰陣連呢個靜默更新都要停：用戶開住 popup 專注揀選項嗰陣，
  // 背景插入新 tile／重排都算係一種「跳動」（唔止之前嗰種 loading 閃爍）。等 popup 關咗
  // （paused 由 true 變 false）先一次過追返最新 —— 依賴 [paused] 令呢個時機自動觸發。
  useEffect(() => {
    if (localTick === 0) return; // 首次（同上面 effect 撞）唔重複 fetch
    if (paused) return;
    let active = true;
    doFetch().then((res) => { if (active) applyFetched(res); }).catch(() => {});
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localTick, paused]);

  // Expose imperative refresh for cases where parent needs it
  useImperativeHandle(ref, () => ({ refresh: () => setLocalTick((t) => t + 1) }), []);

  // 有圖仲喺「生成中」→ 定期 poll 到冚唪唥完成（同 Activity list 嗰套一致）。
  // 呢個 poll 唔靠邊個 popup 開住——就算 popup 已經關咗，返呢頁都會自動見到最新進度。
  const hasInFlight = gallery.some((g) => g.kind === "generated" && g.status === "GENERATING");
  useEffect(() => {
    if (!hasInFlight) return;
    // setInterval（唔係 setTimeout）：淨用 setTimeout 嗰陣，因為 dependency [hasInFlight]
    // 喺持續生成中嘅時候值一直係 true（冇變過），effect 唔會再重新排程，poll 咗一次
    // 之後就永遠停咗——變成「生成完都仲顯示生成中，要手動 refresh 先見到結果」嘅 bug。
    const t = setInterval(() => setLocalTick((v) => v + 1), 3000);
    return () => clearInterval(t);
  }, [hasInFlight]);

  const handleDelete = useCallback(async (id: string) => {
    await fetch(`/api/components/${id}`, { method: "DELETE" });
    setComponents((prev) => prev.filter((c) => c.id !== id));
    setLocalTick((t) => t + 1);
  }, []);

  const handleDeleteGalleryItem = useCallback(async (item: GalleryItem) => {
    if (item.kind === "generated") {
      await fetch(`/api/library/images/${item.libraryImageId}`, { method: "DELETE" });
    } else {
      await Promise.all(item.componentIds.map((id) => fetch(`/api/components/${id}`, { method: "DELETE" })));
    }
    setLocalTick((t) => t + 1);
  }, []);

  // ── 多選 / 批次操作（移到客戶 · 設公用 · 批次刪除）─────────────────────────
  const [selectMode, setSelectMode] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [confirmBatchDelete, setConfirmBatchDelete] = useState(false);

  // 「生成中」嗰陣 imageUrl 一律係 ""（未有真圖），如果同一批生成多於一張
  // （例如人像預設一次生成 2 張），淨用 kind-imageUrl 做 key 會撞晒（兩個都係
  // "generated-"），令 React reconcile 錯 tile——其中一張生成完，另一張留喺
  // 舊嘅「生成中」畫面唔會自己變返，要 reload 成頁先見到（用戶實測撞過）。
  // generated kind 有獨立、由生成嗰刻已經確定嘅 libraryImageId，用嚟做 key 先穩陣。
  const itemKey = (item: GalleryItem) => item.kind === "generated" ? `generated-${item.libraryImageId}` : `${item.kind}-${item.imageUrl}`;
  const toggleSelect = useCallback((key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);
  const exitSelect = useCallback(() => {
    setSelectMode(false); setSelectedKeys(new Set()); setConfirmBatchDelete(false);
  }, []);

  // 將一個 gallery item 對應到底層 API：generated → images/[id]；uploaded/material → 逐個 component。
  const applyToItem = useCallback((item: GalleryItem, body: { clientId: string | null } | "delete") => {
    const opts = body === "delete"
      ? { method: "DELETE" as const }
      : { method: "PATCH" as const, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
    if (item.kind === "generated") {
      return fetch(`/api/library/images/${item.libraryImageId}`, opts);
    }
    return Promise.all(item.componentIds.map((id) => fetch(`/api/components/${id}`, opts)));
  }, []);

  const injectedIds = new Set(Object.values(injectedSlots).filter(Boolean).map((c) => c!.id));

  const openFromCard = (comp: StyleComponent) => {
    if (comp.type === "BACKGROUND") {
      onOpenImage({ imageUrl: comp.previewUrl ?? null, prompt: comp.aiPromptText || null, presetComponents: [comp], regenerateParams: JSON.stringify({ genType: "material" }) });
    } else if (comp.previewUrl) {
      onOpenImage({ imageUrl: comp.previewUrl });
    } else {
      onOpenImage({ imageUrl: null, presetComponents: [comp] });
    }
  };
  const openFromGallery = (item: GalleryItem) => {
    if (item.kind === "generated") {
      let slotComps: StyleComponent[] = [];
      try {
        const p = JSON.parse(item.paramsJson ?? "{}");
        // 引用模型：圖只係「指住」一個真實 block（靠 id）。顯示時即場查返 live `components` 嗰行，
        // 令圖 detail 同「選擇積木 picker」永遠一致、永遠現行版本。
        // 安全網：真實行俾人刪咗（查唔返）先 fallback 用 paramsJson 凝低嗰份快照，唔會白版。
        slotComps = (Object.values(p.slots ?? {}).filter(Boolean) as StyleComponent[])
          .map((snap) => components.find((c) => c.id === snap.id) ?? snap);
      } catch { /* ignore */ }
      onOpenImage({ imageUrl: item.imageUrl, presetComponents: slotComps, copyText: item.copyText, subject: item.subject, regenerateParams: item.paramsJson, prompt: item.prompt, libraryImageId: item.libraryImageId });
    } else if (item.kind === "material") {
      onOpenImage({ imageUrl: item.imageUrl, prompt: item.aiPromptText || null, regenerateParams: JSON.stringify({ genType: "material" }) });
    } else {
      onOpenImage({ imageUrl: item.imageUrl });
    }
  };

  // wireframe ⑥⑦：圖庫經 分類pill → 搜尋 → 引擎 → 排序 過濾
  const galleryEngines = Array.from(new Set(gallery.map(galleryItemEngine).filter((e): e is string => !!e))).sort();
  const visibleGallery = gallery
    .filter((item) => matchesGalleryFilter(item, galleryFilter))
    .filter((item) => !gallerySearch.trim() || galleryItemText(item).includes(gallerySearch.trim().toLowerCase()))
    .filter((item) => galleryEngine === "ALL" || galleryItemEngine(item) === galleryEngine)
    .sort((a, b) => gallerySort === "newest"
      ? b.createdAt.localeCompare(a.createdAt)
      : a.createdAt.localeCompare(b.createdAt));

  // 選取項（用 key 對返 gallery）+ 全選狀態 + 批次執行
  const selectedItems = gallery.filter((it) => selectedKeys.has(itemKey(it)));
  const allVisibleSelected = visibleGallery.length > 0 && visibleGallery.every((it) => selectedKeys.has(itemKey(it)));
  const toggleSelectAll = () =>
    setSelectedKeys(allVisibleSelected ? new Set() : new Set(visibleGallery.map(itemKey)));

  async function runBatch(body: { clientId: string | null } | "delete") {
    if (selectedItems.length === 0 || busy) return;
    setBusy(true);
    try {
      await Promise.all(selectedItems.map((it) => applyToItem(it, body)));
      setLocalTick((t) => t + 1);
      exitSelect();
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-5">

      {/* 動作掣（上傳參考圖 / 新增產品素材圖片）已搬上 BrandWorkspaceHeader 右上角 */}
      {loading ? (
        <div className="text-gray-400 text-sm py-8 text-center">載入中…</div>
      ) : (
        // ── Gallery view（唯一視圖：頂部分段控制已移除，積木 via 圖片詳情帶入） ──
        <>
          {/* 搜尋 / 引擎 / 排序（wireframe ⑦：日期 range 拎走，改輕量排序） */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex-1 min-w-[180px] flex items-center gap-2 bg-white border border-gray-300 rounded-xl px-3.5 py-2">
              <Search className="h-4 w-4 text-gray-400 shrink-0" />
              <input
                value={gallerySearch}
                onChange={(e) => setGallerySearch(e.target.value)}
                placeholder="搜尋標題、內文或 Prompt…"
                className="flex-1 text-sm bg-transparent outline-none placeholder:text-gray-400"
              />
            </div>
            {galleryEngines.length > 0 && (
              <div className="relative shrink-0">
                <select
                  value={galleryEngine}
                  onChange={(e) => setGalleryEngine(e.target.value)}
                  className="appearance-none text-xs bg-white border border-gray-300 rounded-xl pl-3.5 pr-8 py-2 outline-none cursor-pointer"
                >
                  <option value="ALL">引擎：全部</option>
                  {galleryEngines.map((e) => <option key={e} value={e}>{e}</option>)}
                </select>
                <svg className="absolute right-3 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            )}
            <button
              onClick={() => setGallerySort((s) => (s === "newest" ? "oldest" : "newest"))}
              className="flex items-center gap-1 text-xs font-medium bg-white text-violet-600 border border-violet-300 rounded-full px-3 py-1.5 hover:bg-violet-50 transition-colors shrink-0"
            >
              <SlidersHorizontal className="h-3 w-3" />排序：{gallerySort === "newest" ? "最新先" : "最舊先"}
            </button>
          </div>

          {/* 批次操作工具列（長按入多選後出現）：全選 / 移到客戶 / 未分類 / 刪除 / 完成 */}
          {selectMode && (
            <div className="sticky top-2 z-20 flex items-center gap-2 flex-wrap bg-violet-50 border border-violet-200 rounded-xl px-3 py-2 shadow-sm">
              <button onClick={toggleSelectAll}
                className="text-xs font-medium text-violet-700 border border-violet-300 bg-white rounded-full px-3 py-1.5 hover:bg-violet-100 transition-colors">
                {allVisibleSelected ? "取消全選" : "全選"}
              </button>
              <span className="text-xs text-violet-700 font-medium">已選 {selectedItems.length} 項</span>
              <div className="flex-1" />
              {clients.length > 0 && (
                <select disabled={busy || selectedItems.length === 0} defaultValue=""
                  onChange={(e) => { const v = e.target.value; if (!v) return; runBatch({ clientId: v === "__unassigned__" ? null : v }); e.currentTarget.value = ""; }}
                  title="把選取的素材移到客戶 / 移入未分類素材（從畫面隱藏）"
                  className="flex items-center gap-1 text-xs bg-white border border-violet-300 text-violet-700 rounded-full px-3 py-1.5 outline-none cursor-pointer disabled:opacity-50">
                  <option value="">移到…</option>
                  <option value="__unassigned__">未分類素材（從畫面隱藏）</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
              <button disabled={busy || selectedItems.length === 0}
                onClick={() => { if (confirmBatchDelete) runBatch("delete"); else { setConfirmBatchDelete(true); setTimeout(() => setConfirmBatchDelete(false), 3000); } }}
                className={`flex items-center gap-1 text-xs font-medium rounded-full px-3 py-1.5 border transition-colors disabled:opacity-50
                  ${confirmBatchDelete ? "bg-red-500 text-white border-red-500" : "bg-white text-red-600 border-red-300 hover:bg-red-50"}`}>
                <Trash2 className="h-3 w-3" />{confirmBatchDelete ? `確認刪除 ${selectedItems.length} 項？` : "刪除選取"}
              </button>
              <button onClick={exitSelect}
                className="flex items-center gap-1 text-xs font-medium text-gray-600 border border-gray-300 bg-white rounded-full px-3 py-1.5 hover:bg-gray-100 transition-colors">
                <X className="h-3 w-3" />完成
              </button>
            </div>
          )}

          {/* Gallery filter pills + 上傳參考圖（釘死尾巴，方案 D：唔理揀邊個 filter 都顯示，單擊直接開，唔動 gallery 陣列） */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {(["ALL", "uploaded", "material", "person", "illustration", "product"] as GalleryFilter[]).map((f) => {
              const meta = FILTER_META[f];
              const Icon = meta.Icon;
              const cnt = gallery.filter((g) => matchesGalleryFilter(g, f)).length;
              const active = galleryFilter === f;
              // 空類別不再淡化/停用（會被誤會成壞掉）；一律可點，點了下面顯示空狀態即可。
              return (
                <button key={f} onClick={() => setGalleryFilter(f)}
                  className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-full border transition-colors ${
                    active ? "bg-violet-600 text-white border-violet-600" : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"}`}>
                  <Icon className="h-3 w-3" />{meta.label} <span className="opacity-60">{cnt}</span>
                </button>
              );
            })}
            {onOpenQuickAdd && (
              <button
                onClick={onOpenQuickAdd}
                aria-label="上傳參考圖"
                className="group relative flex items-center justify-center h-[26px] w-[26px] rounded-full border border-dashed border-violet-400 bg-violet-50 text-violet-600 hover:bg-violet-100 transition-colors shrink-0"
              >
                <ImagePlus className="h-3.5 w-3.5" />
                <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-[11px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                  上傳參考圖
                </span>
              </button>
            )}
          </div>
          {!selectMode && gallery.length > 0 && (
            <p className="text-[11px] text-gray-400">提示：長按任何圖片即可進入多選，批次移到客戶 / 移入未分類 / 刪除。</p>
          )}
          {/* 所有素材 + 已選取 + 格狀/清單切換 */}
          {gallery.length > 0 && (
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">所有素材</h2>
              <div className="flex items-center gap-3">
                {selectMode && <span className="text-xs text-gray-400">已選取 {selectedItems.length} 個素材</span>}
                <div className="flex items-center gap-0.5 rounded-lg border border-gray-200 p-0.5">
                  <button type="button" onClick={() => setView("grid")} title="格狀檢視"
                    className={`p-1.5 rounded-md transition-colors ${view === "grid" ? "bg-violet-100 text-violet-600" : "text-gray-400 hover:text-gray-600"}`}>
                    <LayoutGrid className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => setView("list")} title="清單檢視"
                    className={`p-1.5 rounded-md transition-colors ${view === "list" ? "bg-violet-100 text-violet-600" : "text-gray-400 hover:text-gray-600"}`}>
                    <List className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          )}
          {gallery.length === 0 ? (
            <EmptyState onOpenQuickAdd={onOpenQuickAdd}
              text={clientId ? "此客戶還沒有圖片" : "還沒有任何圖片"} hint="上傳圖片分析，或在「生成圖片」分頁產生新圖" />
          ) : visibleGallery.length === 0 ? (
            <div className="text-center py-16 text-gray-400 text-sm">找不到符合條件的圖片</div>
          ) : (
            <div className={view === "list" ? "rounded-2xl border border-gray-200 bg-white overflow-hidden divide-y divide-gray-100" : "grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3"}>
              {visibleGallery.map((item) => (
                <GalleryTile key={itemKey(item)} item={item} view={view}
                  onOpen={openFromGallery} onDelete={handleDeleteGalleryItem}
                  selectMode={selectMode} selected={selectedKeys.has(itemKey(item))}
                  onToggleSelect={() => toggleSelect(itemKey(item))}
                  onLongPress={() => { setSelectMode(true); setSelectedKeys((prev) => new Set(prev).add(itemKey(item))); }} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
});

function EmptyState({ onOpenQuickAdd, text, hint }: {
  onOpenQuickAdd?: () => void; text: string; hint: string;
}) {
  return (
    <div className="text-center py-20 text-gray-400">
      <Package className="h-10 w-10 mb-3 text-gray-300 mx-auto" />
      <div className="text-sm">{text}</div>
      <div className="text-xs mt-1 mb-5">{hint}</div>
      {onOpenQuickAdd && (
        <button onClick={onOpenQuickAdd}
          className="inline-flex items-center gap-1.5 text-sm font-medium bg-gray-900 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors">
          <Plus className="h-4 w-4" />手動加入素材
        </button>
      )}
    </div>
  );
}
