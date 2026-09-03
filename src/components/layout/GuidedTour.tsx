"use client";
import { useEffect, useLayoutEffect, useState, useCallback } from "react";

export type TourStep = {
  /** CSS selector for the element to point at（例如 [data-tour="nav-home"]）；找不到就置中顯示。 */
  anchor?: string;
  title: string;
  desc: string;
};

type Rect = { top: number; left: number; width: number; height: number };

const CARD_W = 360;

/**
 * GuidedTour — 快速教學步驟導覽（coach mark）。
 * 紫色步驟卡：第 X/N 步 + 進度點、標題、說明、略過 / 上一步 / 下一步。
 * 有 anchor 就指向該元素（右側顯示 + 高亮框），沒有就置中。
 */
export function GuidedTour({ steps, onClose }: { steps: TourStep[]; onClose: () => void }) {
  const [i, setI] = useState(0);
  const [anchorRect, setAnchorRect] = useState<Rect | null>(null);
  const step = steps[i];
  const total = steps.length;

  const measure = useCallback(() => {
    if (!step?.anchor) { setAnchorRect(null); return; }
    const el = document.querySelector(step.anchor) as HTMLElement | null;
    if (!el) { setAnchorRect(null); return; }
    el.scrollIntoView({ block: "center", inline: "nearest" });
    const r = el.getBoundingClientRect();
    setAnchorRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [step?.anchor]);

  useLayoutEffect(() => { measure(); }, [measure]);
  useEffect(() => {
    const on = () => measure();
    window.addEventListener("resize", on);
    window.addEventListener("scroll", on, true);
    return () => { window.removeEventListener("resize", on); window.removeEventListener("scroll", on, true); };
  }, [measure]);

  // Esc 關閉；←/→ 切步
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") setI((x) => Math.min(x + 1, total - 1));
      else if (e.key === "ArrowLeft") setI((x) => Math.max(x - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, total]);

  if (!step) return null;

  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;

  // 卡片位置：有 anchor → 放右側（tail 指左）；放不下就置中。
  let cardStyle: React.CSSProperties;
  let showTail = false;
  if (anchorRect && anchorRect.left + anchorRect.width + 16 + CARD_W < vw) {
    const top = Math.min(Math.max(anchorRect.top - 8, 12), vh - 240);
    cardStyle = { position: "fixed", top, left: anchorRect.left + anchorRect.width + 16, width: CARD_W };
    showTail = true;
  } else {
    cardStyle = { position: "fixed", top: "50%", left: "50%", width: CARD_W, transform: "translate(-50%,-50%)" };
  }

  const isFirst = i === 0;
  const isLast = i === total - 1;

  return (
    <div className="fixed inset-0 z-[100]">
      {/* 暗色遮罩，點擊關閉 */}
      <div className="absolute inset-0 bg-black/45" onClick={onClose} />

      {/* 高亮錨點 */}
      {anchorRect && (
        <div
          className="pointer-events-none absolute rounded-xl ring-2 ring-white ring-offset-2 ring-offset-violet-600/0 transition-all"
          style={{
            top: anchorRect.top - 4, left: anchorRect.left - 4,
            width: anchorRect.width + 8, height: anchorRect.height + 8,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.35)",
          }}
        />
      )}

      {/* 步驟卡 */}
      <div style={cardStyle} className="relative rounded-2xl bg-violet-600 p-6 text-white shadow-2xl">
        {showTail && (
          <span className="absolute -left-1.5 top-6 h-3 w-3 rotate-45 bg-violet-600" />
        )}
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-semibold text-white/80">第 {i + 1} / {total} 步</span>
          <div className="flex items-center gap-1.5">
            {steps.map((_, k) => (
              <span key={k} className={`h-1.5 rounded-full transition-all ${k === i ? "w-5 bg-white" : "w-3 bg-white/35"}`} />
            ))}
          </div>
        </div>
        <h3 className="text-lg font-bold leading-snug">{step.title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-white/85">{step.desc}</p>
        <div className="mt-5 flex items-center justify-between">
          <button type="button" onClick={onClose} className="text-sm text-white/70 hover:text-white transition-colors">略過</button>
          <div className="flex items-center gap-2">
            {!isFirst && (
              <button type="button" onClick={() => setI((x) => x - 1)}
                className="rounded-full px-4 py-1.5 text-sm font-medium text-white/90 hover:bg-white/10 transition-colors">
                上一步
              </button>
            )}
            <button type="button" onClick={() => (isLast ? onClose() : setI((x) => x + 1))}
              className="rounded-full border border-white px-5 py-1.5 text-sm font-bold text-white hover:bg-white hover:text-violet-600 transition-colors">
              {isLast ? "完成" : "下一步"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
