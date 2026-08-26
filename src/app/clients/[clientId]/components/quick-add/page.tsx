"use client";
/**
 * QuickAddPage — 「上傳參考圖」全頁版（原本係 popup：QuickAddModal）。
 * 由 ComponentGrid 嘅釘死 icon 按鈕，或圖片詳情嘅「分析」/「調整」觸發，
 * 跳嚟呢頁而唔再開 modal。跨頁交接（初始圖／既有積木／libraryImageId）
 * 用 sessionStorage 一次性交接（libraryGenerateHandoff.ts），跟「新增產品／
 * 素材圖片」全頁嗰套做法一致。
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { QuickAddForm } from "@/components/library/QuickAddForm";
import { consumeQuickAddHandoff, type LibraryQuickAddHandoff } from "@/components/library/libraryGenerateHandoff";

export default function QuickAddPage({ params }: { params: Promise<{ clientId: string }> }) {
  const [clientId, setClientId] = useState("");
  const router = useRouter();
  const [handoff, setHandoff] = useState<LibraryQuickAddHandoff | null>(null);

  useEffect(() => {
    params.then(({ clientId }) => setClientId(clientId));
    setHandoff(consumeQuickAddHandoff());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const backToLibrary = () => router.push(`/clients/${clientId}/components`);

  if (!clientId || !handoff) return null;

  const isEdit = !!handoff.prefillComponents && handoff.prefillComponents.length > 0;

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-2 mb-6">
        <button onClick={backToLibrary} className="text-gray-400 hover:text-gray-700">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-semibold flex-1">{isEdit ? "編輯素材" : "上傳參考圖"}</h1>
      </div>

      <QuickAddForm
        clientId={clientId}
        initialImageUrl={handoff.imageUrl}
        prefillComponents={handoff.prefillComponents}
        libraryImageId={handoff.libraryImageId ?? undefined}
        onCancel={backToLibrary}
        onSaved={backToLibrary}
      />
    </div>
  );
}
