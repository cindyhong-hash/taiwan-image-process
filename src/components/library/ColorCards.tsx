"use client";
/**
 * ColorCards — coolors.co-style palette display.
 * Renders palette colors as side-by-side blocks with the hex (and role label)
 * shown on each block. Click a block to copy its hex.
 */
import { useState } from "react";
import { Lock } from "lucide-react";
import type { PaletteColor } from "@/types/library";

/** Pick black/white text for legibility on a given hex background. */
export function readableText(hex: string): string {
  const h = hex.replace("#", "");
  if (h.length < 6) return "#1f2937";
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#1f2937" : "#ffffff";
}

export function ColorCards({
  colors,
  height = "h-20",
  showRole = true,
  showHex = true,
  // 揀色複製功能用 <button>；當呢個 ColorCards 本身已經包喺另一個可撳嘅 <button>（例如
  // BlockCard 嘅「撳去重新揀」），HTML 唔准 button 入面再有 button（會觸發 hydration error），
  // 呢種情況要傳 interactive={false} 改用純顯示嘅 <div>，唔准複製。
  interactive = true,
  // 🔒 主色鎖定標示：預設唔顯示——淨係「目前已選用緊嗰個配色」（例如 PromptComposer 嘅
  // BlockCard 預覽）先顯示，等用戶知道呢個配色套用喺呢次生成會鎖住主色；純粹瀏覽/揀選列表
  // （素材庫 gallery、SlotPickerModal 嘅候選清單）唔應該顯示，因為嗰度仲未揀實用邊個。
  showLock = false,
}: {
  colors: PaletteColor[];
  height?: string;
  showRole?: boolean;
  showHex?: boolean;
  interactive?: boolean;
  showLock?: boolean;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  if (!colors.length) return null;

  const copy = async (hex: string) => {
    try {
      await navigator.clipboard.writeText(hex);
      setCopied(hex);
      setTimeout(() => setCopied((c) => (c === hex ? null : c)), 1500);
    } catch {
      /* clipboard may be unavailable */
    }
  };

  const Swatch = interactive ? "button" : "div";

  return (
    <div className={`flex w-full overflow-hidden rounded-xl border border-gray-200 ${height}`}>
      {colors.map((c, i) => {
        const txt = readableText(c.hex);
        return (
          <Swatch
            key={`${c.hex}-${i}`}
            {...(interactive ? {
              type: "button",
              onClick: (e: React.MouseEvent) => { e.stopPropagation(); copy(c.hex); },
              title: `${c.label} ${c.hex}（點擊複製）`,
            } : {})}
            className={`group/swatch relative flex-1 flex flex-col justify-end items-center pb-1.5 [transition:flex-grow_280ms_ease-in-out,opacity_200ms] ${interactive ? "hover:[flex-grow:2]" : ""}`}
            style={{ backgroundColor: c.hex, color: txt }}
          >
            {/* 主色一定會用、唔可以取消——直接喺色格中間常駐一個鎖頭，唔理總共幾多隻色、主色排第幾都跟得住。 */}
            {showLock && c.role === "primary" && (
              <Lock className="absolute inset-0 m-auto h-3.5 w-3.5" style={{ color: txt }} />
            )}
            {showRole && (
              <span className="text-[9px] font-medium opacity-0 group-hover/swatch:opacity-80 transition-opacity leading-none mb-0.5">{c.label}</span>
            )}
            {showHex && (
              <span className="text-[10px] font-mono font-semibold uppercase leading-none opacity-0 group-hover/swatch:opacity-100 transition-opacity">
                {copied === c.hex ? "✓" : c.hex}
              </span>
            )}
          </Swatch>
        );
      })}
    </div>
  );
}
