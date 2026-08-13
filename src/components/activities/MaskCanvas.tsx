"use client";
/**
 * SelectionCanvas
 * ---------------
 * 拖拉矩形選框工具。
 * 不產生 mask bitmap — 只回傳圈選區域的正規化邊界框 (0~1)，
 * 讓後端知道使用者想修改圖片的「大概位置」，交給 Kontext AI 照指令精確處理。
 *
 * Props:
 *   onMaskChange(maskDataUrl | null)  — 維持 API 相容，傳 null（不再需要 bitmap）
 *   onSelectionChange(bounds | null)  — 回傳正規化的邊界框
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

export type SelectionBounds = {
  x: number;      // 0~1，左邊比例
  y: number;      // 0~1，上邊比例
  width: number;  // 0~1，寬度比例
  height: number; // 0~1，高度比例
};

type Props = {
  imageUrl: string;
  brushSize?: number;           // 保留 API 相容性，不使用
  onMaskChange?: (maskDataUrl: string | null) => void;
  onSelectionChange?: (bounds: SelectionBounds | null) => void;
};

type DragState = { startX: number; startY: number } | null;
type Rect      = { x: number; y: number; w: number; h: number } | null;

export function MaskCanvas({ imageUrl, onMaskChange, onSelectionChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const imgRef       = useRef<HTMLImageElement>(null);
  const drag         = useRef<DragState>(null);

  const [rect, setRect]       = useState<Rect>(null);
  const [hasSelection, setHasSelection] = useState(false);

  // ── Canvas size synced to container ──────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    const canvas    = canvasRef.current;
    if (!container || !canvas) return;
    const ro = new ResizeObserver(([e]) => {
      canvas.width  = Math.round(e.contentRect.width);
      canvas.height = Math.round(e.contentRect.height);
      // Repaint handled by rect state
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // ── Draw selection rect ───────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!rect) return;

    const { x, y, w, h } = rect;

    // Dimming overlay outside selection
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.clearRect(x, y, w, h); // cut out selection

    // Selection border
    ctx.strokeStyle = "rgba(59,130,246,1)";
    ctx.lineWidth   = 2;
    ctx.setLineDash([6, 3]);
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    ctx.setLineDash([]);

    // Corner handles
    const hs = 7;
    const corners = [
      [x, y], [x + w, y], [x, y + h], [x + w, y + h],
    ];
    ctx.fillStyle = "white";
    corners.forEach(([cx, cy]) => {
      ctx.fillRect(cx - hs / 2, cy - hs / 2, hs, hs);
      ctx.strokeRect(cx - hs / 2, cy - hs / 2, hs, hs);
    });

    // Label
    const label = `選取區域`;
    ctx.font        = "12px system-ui, sans-serif";
    ctx.fillStyle   = "rgba(59,130,246,1)";
    ctx.fillText(label, x + 4, y - 6 > 14 ? y - 6 : y + 16);

  }, [rect]);

  // ── Mouse events ──────────────────────────────────────────────────────────────
  const getXY = (e: React.MouseEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const { x, y } = getXY(e);
    drag.current = { startX: x, startY: y };
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!drag.current) return;
    e.preventDefault();
    const { x, y } = getXY(e);
    const { startX, startY } = drag.current;
    setRect({
      x: Math.min(x, startX),
      y: Math.min(y, startY),
      w: Math.abs(x - startX),
      h: Math.abs(y - startY),
    });
  }, []);

  const onMouseUp = useCallback((e: React.MouseEvent) => {
    if (!drag.current) return;
    e.preventDefault();
    drag.current = null;

    // Read current rect via functional updater, but fire callbacks
    // AFTER render via microtask to avoid setState-during-render error
    setRect(prev => {
      if (!prev || prev.w < 10 || prev.h < 10) {
        Promise.resolve().then(() => {
          setHasSelection(false);
          onSelectionChange?.(null);
          onMaskChange?.(null);
        });
        return null;
      }

      const canvas = canvasRef.current;
      const img = imgRef.current;
      if (!canvas || !img) return prev;

      // 座標要跟實際顯示嗰張圖嘅範圍，唔可以淨跟 canvas/container 嘅闊高——canvas
      // 填滿成個 container，但 container 有時會因為 flexbox align-items:stretch
      // （同旁邊縮圖欄拉齊高度）或者圖片比例同 container 唔一致，而變到比實際顯示
      // 嗰張圖大（留白喺下面/側面，img 只係 top-aligned 冇填滿）。如果淨用
      // canvas.width/height 做分母，揀嘅位置百分比會偏移——愈揀近邊緣（例如底部
      // 文案）偏差愈明顯，呢個就係「圈選位置不準」嘅根本原因。改用 img 實際嘅
      // getBoundingClientRect() 做分母，先真正對應返實際張圖。
      const canvasRect = canvas.getBoundingClientRect();
      const imgRect = img.getBoundingClientRect();
      const absX = canvasRect.left + prev.x;
      const absY = canvasRect.top + prev.y;

      const bounds: SelectionBounds = {
        x:      (absX - imgRect.left) / imgRect.width,
        y:      (absY - imgRect.top) / imgRect.height,
        width:  prev.w / imgRect.width,
        height: prev.h / imgRect.height,
      };

      Promise.resolve().then(() => {
        setHasSelection(true);
        onSelectionChange?.(bounds);
        onMaskChange?.("selection");
      });

      return prev;
    });
  }, [onSelectionChange, onMaskChange]);

  const clearSelection = useCallback(() => {
    setRect(null);
    setHasSelection(false);
    onSelectionChange?.(null);
    onMaskChange?.(null);
    const canvas = canvasRef.current;
    if (canvas) canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
  }, [onSelectionChange, onMaskChange]);

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3">
      <div
        ref={containerRef}
        className="relative rounded-xl overflow-hidden border select-none"
        style={{ cursor: "crosshair" }}
      >
        <img
          ref={imgRef}
          src={imageUrl}
          alt="Layout preview"
          className="w-auto max-w-full max-h-[calc(100vh-210px)] object-contain block mx-auto"
          draggable={false}
        />

        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
        />

        {!hasSelection && (
          <div className="absolute bottom-3 left-0 right-0 flex justify-center pointer-events-none">
            <span className="bg-black/55 text-white text-xs px-3 py-1 rounded-full">
              拖拉選取要修改的區域
            </span>
          </div>
        )}

        {hasSelection && (
          <div className="absolute top-2 left-2 bg-blue-500 text-white text-xs px-2 py-0.5 rounded-full pointer-events-none">
            ✓ 已選取區域
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={clearSelection}
          disabled={!hasSelection}
          className="gap-1.5 text-red-500 hover:text-red-600 hover:bg-red-50 disabled:opacity-30"
        >
          <Trash2 className="h-3.5 w-3.5" />
          清除選區
        </Button>
        <span className="ml-auto text-xs text-gray-400">
          {hasSelection ? "選區已設定，輸入修改指令後點「開始修改」" : "拖拉圈選要修改的區域"}
        </span>
      </div>
    </div>
  );
}
