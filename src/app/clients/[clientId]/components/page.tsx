"use client";
import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { LibraryWorkspace, type LibraryWorkspaceHandle } from "@/components/library/LibraryWorkspace";
import { ProductGrid, type ProductGridHandle } from "@/components/products/ProductGrid";
import { setLastClientTab } from "@/lib/lastClientTab";

type Tab = "assets" | "products";

export default function BrandComponentsPage({ params }: { params: Promise<{ clientId: string }> }) {
  const [clientId, setClientId] = useState<string>("");
  const [tab, setTab] = useState<Tab>("assets");
  const libRef = useRef<LibraryWorkspaceHandle>(null);
  const productRef = useRef<ProductGridHandle>(null);

  useEffect(() => {
    params.then(({ clientId }) => setClientId(clientId));
  }, [params]);

  useEffect(() => {
    if (clientId) setLastClientTab(clientId, "components");
  }, [clientId]);

  if (!clientId) return <div className="text-gray-400">載入中...</div>;

  return (
    <div>
      {/* 素材庫頁首：標題 + 副標 + 新增（依分頁切換動作） */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">素材庫</h1>
          <p className="mt-1 text-sm text-gray-400">
            {tab === "assets" ? "集中管理品牌參考、背景、人像與插畫素材" : "為每支產品建立可複用的商品套圖，做內容時直接帶入"}
          </p>
        </div>
        {tab === "assets" ? (
          <button
            data-tour="lib-add"
            onClick={() => libRef.current?.openAddPicker()}
            className="flex items-center gap-1.5 text-sm font-medium bg-violet-600 text-white px-4 py-2 rounded-xl hover:bg-violet-700 transition-colors shrink-0"
          >
            <Plus className="h-4 w-4" />新增素材
          </button>
        ) : (
          <button
            onClick={() => productRef.current?.openNew()}
            className="flex items-center gap-1.5 text-sm font-medium bg-violet-600 text-white px-4 py-2 rounded-xl hover:bg-violet-700 transition-colors shrink-0"
          >
            <Plus className="h-4 w-4" />新增產品
          </button>
        )}
      </div>

      {/* 分頁切換：素材 / 產品 */}
      <div className="flex items-center gap-2 mb-6">
        {([["assets", "素材"], ["products", "產品"]] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium border-[1.5px] transition-colors ${
              tab === key
                ? "border-violet-600 bg-violet-50 text-violet-700"
                : "border-[#ebeff5] bg-white text-gray-500 hover:border-violet-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 用 hidden 保留兩邊狀態（素材庫生成中的 poll 不中斷） */}
      <div hidden={tab !== "assets"}>
        <LibraryWorkspace ref={libRef} clientId={clientId} />
      </div>
      <div hidden={tab !== "products"}>
        <ProductGrid ref={productRef} clientId={clientId} />
      </div>
    </div>
  );
}
