"use client";
/**
 * MaskCanvas
 * ----------
 * Renders a transparent <canvas> perfectly on top of an <img>.
 * The user can paint a semi-transparent mask (inpainting area) with
 * a brush or erase parts of it. The final mask is exposed both as a
 * live base-64 PNG and via the onMaskChange callback so callers can
 * POST { imageUrl, maskDataUrl } to an AI inpainting API.
 *
 * RWD alignment strategy
 * ----------------------
 * The image is rendered with `object-fit: cover` inside a square container.
 * The canvas sits on top via absolute positioning and always matches the
 * container's rendered pixel dimensions (tracked with ResizeObserver).
 * When exporting the mask we additionally scale it to the image's natural
 * resolution so the AI receives a same-size mask regardless of screen size.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Eraser, PaintbrushVertical, Trash2 } from "lucide-react";

type Tool = "brush" | "eraser";

type Props = {
  imageUrl: string;
  /** Brush radius in CSS pixels (default 20) */
  brushSize?: number;
  /** Called every time the mask changes with a base-64 PNG (white mask on black bg, same size as natural image) */
  onMaskChange?: (maskDataUrl: string | null) => void;
};

// ─── helpers ───────────────────────────────────────────────────────────────

function getPos(
  e: React.MouseEvent | React.TouchEvent,
  canvas: HTMLCanvasElement
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const src =
    "touches" in e
      ? (e as React.TouchEvent).touches[0] ?? (e as React.TouchEvent).changedTouches[0]
      : (e as React.MouseEvent);
  return {
    x: src.clientX - rect.left,
    y: src.clientY - rect.top,
  };
}

// ─── component ─────────────────────────────────────────────────────────────

export function MaskCanvas({ imageUrl, brushSize = 20, onMaskChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const isDrawing = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  const [tool, setTool] = useState<Tool>("brush");
  const [hasMask, setHasMask] = useState(false);

  // ── keep canvas pixel-perfect with the container ──────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      // Save current drawing, resize, then restore
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
      canvas.width = Math.round(width);
      canvas.height = Math.round(height);
      // Restore (best-effort; exact pixel mapping preserved when only reflow)
      ctx.putImageData(snapshot, 0, 0);
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // ── drawing core ──────────────────────────────────────────────────────────

  const paint = useCallback(
    (ctx: CanvasRenderingContext2D, from: { x: number; y: number }, to: { x: number; y: number }) => {
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = brushSize * 2;

      if (tool === "brush") {
        ctx.globalCompositeOperation = "source-over";
        // Semi-transparent blue tint — visible over any image content
        ctx.strokeStyle = "rgba(59, 130, 246, 0.45)";
      } else {
        // Eraser: punch a hole back to transparent
        ctx.globalCompositeOperation = "destination-out";
        ctx.strokeStyle = "rgba(0,0,0,1)";
      }

      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    },
    [tool, brushSize]
  );

  // ── export mask (white on black, natural-image resolution) ────────────────

  const exportMask = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return null;

    const natW = img.naturalWidth || canvas.width;
    const natH = img.naturalHeight || canvas.height;

    // Off-screen canvas at natural resolution
    const off = document.createElement("canvas");
    off.width = natW;
    off.height = natH;
    const ctx = off.getContext("2d")!;

    // Black background
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, natW, natH);

    // Scale and stamp our alpha mask as white
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(canvas, 0, 0, natW, natH);

    // Convert blue tint to pure white: iterate pixels and set rgb → 255
    const id = ctx.getImageData(0, 0, natW, natH);
    for (let i = 0; i < id.data.length; i += 4) {
      const alpha = id.data[i + 3];
      if (alpha > 10) {
        id.data[i] = 255;
        id.data[i + 1] = 255;
        id.data[i + 2] = 255;
        id.data[i + 3] = 255;
      } else {
        id.data[i] = 0;
        id.data[i + 1] = 0;
        id.data[i + 2] = 0;
        id.data[i + 3] = 255;
      }
    }
    ctx.putImageData(id, 0, 0);

    return off.toDataURL("image/png");
  }, []);

  // ── pointer events (mouse + touch) ───────────────────────────────────────

  const onStart = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;
      isDrawing.current = true;
      const pos = getPos(e, canvas);
      lastPos.current = pos;
      // Draw a dot on single click
      const ctx = canvas.getContext("2d")!;
      paint(ctx, pos, pos);
    },
    [paint]
  );

  const onMove = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      if (!isDrawing.current) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d")!;
      const pos = getPos(e, canvas);
      paint(ctx, lastPos.current ?? pos, pos);
      lastPos.current = pos;
    },
    [paint]
  );

  const onEnd = useCallback(() => {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    lastPos.current = null;
    setHasMask(true);
    const mask = exportMask();
    onMaskChange?.(mask);
  }, [exportMask, onMaskChange]);

  // ── clear ─────────────────────────────────────────────────────────────────

  const clearMask = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasMask(false);
    onMaskChange?.(null);
  }, [onMaskChange]);

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3">
      {/* Image + Canvas stack */}
      <div
        ref={containerRef}
        className="relative rounded-xl overflow-hidden border select-none"
        style={{ cursor: tool === "brush" ? "crosshair" : "cell" }}
      >
        {/* Base image */}
        <img
          ref={imgRef}
          src={imageUrl}
          alt="Layout preview"
          className="w-full aspect-square object-cover block"
          draggable={false}
        />

        {/* Mask canvas — perfectly overlaid */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          onMouseDown={onStart}
          onMouseMove={onMove}
          onMouseUp={onEnd}
          onMouseLeave={onEnd}
          onTouchStart={onStart}
          onTouchMove={onMove}
          onTouchEnd={onEnd}
        />

        {/* Mask indicator badge */}
        {hasMask && (
          <div className="absolute top-2 left-2 bg-blue-500 text-white text-xs px-2 py-0.5 rounded-full pointer-events-none">
            遮罩已繪製
          </div>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant={tool === "brush" ? "default" : "outline"}
          size="sm"
          onClick={() => setTool("brush")}
          className="gap-1.5"
        >
          <PaintbrushVertical className="h-3.5 w-3.5" />
          畫筆
        </Button>
        <Button
          type="button"
          variant={tool === "eraser" ? "default" : "outline"}
          size="sm"
          onClick={() => setTool("eraser")}
          className="gap-1.5"
        >
          <Eraser className="h-3.5 w-3.5" />
          橡皮擦
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={clearMask}
          disabled={!hasMask}
          className="gap-1.5 text-red-500 hover:text-red-600 hover:bg-red-50 disabled:opacity-30"
        >
          <Trash2 className="h-3.5 w-3.5" />
          清除全部
        </Button>

        <span className="ml-auto text-xs text-gray-400">
          在圖片上塗抹以標記修改區域
        </span>
      </div>
    </div>
  );
}
