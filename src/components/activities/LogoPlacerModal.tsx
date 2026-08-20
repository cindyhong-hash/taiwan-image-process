"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { X, Upload, Loader2, Check, Trash2, Stamp } from "lucide-react";

export type LogoVersion = { url: string; label: string };

type LogoItem = {
  id: string;
  url: string;   // logo 圖源（版本 URL 或 data URI）
  x: number;     // 0..1 中心 X
  y: number;     // 0..1 中心 Y
  scale: number; // 相對畫布寬 16% 的倍數
};

/** 瀏覽器端壓縮 → data URI（避免上傳大檔 & HTTP 413）。 */
async function compressImage(file: File, maxDim: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => { img.src = reader.result as string; };
    reader.onerror = reject;
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const r = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * r);
        height = Math.round(height * r);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("no ctx")); return; }
      ctx.drawImage(img, 0, 0, width, height);
      // logo 多為透明 PNG → 用 png 保留透明度
      resolve(canvas.toDataURL("image/png", quality));
    };
    img.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * LogoPlacerModal —— 手動放置品牌標誌。
 * 使用者可加入多個 logo（品牌各版本 + 上傳），每個獨立拖動位置、拖角等比縮放，
 * 確認後逐個疊加合成（每次把上一個結果當底圖，呼叫 /api/logo/place）。
 */
export default function LogoPlacerModal({
  imageUrl,
  logoVersions = [],
  onConfirm,
  onClose,
}: {
  imageUrl: string;
  logoVersions?: LogoVersion[];
  onConfirm: (url: string) => void;
  onClose: () => void;
}) {
  const [logos, setLogos] = useState<LogoItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [shadow, setShadow] = useState(false);
  const [composing, setComposing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imgRatio, setImgRatio] = useState(1); // 底圖寬高比，讓畫布容器精確匹配圖片（消除留白座標錯位）
  const uploadRef = useRef<HTMLInputElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);

  const interaction = useRef<{
    type: "move" | "resize";
    id: string;
    startX: number;
    startScale: number;
  } | null>(null);

  const addLogo = useCallback((url: string) => {
    setLogos((cur) => {
      const count = cur.length;
      const id = `logo-${Date.now()}-${count}`;
      setSelectedId(id);
      return [...cur, {
        id, url,
        x: 0.3 + (count % 3) * 0.2,
        y: 0.3 + Math.floor(count / 3) * 0.2,
        scale: 1,
      }];
    });
    setError(null);
  }, []);

  const handleUpload = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    try {
      addLogo(await compressImage(file, 800, 0.95));
    } catch {
      addLogo(URL.createObjectURL(file));
    }
    if (uploadRef.current) uploadRef.current.value = "";
  }, [addLogo]);

  const removeLogo = useCallback((id: string) => {
    setLogos((cur) => cur.filter((l) => l.id !== id));
    setSelectedId((cur) => (cur === id ? null : cur));
  }, []);

  // ── 拖動 ──
  const onLogoPointerDown = useCallback((e: React.PointerEvent, id: string) => {
    e.preventDefault(); e.stopPropagation();
    setSelectedId(id);
    interaction.current = { type: "move", id, startX: e.clientX, startScale: 1 };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  // ── 拖角縮放 ──
  const onHandlePointerDown = useCallback((e: React.PointerEvent, id: string) => {
    e.preventDefault(); e.stopPropagation();
    const logo = logos.find((l) => l.id === id);
    if (!logo) return;
    interaction.current = { type: "resize", id, startX: e.clientX, startScale: logo.scale };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [logos]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!interaction.current || !canvasRef.current) return;
    const { type, id, startX, startScale } = interaction.current;
    const rect = canvasRef.current.getBoundingClientRect();
    if (type === "move") {
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      setLogos((cur) => cur.map((l) =>
        l.id === id ? { ...l, x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) } : l));
    } else {
      const delta = (e.clientX - startX) / rect.width * 4; // 拖畫布寬 25% = scale ±1
      setLogos((cur) => cur.map((l) =>
        l.id === id ? { ...l, scale: Math.max(0.3, Math.min(4, startScale + delta)) } : l));
    }
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (interaction.current) {
      try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* */ }
    }
    interaction.current = null;
  }, []);

  // ── 確認：逐個疊加合成 ──
  const handleConfirm = useCallback(async () => {
    if (logos.length === 0 || composing) return;
    setComposing(true); setError(null);
    try {
      let currentUrl = imageUrl;
      for (const logo of logos) {
        const res = await fetch("/api/logo/place", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ imageUrl: currentUrl, logoUrl: logo.url, x: logo.x, y: logo.y, scale: logo.scale, shadow }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.url) throw new Error(data.error || "合成失敗");
        currentUrl = data.url;
      }
      onConfirm(currentUrl);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setComposing(false);
    }
  }, [logos, composing, imageUrl, shadow, onConfirm]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        e.preventDefault();
        removeLogo(selectedId);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, selectedId, removeLogo]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[92vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b shrink-0">
          <h2 className="text-sm font-semibold flex items-center gap-1.5">
            <Stamp className="h-4 w-4 text-violet-500 shrink-0" />
            放置標誌
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto flex-1 min-h-0 space-y-4">
          <p className="text-xs text-gray-500">點下方標誌加入，拖動移動位置、拖藍色手柄等比縮放。按 Delete 鍵刪除選中的標誌。</p>

          {/* 畫布 —— 容器精確匹配底圖比例（消除 object-contain 留白造成的座標錯位）*/}
          <div
            ref={canvasRef}
            onPointerDown={() => setSelectedId(null)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            className="relative mx-auto rounded-lg border bg-gray-50 overflow-hidden select-none touch-none"
            style={{ aspectRatio: String(imgRatio), maxHeight: 420, height: 420, width: 420 * imgRatio }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt=""
              onLoad={(e) => {
                const im = e.currentTarget;
                if (im.naturalWidth && im.naturalHeight) setImgRatio(im.naturalWidth / im.naturalHeight);
              }}
              className="w-full h-full block object-contain pointer-events-none"
              draggable={false}
            />
            {logos.map((logo) => {
              const isSel = logo.id === selectedId;
              return (
                <div
                  key={logo.id}
                  onPointerDown={(e) => onLogoPointerDown(e, logo.id)}
                  className={`absolute cursor-move ${isSel ? "outline outline-2 outline-dashed outline-violet-500" : ""}`}
                  style={{
                    left: `${logo.x * 100}%`,
                    top: `${logo.y * 100}%`,
                    width: `${16 * logo.scale}%`,
                    transform: "translate(-50%, -50%)",
                    filter: shadow ? "drop-shadow(0 4px 12px rgba(0,0,0,0.3))" : "none",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={logo.url} alt="" className="w-full pointer-events-none select-none" draggable={false} />
                  {isSel && (
                    <>
                      <button
                        type="button"
                        onPointerDown={(e) => onHandlePointerDown(e, logo.id)}
                        className="absolute -bottom-1.5 -right-1.5 w-4 h-4 rounded-full bg-violet-600 border-2 border-white cursor-nwse-resize touch-none"
                        title="拖動縮放"
                      />
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); removeLogo(logo.id); }}
                        className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center"
                        title="移除"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {/* 標誌選擇：品牌版本 + 上傳 */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">標誌</p>
            <div className="flex gap-2 flex-wrap">
              {logoVersions.map((lg) => (
                <button
                  key={lg.url}
                  type="button"
                  onClick={() => addLogo(lg.url)}
                  title={lg.label}
                  className="flex-1 min-w-[96px] flex flex-col items-center gap-1 rounded-lg border bg-white p-2 hover:border-violet-300 hover:bg-violet-50 transition-colors"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={lg.url} alt={lg.label} className="h-9 object-contain" />
                  <span className="text-[10px] text-gray-500 truncate max-w-full">{lg.label}</span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => uploadRef.current?.click()}
                className="flex-1 min-w-[96px] flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed p-2 text-gray-400 hover:border-violet-400 hover:text-violet-600 hover:bg-violet-50 transition-colors"
              >
                <Upload className="h-4 w-4" />
                <span className="text-[10px]">上傳標誌</span>
              </button>
              <input ref={uploadRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
            </div>
          </div>

          {/* 已加入的標誌 */}
          {logos.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-500">已加入 {logos.length} 個：</span>
              {logos.map((logo, i) => (
                <button
                  key={logo.id}
                  type="button"
                  onClick={() => setSelectedId(logo.id)}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] border transition-colors ${
                    logo.id === selectedId ? "border-violet-400 bg-violet-50 text-violet-700" : "border-gray-200 text-gray-500"
                  }`}
                >
                  標誌 {i + 1}
                </button>
              ))}
            </div>
          )}

          {/* 投影開關 */}
          <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
            <input type="checkbox" checked={shadow} onChange={(e) => setShadow(e.target.checked)} className="accent-violet-600" />
            加柔和投影（淺背景上更清晰）
          </label>

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 flex items-center justify-end gap-2 border-t shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="text-xs px-3 py-2 rounded-lg border bg-white border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={logos.length === 0 || composing}
            className="flex items-center gap-1.5 text-xs px-3.5 py-2 rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40 transition-colors"
          >
            {composing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            {composing ? "合成中…" : "套用標誌"}
          </button>
        </div>
      </div>
    </div>
  );
}
