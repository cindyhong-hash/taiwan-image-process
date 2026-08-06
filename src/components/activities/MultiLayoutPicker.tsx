"use client";
import { X } from "lucide-react";
import { MULTI_LAYOUTS, type MultiLayout } from "@/types/multiLayout";

type Props = {
  /** 目前選中的版型 id（可選，用於高亮）*/
  selectedId?: string;
  /** 選擇版型後回呼（選完即關閉並跳轉，由父層處理）*/
  onSelect: (layoutId: string) => void;
  /** 關閉（✕ 或點遮罩）*/
  onClose: () => void;
};

/** 單一版型縮圖：用 CSS Grid 模擬格局 */
function LayoutThumb({ layout, active }: { layout: MultiLayout; active: boolean }) {
  return (
    <div
      className="relative grid"
      style={{
        ...layout.grid,
        width: 68,
        height: 60,
        gap: 3,
        padding: 6,
        borderRadius: 10,
        border: active ? "1.5px solid #6C63FF" : "1px solid #E5E5E5",
        background: active ? "#F0EFFF" : "#F5F5F5",
      }}
    >
      {layout.cells.map((cell, i) => (
        <div
          key={i}
          style={{
            ...cell.style,
            borderRadius: 2,
            background: cell.main ? "#BFBFBF" : "#D4D4D4",
          }}
        />
      ))}
      {layout.badge && (
        <span
          className="absolute bottom-1 right-1 text-[9px] font-semibold leading-none px-1 py-0.5 rounded"
          style={{ background: "#6C63FF", color: "#fff" }}
        >
          {layout.badge}
        </span>
      )}
    </div>
  );
}

export function MultiLayoutPicker({ selectedId, onSelect, onClose }: Props) {
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: "rgba(0,0,0,0.3)" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl rounded-2xl shadow-2xl p-6"
        style={{ background: "#FFFFFF" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold" style={{ color: "#1A1A1A" }}>
            選擇活動版型 <span style={{ color: "#888888" }} className="text-sm font-normal">(Activity Layout)</span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 transition-colors"
            style={{ background: "#F0F0F0", color: "#666666" }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Grid 4×2 */}
        <div className="grid grid-cols-4 gap-3">
          {MULTI_LAYOUTS.map((layout) => {
            const active = layout.id === selectedId;
            return (
              <button
                key={layout.id}
                type="button"
                onClick={() => onSelect(layout.id)}
                className="flex flex-col items-center gap-2 rounded-xl p-2 transition-colors hover:bg-gray-50"
              >
                <LayoutThumb layout={layout} active={active} />
                <span
                  className="text-xs text-center leading-tight"
                  style={{ color: active ? "#6C63FF" : "#888888" }}
                >
                  {layout.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
