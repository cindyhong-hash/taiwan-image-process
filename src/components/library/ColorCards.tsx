"use client";
/**
 * ColorCards — coolors.co-style palette display.
 * Renders palette colors as side-by-side blocks with the hex (and role label)
 * shown on each block. Click a block to copy its hex.
 */
import { useState } from "react";
import type { PaletteColor } from "@/types/library";

/** Pick black/white text for legibility on a given hex background. */
function readableText(hex: string): string {
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
}: {
  colors: PaletteColor[];
  height?: string;
  showRole?: boolean;
  showHex?: boolean;
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

  return (
    <div className={`flex w-full overflow-hidden rounded-xl border border-gray-200 ${height}`}>
      {colors.map((c, i) => {
        const txt = readableText(c.hex);
        return (
          <button
            key={`${c.hex}-${i}`}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              copy(c.hex);
            }}
            className="group/swatch flex-1 flex flex-col justify-end items-center pb-1.5 [transition:flex-grow_280ms_ease-in-out,opacity_200ms] hover:[flex-grow:2]"
            style={{ backgroundColor: c.hex, color: txt }}
            title={`${c.label} ${c.hex}（點擊複製）`}
          >
            {showRole && (
              <span className="text-[9px] font-medium opacity-0 group-hover/swatch:opacity-80 transition-opacity leading-none mb-0.5">{c.label}</span>
            )}
            {showHex && (
              <span className="text-[10px] font-mono font-semibold uppercase leading-none opacity-0 group-hover/swatch:opacity-100 transition-opacity">
                {copied === c.hex ? "✓" : c.hex}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
