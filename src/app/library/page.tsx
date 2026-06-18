"use client";
/**
 * LibraryPage  (/library)
 * Tabs: 生成圖片 (PromptComposer + 圖片紀錄) ／ 風格組件 (品牌圖庫 + 子分頁)
 * The ImageDetailModal is shared here so both tabs (gallery + 圖片紀錄) open it,
 * and inject/edit/regenerate are coordinated at page level.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { FolderOpen, Images, Layers, Check, ChevronLeft } from "lucide-react";
import { AssetGrid } from "@/components/library/AssetGrid";
import { ComponentGrid, type ComponentGridHandle } from "@/components/library/ComponentGrid";
import { PromptComposer } from "@/components/library/PromptComposer";
import { QuickAddModal } from "@/components/library/QuickAddModal";
import { GenerateAssetModal } from "@/components/library/GenerateAssetModal";
import { ImageDetailModal } from "@/components/library/ImageDetailModal";
import type { StyleComponent, PromptSlots, ImageDetail } from "@/types/library";
import { CATEGORY_META } from "@/types/library";

type Client = { id: string; name: string; _count: { activities: number } };
type Tab = "assets" | "components";
type Prefill = { subject?: string; notes?: string; useFlags?: Record<string, boolean> };
type GenerateAssetInit = { description: string; refImageUrl: string; type: "background" | "person" | "illustration"; engine: "flux" | "nano" };

export default function LibraryPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("components");
  const [slots, setSlots] = useState<PromptSlots>({ layout: null, color: null, tone: null, background: null });
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showGenerateAsset, setShowGenerateAsset] = useState(false);
  const [generateAssetInit, setGenerateAssetInit] = useState<GenerateAssetInit | null>(null);
  const [quickAddImageUrl, setQuickAddImageUrl] = useState<string | null>(null);
  const [editComponent, setEditComponent] = useState<StyleComponent | null>(null);
  const [prefillComponents, setPrefillComponents] = useState<StyleComponent[] | null>(null);
  // When adjusting a GENERATED image, save edits back into its paramsJson (not StyleComponent rows).
  const [adjustLibraryImageId, setAdjustLibraryImageId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [componentReloadKey, setComponentReloadKey] = useState(0);
  const [detail, setDetail] = useState<ImageDetail | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<Prefill>({});
  const [prefillNonce, setPrefillNonce] = useState(0);
  const componentGridRef = useRef<ComponentGridHandle>(null);
  const prevShowQuickAdd = useRef(false);

  useEffect(() => {
    fetch("/api/clients")
      .then((r) => r.json())
      .then((data: Client[]) => {
        setClients(data);
        // Default to「全部」(selectedClientId stays null) — no auto-select of first client.
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 2200);
  }, []);

  // Inject a component into its slot — NO tab jump, just a toast (#3).
  const handleInject = useCallback((comp: StyleComponent) => {
    const slotKey = CATEGORY_META[comp.type].slot as keyof PromptSlots;
    setSlots((prev) => ({ ...prev, [slotKey]: comp }));
    showToast(`已帶入${CATEGORY_META[comp.type].label}：${comp.name}`);
  }, [showToast]);

  // Popup「全部帶入生成圖片」→ 一次過將構圖/配色/語氣/背景塞入對應 slot，並切去生成圖片 tab。
  const handleInjectAll = useCallback((comps: StyleComponent[]) => {
    if (comps.length === 0) return;
    setSlots((prev) => {
      const next = { ...prev };
      comps.forEach((c) => { next[CATEGORY_META[c.type].slot as keyof PromptSlots] = c; });
      return next;
    });
    setTab("assets");
    setDetail(null);
    showToast(`已帶入 ${comps.length} 個積木到生成圖片`);
  }, [showToast]);

  const handleClearSlot = useCallback((key: keyof PromptSlots) => {
    setSlots((prev) => ({ ...prev, [key]: null }));
  }, []);

  // Popup「重新生成/調整」→ 關閉 popup，切到風格組件 tab，帶預填資料打開素材生成。
  const handleOpenGenerateAsset = useCallback((init: GenerateAssetInit) => {
    setDetail(null);
    setGenerateAssetInit(init);
    setTab("components");
    setShowGenerateAsset(true);
  }, []);

  // Popup「分析此圖加入素材」→ open QuickAdd prefilled with the image
  const handleAnalyze = useCallback((url: string) => {
    setEditComponent(null);
    setQuickAddImageUrl(url);
    setShowQuickAdd(true);
    setDetail(null);
  }, []);

  // Popup「調整」→ image-based edit: open QuickAdd prefilled with ALL of the image's components.
  // libraryImageId is set only for generated images → save rewrites that image's paramsJson.slots.
  const handleAdjustImage = useCallback((url: string, comps: StyleComponent[], libraryImageId?: string) => {
    setQuickAddImageUrl(url);
    setEditComponent(null);
    setPrefillComponents(comps);
    setAdjustLibraryImageId(libraryImageId ?? null);
    setShowQuickAdd(true);
    setDetail(null);
  }, []);

  // Popup「重新生成/調整」→ load params into composer (#5)
  const handleRegenerate = useCallback((d: ImageDetail) => {
    try {
      const p = JSON.parse(d.regenerateParams || "{}");
      if (p.slots) {
        setSlots({
          layout: p.slots.layout ?? null,
          color: p.slots.color ?? null,
          tone: p.slots.tone ?? null,
          background: p.slots.background ?? null,
        });
      }
      const useFlags: Record<string, boolean> = {};
      (p.palette ?? []).forEach((c: { hex: string; use?: boolean }) => { useFlags[c.hex] = c.use !== false; });
      setPrefill({ subject: d.subject ?? "", notes: p.notes ?? "", useFlags });
      setPrefillNonce((n) => n + 1);
    } catch { /* ignore parse errors */ }
    setTab("assets");
    setDetail(null);
    showToast("已載入原參數，可調整後重新生成");
  }, [showToast]);

  // When QuickAdd modal closes (was open → now closed), always refresh the component grid.
  // This is a belt-and-suspenders approach alongside the reloadKey prop, ensuring we never
  // miss a refresh even if React batches the state updates in an unexpected order.
  useEffect(() => {
    if (prevShowQuickAdd.current && !showQuickAdd) {
      setComponentReloadKey((k) => k + 1);
    }
    prevShowQuickAdd.current = showQuickAdd;
  }, [showQuickAdd]);

  const handleGenerated = useCallback(() => {
    setReloadKey((k) => k + 1);
    componentGridRef.current?.refresh();
  }, []);

  const handleDeleteLibraryImage = useCallback(async (id: string) => {
    await fetch(`/api/library/images/${id}`, { method: "DELETE" });
    setReloadKey((k) => k + 1);
    componentGridRef.current?.refresh();
    setDetail(null);
  }, []);

  // Delete style components by id (e.g. 背景素材 from its popup)
  const handleDeleteComponents = useCallback(async (ids: string[]) => {
    await Promise.all(ids.map((id) => fetch(`/api/components/${id}`, { method: "DELETE" })));
    setComponentReloadKey((k) => k + 1);
    setDetail(null);
  }, []);

  const injectedIds = new Set(Object.values(slots).filter(Boolean).map((c) => c!.id));
  const filledSlotCount = Object.values(slots).filter(Boolean).length;

  return (
    <>
      <div className="flex gap-0 min-h-[calc(100vh-4rem)] -mx-6 -mt-6">
        {/* ── Left: Client folder sidebar ── */}
        <aside className="w-44 shrink-0 border-r bg-gray-50/70 pt-6 pb-4 flex flex-col gap-1 px-3">
          <Link href="/clients" className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 px-2 mb-2 transition-colors">
            <ChevronLeft className="h-3.5 w-3.5" />返回客戶
          </Link>
          <div className="text-xs font-semibold text-gray-500 px-2 mb-3 uppercase tracking-wide">客戶資料夾</div>
          <button onClick={() => setSelectedClientId(null)}
            className={`flex items-center gap-2 px-2 py-2 rounded-lg text-sm transition-colors text-left w-full ${
              selectedClientId === null ? "bg-gray-200 font-medium text-gray-900" : "text-gray-600 hover:bg-gray-100"}`}>
            <Layers className="h-4 w-4 shrink-0 text-gray-400" />
            <span className="truncate">全部</span>
          </button>
          {clients.map((client) => (
            <button key={client.id} onClick={() => setSelectedClientId(client.id)}
              className={`flex items-center gap-2 px-2 py-2 rounded-lg text-sm transition-colors text-left w-full ${
                selectedClientId === client.id ? "bg-gray-200 font-medium text-gray-900" : "text-gray-600 hover:bg-gray-100"}`}>
              <FolderOpen className="h-4 w-4 shrink-0 text-gray-400" />
              <span className="truncate flex-1">{client.name}</span>
              <span className="text-[10px] text-gray-400 shrink-0">{client._count.activities}</span>
            </button>
          ))}
        </aside>

        {/* ── Right: Tab bar + content ── */}
        <div className="flex-1 px-6 pt-6 pb-8 overflow-auto min-w-0">
          <div className="flex items-center justify-between mb-5">
            <h1 className="text-xl font-semibold">
              素材庫
              {selectedClientId && (
                <span className="ml-2 text-sm font-normal text-gray-400">
                  — {clients.find((c) => c.id === selectedClientId)?.name}
                </span>
              )}
            </h1>
            {filledSlotCount > 0 && (
              <button onClick={() => setTab("assets")}
                className="flex items-center gap-1.5 text-xs bg-violet-50 border border-violet-200 text-violet-700 px-3 py-1.5 rounded-full hover:bg-violet-100 transition-colors">
                <span className="w-4 h-4 rounded-full bg-violet-600 text-white text-[9px] flex items-center justify-center font-bold">{filledSlotCount}</span>
                積木已選取，前往組合台
              </button>
            )}
          </div>

          {/* Tab bar */}
          <div className="flex gap-0 border-b mb-6">
            {([
              { key: "components" as Tab, label: "風格組件", icon: <Layers className="h-4 w-4" /> },
              { key: "assets" as Tab, label: "生成圖片", icon: <Images className="h-4 w-4" /> },
            ] as const).map(({ key, label, icon }) => (
              <button key={key} onClick={() => setTab(key)}
                className={`flex items-center gap-1.5 px-4 pb-3 text-sm font-medium border-b-2 transition-colors ${
                  tab === key ? "border-black text-black" : "border-transparent text-gray-400 hover:text-gray-600"}`}>
                {icon}
                {label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {tab === "assets" && (
            <div className="space-y-8">
              <PromptComposer
                slots={slots}
                onClearSlot={handleClearSlot}
                onPickSlot={handleInject}
                clientId={selectedClientId}
                onGenerated={handleGenerated}
                prefill={prefill}
                prefillNonce={prefillNonce}
              />
              <div>
                <h2 className="text-sm font-semibold text-gray-600 mb-4">圖片紀錄</h2>
                <AssetGrid clientId={selectedClientId} reloadKey={reloadKey} onOpenImage={setDetail} />
              </div>
            </div>
          )}

          {tab === "components" && (
            <ComponentGrid
              ref={componentGridRef}
              clientId={selectedClientId}
              injectedSlots={slots}
              onInject={handleInject}
              onOpenQuickAdd={() => { setEditComponent(null); setQuickAddImageUrl(null); setShowQuickAdd(true); }}
              onOpenGenerateAsset={() => setShowGenerateAsset(true)}
              onOpenImage={setDetail}
              reloadKey={componentReloadKey}
            />
          )}
        </div>
      </div>

      {/* Shared image popup */}
      {detail && (
        <ImageDetailModal
          imageUrl={detail.imageUrl}
          presetComponents={detail.presetComponents}
          copyText={detail.copyText}
          subject={detail.subject}
          prompt={detail.prompt}
          libraryImageId={detail.libraryImageId}
          genType={(() => { try { return JSON.parse(detail.regenerateParams || "{}").genType as string | undefined; } catch { return undefined; } })()}
          mode={(() => { try { return JSON.parse(detail.regenerateParams || "{}").mode as string | undefined; } catch { return undefined; } })()}
          refImageUrl={(() => { try { return JSON.parse(detail.regenerateParams || "{}").refImageUrl as string | undefined; } catch { return undefined; } })()}
          sourceImages={(() => { try { const p = JSON.parse(detail.regenerateParams || "{}"); const arr = (Array.isArray(p.productImageUrls) && p.productImageUrls.length ? p.productImageUrls : (p.productImageUrl ? [p.productImageUrl] : [])) as string[]; return arr.filter(Boolean); } catch { return []; } })()}
          onOpenGenerateAsset={handleOpenGenerateAsset}
          clients={clients}
          injectedIds={injectedIds}
          onInject={handleInject}
          onInjectAll={handleInjectAll}
          onAnalyze={handleAnalyze}
          onAdjust={handleAdjustImage}
          onRegenerate={detail.regenerateParams ? () => handleRegenerate(detail) : undefined}
          onDelete={detail.libraryImageId ? handleDeleteLibraryImage : undefined}
          onDeleteComponents={handleDeleteComponents}
          onRefresh={() => { setReloadKey((k) => k + 1); setComponentReloadKey((k) => k + 1); }}
          onClose={() => setDetail(null)}
        />
      )}

      {/* Generate asset */}
      {showGenerateAsset && (
        <GenerateAssetModal
          clientId={selectedClientId}
          init={generateAssetInit ?? undefined}
          onClose={() => { setShowGenerateAsset(false); setGenerateAssetInit(null); }}
          onSaved={() => {
            setShowGenerateAsset(false);
            setGenerateAssetInit(null);
            setReloadKey((k) => k + 1);
            setComponentReloadKey((k) => k + 1);
          }}
        />
      )}

      {/* Quick add / edit */}
      {showQuickAdd && (
        <QuickAddModal
          clientId={selectedClientId}
          initialImageUrl={quickAddImageUrl}
          editComponent={editComponent}
          prefillComponents={prefillComponents}
          libraryImageId={adjustLibraryImageId ?? undefined}
          onClose={() => { setShowQuickAdd(false); setQuickAddImageUrl(null); setEditComponent(null); setPrefillComponents(null); setAdjustLibraryImageId(null); }}
          onSaved={() => {
            setShowQuickAdd(false);
            setQuickAddImageUrl(null);
            setEditComponent(null);
            setPrefillComponents(null);
            setAdjustLibraryImageId(null);
            setReloadKey((k) => k + 1);
            setComponentReloadKey((k) => k + 1);
          }}
        />
      )}

      {/* Auto-dismiss toast (#3) */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[70] flex items-center gap-2 bg-gray-900 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg animate-in fade-in slide-in-from-bottom-2">
          <Check className="h-4 w-4 text-emerald-400" />
          {toast}
        </div>
      )}
    </>
  );
}
