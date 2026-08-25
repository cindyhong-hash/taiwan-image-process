"use client";
/**
 * LibraryWorkspace — wireframe v2 ⑥ 素材庫（前稱「風格組件」）內容（brand-scoped 或 未分組）。
 * 由原 /library 抽出：去除自己嗰套 client 資料夾側欄 / 「全部」/ 返回客戶 / 頁標題。
 * 唔再有「風格組件／生成圖片」sub-tab —— 生成功能併入「新增產品／素材圖片」融合入口：
 *   • 產品圖 → ProductComposeModal（包 PromptComposer）
 *   • 背景/人像/2D插圖 → GenerateAssetModal（預選 type）
 * clientId=null + unassigned=true → 未分組視圖（收 clientId 為 null 嘅素材）。
 */
import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { ComponentGrid, type ComponentGridHandle } from "@/components/library/ComponentGrid";
import { ProductComposeModal } from "@/components/library/ProductComposeModal";
import { QuickAddModal } from "@/components/library/QuickAddModal";
import { GenerateAssetModal } from "@/components/library/GenerateAssetModal";
import { AddAssetModal, type AddAssetType } from "@/components/library/AddAssetModal";
import { ImageDetailModal } from "@/components/library/ImageDetailModal";
import { RolePickerModal, ACTIVITY_REF_KEY, ACTIVITY_BASE_KEY, ACTIVITY_IMAGE_PROMPT_KEY, ML_COMPOSE_BG_KEY, type ActivityImageRole } from "@/components/activities/RolePickerModal";
import type { StyleComponent, PromptSlots, ImageDetail } from "@/types/library";
import { CATEGORY_META } from "@/types/library";

type Client = { id: string; name: string; _count: { activities: number } };
type Prefill = { subject?: string; notes?: string; useFlags?: Record<string, boolean> };
type GenerateAssetInit = { description: string; refImageUrl: string; type: "background" | "person" | "illustration"; engine: "flux" | "nano" };

export type LibraryWorkspaceHandle = { openQuickAdd: () => void; openAddPicker: () => void };

export const LibraryWorkspace = forwardRef<LibraryWorkspaceHandle, { clientId: string | null; unassigned?: boolean }>(
  function LibraryWorkspace({ clientId, unassigned = false }, ref) {
  const [clients, setClients] = useState<Client[]>([]);
  const router = useRouter();
  const [slots, setSlots] = useState<PromptSlots>({ layout: null, color: null, tone: null, background: null });
  const [showCompose, setShowCompose] = useState(false); // 產品圖生成（PromptComposer modal）
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showAddPicker, setShowAddPicker] = useState(false); // wireframe ⑧ 融合入口
  const [showGenerateAsset, setShowGenerateAsset] = useState(false);
  const [generateAssetInit, setGenerateAssetInit] = useState<GenerateAssetInit | null>(null);
  const [lockedAssetType, setLockedAssetType] = useState<"background" | "person" | "illustration" | null>(null);
  const [quickAddImageUrl, setQuickAddImageUrl] = useState<string | null>(null);
  const [editComponent, setEditComponent] = useState<StyleComponent | null>(null);
  const [prefillComponents, setPrefillComponents] = useState<StyleComponent[] | null>(null);
  const [adjustLibraryImageId, setAdjustLibraryImageId] = useState<string | null>(null);
  const [componentReloadKey, setComponentReloadKey] = useState(0);
  const [detail, setDetail] = useState<ImageDetail | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<Prefill>({});
  const [prefillNonce, setPrefillNonce] = useState(0);
  const componentGridRef = useRef<ComponentGridHandle>(null);
  const prevShowQuickAdd = useRef(false);

  // clients list 仍需要：ComponentGrid（gallery 長按移到）+ QuickAddModal（編輯素材的「專案」下拉）用到。
  useEffect(() => {
    fetch("/api/clients").then((r) => r.json()).then(setClients).catch(() => {});
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 2200);
  }, []);

  const handleInject = useCallback((comp: StyleComponent) => {
    const slotKey = CATEGORY_META[comp.type].slot as keyof PromptSlots;
    setSlots((prev) => ({ ...prev, [slotKey]: comp }));
    showToast(`已帶入${CATEGORY_META[comp.type].label}：${comp.name}`);
  }, [showToast]);

  const handleInjectAll = useCallback((comps: StyleComponent[]) => {
    if (comps.length === 0) return;
    setSlots((prev) => {
      const next = { ...prev };
      comps.forEach((c) => { next[CATEGORY_META[c.type].slot as keyof PromptSlots] = c; });
      return next;
    });
    setDetail(null);
    setShowCompose(true);
    showToast(`已帶入 ${comps.length} 個積木到產品圖生成`);
  }, [showToast]);

  const handleClearSlot = useCallback((key: keyof PromptSlots) => {
    setSlots((prev) => ({ ...prev, [key]: null }));
  }, []);

  // 素材 popup →「帶入活動圖生成」：先開 RolePicker 揀角色（參考圖 / 底圖，同 Mode A 共用）。
  const [rolePickImage, setRolePickImage] = useState<string | null>(null);
  const [rolePickPrompt, setRolePickPrompt] = useState<string>(""); // 帶入圖已有嘅 AI prompt
  const handleUseAsActivityRef = useCallback((imageUrl: string, prompt?: string) => {
    setDetail(null);
    setRolePickImage(imageUrl); // → RolePickerModal
    setRolePickPrompt(prompt ?? "");
  }, []);
  // 素材 popup →「用這張做背景排版」：URL 經 sessionStorage 傳去 Magic Layers 分層合成頁。
  // 點素材時攔截：若是 Magic Layers 排版 → 開回編輯器續編，否則照常開圖片詳情。
  const handleOpenImage = useCallback((d: ImageDetail) => {
    try {
      if (d.libraryImageId && JSON.parse(d.regenerateParams || "{}").kind === "magicLayout") {
        router.push(`/clients/${clientId}/magic-layers/compose?layout=${d.libraryImageId}`);
        return;
      }
    } catch { /* ignore → fall through to detail */ }
    setDetail(d);
  }, [router, clientId]);

  const handleUseAsComposeBg = useCallback((imageUrl: string) => {
    setDetail(null);
    try { sessionStorage.setItem(ML_COMPOSE_BG_KEY, imageUrl); } catch { /* ignore */ }
    // 走品牌路由：app 外殼保留品牌側邊欄並高亮此品牌；clientId 由網址帶入（背景庫連動素材庫）。
    router.push(`/clients/${clientId}/magic-layers/compose`);
  }, [router, clientId]);
  // 揀完角色：URL + AI prompt 經 sessionStorage 傳（唔喺網址外露）→ 跳新增活動頁。
  const handlePickActivityRole = useCallback((role: ActivityImageRole) => {
    if (!rolePickImage) return;
    try {
      sessionStorage.removeItem(ACTIVITY_REF_KEY);
      sessionStorage.removeItem(ACTIVITY_BASE_KEY);
      sessionStorage.removeItem(ACTIVITY_IMAGE_PROMPT_KEY);
      sessionStorage.setItem(role === "base" ? ACTIVITY_BASE_KEY : ACTIVITY_REF_KEY, rolePickImage);
      if (rolePickPrompt.trim()) sessionStorage.setItem(ACTIVITY_IMAGE_PROMPT_KEY, rolePickPrompt.trim());
    } catch { /* ignore */ }
    router.push(`/clients/${clientId}/activities/new`);
  }, [rolePickImage, rolePickPrompt, clientId, router]);

  const handleOpenGenerateAsset = useCallback((init: GenerateAssetInit) => {
    setDetail(null);
    setLockedAssetType(null); // 重新生成/調整：唔鎖類型，俾用戶可切換
    setGenerateAssetInit(init);
    setShowGenerateAsset(true);
  }, []);

  // wireframe ⑧：4-type 入口路由。產品圖 → ProductComposeModal；其餘 → GenerateAssetModal 預選 type。
  const handlePickAddType = useCallback((t: AddAssetType) => {
    setShowAddPicker(false);
    if (t === "product") {
      setShowCompose(true);
      return;
    }
    setLockedAssetType(t); // 由融合入口揀咗 → 鎖死、隱藏類型選擇器
    setGenerateAssetInit({ description: "", refImageUrl: "", type: t, engine: "flux" });
    setShowGenerateAsset(true);
  }, []);

  const handleAnalyze = useCallback((url: string, libraryImageId?: string) => {
    setEditComponent(null);
    setQuickAddImageUrl(url);
    // 傳 libraryImageId → QuickAddModal 會經「接回圖」分支：分析出嚟嘅 block 除咗入 picker，
    // 亦寫返落呢張圖嘅 slots（detail 唔再顯示「尚未分析風格」）。
    setAdjustLibraryImageId(libraryImageId ?? null);
    setShowQuickAdd(true);
    setDetail(null);
  }, []);

  const handleAdjustImage = useCallback((url: string, comps: StyleComponent[], libraryImageId?: string) => {
    setQuickAddImageUrl(url);
    setEditComponent(null);
    setPrefillComponents(comps);
    setAdjustLibraryImageId(libraryImageId ?? null);
    setShowQuickAdd(true);
    setDetail(null);
  }, []);

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
    setDetail(null);
    setShowCompose(true);
    showToast("已載入原參數，可調整後重新生成");
  }, [showToast]);

  useEffect(() => {
    if (prevShowQuickAdd.current && !showQuickAdd) {
      setComponentReloadKey((k) => k + 1);
    }
    prevShowQuickAdd.current = showQuickAdd;
  }, [showQuickAdd]);

  const handleGenerated = useCallback(() => {
    componentGridRef.current?.refresh();
    setShowCompose(false);
  }, []);

  // 撳「生成」嗰刻（仲未等生成完）即刻叫一次 refresh——令主畫廊即刻見到「生成中」
  // 佔位卡，唔使等成個 poll 完先反映，亦唔靠關咗 popup 之後先見到。
  const handleGenerationStarted = useCallback(() => {
    componentGridRef.current?.refresh();
  }, []);

  const handleDeleteLibraryImage = useCallback(async (id: string) => {
    await fetch(`/api/library/images/${id}`, { method: "DELETE" });
    componentGridRef.current?.refresh();
    setDetail(null);
  }, []);

  const handleDeleteComponents = useCallback(async (ids: string[]) => {
    await Promise.all(ids.map((id) => fetch(`/api/components/${id}`, { method: "DELETE" })));
    setComponentReloadKey((k) => k + 1);
    setDetail(null);
  }, []);

  // 暴露俾 header 嘅動作掣（上傳參考圖 / 新增產品素材圖片 已搬上 header 右上）
  useImperativeHandle(ref, () => ({
    openQuickAdd: () => { setEditComponent(null); setQuickAddImageUrl(null); setShowQuickAdd(true); },
    openAddPicker: () => setShowAddPicker(true),
  }), []);

  const injectedIds = new Set(Object.values(slots).filter(Boolean).map((c) => c!.id));
  const filledSlotCount = Object.values(slots).filter(Boolean).length;

  return (
    <>
      {filledSlotCount > 0 && (
        <div className="flex justify-end mb-3">
          <button onClick={() => setShowCompose(true)}
            className="flex items-center gap-1.5 text-xs bg-violet-50 border border-violet-200 text-violet-700 px-3 py-1.5 rounded-full hover:bg-violet-100 transition-colors">
            <span className="w-4 h-4 rounded-full bg-violet-600 text-white text-[9px] flex items-center justify-center font-bold">{filledSlotCount}</span>
            積木已選取，前往產品圖生成
          </button>
        </div>
      )}

      <ComponentGrid
        ref={componentGridRef}
        clientId={clientId}
        unassigned={unassigned}
        injectedSlots={slots}
        onInject={handleInject}
        onOpenQuickAdd={() => { setEditComponent(null); setQuickAddImageUrl(null); setShowQuickAdd(true); }}
        onOpenGenerateAsset={() => setShowAddPicker(true)}
        onOpenImage={handleOpenImage}
        reloadKey={componentReloadKey}
        clients={clients}
        paused={showCompose || showGenerateAsset}
      />

      {/* 產品圖生成（PromptComposer modal） */}
      {showCompose && (
        <ProductComposeModal
          clientId={clientId}
          slots={slots}
          onClearSlot={handleClearSlot}
          onPickSlot={handleInject}
          onGenerated={handleGenerated}
          onStarted={handleGenerationStarted}
          prefill={prefill}
          prefillNonce={prefillNonce}
          onClose={() => setShowCompose(false)}
        />
      )}

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
          onUseAsActivityRef={handleUseAsActivityRef}
          onUseAsComposeBg={handleUseAsComposeBg}
          injectedIds={injectedIds}
          onInject={handleInject}
          onInjectAll={handleInjectAll}
          onAnalyze={handleAnalyze}
          onAdjust={handleAdjustImage}
          onRegenerate={detail.regenerateParams ? () => handleRegenerate(detail) : undefined}
          onDelete={detail.libraryImageId ? handleDeleteLibraryImage : undefined}
          onDeleteComponents={handleDeleteComponents}
          onRefresh={() => { setComponentReloadKey((k) => k + 1); componentGridRef.current?.refresh(); }}
          onClose={() => setDetail(null)}
        />
      )}

      {/* Mode B：素材圖 popup「帶入活動圖生成」→ 揀角色（參考圖 / 底圖）*/}
      {rolePickImage && (
        <RolePickerModal
          imageUrl={rolePickImage}
          onPick={handlePickActivityRole}
          onClose={() => setRolePickImage(null)}
        />
      )}

      {showAddPicker && (
        <AddAssetModal onPick={handlePickAddType} onClose={() => setShowAddPicker(false)} />
      )}

      {showGenerateAsset && (
        <GenerateAssetModal
          clientId={clientId}
          init={generateAssetInit ?? undefined}
          lockedType={lockedAssetType ?? undefined}
          onClose={() => { setShowGenerateAsset(false); setGenerateAssetInit(null); setLockedAssetType(null); }}
          onStarted={handleGenerationStarted}
          onSaved={() => {
            setShowGenerateAsset(false);
            setGenerateAssetInit(null);
            setLockedAssetType(null);
            setComponentReloadKey((k) => k + 1);
            componentGridRef.current?.refresh();
          }}
        />
      )}

      {showQuickAdd && (
        <QuickAddModal
          clientId={clientId}
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
            setComponentReloadKey((k) => k + 1);
            componentGridRef.current?.refresh();
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-[70] flex items-center gap-2 bg-gray-900 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg animate-in fade-in slide-in-from-bottom-2">
          <Check className="h-4 w-4 text-emerald-400" />
          {toast}
        </div>
      )}
    </>
  );
});
