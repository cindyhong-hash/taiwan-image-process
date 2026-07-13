"use client";
/**
 * BrandMemoryCards — wireframe v2 ④⑤ 品牌記憶 block。
 * 依 reference：**單一 block，中間一條垂直分隔線**——
 *   左：AI 已學習的品牌記憶（色票 + 😊 語調）｜右：風格禁忌（taboos + 歷史庫組數）。
 * 純展示現有品牌設定資料（AI 風格 DNA 自動掃描＝OAuth 依賴，排 backlog）。
 */
import { useEffect, useState } from "react";
import { Brain, Ban, Smile } from "lucide-react";

type BrandMemory = {
  primaryColor?: string;
  secondaryColor?: string | null;
  paletteColors?: unknown;
  toneLabels?: string[];
  taboos?: string[];
};

function parseColors(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((x) => typeof x === "string") as string[];
  if (typeof raw === "string") {
    try { const a = JSON.parse(raw); return Array.isArray(a) ? a.filter((x) => typeof x === "string") : []; }
    catch { return []; }
  }
  return [];
}

/** 依背景色光度決定文字用黑定白（色票 pill 可讀性）。 */
function textOn(hex: string): string {
  const h = hex.replace("#", "");
  if (h.length < 6) return "#1a1a18";
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62 ? "#1a1a18" : "#ffffff";
}

export function BrandMemoryCards({ clientId, data }: { clientId: string; data?: BrandMemory | null }) {
  const [fetched, setFetched] = useState<BrandMemory | null>(null);
  const [assetCount, setAssetCount] = useState<number>(0);
  // parent 已 load 咗 client → 用 props data，同頁面一齊 render（唔再二次 fetch、唔再遲彈）。
  const m = data ?? fetched;

  useEffect(() => {
    if (!clientId) return;
    if (!data) fetch(`/api/clients/${clientId}`).then((r) => r.json()).then(setFetched).catch(() => {});
    fetch(`/api/library/gallery?clientId=${clientId}`)
      .then((r) => r.json())
      .then((g) => setAssetCount(Array.isArray(g) ? g.length : 0))
      .catch(() => {});
  }, [clientId, data]);

  // 冇 data（純 fetch 模式 + 未返）先用 skeleton 留位。
  if (!m) {
    return <div className="border border-gray-200 rounded-xl bg-white px-4 py-3 mb-6 h-[76px] animate-pulse" aria-hidden />;
  }

  const colors = [m.primaryColor, m.secondaryColor, ...parseColors(m.paletteColors)]
    .filter((c): c is string => !!c)
    .filter((c, i, arr) => arr.indexOf(c) === i);
  const tones = m.toneLabels ?? [];
  const taboos = m.taboos ?? [];

  return (
    // 單一 block + 中間分隔線（reference 對齊）
    <div className="border border-gray-200 rounded-xl bg-white px-4 py-3 mb-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* 左：BRAND GUIDELINES */}
        <div className="sm:pr-4">
          <p className="text-xs font-medium text-gray-500 mb-2 flex items-center gap-1.5">
            <Brain className="h-3.5 w-3.5 text-emerald-600 shrink-0" /> AI 已學習的品牌記憶（BRAND GUIDELINES）
          </p>
          <div className="flex items-center gap-x-3 gap-y-2 flex-wrap">
            {colors.length > 0 ? (
              <div className="flex gap-1.5 flex-wrap">
                {colors.map((c) => (
                  <span key={c} className="text-[11px] font-medium px-2 py-0.5 rounded-full border"
                    style={{ background: c, color: textOn(c), borderColor: "rgba(0,0,0,0.12)" }}>
                    {c}
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-xs text-gray-400">未設定品牌色</span>
            )}
            <span className="text-xs text-gray-600 flex items-center gap-1">
              <Smile className="h-3.5 w-3.5 text-amber-500 shrink-0" />
              語調：{tones.length > 0 ? tones.join("、") : <span className="text-gray-400">未設定</span>}
            </span>
          </div>
        </div>

        {/* 右：NEGATIVE PROMPTS（左邊分隔線） */}
        <div className="sm:border-l sm:border-gray-200 sm:pl-4">
          <p className="text-xs font-medium text-red-600 mb-2 flex items-center gap-1.5">
            <Ban className="h-3.5 w-3.5 shrink-0" /> 風格禁忌（NEGATIVE PROMPTS）
          </p>
          <p className="text-xs text-gray-600 leading-relaxed">
            {taboos.length > 0
              ? `${taboos.join("、")}。`
              : "未設定禁忌 —— 去「品牌設定」加入，生成時會自動避開。"}
            {assetCount > 0 && `　歷史庫已有 ${assetCount} 組專屬素材可直接調用。`}
          </p>
        </div>
      </div>
    </div>
  );
}
