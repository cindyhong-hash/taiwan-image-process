"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { ActivityForm, type ActivityFormValues } from "@/components/activities/ActivityForm";
import { ACTIVITY_REF_KEY, ACTIVITY_BASE_KEY, ACTIVITY_IMAGE_PROMPT_KEY, ACTIVITY_HANDOFF_KEY } from "@/components/activities/RolePickerModal";
import { MultiLayoutPicker } from "@/components/activities/MultiLayoutPicker";
import { useUnsavedGuard } from "@/components/common/UnsavedGuard";

export default function NewActivityPage({ params }: { params: Promise<{ clientId: string }> }) {
  const [clientId, setClientId] = useState("");
  const router = useRouter();
  const [showLayoutPicker, setShowLayoutPicker] = useState(false);  // [MULTI] 版型下拉
  // [UX] ActivityForm 目前值（切版型帶去多圖頁，避免重打）
  const latestValues = useRef<Partial<ActivityFormValues>>({});
  // 底圖模式（用素材庫圖片作活動圖底圖）：呢張相 100% 固定做背景，唔支援拆做多格
  // 拼版——版型切換器擺喺呢個模式冇意義，撳咗轉去多圖頁仲會令底圖脈絡靜雞流失
  // （多圖頁完全冇 baseImageUrl 呢個概念）。跟 ActivityForm 嘅 live 狀態（唔淨係
  // 初始值）：用戶喺表單入面撳「移除底圖」跌返做一般生成模式時，切換器要即刻再顯示。
  const [isBaseMode, setIsBaseMode] = useState(false);
  const [dirty, setDirty] = useState(false);       // 表單有改動 → 離開時攔截
  const seenChange = useRef(false);                // 略過 mount 時的第一次 onValuesChange

  // 由素材 popup「帶入活動圖生成」跳過嚟：URL 存喺 sessionStorage（唔喺網址外露）。
  // 參考圖 → activityRefImage；活動圖底圖 → activityBaseImage。
  // 同步喺首次 render 讀取並清走，令 ActivityForm mount 時已有預填。
  type Handoff = { clientId?: string; imagePrompt?: string; requiredText?: string; productImageUrls?: string[]; referenceImageUrls?: string[] };
  const [initial] = useState<{ ref: string | null; base: string | null; prompt: string | null; handoff: Handoff | null }>(() => {
    if (typeof window === "undefined") return { ref: null, base: null, prompt: null, handoff: null };
    const ref = sessionStorage.getItem(ACTIVITY_REF_KEY);
    const base = sessionStorage.getItem(ACTIVITY_BASE_KEY);
    const prompt = sessionStorage.getItem(ACTIVITY_IMAGE_PROMPT_KEY);
    if (ref) sessionStorage.removeItem(ACTIVITY_REF_KEY);
    if (base) sessionStorage.removeItem(ACTIVITY_BASE_KEY);
    if (prompt) sessionStorage.removeItem(ACTIVITY_IMAGE_PROMPT_KEY);
    // [UX] 從多圖頁切回單圖：讀共用欄位交接。讀一次即清；只在「同一個品牌」才套用，
    // 避免中途放棄導航時，殘留內容被帶到別的客戶的新增頁。
    let handoff: Handoff | null = null;
    const raw = sessionStorage.getItem(ACTIVITY_HANDOFF_KEY);
    if (raw) {
      sessionStorage.removeItem(ACTIVITY_HANDOFF_KEY);
      try {
        const h = JSON.parse(raw) as Handoff;
        const cid = window.location.pathname.split("/")[2];  // /clients/{cid}/...
        if (h.clientId === cid) handoff = h;
      } catch { handoff = null; }
    }
    return { ref, base, prompt, handoff };
  });

  useEffect(() => {
    params.then(({ clientId }) => setClientId(clientId));
  }, [params]);

  // [MULTI] 選版型：single 留在單圖頁；其餘導去多圖頁
  const handleLayout = (id: string) => {
    setShowLayoutPicker(false);
    if (id !== "single") {
      // [UX] 切去多圖頁前，把共用欄位（主題/必放文字/產品圖）帶過去，避免重打
      const v = latestValues.current;
      try {
        sessionStorage.setItem(ACTIVITY_HANDOFF_KEY, JSON.stringify({
          clientId,
          imagePrompt: v.imagePrompt ?? "",
          requiredText: v.requiredText ?? "",
          productImageUrls: v.productImageUrls ?? [],
          referenceImageUrls: v.referenceImageUrls ?? [],
        }));
      } catch { /* ignore */ }
      router.push(`/clients/${clientId}/activities/new/multi?layout=${id}`);
    }
  };

  const handleSubmit = async (values: ActivityFormValues) => {
    setDirty(false);   // 正式送出 → 解除離開攔截
    const res = await fetch("/api/activities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...values, clientId }),
    });
    const activity = await res.json();
    router.push(`/clients/${clientId}/activities/${activity.id}`);
  };

  // [UX] 穩定的 callback，避免每次 render 都重觸發 ActivityForm 的 onValuesChange effect
  const captureValues = useCallback((v: ActivityFormValues) => {
    latestValues.current = v;
    if (seenChange.current) setDirty(true); else seenChange.current = true;  // 第一次是 mount 初始值，略過
  }, []);

  // 寫一半離開 → 存成草稿活動（status=DRAFT，不觸發生成）
  const saveDraft = useCallback(async () => {
    await fetch("/api/activities", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...latestValues.current, clientId, status: "DRAFT" }),
    });
  }, [clientId]);
  const { dialog } = useUnsavedGuard(dirty, saveDraft);

  if (!clientId) return null;

  return (
    <div className="max-w-xl">
      {dialog}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-xl font-semibold">新增活動</h1>
        {/* [MULTI] 版型下拉：可從單圖切換到多圖版型（底圖模式唔支援，隱藏） */}
        {!isBaseMode && (
          <button
            type="button"
            onClick={() => setShowLayoutPicker(true)}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-violet-600 border border-gray-200 hover:border-violet-300 rounded-lg px-3 py-1.5 transition-all"
          >
            已選版型：<span className="font-medium text-gray-800">1張（單圖）</span>
            <ChevronDown className="h-4 w-4" />
          </button>
        )}
      </div>
      <ActivityForm clientId={clientId} onSubmit={handleSubmit}
        onBaseModeChange={setIsBaseMode}
        onValuesChange={captureValues}
        initialValues={{
          ...(initial.ref ? { referenceImageUrls: [initial.ref] } : {}),
          ...(initial.base ? { baseImageUrl: initial.base } : {}),
          ...(initial.prompt ? { imagePrompt: initial.prompt } : {}),
          // [UX] 從多圖頁帶回的共用欄位（優先於 prompt-only 帶入）
          ...(initial.handoff?.imagePrompt ? { imagePrompt: initial.handoff.imagePrompt } : {}),
          ...(initial.handoff?.requiredText ? { requiredText: initial.handoff.requiredText } : {}),
          ...(initial.handoff?.productImageUrls?.length ? { productImageUrls: initial.handoff.productImageUrls } : {}),
          ...(initial.handoff?.referenceImageUrls?.length ? { referenceImageUrls: initial.handoff.referenceImageUrls } : {}),
        }} />
      {showLayoutPicker && (
        <MultiLayoutPicker selectedId="single" onSelect={handleLayout} onClose={() => setShowLayoutPicker(false)} />
      )}
    </div>
  );
}
