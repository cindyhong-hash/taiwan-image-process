"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Sparkles, Trash2, Loader2, ImageOff, RefreshCw } from "lucide-react";
import { ASSET_ROLE_LABELS, type Product } from "@/lib/productMeta";
import { ImageSetModal } from "@/components/products/ImageSetModal";

export default function ProductDetailPage({
  params,
}: {
  params: Promise<{ clientId: string; productId: string }>;
}) {
  const router = useRouter();
  const [clientId, setClientId] = useState("");
  const [productId, setProductId] = useState("");
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [recutting, setRecutting] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [showSet, setShowSet] = useState(false);

  useEffect(() => {
    params.then(({ clientId, productId }) => { setClientId(clientId); setProductId(productId); });
  }, [params]);

  const load = useCallback(() => {
    if (!productId) return;
    fetch(`/api/products/${productId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setProduct(data))
      .finally(() => setLoading(false));
  }, [productId]);

  useEffect(() => { load(); }, [load]);

  const handleRecut = useCallback(async () => {
    setRecutting(true);
    setNote(null);
    try {
      const res = await fetch(`/api/products/${productId}/hero`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "去背失敗"); }
      load();
    } catch (e) {
      setNote(e instanceof Error ? e.message : "去背失敗");
    } finally {
      setRecutting(false);
    }
  }, [productId, load]);

  const handleDelete = useCallback(async () => {
    if (!confirm("確定刪除這支產品？（它的素材會變回一般素材，不會刪圖）")) return;
    await fetch(`/api/products/${productId}`, { method: "DELETE" });
    router.push(`/clients/${clientId}/components`);
  }, [productId, clientId, router]);

  if (loading) return <div className="text-gray-400 py-12 text-center">載入中…</div>;
  if (!product) return <div className="text-gray-400 py-12 text-center">找不到這支產品</div>;

  // 資產依角色分組
  const assets = product.assets ?? [];
  const grouped: Record<string, typeof assets> = {};
  for (const a of assets) {
    const role = a.assetRole ?? "finished";
    (grouped[role] ??= []).push(a);
  }

  return (
    <div className="max-w-4xl">
      <button
        onClick={() => router.push(`/clients/${clientId}/components`)}
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-4"
      >
        <ArrowLeft className="h-4 w-4" /> 返回素材庫
      </button>

      {/* 頭部：主圖 + 資訊 */}
      <div className="rounded-2xl border border-[#ebeff5] bg-white p-6 sm:p-8 flex flex-col sm:flex-row gap-6">
        <div className="w-full sm:w-56 shrink-0">
          <div className="aspect-square rounded-xl bg-gray-50 border border-[#ebeff5] flex items-center justify-center overflow-hidden">
            {product.heroImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={product.heroImageUrl} alt={product.name} className="h-full w-full object-contain p-3" />
            ) : (
              <div className="flex flex-col items-center gap-1 text-gray-300">
                <ImageOff className="h-8 w-8" />
                <span className="text-xs">尚無去背主圖</span>
              </div>
            )}
          </div>
          {product.rawImageUrls.length > 0 && (
            <button
              onClick={handleRecut}
              disabled={recutting}
              className="mt-2 w-full inline-flex items-center justify-center gap-1.5 text-xs text-gray-500 hover:text-violet-600 border border-[#ebeff5] rounded-lg py-1.5 disabled:opacity-50"
            >
              {recutting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {product.heroImageUrl ? "重新去背" : "產生去背主圖"}
            </button>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{product.name}</h1>
              {product.category && (
                <span className="inline-block mt-1.5 text-xs px-2 py-0.5 rounded bg-violet-50 text-violet-600">{product.category}</span>
              )}
            </div>
            <button onClick={handleDelete} className="text-gray-300 hover:text-red-500 shrink-0" aria-label="刪除產品">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          {product.description && <p className="mt-3 text-sm text-gray-500 whitespace-pre-wrap">{product.description}</p>}

          {/* 原始照 */}
          {product.rawImageUrls.length > 0 && (
            <div className="mt-4">
              <div className="text-xs text-gray-400 mb-1.5">原始商品照</div>
              <div className="flex flex-wrap gap-2">
                {product.rawImageUrls.map((url) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={url} src={url} alt="" className="h-14 w-14 rounded-lg object-cover border border-[#ebeff5]" />
                ))}
              </div>
            </div>
          )}

          {/* 建立商品套圖 CTA（單元 D 接上生成流程） */}
          <div className="mt-6">
            <button
              onClick={() => setShowSet(true)}
              className="inline-flex items-center gap-2 rounded-full bg-violet-600 hover:bg-violet-700 text-white px-6 py-3 text-sm font-bold shadow-[0_8px_8px_rgba(124,58,237,0.15)]"
            >
              <Sparkles className="h-[18px] w-[18px]" /> AI 建立商品套圖
            </button>
            {note && <p className="mt-2 text-xs text-gray-400">{note}</p>}
          </div>
        </div>
      </div>

      {/* 資產分區 */}
      <div className="mt-6">
        <h2 className="text-sm font-bold text-gray-900 mb-3">產品素材</h2>
        {assets.length === 0 ? (
          <div className="rounded-2xl border-[1.5px] border-dashed border-[#ebeff5] bg-white py-12 text-center text-sm text-gray-400">
            還沒有素材，用上方「AI 建立商品套圖」生成一組可疊積木
          </div>
        ) : (
          <div className="space-y-5">
            {Object.entries(grouped).map(([role, items]) => (
              <div key={role}>
                <div className="text-xs text-gray-400 mb-1.5">{ASSET_ROLE_LABELS[role] ?? role}</div>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                  {items.map((a) => (
                    <div key={a.id} className="aspect-square rounded-xl bg-gray-50 border border-[#ebeff5] overflow-hidden flex items-center justify-center">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={a.imageUrl} alt="" className="h-full w-full object-contain p-2" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showSet && (
        <ImageSetModal
          productId={productId}
          onClose={() => setShowSet(false)}
          onFinished={load}
        />
      )}
    </div>
  );
}
