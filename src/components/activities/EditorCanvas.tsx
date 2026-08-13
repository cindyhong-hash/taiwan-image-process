"use client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Loader2, Sparkles, Wand2, RotateCcw, CheckCircle2, ImagePlus, X } from "lucide-react";
import { MaskCanvas, type SelectionBounds } from "@/components/activities/MaskCanvas";

type Props = {
  layout: { id: string; imageUrl: string; copyText: string; layoutType: string };
  brandLogoUrl?: string;
};

const COPY_TRANSFORMS = [
  { label: "再簡短一點", instruction: "請把這段文案縮短一半，保留核心意思" },
  { label: "更有衝勁",   instruction: "請讓這段文案更有能量、更有購買衝動感" },
  { label: "更正式",     instruction: "請讓這段文案更專業正式" },
  { label: "換諧音梗",   instruction: "請在這段文案中加入一個有趣的諧音梗或雙關語" },
];

export function EditorCanvas({ layout, brandLogoUrl }: Props) {
  const [copyText,    setCopyText]    = useState(layout.copyText);
  const [transforming, setTransforming] = useState(false);
  const [exporting,   setExporting]   = useState(false);
  const [maskDataUrl,      setMaskDataUrl]      = useState<string | null>(null);
  const [selectionBounds,  setSelectionBounds]  = useState<SelectionBounds | null>(null);
  const [imagePrompt, setImagePrompt] = useState("");
  const [inpainting,  setInpainting]  = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [refImageDataUrl, setRefImageDataUrl] = useState<string | null>(null);
  const [refImageName,    setRefImageName]    = useState<string | null>(null);
  const refInputRef = useRef<HTMLInputElement>(null);

  const handleRefImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRefImageName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      setRefImageDataUrl(ev.target?.result as string);
      // 如果指令欄是空的，自動填入文字風格參考提示
      setImagePrompt(prev => prev.trim() ? prev : "參考參考圖的文字風格，套用到現有廣告的文字上（保持原本語言，唔好翻譯）");
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const clearRefImage = () => {
    setRefImageDataUrl(null);
    setRefImageName(null);
  };
  const [saved,       setSaved]       = useState(false);

  // 歷史 stack — 初始值直接用 layout.imageUrl（已是 DB 最新版）
  const [imageHistory, setImageHistory] = useState<string[]>([layout.imageUrl]);
  const currentImage = imageHistory[imageHistory.length - 1];
  const canUndo      = imageHistory.length > 1;
  const isModified   = currentImage !== layout.imageUrl;

  const undo = () => setImageHistory((h) => h.slice(0, -1));

  /** 局部重繪 */
  const handleInpaint = async () => {
    if (!imagePrompt.trim() && !refImageDataUrl) return;
    setInpainting(true);
    try {
      const res = await fetch("/api/inpaint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl:        currentImage,
          maskDataUrl,
          selectionBounds,
          prompt:          imagePrompt,
          referenceImageDataUrl: refImageDataUrl ?? undefined,
          brandLogoUrl:    brandLogoUrl ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? await res.text());

      // 推入歷史，同時重置 mask（key 改變 → MaskCanvas 重新 mount，遮罩清除）
      setImageHistory((h) => [...h, data.imageUrl]);
      setMaskDataUrl(null);
      setSelectionBounds(null);
      setImagePrompt("");
      setRefImageDataUrl(null);
      setRefImageName(null);
      setSaved(false);
    } catch (err) {
      console.error("[inpaint]", err);
      alert(err instanceof Error ? err.message : "局部重繪失敗，請查看 console");
    } finally {
      setInpainting(false);
    }
  };

  /** 完成此版本 — 把 currentImage 寫回 DB */
  const handleSave = async () => {
    if (!isModified) return;
    setSaving(true);
    try {
      await fetch(`/api/layouts/${layout.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: currentImage }),
      });
      setSaved(true);
      // 將歷史壓縮成只剩儲存後的版本（讓下次回來仍顯示最新結果）
      setImageHistory([currentImage]);
    } catch (err) {
      console.error("[save]", err);
      alert("儲存失敗");
    } finally {
      setSaving(false);
    }
  };

  const transformCopy = async (instruction: string) => {
    setTransforming(true);
    try {
      const res = await fetch("/api/transform-copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ copyText, instruction }),
      });
      const data = await res.json();
      setCopyText(data.result);
    } finally {
      setTransforming(false);
    }
  };

  const exportImage = async (size: "fb" | "ig") => {
    setExporting(true);
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: currentImage, size }),
      });
      const data = await res.json();
      const link = document.createElement("a");
      link.href = data.url;
      link.download = data.filename;
      link.target = "_blank";
      link.click();
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="grid grid-cols-[1fr_1fr] xl:grid-cols-[auto_340px_340px] gap-8 items-start xl:justify-center">

      {/* ── Col 1: Image ── */}
      <div className="space-y-3">

        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="font-medium">圖片預覽</h2>
          <div className="flex items-center gap-2">
            {maskDataUrl && !inpainting && (
              <span className="text-xs text-blue-500 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                遮罩已就緒
              </span>
            )}
            {canUndo && !inpainting && (
              <button
                onClick={undo}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 border border-gray-200 hover:border-gray-400 rounded-lg px-2 py-1 transition-all"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                上一步
              </button>
            )}
          </div>
        </div>

        {/* Canvas — key={currentImage} 讓 inpaint 完成後遮罩自動清除 */}
        <div className="relative rounded-xl overflow-hidden">
          <MaskCanvas
            key={currentImage}
            imageUrl={currentImage}
            onMaskChange={setMaskDataUrl}
            onSelectionChange={setSelectionBounds}
          />

          {/* Loading overlay */}
          {inpainting && (
            <div className="absolute inset-0 bg-black/65 backdrop-blur-[2px] flex flex-col items-center justify-center gap-4 z-20 rounded-xl">
              <div className="relative">
                {/* Outer ring */}
                <div className="w-16 h-16 rounded-full border-4 border-white/20" />
                {/* Spinning arc */}
                <div className="absolute inset-0 w-16 h-16 rounded-full border-4 border-transparent border-t-white animate-spin" />
                {/* Center icon */}
                <Sparkles className="absolute inset-0 m-auto h-6 w-6 text-white/80" />
              </div>
              <div className="text-center">
                <p className="text-white font-semibold text-sm">AI 正在修改圖片</p>
                <p className="text-white/60 text-xs mt-1">通常需要 15–30 秒</p>
              </div>
            </div>
          )}
        </div>

        {/* 完成此版本 banner — 有修改且尚未儲存時顯示 */}
        {isModified && !inpainting && (
          <div className={`rounded-xl border p-3 flex items-center justify-between gap-3 transition-all ${
            saved
              ? "bg-emerald-50 border-emerald-200"
              : "bg-amber-50 border-amber-200"
          }`}>
            <div>
              <p className={`text-sm font-medium ${saved ? "text-emerald-700" : "text-amber-700"}`}>
                {saved ? "✅ 已儲存為最終版本" : "圖片已修改，尚未儲存"}
              </p>
              <p className={`text-xs mt-0.5 ${saved ? "text-emerald-600" : "text-amber-600"}`}>
                {saved
                  ? "下次回到這個頁面會顯示此版本"
                  : "點擊「完成此版本」將修改後的圖片存回系統"}
              </p>
            </div>
            {!saved && (
              <Button
                onClick={handleSave}
                disabled={saving}
                size="sm"
                className="shrink-0 gap-1.5 bg-amber-600 hover:bg-amber-700 text-white"
              >
                {saving
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <CheckCircle2 className="h-3.5 w-3.5" />}
                <span>{saving ? "儲存中…" : "完成此版本"}</span>
              </Button>
            )}
          </div>
        )}

        {/* Export（FB/IG 尺寸）—— 暫隱藏（下載改喺版型卡直接下載；code 保留備用）。
            原 /api/export 下載未 work；日後修好可拆返 hidden。 */}
        <div className="hidden gap-2">
          <Button variant="outline" size="sm" onClick={() => exportImage("fb")} disabled={exporting}>
            {exporting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
            <span>FB 尺寸</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportImage("ig")} disabled={exporting}>
            {exporting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
            <span>IG 尺寸</span>
          </Button>
        </div>
      </div>

      {/* ── Col 2: Inpainting ── */}
      <div className="space-y-4">
        <h2 className="font-medium flex items-center gap-1.5">
          <Wand2 className="h-4 w-4 text-violet-500" />
          圖片微調
        </h2>

        <div className="rounded-xl border bg-violet-50/60 p-4 space-y-3">
          <p className="text-xs text-violet-700 leading-relaxed">
            <span className="font-semibold">使用方式：</span>在左側圖片塗抹想修改的區域，輸入指令後點「開始修改」。
          </p>

          <div className={`flex items-center gap-2 text-xs rounded-lg px-3 py-2 border ${
            maskDataUrl
              ? "bg-blue-50 border-blue-200 text-blue-700"
              : "bg-gray-50 border-gray-200 text-gray-400"
          }`}>
            <span className={`w-2 h-2 rounded-full inline-block ${maskDataUrl ? "bg-blue-500" : "bg-gray-300"}`} />
            {maskDataUrl ? "已選取修改範圍" : "尚未圈選範圍（可選）"}
          </div>

          <textarea
            value={imagePrompt}
            onChange={(e) => setImagePrompt(e.target.value)}
            rows={5}
            placeholder="請輸入修改指令，例如：&#10;・把腳踏車換成奔跑的黑熊&#10;・將背景改為日落沙灘&#10;・移除右下角的水印&#10;・文字改成：限時優惠中"
            className="w-full rounded-lg border border-violet-200 bg-white p-3 text-sm resize-none placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-400 transition"
          />
          <p className="text-[11px] text-gray-400 -mt-1.5">
            想改文字內容：用「文字改成：新內容」呢個句式最準，或者圈選好文字範圍後直接打新內容都得。
          </p>

          <div className="space-y-2">
            <p className="text-xs text-gray-500 font-medium">參考圖（選填）</p>
            {refImageDataUrl ? (
              <div className="flex items-center gap-3 rounded-lg border border-violet-200 bg-white p-2">
                <img src={refImageDataUrl} alt="參考圖" className="h-14 w-14 rounded-md object-cover shrink-0 border" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-700 truncate">{refImageName}</p>
                  <p className="text-xs text-gray-400 mt-0.5">例如：「幫我換成這個女生的臉」</p>
                </div>
                <button onClick={clearRefImage} className="shrink-0 text-gray-400 hover:text-red-500 transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button onClick={() => refInputRef.current?.click()} className="w-full flex items-center gap-2 rounded-lg border border-dashed border-violet-200 bg-white hover:border-violet-400 hover:bg-violet-50 px-3 py-3 text-sm text-gray-400 hover:text-violet-600 transition-all">
                <ImagePlus className="h-4 w-4 shrink-0" />
                <span>上傳參考圖（臉部替換、風格參考…）</span>
              </button>
            )}
            <input ref={refInputRef} type="file" accept="image/*" className="hidden" onChange={handleRefImageChange} />
          </div>

          <Button
            onClick={handleInpaint}
            disabled={inpainting || (!imagePrompt.trim() && !refImageDataUrl)}
            className="w-full gap-2 bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-50"
          >
            {inpainting
              ? <><Loader2 className="h-4 w-4 animate-spin" /><span>生成中…</span></>
              : <><Sparkles className="h-4 w-4" /><span>開始修改</span></>}
          </Button>
        </div>
      </div>

      {/* ── Col 3: Copy ── */}
      <div className="space-y-4">
        <h2 className="font-medium">文案微調</h2>
        <textarea
          value={copyText}
          onChange={(e) => setCopyText(e.target.value)}
          rows={8}
          className="w-full border rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-black"
        />
        <div className="space-y-2">
          <div className="text-sm text-gray-500">一鍵轉換語氣：</div>
          <div className="flex flex-wrap gap-2">
            {COPY_TRANSFORMS.map((t) => (
              <Button key={t.label} variant="outline" size="sm"
                onClick={() => transformCopy(t.instruction)} disabled={transforming}>
                {transforming ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
                {t.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
}
