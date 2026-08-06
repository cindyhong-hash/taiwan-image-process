"use client";
/**
 * NewActivityModal — Mode A（廣告活動圖頁「新增活動」入口，WF3 v3 方案 B）。
 * 撳「新增活動」先揀方式：
 *   ① 新活動圖生成   → 入空白表單（現有流程）
 *   ② 用素材庫圖片   → 揀圖 → RolePicker（參考圖 / 底圖，同 Mode B 共用）→ 入預填表單
 * 帶入表單嘅圖經 sessionStorage 傳（唔喺網址外露）：
 *   參考圖 → "activityRefImage"；底圖 → "activityBaseImage"
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Images, X } from "lucide-react";
import { LibraryImagePickerModal } from "@/components/activities/LibraryImagePickerModal";
import { RolePickerModal, ACTIVITY_REF_KEY, ACTIVITY_BASE_KEY, ACTIVITY_IMAGE_PROMPT_KEY, type ActivityImageRole } from "@/components/activities/RolePickerModal";
import { MultiLayoutPicker } from "@/components/activities/MultiLayoutPicker";

type Step = "choose" | "pick" | "role" | "layout";

export function NewActivityModal({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("choose");
  const [picked, setPicked] = useState<string | null>(null);
  const [pickedPrompt, setPickedPrompt] = useState<string>(""); // 揀嗰張圖已有嘅 AI prompt

  const gotoNew = () => router.push(`/clients/${clientId}/activities/new`);
  // [MULTI] 版型選擇：single → 他的單圖頁；其餘 → 多圖頁並帶 layout 參數
  const handleLayout = (id: string) => {
    if (id === "single") gotoNew();
    else router.push(`/clients/${clientId}/activities/new/multi?layout=${id}`);
  };

  const handleRole = (role: ActivityImageRole) => {
    if (!picked) return;
    try {
      sessionStorage.removeItem(ACTIVITY_REF_KEY);
      sessionStorage.removeItem(ACTIVITY_BASE_KEY);
      sessionStorage.removeItem(ACTIVITY_IMAGE_PROMPT_KEY);
      sessionStorage.setItem(role === "base" ? ACTIVITY_BASE_KEY : ACTIVITY_REF_KEY, picked);
      if (pickedPrompt.trim()) sessionStorage.setItem(ACTIVITY_IMAGE_PROMPT_KEY, pickedPrompt.trim());
    } catch { /* ignore */ }
    gotoNew();
  };

  // 揀圖 / 揀角色兩步：直接 render 對應 modal（佢哋自己有 backdrop）。
  if (step === "pick") {
    return (
      <LibraryImagePickerModal
        clientId={clientId}
        onPick={(url, promptText) => { setPicked(url); setPickedPrompt(promptText ?? ""); setStep("role"); }}
        onClose={onClose}
      />
    );
  }
  if (step === "role" && picked) {
    return <RolePickerModal imageUrl={picked} onPick={handleRole} onClose={onClose} />;
  }
  // [MULTI] 揀版型：single→單圖頁、其餘→多圖頁
  if (step === "layout") {
    return <MultiLayoutPicker onSelect={handleLayout} onClose={onClose} />;
  }

  // step === "choose"
  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b">
          <h2 className="text-sm font-semibold">新增活動</h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5 space-y-2.5">
          <p className="text-xs text-gray-500">點樣開始？</p>
          {/* ① 新生成（先揀版型：單圖 / 多圖拼版） */}
          <button type="button" onClick={() => setStep("layout")}
            className="w-full flex items-start gap-3 text-left rounded-xl border border-gray-200 p-3.5 hover:border-violet-400 hover:bg-violet-50/40 transition-colors">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-600">
              <Sparkles className="h-4.5 w-4.5" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-gray-800">① 新活動圖生成</span>
              <span className="block text-[11px] text-gray-500 mt-0.5 leading-relaxed">由零開始，AI 幫你生成全新活動圖。</span>
            </span>
          </button>
          {/* ② 用素材庫圖片 */}
          <button type="button" onClick={() => setStep("pick")}
            className="w-full flex items-start gap-3 text-left rounded-xl border border-gray-200 p-3.5 hover:border-blue-400 hover:bg-blue-50/40 transition-colors">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
              <Images className="h-4.5 w-4.5" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-gray-800">② 用素材庫圖片</span>
              <span className="block text-[11px] text-gray-500 mt-0.5 leading-relaxed">揀一張現有素材做起點（參考圖或活動圖底圖）。</span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
