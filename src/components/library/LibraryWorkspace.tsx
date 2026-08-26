"use client";
/**
 * LibraryWorkspace — wireframe v2 ⑥ 素材庫（前稱「風格組件」）內容（brand-scoped 或 未分組）。
 * 由原 /library 抽出：去除自己嗰套 client 資料夾側欄 / 「全部」/ 返回客戶 / 頁標題。
 * 唔再有「風格組件／生成圖片」sub-tab —— 生成功能併入「新增產品／素材圖片」融合入口：
 *   • 第一步（大卡片揀類型）— AddAssetModal，維持 popup。
 *   • 揀完之後 — 跳去全頁 /clients/[clientId]/components/new?type=xxx（唔再開 popup）：
 *     產品圖 → PromptComposer；背景/人像/2D插圖 → GenerateAssetForm。
 * 「上傳參考圖」（ComponentGrid 釘死 icon 按鈕 / 圖片詳情「分析」「調整」）亦已改全頁
 *   /clients/[clientId]/components/quick-add（QuickAddForm，唔再開 popup）。
 *   跨頁需要帶嘅資料（積木 slots / 重新生成 prefill / 調整 init / 上傳參考圖初始圖與既有積木）
 *   經 sessionStorage 交接（libraryGenerateHandoff.ts），跟 RolePickerModal 嗰套做法一致。
 * clientId=null + unassigned=true → 未分組視圖（收 clientId 為 null 嘅素材）。
 */
import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { ComponentGrid, type ComponentGridHandle } from "@/components/library/ComponentGrid";
import { AddAssetModal, type AddAssetType } from "@/components/library/AddAssetModal";
import { ImageDetailModal } from "@/components/library/ImageDetailModal";
import { RolePickerModal, ACTIVITY_REF_KEY, ACTIVITY_BASE_KEY, ACTIVITY_IMAGE_PROMPT_KEY, type ActivityImageRole } from "@/components/activities/RolePickerModal";
import { stashProductHandoff, stashAssetInitHandoff, stashQuickAddHandoff } from "@/components/library/libraryGenerateHandoff";
import type { StyleComponent, PromptSlots, ImageDetail } from "@/types/library";
import { CATEGORY_META } from "@/types/library";

type Client = { id: string; name: string; _count: { activities: number } };
type GenerateAssetInit = { description: string; refImageUrl: string; type: "background" | "person" | "illustration"; engine: "flux" | "nano" };

export type LibraryWorkspaceHandle = { openQuickAdd: () => void; openAddPicker: () => void };

export const LibraryWorkspace = forwardRef<LibraryWorkspaceHandle, { clientId: string | null; unassigned?: boolean }>(
  function LibraryWorkspace({ clientId, unassigned = false }, ref) {
  const [clients, setClients] = useState<Client[]>([]);
  const router = useRouter();
  const [slots, setSlots] = useState<PromptSlots>({ layout: null, color: null, tone: null, background: null });
  const [showAddPicker, setShowAddPicker] = useState(false); // wireframe ⑧ 融合入口第一步：大卡片揀類型
  const [componentReloadKey, setComponentReloadKey] = useState(0);
  const [detail, setDetail] = useState<ImageDetail | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const componentGridRef = useRef<ComponentGridHandle>(null);

  // clients list 仍需要：ComponentGrid（gallery 長按移到）+ QuickAddForm（編輯素材的「專案」下拉）用到。
  useEffect(() => {
    fetch("/api/clients").then((r) => r.json()).then(setClients).catch(() => {});
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 2200);
  }, []);

  const goToProductGen = useCallback(() => {
    router.push(`/clients/${clientId}/components/new?type=product`);
  }, [router, clientId]);

  const goToQuickAdd = useCallback(() => {
    router.push(`/clients/${clientId}/components/quick-add`);
  }, [router, clientId]);

  const handleInject = useCallback((comp: StyleComponent) => {
    const slotKey = CATEGORY_META[comp.type].slot as keyof PromptSlots;
    setSlots((prev) => ({ ...prev, [slotKey]: comp }));
    showToast(`已帶入${CATEGORY_META[comp.type].label}：${comp.name}`);
  }, [showToast]);

  const handleInjectAll = useCallback((comps: StyleComponent[]) => {
    if (comps.length === 0) return;
    const next = { ...slots };
    comps.forEach((c) => { next[CATEGORY_META[c.type].slot as keyof PromptSlots] = c; });
    setSlots(next);
    stashProductHandoff(next);
    setDetail(null);
    showToast(`已帶入 ${comps.length} 個積木，前往產品圖生成`);
    goToProductGen();
  }, [slots, showToast, goToProductGen]);

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

  // popup「重新生成背景」/「調整」（人像/插畫）→ 帶 init 過去全頁（唔再鎖類型限制，落咗新頁可再用
  // 「已選類型」切換器改類型）。
  const handleOpenGenerateAsset = useCallback((init: GenerateAssetInit) => {
    setDetail(null);
    stashAssetInitHandoff({ description: init.description, refImageUrl: init.refImageUrl, engine: init.engine });
    router.push(`/clients/${clientId}/components/new?type=${init.type}`);
  }, [router, clientId]);

  // wireframe ⑧：4-type 入口路由 → 全頁（唔再開 modal）。
  const handlePickAddType = useCallback((t: AddAssetType) => {
    setShowAddPicker(false);
    router.push(`/clients/${clientId}/components/new?type=${t}`);
  }, [router, clientId]);

  const handleAnalyze = useCallback((url: string, libraryImageId?: string) => {
    // 傳 libraryImageId → QuickAddForm 會經「接回圖」分支：分析出嚟嘅 block 除咗入 picker，
    // 亦寫返落呢張圖嘅 slots（detail 唔再顯示「尚未分析風格」）。
    stashQuickAddHandoff({ imageUrl: url, libraryImageId: libraryImageId ?? null });
    setDetail(null);
    goToQuickAdd();
  }, [goToQuickAdd]);

  const handleAdjustImage = useCallback((url: string, comps: StyleComponent[], libraryImageId?: string) => {
    stashQuickAddHandoff({ imageUrl: url, prefillComponents: comps, libraryImageId: libraryImageId ?? null });
    setDetail(null);
    goToQuickAdd();
  }, [goToQuickAdd]);

  // 產品圖「重新生成」→ 帶 slots + prefill(主體/其他要求) 過去全頁。
  const handleRegenerate = useCallback((d: ImageDetail) => {
    try {
      const p = JSON.parse(d.regenerateParams || "{}");
      const nextSlots: PromptSlots = p.slots
        ? { layout: p.slots.layout ?? null, color: p.slots.color ?? null, tone: p.slots.tone ?? null, background: p.slots.background ?? null }
        : { layout: null, color: null, tone: null, background: null };
      const useFlags: Record<string, boolean> = {};
      (p.palette ?? []).forEach((c: { hex: string; use?: boolean }) => { useFlags[c.hex] = c.use !== false; });
      stashProductHandoff(nextSlots, { subject: d.subject ?? "", notes: p.notes ?? "", useFlags });
    } catch { /* ignore parse errors */ }
    setDetail(null);
    showToast("已載入原參數，可調整後重新生成");
    goToProductGen();
  }, [showToast, goToProductGen]);

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

  // 暴露俾 header 嘅動作掣（新增產品素材圖片 已搬上 header 右上；上傳參考圖已改全頁）
  useImperativeHandle(ref, () => ({
    openQuickAdd: goToQuickAdd,
    openAddPicker: () => setShowAddPicker(true),
  }), [goToQuickAdd]);

  const injectedIds = new Set(Object.values(slots).filter(Boolean).map((c) => c!.id));
  const filledSlotCount = Object.values(slots).filter(Boolean).length;

  return (
    <>
      {filledSlotCount > 0 && (
        <div className="flex justify-end mb-3">
          <button onClick={() => { stashProductHandoff(slots); goToProductGen(); }}
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
        onOpenQuickAdd={goToQuickAdd}
        onOpenGenerateAsset={() => setShowAddPicker(true)}
        onOpenImage={setDetail}
        reloadKey={componentReloadKey}
        clients={clients}
      />

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

      {toast && (
        <div className="fixed bottom-6 right-6 z-[70] flex items-center gap-2 bg-gray-900 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg animate-in fade-in slide-in-from-bottom-2">
          <Check className="h-4 w-4 text-emerald-400" />
          {toast}
        </div>
      )}
    </>
  );
});
