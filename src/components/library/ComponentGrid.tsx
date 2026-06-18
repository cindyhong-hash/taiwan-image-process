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

import { useEffect, useState, useCallback, useImperativeHandle, forwardRef } from "react";
import {
  ArrowRightCircle, LayoutTemplate, Palette, MessageSquare,
  Image as ImageIcon, LayoutGrid, Plus, Trash2, Wand2,
  Paperclip, UserRound, Package, Sparkles,
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
  { key: "BACKGROUND", label: "背景", icon: <ImageIcon className="h-3.5 w-3.5" /> },
];

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

// ─── Gallery tile ────────────────────────────────────────────────────────────
function GalleryTile({ item, onOpen, onDelete }: {
  item: GalleryItem;
  onOpen: (item: GalleryItem) => void;
  onDelete: (item: GalleryItem) => void;
}) {
  const [confirmDel, setConfirmDel] = useState(false);
  const [dims, setDims] = useState("");
  return (
    <div className="group relative rounded-xl overflow-hidden border border-gray-200 bg-gray-50 hover:shadow-md hover:border-gray-300 transition-all">
      <button onClick={() => onOpen(item)} className="w-full text-left">
        {/* Show the FULL image (no crop) — object-contain, letterboxed in a square box. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.imageUrl} alt="brand" loading="lazy" decoding="async"
          onLoad={(e) => { const t = e.currentTarget; setDims((d) => d || `${t.naturalWidth}×${t.naturalHeight}`); }}
          className="w-full aspect-square object-contain" />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors pointer-events-none" />
      </button>
      {dims && (
        <span className="absolute bottom-2 right-2 text-[10px] font-medium bg-black/55 text-white px-1.5 py-0.5 rounded shadow pointer-events-none">{dims}</span>
      )}
      {/* 統一標籤：類型 icon pill；AI 生成圖另加 model 標（背景亦標 AI生成，一致呈現）。 */}
      {(() => {
        const meta = FILTER_META[tileFilterKey(item)];
        const Icon = meta.Icon;
        const model = item.kind === "generated"
          ? engineLabel(item.paramsJson)
          : item.kind === "material"
            ? (item.mode ? (engineLabel(JSON.stringify({ mode: item.mode })) ?? "AI生成") : "AI生成")
            : null;
        return (
          <div className="absolute top-2 left-2 flex items-center gap-1 pointer-events-none">
            <span className={`flex items-center gap-1 text-[10px] font-semibold ${meta.cls} text-white px-1.5 py-0.5 rounded-full shadow whitespace-nowrap`}>
              <Icon className="h-2.5 w-2.5" />{meta.label}
            </span>
            {model && (
              <span className="flex items-center gap-0.5 text-[10px] font-medium bg-black/55 text-white px-1.5 py-0.5 rounded-full shadow whitespace-nowrap">
                <Sparkles className="h-2.5 w-2.5" />{model}
              </span>
            )}
          </div>
        );
      })()}
      {/* Delete button */}
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
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────
export type ComponentGridHandle = { refresh: () => void };

type GalleryFilter = "ALL" | "uploaded" | "material" | "person" | "illustration" | "product";

// 用 lucide icon（取代 emoji）+ 每類一個底色（pill 用 cls，filter 選中用 activeCls）。
const FILTER_META: Record<GalleryFilter, { label: string; Icon: LucideIcon; cls: string; activeCls: string }> = {
  ALL:          { label: "全部",     Icon: LayoutGrid, cls: "bg-gray-700",   activeCls: "bg-violet-600 text-white border-violet-600" },
  uploaded:     { label: "參考圖",   Icon: Paperclip,  cls: "bg-blue-500",   activeCls: "bg-blue-500 text-white border-blue-500" },
  material:     { label: "背景",     Icon: ImageIcon,  cls: "bg-teal-600",   activeCls: "bg-teal-600 text-white border-teal-600" },
  person:       { label: "人像",     Icon: UserRound,  cls: "bg-rose-500",   activeCls: "bg-rose-500 text-white border-rose-500" },
  illustration: { label: "插畫",     Icon: Palette,    cls: "bg-amber-500",  activeCls: "bg-amber-500 text-white border-amber-500" },
  product:      { label: "產品成圖", Icon: Package,    cls: "bg-violet-600", activeCls: "bg-violet-600 text-white border-violet-600" },
};

/** #4 系列圖成圖（mode=paste-template）—— 報告期間隱藏。 */
function isSeriesTemplate(item: GalleryItem): boolean {
  if (item.kind !== "generated") return false;
  try { return JSON.parse(item.paramsJson ?? "{}").mode === "paste-template"; } catch { return false; }
}

/** Generated tiles split by genType (stored in paramsJson): person / illustration / 其餘=product。 */
function generatedKind(item: GalleryItem): "person" | "illustration" | "product" | null {
  if (item.kind !== "generated") return null;
  try {
    const g = JSON.parse(item.paramsJson ?? "{}").genType;
    return g === "person" ? "person" : g === "illustration" ? "illustration" : "product";
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
  if (f === "uploaded") return item.kind === "uploaded";
  if (f === "material") return item.kind === "material";
  return generatedKind(item) === f; // person | illustration | product
}

type Props = {
  clientId: string | null;
  injectedSlots: PromptSlots;
  onInject: (comp: StyleComponent) => void;
  onOpenQuickAdd?: () => void;
  onOpenGenerateAsset?: () => void;
  onOpenImage: (detail: ImageDetail) => void;
  reloadKey?: number;
};

export const ComponentGrid = forwardRef<ComponentGridHandle, Props>(function ComponentGrid(
  { clientId, injectedSlots, onInject, onOpenQuickAdd, onOpenGenerateAsset, onOpenImage, reloadKey = 0 }, ref,
) {
  const [components, setComponents] = useState<StyleComponent[]>([]);
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<FilterTab>("GALLERY");
  const [galleryFilter, setGalleryFilter] = useState<GalleryFilter>("ALL");

  // Internal tick for imperative refresh (via ref.refresh())
  const [localTick, setLocalTick] = useState(0);

  // Fetch helper stored in ref so delete handlers always call the latest version
  const doFetch = useCallback(() => {
    const cq = clientId ? `?clientId=${clientId}` : "";
    const bust = `${cq ? "&" : "?"}_t=${Date.now()}`;
    return Promise.all([
      fetch(`/api/components${cq}${bust}`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/library/gallery${cq}${bust}`, { cache: "no-store" }).then((r) => r.json()),
    ]);
  }, [clientId]);

  // Primary data effect — runs whenever clientId, reloadKey (from parent), or localTick changes
  useEffect(() => {
    let active = true;
    setLoading(true);
    doFetch()
      .then(([comps, gal]) => {
        if (!active) return;
        setComponents(Array.isArray(comps) ? comps : []);
        // 報告期間隱藏 #4 系列圖成圖（SHOW_SERIES_TEMPLATE=false）。
        const galArr: GalleryItem[] = Array.isArray(gal) ? gal : [];
        setGallery(SHOW_SERIES_TEMPLATE ? galArr : galArr.filter((g) => !isSeriesTemplate(g)));
      })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [clientId, reloadKey, localTick, doFetch]);

  // Expose imperative refresh for cases where parent needs it
  useImperativeHandle(ref, () => ({ refresh: () => setLocalTick((t) => t + 1) }), []);

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
        slotComps = Object.values(p.slots ?? {}).filter(Boolean) as StyleComponent[];
      } catch { /* ignore */ }
      onOpenImage({ imageUrl: item.imageUrl, presetComponents: slotComps, copyText: item.copyText, subject: item.subject, regenerateParams: item.paramsJson, prompt: item.prompt, libraryImageId: item.libraryImageId });
    } else if (item.kind === "material") {
      onOpenImage({ imageUrl: item.imageUrl, prompt: item.aiPromptText || null, regenerateParams: JSON.stringify({ genType: "material" }) });
    } else {
      onOpenImage({ imageUrl: item.imageUrl });
    }
  };

  // 背景 is now an image-only asset — hide legacy text-only backgrounds (no image) everywhere.
  const visibleComponents = components.filter((c) => c.type !== "BACKGROUND" || c.previewUrl || c.data?.imageUrl);
  const filtered = activeTab === "ALL" || activeTab === "GALLERY"
    ? visibleComponents
    : visibleComponents.filter((c) => c.type === activeTab);

  const grouped = filtered.reduce<Record<string, StyleComponent[]>>((acc, c) => {
    acc[c.type] = [...(acc[c.type] ?? []), c];
    return acc;
  }, {});

  const counts = (key: FilterTab) =>
    key === "GALLERY" ? gallery.length
    : key === "ALL" ? visibleComponents.length
    : visibleComponents.filter((c) => c.type === key).length;

  return (
    <div className="space-y-5">

      {/* Top bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit flex-wrap">
          {FILTER_TABS.map((t) => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === t.key ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"}`}>
              {t.icon}
              {t.label}
              <span className={`text-[10px] ${activeTab === t.key ? "text-gray-400" : "text-gray-300"}`}>{counts(t.key)}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* 背景生成 only shows in 圖庫 / 全部 / 背景 sub-tabs */}
          {onOpenGenerateAsset && (activeTab === "GALLERY" || activeTab === "ALL" || activeTab === "BACKGROUND") && (
            <button onClick={onOpenGenerateAsset}
              className="flex items-center gap-1.5 text-xs font-medium bg-violet-600 text-white px-3 py-2 rounded-lg hover:bg-violet-700 transition-colors">
              <Wand2 className="h-3.5 w-3.5" />素材生成
            </button>
          )}
          {onOpenQuickAdd && (
            <button onClick={onOpenQuickAdd}
              className="flex items-center gap-1.5 text-xs font-medium bg-gray-900 text-white px-3 py-2 rounded-lg hover:bg-gray-700 transition-colors">
              <Plus className="h-3.5 w-3.5" />上傳參考圖
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="text-gray-400 text-sm py-8 text-center">載入中…</div>
      ) : activeTab === "GALLERY" ? (
        // ── Gallery view ──
        <>
          {/* Gallery filter pills */}
          <div className="flex gap-1.5 flex-wrap">
            {(["ALL", "uploaded", "material", "person", "illustration", "product"] as GalleryFilter[]).map((f) => {
              const meta = FILTER_META[f];
              const Icon = meta.Icon;
              const cnt = gallery.filter((g) => matchesGalleryFilter(g, f)).length;
              const active = galleryFilter === f;
              return (
                <button key={f} onClick={() => setGalleryFilter(f)}
                  className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition-colors ${active ? meta.activeCls : "bg-white text-gray-500 border-gray-200 hover:border-gray-400"}`}>
                  <Icon className="h-3 w-3" />{meta.label} <span className="opacity-60">{cnt}</span>
                </button>
              );
            })}
          </div>
          {gallery.length === 0 ? (
            <EmptyState onOpenQuickAdd={onOpenQuickAdd}
              text={clientId ? "此客戶還沒有圖片" : "還沒有任何圖片"} hint="上傳圖片分析，或在「生成圖片」分頁產生新圖" />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
              {gallery
                .filter((item) => matchesGalleryFilter(item, galleryFilter))
                .map((item) => (
                  <GalleryTile key={`${item.kind}-${item.imageUrl}`} item={item}
                    onOpen={openFromGallery} onDelete={handleDeleteGalleryItem} />
                ))}
            </div>
          )}
        </>
      ) : components.length === 0 ? (
        <EmptyState onOpenQuickAdd={onOpenQuickAdd}
          text={clientId ? "此客戶還沒有風格組件" : "還沒有任何風格組件"} hint="生成活動或上傳圖片後，會自動提取風格組件" />
      ) : (
        // ── Component cards by group ──
        <div className="space-y-6">
          {Object.entries(grouped).map(([type, items]) => {
            const meta = CATEGORY_META[type as ComponentCategory];
            return (
              <div key={type}>
                <h3 className={`text-xs font-semibold mb-3 flex items-center gap-1.5 ${meta.color}`}>
                  <span className={`inline-block w-2 h-2 rounded-full ${meta.bg} border ${meta.border}`} />
                  {meta.label}
                  <span className="text-gray-400 font-normal">({items.length})</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {items.map((comp) => (
                    <ComponentCard key={comp.id} comp={comp} isInjected={injectedIds.has(comp.id)}
                      onInject={onInject} onDelete={handleDelete} onOpen={openFromCard} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
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
