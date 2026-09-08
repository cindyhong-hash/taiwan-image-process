"use client";
/**
 * AI 幫我排版：用商品素材包，問極少的問題（用途/尺寸/主要文字）→ 呼叫 /api/magic-layers/ad-layout
 * 組成一張可編輯設計稿 → seed 進 Magic Layers 編輯器（?seed=1）讓使用者自由微調。
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, X } from "lucide-react";
import { ML_WIZARD_SEED_KEY } from "@/components/activities/RolePickerModal";

const PURPOSES = [
  { k: "product", label: "產品介紹" },
  { k: "benefit", label: "賣點介紹" },
  { k: "scene", label: "情境貼文" },
  { k: "promo", label: "促銷活動" },
] as const;
const RATIOS = [
  { k: "1:1", label: "1:1 貼文" },
  { k: "4:5", label: "4:5 直式" },
  { k: "9:16", label: "限時動態" },
] as const;

export function AdLayoutModal({ clientId, productId, productName, onClose }: {
  clientId: string; productId: string; productName?: string; onClose: () => void;
}) {
  const router = useRouter();
  const [purpose, setPurpose] = useState<(typeof PURPOSES)[number]["k"]>("product");
  const [ratio, setRatio] = useState<(typeof RATIOS)[number]["k"]>("4:5");
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/magic-layers/ad-layout", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, productId, purpose, ratio, title: title.trim(), subtitle: subtitle.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "產生設計稿失敗");
      sessionStorage.setItem(ML_WIZARD_SEED_KEY, JSON.stringify({ layers: data.layers, docW: data.canvasWidth, docH: data.canvasHeight, clientId }));
      router.push(`/clients/${clientId}/magic-layers/compose?seed=1`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "產生設計稿失敗，請稍後再試");
      setBusy(false);
    }
  };

  const chip = (active: boolean) =>
    `rounded-full border-[1.5px] px-3.5 py-1.5 text-sm font-medium transition-colors ${active ? "border-violet-600 bg-violet-50 text-violet-700" : "border-[#ebeff5] bg-white text-gray-500 hover:border-violet-300"}`;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 backdrop-blur-sm p-4" onClick={() => !busy && onClose()}>
      <div className="w-full max-w-md rounded-2xl border border-[#ebeff5] bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 text-lg font-bold text-gray-900"><Sparkles className="h-5 w-5 text-violet-500" />AI 幫我排版</div>
            <p className="mt-1 text-sm text-gray-500">用{productName ? `「${productName}」` : ""}的素材包，自動排成一張可編輯設計稿。</p>
          </div>
          <button type="button" onClick={() => !busy && onClose()} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>

        <div className="mt-5 space-y-5">
          <div>
            <div className="text-sm font-bold text-gray-800">這張圖想做什麼？</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {PURPOSES.map((p) => <button key={p.k} type="button" onClick={() => setPurpose(p.k)} className={chip(purpose === p.k)}>{p.label}</button>)}
            </div>
          </div>
          <div>
            <div className="text-sm font-bold text-gray-800">尺寸</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {RATIOS.map((r) => <button key={r.k} type="button" onClick={() => setRatio(r.k)} className={chip(ratio === r.k)}>{r.label}</button>)}
            </div>
          </div>
          <div>
            <div className="text-sm font-bold text-gray-800">主要文字 <span className="font-normal text-gray-400">（選填）</span></div>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={30} placeholder="例：溫和去角質，讓肌膚更滑嫩"
              className="mt-2 h-11 w-full rounded-lg border-[1.5px] border-[#ebeff5] px-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
            <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} maxLength={30} placeholder="副標（選填）"
              className="mt-2 h-11 w-full rounded-lg border-[1.5px] border-[#ebeff5] px-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
          </div>
        </div>

        {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

        <button type="button" onClick={generate} disabled={busy}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-60">
          {busy ? <><Loader2 className="h-4 w-4 animate-spin" />排版中…（約十幾秒）</> : <><Sparkles className="h-4 w-4" />產生設計稿</>}
        </button>
      </div>
    </div>
  );
}
