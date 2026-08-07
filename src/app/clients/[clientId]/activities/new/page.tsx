"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { ActivityForm, type ActivityFormValues } from "@/components/activities/ActivityForm";
import { ACTIVITY_REF_KEY, ACTIVITY_BASE_KEY, ACTIVITY_IMAGE_PROMPT_KEY } from "@/components/activities/RolePickerModal";
import { MultiLayoutPicker } from "@/components/activities/MultiLayoutPicker";

export default function NewActivityPage({ params }: { params: Promise<{ clientId: string }> }) {
  const [clientId, setClientId] = useState("");
  const [showLayoutPicker, setShowLayoutPicker] = useState(false);  // [MULTI] 版型下拉
  const router = useRouter();

  // [MULTI] 選版型：single 留在單圖頁；其餘導去多圖頁
  const handleLayout = (id: string) => {
    setShowLayoutPicker(false);
    if (id !== "single") router.push(`/clients/${clientId}/activities/new/multi?layout=${id}`);
  };

  // 由素材 popup「帶入活動圖生成」跳過嚟：URL 存喺 sessionStorage（唔喺網址外露）。
  // 參考圖 → activityRefImage；活動圖底圖 → activityBaseImage。
  // 同步喺首次 render 讀取並清走，令 ActivityForm mount 時已有預填。
  const [initial] = useState<{ ref: string | null; base: string | null; prompt: string | null }>(() => {
    if (typeof window === "undefined") return { ref: null, base: null, prompt: null };
    const ref = sessionStorage.getItem(ACTIVITY_REF_KEY);
    const base = sessionStorage.getItem(ACTIVITY_BASE_KEY);
    const prompt = sessionStorage.getItem(ACTIVITY_IMAGE_PROMPT_KEY);
    if (ref) sessionStorage.removeItem(ACTIVITY_REF_KEY);
    if (base) sessionStorage.removeItem(ACTIVITY_BASE_KEY);
    if (prompt) sessionStorage.removeItem(ACTIVITY_IMAGE_PROMPT_KEY);
    return { ref, base, prompt };
  });

  useEffect(() => {
    params.then(({ clientId }) => setClientId(clientId));
  }, [params]);

  const handleSubmit = async (values: ActivityFormValues) => {
    const res = await fetch("/api/activities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...values, clientId }),
    });
    const activity = await res.json();
    router.push(`/clients/${clientId}/activities/${activity.id}`);
  };

  if (!clientId) return null;

  return (
    <div className="max-w-xl">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-xl font-semibold">新增活動</h1>
        {/* [MULTI] 版型下拉：可從單圖切換到多圖版型 */}
        <button
          type="button"
          onClick={() => setShowLayoutPicker(true)}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-violet-600 border border-gray-200 hover:border-violet-300 rounded-lg px-3 py-1.5 transition-all"
        >
          已選版型：<span className="font-medium text-gray-800">1張（單圖）</span>
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>
      <ActivityForm clientId={clientId} onSubmit={handleSubmit}
        initialValues={{
          ...(initial.ref ? { referenceImageUrls: [initial.ref] } : {}),
          ...(initial.base ? { baseImageUrl: initial.base } : {}),
          ...(initial.prompt ? { imagePrompt: initial.prompt } : {}),
        }} />
      {showLayoutPicker && (
        <MultiLayoutPicker selectedId="single" onSelect={handleLayout} onClose={() => setShowLayoutPicker(false)} />
      )}
    </div>
  );
}
