"use client";
/**
 * AI 幫我排版：用商品素材包，問極少的問題（用途/尺寸/主要文字）→ 呼叫 /api/magic-layers/ad-layout
 * 組成一張可編輯設計稿 → seed 進 Magic Layers 編輯器（?seed=1）讓使用者自由微調。
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Loader2, Sparkles, X } from "lucide-react";
import { ML_WIZARD_SEED_KEY } from "@/components/activities/RolePickerModal";
import {
  selectAdLayoutOption,
  type AdLayoutOption,
} from "@/lib/magic-layers/ad-layout-options";

import { AdLayoutPreviewCanvas } from "./AdLayoutPreviewCanvas";
import type { LayerData } from "@/lib/magic-layers/types.ts";

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

type LayoutCanvas = { width: number; height: number };

function LayoutOptionPreview({
  option,
  canvas,
  selected,
  onSelect, onReady,
}: {
  option: AdLayoutOption;
  canvas: LayoutCanvas;
  selected: boolean;
  onSelect: () => void;
  onReady: (layers: LayerData[] | null) => void;
}) {

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`group relative overflow-hidden rounded-xl border-2 text-left transition-all ${
        selected
          ? "border-violet-600 shadow-[0_8px_20px_rgba(109,74,255,0.16)]"
          : "border-[#e8eaf0] hover:border-violet-300"
      }`}
    >
      <div className="relative overflow-hidden bg-[#f4f5f8]" style={{ aspectRatio: `${canvas.width} / ${canvas.height}` }}>
        <AdLayoutPreviewCanvas layers={option.layers} width={canvas.width} height={canvas.height} onReady={onReady} />
        {selected && (
          <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-violet-600 text-white shadow-sm">
            <Check className="h-4 w-4" />
          </span>
        )}
      </div>
      <div className="bg-white px-3 py-2.5">
        <div className="text-sm font-bold text-gray-900">{option.label}</div>
        <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-gray-500">{option.description}</p>
      </div>
    </button>
  );
}

export function AdLayoutModal({ clientId, productId, productName, onClose }: {
  clientId: string; productId: string; productName?: string; onClose: () => void;
}) {
  const router = useRouter();
  const [purpose, setPurpose] = useState<(typeof PURPOSES)[number]["k"]>("product");
  const [ratio, setRatio] = useState<(typeof RATIOS)[number]["k"]>("4:5");
  const [title, setTitle] = useState("");
  const [benefitText, setBenefitText] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<AdLayoutOption[] | null>(null);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [readyLayers, setReadyLayers] = useState<Record<string, LayerData[] | null>>({});
  const [canvas, setCanvas] = useState<LayoutCanvas | null>(null);

  const generate = async () => {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/magic-layers/ad-layout", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, productId, purpose, ratio, title: title.trim(), subtitle: subtitle.trim(), benefits: purpose === "benefit" ? benefitText.split("\n").map(s=>s.trim()).filter(Boolean) : [] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "產生設計稿失敗");
      if (!Array.isArray(data.options) || data.options.length === 0) {
        throw new Error("沒有可選擇的版型，請稍後再試");
      }
      setReadyLayers({});
      setOptions(data.options);
      setSelectedOptionId(data.options[0].id);
      setCanvas({ width: data.canvasWidth, height: data.canvasHeight });
    } catch (e) {
      setError(e instanceof Error ? e.message : "產生設計稿失敗，請稍後再試");
    } finally {
      setBusy(false);   // 成功也要解除 busy，否則「使用這個方向進入編輯」會一直卡在「排版中…」disabled
    }
  };

  const continueToEditor = () => {
    const selected = options && selectedOptionId
      ? selectAdLayoutOption(options, selectedOptionId)
      : null;
    if (!selected || !canvas || !readyLayers[selected.id]) return;

    sessionStorage.setItem(ML_WIZARD_SEED_KEY, JSON.stringify({
      layers: readyLayers[selected.id],
      docW: canvas.width,
      docH: canvas.height,
      clientId,
    }));
    router.push(`/clients/${clientId}/magic-layers/compose?seed=1`);
  };

  const chip = (active: boolean) =>
    `rounded-full border-[1.5px] px-3.5 py-1.5 text-sm font-medium transition-colors ${active ? "border-violet-600 bg-violet-50 text-violet-700" : "border-[#ebeff5] bg-white text-gray-500 hover:border-violet-300"}`;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 backdrop-blur-sm p-4" onClick={() => !busy && onClose()}>
      <div className="w-full max-w-md rounded-2xl border border-[#ebeff5] bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 text-lg font-bold text-gray-900"><Sparkles className="h-5 w-5 text-violet-500" />AI 幫我設計</div>
            <p className="mt-1 text-sm text-gray-500">用{productName ? `「${productName}」` : ""}的素材包，自動排成一張可編輯設計稿。</p>
          </div>
          <button type="button" onClick={() => !busy && onClose()} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>

        {options && canvas ? (
          <div className="mt-5">
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="text-sm font-bold text-gray-900">選一個設計方向</div>
                <p className="mt-1 text-xs leading-5 text-gray-500">每個方向都已挑選必要素材並建立文字層級；下一步仍可自由調整。</p>
              </div>
              <button type="button" onClick={() => { setOptions(null); setCanvas(null); setSelectedOptionId(null); }} className="flex shrink-0 items-center gap-1 text-xs font-medium text-gray-500 hover:text-violet-700">
                <ArrowLeft className="h-3.5 w-3.5" />重選條件
              </button>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {options.map((option) => (
                <LayoutOptionPreview
                  key={option.id}
                  option={option}
                  onReady={(layers) => setReadyLayers(prev => ({...prev, [option.id]: layers}))}
                  canvas={canvas}
                  selected={selectedOptionId === option.id}
                  onSelect={() => setSelectedOptionId(option.id)}
                />
              ))}
            </div>
          </div>
        ) : <div className="mt-5 space-y-5">
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
        </div>}

        {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

        {!options && purpose === "benefit" && <label className="mt-3 block text-sm text-gray-600">賣點（選填，最多三條，每條 40 字）<textarea value={benefitText} onChange={e=>setBenefitText(e.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-gray-200 p-2" placeholder="每行填寫一個已確認的產品賣點" /></label>}
        <button type="button" onClick={options ? continueToEditor : generate} disabled={busy || Boolean(options && (!selectedOptionId || !readyLayers[selectedOptionId]))}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-60">
          {busy ? <><Loader2 className="h-4 w-4 animate-spin" />正在建立三個可編輯設計稿…</> : options ? <><Check className="h-4 w-4" />使用這份設計稿進入編輯</> : <><Sparkles className="h-4 w-4" />建立 3 個設計稿</>}
        </button>
      </div>
    </div>
  );
}
