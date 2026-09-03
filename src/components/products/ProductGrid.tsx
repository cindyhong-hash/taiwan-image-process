"use client";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from "react";
import { useRouter } from "next/navigation";
import { Package, ImageOff, Layers } from "lucide-react";
import { NewProductModal } from "@/components/products/NewProductModal";
import type { Product } from "@/lib/productMeta";

export type ProductGridHandle = { openNew: () => void };

// [PRODUCT] 素材庫「產品」分頁：列出品牌旗下產品卡，點卡進詳情頁
export const ProductGrid = forwardRef<ProductGridHandle, { clientId: string }>(
  function ProductGrid({ clientId }, ref) {
    const router = useRouter();
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [showNew, setShowNew] = useState(false);

    const load = useCallback(() => {
      fetch(`/api/products?clientId=${clientId}`)
        .then((r) => r.json())
        .then((data) => setProducts(Array.isArray(data) ? data : []))
        .catch(() => setProducts([]))
        .finally(() => setLoading(false));
    }, [clientId]);

    useEffect(() => { load(); }, [load]);

    useImperativeHandle(ref, () => ({ openNew: () => setShowNew(true) }), []);

    if (loading) return <div className="text-gray-400 text-sm py-12 text-center">載入中…</div>;

    return (
      <>
        {products.length === 0 ? (
          <button
            onClick={() => setShowNew(true)}
            className="w-full rounded-2xl border-[1.5px] border-dashed border-[#ebeff5] bg-white py-16 flex flex-col items-center justify-center gap-3 text-gray-400 hover:border-violet-300 hover:text-violet-500 transition-colors"
          >
            <Package className="h-8 w-8" />
            <div className="text-sm font-medium">還沒有產品，點此新增第一支</div>
            <div className="text-xs text-gray-400">建立一次，之後做內容都能直接選這支產品帶入素材</div>
          </button>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {products.map((p) => (
              <button
                key={p.id}
                onClick={() => router.push(`/clients/${clientId}/products/${p.id}`)}
                className="group text-left rounded-2xl border border-[#ebeff5] bg-white overflow-hidden hover:shadow-md hover:border-violet-200 transition-all"
              >
                <div className="aspect-square bg-gray-50 flex items-center justify-center overflow-hidden">
                  {p.heroImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.heroImageUrl} alt={p.name} className="h-full w-full object-contain p-3" />
                  ) : (
                    <div className="flex flex-col items-center gap-1 text-gray-300">
                      <ImageOff className="h-7 w-7" />
                      <span className="text-[11px]">尚無主圖</span>
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <div className="text-sm font-bold text-gray-900 truncate">{p.name}</div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-gray-400">
                    {p.category && <span className="px-1.5 py-0.5 rounded bg-violet-50 text-violet-600">{p.category}</span>}
                    <span className="inline-flex items-center gap-1"><Layers className="h-3 w-3" />{p._count?.assets ?? 0} 素材</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {showNew && (
          <NewProductModal
            clientId={clientId}
            onClose={() => setShowNew(false)}
            onCreated={(product) => {
              setShowNew(false);
              router.push(`/clients/${clientId}/products/${product.id}`);
            }}
          />
        )}
      </>
    );
  },
);
