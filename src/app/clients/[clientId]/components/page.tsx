"use client";
import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { BrandWorkspaceHeader } from "@/components/layout/BrandWorkspaceHeader";
import { LibraryWorkspace, type LibraryWorkspaceHandle } from "@/components/library/LibraryWorkspace";
import { setLastClientTab } from "@/lib/lastClientTab";

export default function BrandComponentsPage({ params }: { params: Promise<{ clientId: string }> }) {
  const [clientId, setClientId] = useState<string>("");
  const libRef = useRef<LibraryWorkspaceHandle>(null);

  useEffect(() => {
    params.then(({ clientId }) => setClientId(clientId));
  }, [params]);

  useEffect(() => {
    if (clientId) setLastClientTab(clientId, "components");
  }, [clientId]);

  if (!clientId) return <div className="text-gray-400">載入中...</div>;

  return (
    <div>
      <BrandWorkspaceHeader
        clientId={clientId}
        activeTab="components"
        actions={
          // 「上傳參考圖」已搬去 ComponentGrid 嘅 filter pills 尾（釘死顯示，方案 D），呢邊淨返真正全域動作。
          <button
            onClick={() => libRef.current?.openAddPicker()}
            className="flex items-center gap-1.5 text-xs font-medium bg-violet-600 text-white px-3 py-2 rounded-lg hover:bg-violet-700 transition-colors"
          >
            <Sparkles className="h-3.5 w-3.5" />新增產品／素材圖片
          </button>
        }
      />
      <LibraryWorkspace ref={libRef} clientId={clientId} />
    </div>
  );
}
