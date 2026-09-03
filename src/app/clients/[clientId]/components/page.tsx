"use client";
import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
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
      {/* 素材庫頁首：標題 + 副標 + 新增素材（對齊 Figma，取代舊 BrandWorkspaceHeader tab 列） */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">素材庫</h1>
          <p className="mt-1 text-sm text-gray-400">集中管理品牌參考、背景、人像與插畫素材</p>
        </div>
        <button
          onClick={() => libRef.current?.openAddPicker()}
          className="flex items-center gap-1.5 text-sm font-medium bg-violet-600 text-white px-4 py-2 rounded-xl hover:bg-violet-700 transition-colors shrink-0"
        >
          <Plus className="h-4 w-4" />新增素材
        </button>
      </div>
      <LibraryWorkspace ref={libRef} clientId={clientId} />
    </div>
  );
}
