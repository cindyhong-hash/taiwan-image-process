"use client";
/**
 * NewActivityModal — Mode A（廣告活動圖頁「新增活動」入口，WF3 v3 方案 B）。
 * 撳「新增活動」一屏兩揀：
 *   ① 新活動圖生成       → 入空白表單（現有流程；表單內部仍可用「從素材庫揀」加參考圖）
 *   ② 用素材庫圖片·底圖   → 揀圖 → 呢張相 100% 做背景，唔重新生圖
 * （原本仲有「② 用素材庫圖片·作參考圖」，但呢個本質同①一樣係「AI 生成全新
 *   畫面」，只係加咗個風格參考——同①重複，移除。想用參考圖可以揀①之後
 *   喺表單入面「從素材庫揀」，唔失去呢個能力，只係唔再喺呢一屏重複問。）
 * 帶入表單嘅底圖經 sessionStorage 傳（唔喺網址外露）："activityBaseImage"
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, ImageDown, X } from "lucide-react";
import { LibraryImagePickerModal } from "@/components/activities/LibraryImagePickerModal";
import { ACTIVITY_REF_KEY, ACTIVITY_BASE_KEY, ACTIVITY_IMAGE_PROMPT_KEY } from "@/components/activities/RolePickerModal";
import { MultiLayoutPicker } from "@/components/activities/MultiLayoutPicker";

// [MULTI] 保留同事的「2揀1」簡化；① 改成先揀版型（單圖/多圖）
type Step = "choose" | "pick" | "layout";

export function NewActivityModal({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("choose");

  const gotoNew = () => router.push(`/clients/${clientId}/activities/new`);
  // [MULTI] 版型選擇：single → 他的單圖頁；其餘 → 多圖頁並帶 layout 參數
  const handleLayout = (id: string) => {
    if (id === "single") gotoNew();
    else router.push(`/clients/${clientId}/activities/new/multi?layout=${id}`);
  };

  const handlePicked = (url: string, promptText?: string) => {
    try {
      sessionStorage.removeItem(ACTIVITY_REF_KEY);
      sessionStorage.removeItem(ACTIVITY_BASE_KEY);
      sessionStorage.removeItem(ACTIVITY_IMAGE_PROMPT_KEY);
      sessionStorage.setItem(ACTIVITY_BASE_KEY, url);
      if (promptText?.trim()) sessionStorage.setItem(ACTIVITY_IMAGE_PROMPT_KEY, promptText.trim());
    } catch { /* ignore */ }
    gotoNew();
  };

  if (step === "pick") {
    return (
      <LibraryImagePickerModal
        clientId={clientId}
        title="從素材庫揀底圖"
        onPick={handlePicked}
        onClose={onClose}
      />
    );
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
          {/* ① 新生成（先揀版型：單圖 / 多圖拼版）— 配色沿用同事新 amber */}
          <button type="button" onClick={() => setStep("layout")}
            className="w-full flex items-start gap-3 text-left rounded-xl border border-gray-200 p-3.5 hover:border-amber-400 hover:bg-amber-50/40 transition-colors">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600">

              <Sparkles className="h-4.5 w-4.5" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-gray-800">① 新活動圖生成</span>
              <span className="block text-[11px] text-gray-500 mt-0.5 leading-relaxed">由零開始，AI 幫你生成全新活動圖。</span>
            </span>
          </button>
          {/* ② 用素材庫圖片 · 作活動圖底圖 */}
          <button type="button" onClick={() => setStep("pick")}
            className="w-full flex items-start gap-3 text-left rounded-xl border border-gray-200 p-3.5 hover:border-violet-400 hover:bg-violet-50/40 transition-colors">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-600">
              <ImageDown className="h-4.5 w-4.5" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-gray-800">② 用素材庫圖片 · 作活動圖底圖</span>
              <span className="block text-[11px] text-gray-500 mt-0.5 leading-relaxed">揀一張現有素材做背景，AI幫手加文字。</span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
