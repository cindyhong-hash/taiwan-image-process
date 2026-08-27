"use client";
/**
 * QuickAddPage — 「上傳參考圖」全頁版（原本係 popup：QuickAddModal）。
 * 由 ComponentGrid 嘅釘死 icon 按鈕，或圖片詳情嘅「分析」/「調整」觸發，
 * 跳嚟呢頁而唔再開 modal。跨頁交接（初始圖／既有積木／libraryImageId）
 * 用 sessionStorage 一次性交接（libraryGenerateHandoff.ts），跟「新增產品／
 * 素材圖片」全頁嗰套做法一致。
 */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { QuickAddForm } from "@/components/library/QuickAddForm";
import { consumeQuickAddHandoff, type LibraryQuickAddHandoff } from "@/components/library/libraryGenerateHandoff";

export default function QuickAddPage({ params }: { params: Promise<{ clientId: string }> }) {
  const [clientId, setClientId] = useState("");
  const router = useRouter();
  const [handoff, setHandoff] = useState<LibraryQuickAddHandoff | null>(null);
  // 專案（clientId）選擇器：放喺 header 右上角（同下面「編輯/重新生成」等掣同一慣例），
  // 唔再夾喺表單內容中間——嗰度全部項目都係滿版闊度，一粒窄 dropdown 擺埋一齊會唔 align。
  const [editClientId, setEditClientId] = useState<string | null>(null);
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);

  // consumeQuickAddHandoff() 一次性讀走 sessionStorage——dev 環境 React Strict Mode 會將呢個
  // effect 連續 invoke 兩次，第二次先讀就已經俾第一次清空，令「調整」帶埋嚟嘅構圖/配色靜靜哋
  // 冇咗（頁面淨係跌落「上傳參考圖」空白模式，冇報錯，好隱蔽）。用 ref 確保實際「讀走」呢個
  // 動作淨係執行一次。
  const handoffConsumedRef = useRef(false);
  useEffect(() => {
    params.then(({ clientId }) => setClientId(clientId));
    if (!handoffConsumedRef.current) {
      handoffConsumedRef.current = true;
      setHandoff(consumeQuickAddHandoff());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  useEffect(() => {
    if (clientId) setEditClientId((prev) => (prev === null ? clientId : prev));
  }, [clientId]);

  const isEdit = !!handoff?.prefillComponents && handoff.prefillComponents.length > 0;

  useEffect(() => {
    if (!isEdit) return;
    fetch("/api/clients").then((r) => r.json()).then((data) => setClients(Array.isArray(data) ? data : []));
  }, [isEdit]);

  const backToLibrary = () => router.push(`/clients/${clientId}/components`);

  if (!clientId || !handoff) return null;

  return (
    <div className="max-w-3xl">
      <div className="flex items-start gap-2 mb-6">
        {/* items-start（唔用 items-center）：而家標題下面加咗說明文字，變成兩行高，
            如果成排用 items-center，箭嘴/dropdown 會被逼向中間，睇落飄到低過標題本身。
            用 items-start 令佢哋同標題文字頂部對齊；箭嘴自己加 mt-0.5 微調就啱返標題
            嘅視覺中心（純用 items-start 個 icon 頂會貼實行高頂端，睇落仲係差少少高）。 */}
        <button onClick={backToLibrary} className="text-gray-400 hover:text-gray-700 mt-0.5">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-semibold">{isEdit ? "編輯素材" : "上傳參考圖"}</h1>
          {isEdit && <p className="text-xs text-gray-400 mt-0.5">修改後儲存即覆蓋原素材之設定</p>}
        </div>
        {isEdit && (
          <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
            <span className="text-xs text-gray-400 whitespace-nowrap">所屬品牌</span>
            <div className="relative">
              {/* 冇「全部（無分類）」——呢個選項會將素材搬去 clientId=null 嘅「未分類」
                  狀態，而呢個狀態已經由側欄隱藏埋（見 Sidebar.tsx SHOW_UNASSIGNED_LINK），
                  屬於待清理嘅舊資料，唔應該再喺呢度提供做正常揀選。 */}
              <select value={editClientId ?? ""} onChange={(e) => setEditClientId(e.target.value || null)}
                className="appearance-none text-xs border border-gray-200 rounded-lg pl-2.5 pr-7 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white cursor-pointer">
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <svg className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        )}
      </div>

      <QuickAddForm
        initialImageUrl={handoff.imageUrl}
        prefillComponents={handoff.prefillComponents}
        libraryImageId={handoff.libraryImageId ?? undefined}
        editClientId={editClientId}
        onCancel={backToLibrary}
        onSaved={backToLibrary}
      />
    </div>
  );
}
