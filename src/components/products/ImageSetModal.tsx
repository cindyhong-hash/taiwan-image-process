"use client";
import { useEffect, useState } from "react";
import { X, Sparkles, Loader2, Check, AlertCircle } from "lucide-react";
import { pollLibraryImage } from "@/lib/pollLibraryImage";
import type { SetItem } from "@/lib/imageSet";

type ItemState = SetItem & { checked: boolean };
type GenState = { id: string; role: string; label: string; status: "GENERATING" | "DONE" | "FAILED"; imageUrl?: string };

// [PRODUCT] AI 建立商品套圖：勾選 AI 建議的積木 → 批次生成 → 逐張輪詢進度
export function ImageSetModal({
  productId,
  onClose,
  onFinished,
}: {
  productId: string;
  onClose: () => void;
  onFinished: () => void;
}) {
  const [items, setItems] = useState<ItemState[]>([]);
  const [hasHero, setHasHero] = useState(true);
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<"pick" | "generating" | "done">("pick");
  const [gen, setGen] = useState<GenState[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/products/${productId}/image-set`)
      .then((r) => r.json())
      .then((data) => {
        if (!alive) return;
        const hero = !!data.hasHero;
        setHasHero(hero);
        setItems((data.suggestions as SetItem[]).map((s) => ({ ...s, checked: hero || s.path !== "edit" })));
      })
      .catch(() => setError("無法載入套圖建議"))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [productId]);

  const toggle = (role: string) =>
    setItems((prev) => prev.map((it) => (it.role === role ? { ...it, checked: !it.checked } : it)));

  const chosen = items.filter((it) => it.checked);

  async function handleGenerate() {
    if (!chosen.length) return;
    setError(null);
    setPhase("generating");
    try {
      const res = await fetch(`/api/products/${productId}/image-set`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: chosen.map(({ role, label, path, cutout, sceneCn }) => ({ role, label, path, cutout, sceneCn })) }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "生成失敗"); }
      const data = await res.json();
      const created: GenState[] = data.items.map((i: { id: string; role: string; label: string }) => ({ ...i, status: "GENERATING" as const }));
      setGen(created);

      // 逐張輪詢，完成/失敗即更新該張狀態
      await Promise.all(
        created.map(async (c) => {
          const result = await pollLibraryImage(c.id);
          setGen((prev) => prev.map((g) => (g.id === c.id
            ? { ...g, status: result.status === "DONE" ? "DONE" : "FAILED", imageUrl: result.imageUrl }
            : g)));
        }),
      );
      setPhase("done");
      onFinished(); // 讓詳情頁刷新資產
    } catch (e) {
      setError(e instanceof Error ? e.message : "生成失敗");
      setPhase("pick");
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl bg-white p-6 sm:p-8 shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-violet-600" /> AI 建立商品套圖
            </h2>
            <p className="mt-1 text-xs text-gray-400">生成一組可疊積木，存回這支產品，之後排版/生成直接複用</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="關閉">
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading ? (
          <div className="py-12 text-center text-gray-400 text-sm">載入建議中…</div>
        ) : phase === "pick" ? (
          <>
            {!hasHero && (
              <div className="mb-4 flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-700">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>尚無去背主圖。實拍類（主視覺／質地）需要主圖當錨點，已先取消勾選；可先生成概念／背景類，或回產品頁產生主圖。</span>
              </div>
            )}
            <div className="space-y-2">
              {items.map((it) => {
                const disabled = it.path === "edit" && !hasHero;
                return (
                  <label
                    key={it.role}
                    className={`flex items-start gap-3 rounded-xl border-[1.5px] p-3 cursor-pointer transition-colors ${
                      it.checked ? "border-violet-600 bg-violet-50" : "border-[#ebeff5] bg-white hover:border-violet-300"
                    } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={it.checked}
                      disabled={disabled}
                      onChange={() => toggle(it.role)}
                      className="mt-0.5 accent-violet-600"
                    />
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-gray-900 flex items-center gap-2">
                        {it.label}
                        <span className="text-[10px] font-normal text-gray-400">{it.path === "edit" ? "以主圖合成" : "概念生圖"}</span>
                      </div>
                      <div className="text-xs text-gray-500 truncate">{it.sceneCn}</div>
                    </div>
                  </label>
                );
              })}
            </div>

            {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

            <div className="flex flex-col items-center pt-6">
              <button
                onClick={handleGenerate}
                disabled={!chosen.length}
                className="inline-flex items-center gap-2 rounded-full bg-violet-600 hover:bg-violet-700 text-white px-12 py-3.5 text-sm font-bold shadow-[0_8px_8px_rgba(124,58,237,0.15)] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Sparkles className="h-[18px] w-[18px]" /> 生成 {chosen.length} 張商品素材
              </button>
            </div>
          </>
        ) : (
          // generating / done
          <div className="space-y-2">
            {gen.map((g) => (
              <div key={g.id} className="flex items-center gap-3 rounded-xl border border-[#ebeff5] p-2.5">
                <div className="h-12 w-12 shrink-0 rounded-lg bg-gray-50 border border-[#ebeff5] overflow-hidden flex items-center justify-center">
                  {g.status === "DONE" && g.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={g.imageUrl} alt="" className="h-full w-full object-contain p-1" />
                  ) : g.status === "GENERATING" ? (
                    <Loader2 className="h-4 w-4 animate-spin text-violet-500" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-red-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900">{g.label}</div>
                  <div className="text-xs text-gray-400">
                    {g.status === "GENERATING" ? "生成中…" : g.status === "DONE" ? "完成" : "失敗（可稍後重生）"}
                  </div>
                </div>
                {g.status === "DONE" && <Check className="h-4 w-4 text-emerald-500 shrink-0" />}
              </div>
            ))}

            {phase === "done" && (
              <div className="flex flex-col items-center pt-4">
                <div className="text-sm text-gray-500 mb-3">✓ 已儲存至產品素材</div>
                <button
                  onClick={onClose}
                  className="rounded-full bg-violet-600 hover:bg-violet-700 text-white px-10 py-3 text-sm font-bold"
                >
                  完成
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
