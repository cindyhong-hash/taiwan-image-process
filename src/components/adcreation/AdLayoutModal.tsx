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

const PREVIEW_POSITIONS: Record<string, { product: string; benefit: string; title: string }> = {
  "product-focus": {
    product: "bottom-2 right-[7%] h-[58%] w-[48%]",
    benefit: "bottom-[17%] left-[7%] h-[25%] w-[35%]",
    title: "left-[8%] top-[12%] w-[60%]",
  },
  editorial: {
    product: "bottom-[8%] left-[9%] h-[62%] w-[40%]",
    benefit: "right-[6%] top-[16%] h-[37%] w-[44%]",
    title: "bottom-[13%] right-[7%] w-[47%]",
  },
  "scene-led": {
    product: "bottom-[7%] right-[8%] h-[48%] w-[43%]",
    benefit: "bottom-[12%] left-[7%] h-[20%] w-[28%]",
    title: "left-[8%] top-[13%] w-[64%]",
  },
};

function LayoutOptionPreview({
  option,
  selected,
  onSelect,
}: {
  option: AdLayoutOption;
  selected: boolean;
  onSelect: () => void;
}) {
  const preview = option.preview;
  const position = PREVIEW_POSITIONS[option.id] ?? PREVIEW_POSITIONS["product-focus"];

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
      <div className="relative aspect-[4/3] overflow-hidden bg-[#f4f5f8]">
        {preview?.backgroundUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview.backgroundUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/10 via-transparent to-white/5" />
        {preview?.benefitUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview.benefitUrl} alt="" className={`absolute object-contain ${position.benefit}`} />
        )}
        {preview?.heroUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview.heroUrl} alt="" className={`absolute object-contain drop-shadow-xl ${position.product}`} />
        )}
        {preview?.purpose === "promo" && <div className="absolute left-[5%] top-[6%] h-[25%] w-[54%] rounded-lg" style={{ backgroundColor: preview.accentColor }} />}
        <div className={`absolute ${position.title} text-[11px] font-extrabold leading-tight`} style={{ color: preview?.purpose === "promo" ? "#ffffff" : preview?.textColor }}>
          {option.id === "editorial" ? "為日常留一點\n溫柔呵護" : option.id === "scene-led" ? "把美好，\n放進生活裡" : "剛剛好的\n日常保養"}
        </div>
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
  const [subtitle, setSubtitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<AdLayoutOption[] | null>(null);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [canvas, setCanvas] = useState<LayoutCanvas | null>(null);

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
      if (!Array.isArray(data.options) || data.options.length === 0) {
        throw new Error("沒有可選擇的版型，請稍後再試");
      }
      setOptions(data.options);
      setSelectedOptionId(data.options[0].id);
      setCanvas({ width: data.canvasWidth, height: data.canvasHeight });
    } catch (e) {
      setError(e instanceof Error ? e.message : "產生設計稿失敗，請稍後再試");
      setBusy(false);
    }
  };

  const continueToEditor = () => {
    const selected = options && selectedOptionId
      ? selectAdLayoutOption(options, selectedOptionId)
      : null;
    if (!selected || !canvas) return;

    sessionStorage.setItem(ML_WIZARD_SEED_KEY, JSON.stringify({
      layers: selected.layers,
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
            <div className="flex items-center gap-2 text-lg font-bold text-gray-900"><Sparkles className="h-5 w-5 text-violet-500" />AI 幫我排版</div>
            <p className="mt-1 text-sm text-gray-500">用{productName ? `「${productName}」` : ""}的素材包，自動排成一張可編輯設計稿。</p>
          </div>
          <button type="button" onClick={() => !busy && onClose()} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>

        {options && canvas ? (
          <div className="mt-5">
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="text-sm font-bold text-gray-900">選一個設計方向</div>
                <p className="mt-1 text-xs leading-5 text-gray-500">三個方向都可在下一步自由調整文字、尺寸與圖層。</p>
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

        <button type="button" onClick={options ? continueToEditor : generate} disabled={busy}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-60">
          {busy ? <><Loader2 className="h-4 w-4 animate-spin" />排版中…（約十幾秒）</> : options ? <><Check className="h-4 w-4" />使用這個方向進入編輯</> : <><Sparkles className="h-4 w-4" />產生設計稿</>}
        </button>
      </div>
    </div>
  );
}
