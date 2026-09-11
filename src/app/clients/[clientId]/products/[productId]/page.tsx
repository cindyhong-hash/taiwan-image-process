"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Sparkles, Trash2, Loader2, ImageOff, RefreshCw, PenLine } from "lucide-react";
import { ASSET_ROLE_LABELS, CORE_SET_ROLES as CORE_ROLES, imageSetCompleteness, type Product } from "@/lib/productMeta";
import { ImageSetModal } from "@/components/products/ImageSetModal";
import { ACTIVITY_HANDOFF_KEY } from "@/components/activities/RolePickerModal";
import { AdLayoutModal } from "@/components/adcreation/AdLayoutModal";
import { useAdLayoutEnabled } from "@/lib/feature-flags";

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
  const [showAdLayout, setShowAdLayout] = useState(false);
  // 旗標關著時點按鈕不開排版流程，改顯示「籌備中」說明。
  const [showAdLayoutSoon, setShowAdLayoutSoon] = useState(false);
  const adLayoutOn = useAdLayoutEnabled();

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

  // [單元E] 完整度：核心套圖角色有幾種已備齊（只算已完成的素材）
  const presentRoles = new Set(assets.filter((a) => a.status === "DONE" && a.assetRole).map((a) => a.assetRole as string));
  const { doneCount, missingRoles } = imageSetCompleteness(presentRoles);

  // [單元F] 用這組素材建立圖文：帶「商品 context + 素材包」進建立圖文（fromProductAssets 模式）。
  // 商品主體放進「產品圖」欄（不是參考風格圖）；賣點/定位只當 context，不直接當畫面 prompt。
  const hasBridgeImage = Boolean(product.heroImageUrl || assets[0]?.imageUrl || product.rawImageUrls[0]);
  // 先隱藏「使用這組素材建立圖文」(Road A) 入口，保留程式碼與流程；改 true 即可恢復。
  const SHOW_USE_FOR_CONTENT = false;
  const useForContent = () => {
    try {
      const pack = assets
        .filter((a) => a.status === "DONE" && a.assetRole && a.imageUrl)
        .map((a) => ({ role: a.assetRole as string, url: a.imageUrl as string }));
      const heroUrl = product.heroImageUrl || pack.find((p) => p.role === "hero")?.url || product.rawImageUrls[0] || "";
      sessionStorage.setItem(ACTIVITY_HANDOFF_KEY, JSON.stringify({
        clientId,
        fromProduct: { productId, name: product.name, description: product.description ?? "", category: product.category ?? "" },
        productImageUrls: heroUrl ? [heroUrl] : [],
        assetPack: pack,
      }));
    } catch { /* ignore */ }
    router.push(`/clients/${clientId}/activities/new`);
  };


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

          {/* CTA 列：建立套圖 + 用這組素材建立圖文（橋接單圖流程） */}
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <button
              onClick={() => setShowSet(true)}
              className="inline-flex items-center gap-2 rounded-full bg-violet-600 hover:bg-violet-700 text-white px-6 py-3 text-sm font-bold shadow-[0_8px_8px_rgba(124,58,237,0.15)]"
            >
              <Sparkles className="h-[18px] w-[18px]" /> AI 建立商品套圖
            </button>
            {SHOW_USE_FOR_CONTENT && (
              <button
                onClick={useForContent}
                disabled={!hasBridgeImage}
                className="inline-flex items-center gap-2 rounded-full border-[1.5px] border-violet-200 bg-white text-violet-700 hover:bg-violet-50 px-5 py-3 text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <PenLine className="h-[18px] w-[18px]" /> 使用這組素材建立圖文
              </button>
            )}
            <button
              onClick={() => (adLayoutOn ? setShowAdLayout(true) : setShowAdLayoutSoon(true))}
              disabled={!hasBridgeImage}
              title={adLayoutOn ? "使用商品素材，自動建立可編輯的設計稿" : "新功能還在籌備中"}
              className="inline-flex items-center gap-2 rounded-full border-[1.5px] border-violet-200 bg-white text-violet-700 hover:bg-violet-50 px-5 py-3 text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Sparkles className="h-[18px] w-[18px]" /> AI 幫我排版
            </button>
          </div>
          <p className="mt-2 text-xs text-gray-400">
            {adLayoutOn
              ? "「AI 幫我排版」會用商品素材自動排成可編輯設計稿，進編輯器後可自由微調。"
              : "「AI 幫我排版」還在籌備中，敬請期待。"}
          </p>
          {note && <p className="mt-2 text-xs text-gray-400">{note}</p>}

          {/* [單元E] 資產完整度儀表 */}
          <div className="mt-5">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-bold text-gray-900">資產完整度</span>
              <span className="text-xs text-gray-400">{doneCount}/{CORE_ROLES.length}</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
              <div className="h-full bg-violet-500 rounded-full transition-all" style={{ width: `${(doneCount / CORE_ROLES.length) * 100}%` }} />
            </div>
            {missingRoles.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-gray-400">待補：</span>
                {missingRoles.map((r) => (
                  <button
                    key={r}
                    onClick={() => setShowSet(true)}
                    className="text-xs px-2 py-0.5 rounded-full border border-[#ebeff5] text-gray-500 hover:border-violet-300 hover:text-violet-600 transition-colors"
                  >
                    + {ASSET_ROLE_LABELS[r] ?? r}
                  </button>
                ))}
              </div>
            )}
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
      {/* 籌備中提示：功能旗標關著時取代排版流程 */}
      {showAdLayoutSoon && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4"
          onClick={() => setShowAdLayoutSoon(false)}
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-violet-50">
              <Sparkles className="h-5 w-5 text-violet-600" />
            </div>
            <h3 className="text-base font-bold text-gray-900">新功能還在籌備中</h3>
            <p className="mt-2 text-xs leading-relaxed text-gray-500">
              「AI 幫我排版」正在調整版面品質，完成後會開放使用。<br />
              目前可以先用「自由設計」自己排版。
            </p>
            <button
              type="button"
              onClick={() => setShowAdLayoutSoon(false)}
              className="mt-5 w-full rounded-full bg-violet-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-violet-700"
            >
              我知道了
            </button>
          </div>
        </div>
      )}

      {adLayoutOn && showAdLayout && (
        <AdLayoutModal
          clientId={clientId}
          productId={productId}
          productName={product.name}
          onClose={() => setShowAdLayout(false)}
        />
      )}
    </div>
  );
}
