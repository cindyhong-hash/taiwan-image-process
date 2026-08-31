"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Loader2, Sparkles, CheckCircle2, X, ChevronLeft, Pencil,
  Maximize2, SplitSquareHorizontal, RotateCcw, RotateCw,
  ChevronDown, ChevronUp, UploadCloud, FileText,
} from "lucide-react";
import { MaskCanvas, type SelectionBounds } from "@/components/activities/MaskCanvas";
import LogoPlacerModal, { type LogoVersion } from "@/components/activities/LogoPlacerModal";
import { UnsavedChangesModal } from "@/components/activities/UnsavedChangesModal";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";

type Props = {
  layout: { id: string; imageUrl: string; copyText: string; layoutType: string };
  brandLogoUrl?: string;
  logoVersions?: LogoVersion[];
  /** 活動主題 — 顯示喺頂欄標題。 */
  theme?: string;
  /** 頂欄「返回」連結。 */
  backHref?: string;
};

const COPY_TRANSFORMS = [
  { label: "再簡短一點", instruction: "請把這段文案縮短一半，保留核心意思" },
  { label: "更有衝勁",   instruction: "請讓這段文案更有能量、更有購買衝動感" },
  { label: "更正式",     instruction: "請讓這段文案更專業正式" },
  { label: "換諧音梗",   instruction: "請在這段文案中加入一個有趣的諧音梗或雙關語" },
];

export function EditorCanvas({ layout, brandLogoUrl, logoVersions = [], theme, backHref }: Props) {
  const [showLogo,    setShowLogo]    = useState(false);
  const [copyText,    setCopyText]    = useState(layout.copyText);
  const [transforming, setTransforming] = useState(false);
  const [maskDataUrl,      setMaskDataUrl]      = useState<string | null>(null);
  const [selectionBounds,  setSelectionBounds]  = useState<SelectionBounds | null>(null);
  const [imagePrompt, setImagePrompt] = useState("");
  const [inpainting,  setInpainting]  = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [refImageDataUrl, setRefImageDataUrl] = useState<string | null>(null);
  const [refImageName,    setRefImageName]    = useState<string | null>(null);
  const refInputRef = useRef<HTMLInputElement>(null);

  // 右側面板分頁：修改圖片／放置LOGO
  const [tab, setTab] = useState<"edit" | "logo">("edit");
  // 文案微調 collapsible（預設展開）
  const [copyOpen, setCopyOpen] = useState(true);
  // 左側圖片工具列：縮放（0.5~2）＋對比（按住顯示上一步版本）
  const [zoom,    setZoom]    = useState(1);
  const [compare, setCompare] = useState(false);

  const handleRefImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRefImageName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      setRefImageDataUrl(ev.target?.result as string);
      // 如果指令欄是空的，自動填入文字風格參考提示
      setImagePrompt(prev => prev.trim() ? prev : "參考參考圖的文字風格，套用到現有廣告的文字上（保持原本語言，不要翻譯）");
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const clearRefImage = () => {
    setRefImageDataUrl(null);
    setRefImageName(null);
  };
  const [saved, setSaved] = useState(false);

  // 歷史 stack — 初始值直接用 layout.imageUrl（已是 DB 最新版）
  const [imageHistory, setImageHistory] = useState<string[]>([layout.imageUrl]);
  // 重做棧：撳「復原」彈出嘅版本會推入呢度，新改動（inpaint/放置標誌）會清空（標準 redo 慣例）。
  const [redoStack, setRedoStack] = useState<string[]>([]);
  const currentImage = imageHistory[imageHistory.length - 1];
  const previousImage = imageHistory.length > 1 ? imageHistory[imageHistory.length - 2] : null;
  const canUndo = imageHistory.length > 1;
  const canRedo = redoStack.length > 0;
  // isModified 淨係比較「而家張圖」同「呢頁一開始個 layout.imageUrl」——但
  // layout 係 prop，撳完「儲存草稿」都唔會自動更新，所以 isModified 撳完儲存
  // 都仲係 true。頂欄要靠呢個先顯示得返「已儲存」pill（唔可以一撳完儲存就即刻
  // 連 pill 都冧埋），所以離開警告淨係加 `&& !saved` 傳落 useUnsavedChangesGuard，
  // 唔改 isModified 本身。
  const isModified = currentImage !== layout.imageUrl;
  const { pendingHref, confirmLeave, cancelLeave } = useUnsavedChangesGuard(isModified && !saved);

  const undo = () => {
    if (imageHistory.length <= 1) return;
    const popped = imageHistory[imageHistory.length - 1];
    setRedoStack((r) => [popped, ...r]);
    setImageHistory((h) => h.slice(0, -1));
  };
  const redo = () => {
    if (redoStack.length === 0) return;
    const [next, ...rest] = redoStack;
    setImageHistory((h) => [...h, next]);
    setRedoStack(rest);
  };

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

      // 推入歷史，同時重置 mask（MaskCanvas 自己會喺 imageUrl 改變嗰陣清返選區）
      setImageHistory((h) => [...h, data.imageUrl]);
      setRedoStack([]);
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

  /** 儲存草稿 — 把 currentImage 寫回 DB */
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
      setRedoStack([]);
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

  const zoomIn  = () => setZoom((z) => Math.min(2,   +(z + 0.1).toFixed(2)));
  const zoomOut = () => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2)));
  const fitZoom = () => setZoom(1);

  const availableLogos: LogoVersion[] =
    logoVersions.length ? logoVersions : (brandLogoUrl ? [{ url: brandLogoUrl, label: "品牌 Logo" }] : []);

  return (
    <div>
      {/* ── 頂欄 ── */}
      <div className="flex items-center justify-between border-b px-6 py-3">
        <div className="flex items-center gap-3">
          <Link
            href={backHref ?? "#"}
            className="flex items-center gap-1 text-xs text-gray-600 border border-gray-200 rounded-full px-3 py-1.5 hover:border-violet-300 hover:text-violet-600 hover:bg-violet-50 transition-all"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            返回
          </Link>
          <div className="flex items-center gap-1.5">
            <h1 className="font-semibold text-gray-900">{theme}</h1>
            <Pencil className="h-3.5 w-3.5 text-gray-300" />
          </div>
          {(!isModified || saved) && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 text-xs px-2.5 py-1">
              <CheckCircle2 className="h-3 w-3" />
              已儲存
            </span>
          )}
        </div>
        <Button
          onClick={handleSave}
          disabled={!isModified || saving}
          className="bg-violet-600 hover:bg-violet-700 text-white gap-1.5 disabled:opacity-50"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          <span>{saving ? "儲存中…" : "儲存草稿"}</span>
        </Button>
      </div>

      {/* ── 主體 ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6 items-start p-6">

        {/* Left: image */}
        <div className="space-y-3">
          <div className="rounded-2xl border bg-gray-50/50 overflow-auto max-h-[75vh] flex justify-center p-4">
            <div
              style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }}
              className="relative inline-block"
            >
              <MaskCanvas
                imageUrl={currentImage}
                onMaskChange={setMaskDataUrl}
                onSelectionChange={setSelectionBounds}
                previousImageUrl={previousImage}
                overlay={inpainting && (
                  <div className="absolute inset-0 bg-black/65 backdrop-blur-[2px] flex flex-col items-center justify-center gap-4">
                    <div className="relative">
                      <div className="w-16 h-16 rounded-full border-4 border-white/20" />
                      <div className="absolute inset-0 w-16 h-16 rounded-full border-4 border-transparent border-t-white animate-spin" />
                      <Sparkles className="absolute inset-0 m-auto h-6 w-6 text-white/80" />
                    </div>
                    <div className="text-center">
                      <p className="text-white font-semibold text-sm">AI 正在修改圖片</p>
                      <p className="text-white/60 text-xs mt-1">通常需要 15–30 秒</p>
                    </div>
                  </div>
                )}
              />
              {/* 對比：按住時疊上一步版本喺畫面上面 */}
              {compare && previousImage && (
                <img
                  src={previousImage}
                  alt="上一步版本"
                  className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none z-50 bg-white"
                />
              )}
            </div>
          </div>

          {/* 底部工具列 */}
          <div className="rounded-xl border bg-white px-3 py-2 flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5">
              <button
                onClick={zoomOut}
                className="w-6 h-6 flex items-center justify-center rounded-md border border-gray-200 text-gray-500 hover:border-violet-300 hover:text-violet-600 hover:bg-violet-50 transition-all"
              >
                −
              </button>
              <span className="text-xs text-gray-600 w-10 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
              <button
                onClick={zoomIn}
                className="w-6 h-6 flex items-center justify-center rounded-md border border-gray-200 text-gray-500 hover:border-violet-300 hover:text-violet-600 hover:bg-violet-50 transition-all"
              >
                ＋
              </button>
            </div>
            <button
              onClick={fitZoom}
              className="flex items-center gap-1 text-xs text-gray-600 border border-gray-200 rounded-lg px-2 py-1 hover:border-violet-300 hover:text-violet-600 hover:bg-violet-50 transition-all"
            >
              <Maximize2 className="h-3.5 w-3.5" />
              符合畫面
            </button>
            <button
              onPointerDown={() => previousImage && setCompare(true)}
              onPointerUp={() => setCompare(false)}
              onPointerLeave={() => setCompare(false)}
              disabled={!previousImage}
              className="flex items-center gap-1 text-xs text-gray-600 border border-gray-200 rounded-lg px-2 py-1 hover:border-violet-300 hover:text-violet-600 hover:bg-violet-50 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <SplitSquareHorizontal className="h-3.5 w-3.5" />
              對比
            </button>
            <div className="ml-auto flex items-center gap-1.5">
              <button
                onClick={undo} disabled={!canUndo}
                className={`flex items-center gap-1 text-xs rounded-lg px-2 py-1 border transition-all ${
                  canUndo ? "text-gray-600 hover:text-violet-600 border-gray-200 hover:border-violet-300 hover:bg-violet-50"
                  : "opacity-30 cursor-not-allowed text-gray-400 border-gray-200"}`}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                復原
              </button>
              <button
                onClick={redo} disabled={!canRedo}
                className={`flex items-center gap-1 text-xs rounded-lg px-2 py-1 border transition-all ${
                  canRedo ? "text-gray-600 hover:text-violet-600 border-gray-200 hover:border-violet-300 hover:bg-violet-50"
                  : "opacity-30 cursor-not-allowed text-gray-400 border-gray-200"}`}
              >
                <RotateCw className="h-3.5 w-3.5" />
                重做
              </button>
            </div>
          </div>
        </div>

        {/* Right: AI 微調面板 */}
        <div className="rounded-2xl border bg-white p-5 space-y-4">
          <h2 className="font-semibold">AI 微調</h2>

          <div className="flex items-center gap-1 rounded-lg bg-gray-100 p-1">
            <button
              onClick={() => setTab("edit")}
              className={`flex-1 rounded-md text-sm py-1.5 transition-all ${
                tab === "edit" ? "bg-white text-violet-600 font-medium shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
            >
              修改圖片
            </button>
            <button
              onClick={() => setTab("logo")}
              className={`flex-1 rounded-md text-sm py-1.5 transition-all ${
                tab === "logo" ? "bg-white text-violet-600 font-medium shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
            >
              放置LOGO
            </button>
          </div>

          {tab === "edit" && (
            <div className="space-y-4">
              <p className="text-xs text-gray-400">請選取畫面中的物件，或直接告訴 AI 想怎麼修改</p>

              {maskDataUrl && (
                <div className="flex items-center gap-2 text-xs rounded-lg px-3 py-2 border bg-blue-50 border-blue-200 text-blue-700">
                  <span className="w-2 h-2 rounded-full inline-block bg-blue-500" />
                  已選取修改範圍
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-gray-600 mb-1.5 block">告訴 AI 你想怎麼修改</label>
                <textarea
                  value={imagePrompt}
                  onChange={(e) => setImagePrompt(e.target.value)}
                  rows={4}
                  placeholder="請輸入修改指令，例如：&#10;・把腳踏車換成奔跑的黑熊&#10;・將背景改為日落沙灘&#10;・移除右下角的水印&#10;・文字改成：限時優惠中"
                  className="w-full rounded-lg border border-gray-200 bg-white p-3 text-sm resize-none placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-400 transition"
                />
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium text-gray-600">加入參考圖（選填）</p>
                {refImageDataUrl ? (
                  <div className="flex items-center gap-3 rounded-lg border border-violet-200 bg-white p-2">
                    <img src={refImageDataUrl} alt="參考圖" className="h-14 w-14 rounded-md object-cover shrink-0 border" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-700 truncate">{refImageName}</p>
                    </div>
                    <button onClick={clearRefImage} className="shrink-0 text-gray-400 hover:text-red-500 transition-colors">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => refInputRef.current?.click()}
                    className="w-full flex flex-col items-center gap-1.5 rounded-lg border border-dashed border-gray-200 bg-gray-50 hover:border-violet-300 hover:bg-violet-50 px-3 py-5 text-xs text-gray-400 hover:text-violet-600 transition-all"
                  >
                    <UploadCloud className="h-5 w-5" />
                    <span className="font-medium">＋ 加入參考圖</span>
                    <span className="text-[11px] text-gray-400">支援 JPG、PNG，檔案大小不超過 5MB</span>
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
                  : <><Sparkles className="h-4 w-4" /><span>產生修改 ✨</span></>}
              </Button>

              <div className="border-t pt-4">
                <button
                  onClick={() => setCopyOpen((o) => !o)}
                  className="w-full flex items-center justify-between text-sm font-medium text-gray-700"
                >
                  <span className="flex items-center gap-1.5">
                    <FileText className="h-4 w-4 text-gray-400" />
                    文案微調
                  </span>
                  {copyOpen ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                </button>
                {copyOpen && (
                  <div className="mt-3 space-y-2">
                    <textarea
                      value={copyText}
                      onChange={(e) => setCopyText(e.target.value)}
                      rows={6}
                      className="w-full border rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-400"
                    />
                    <div className="text-xs text-gray-500">一鍵轉換語氣：</div>
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
                )}
              </div>
            </div>
          )}

          {tab === "logo" && (
            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium text-gray-600 mb-2">標誌</p>
                {availableLogos.length ? (
                  <div className="grid grid-cols-3 gap-2">
                    {availableLogos.map((lv) => (
                      <button
                        key={lv.url}
                        onClick={() => setShowLogo(true)}
                        title={lv.label}
                        className="flex flex-col items-center gap-1 rounded-lg border border-gray-200 bg-white p-2 hover:border-violet-300 hover:bg-violet-50 transition-colors"
                      >
                        <img src={lv.url} alt={lv.label} className="h-10 object-contain" />
                        <span className="text-[10px] text-gray-500 truncate max-w-full">{lv.label}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">尚未設定品牌標誌，可於下方上傳。</p>
                )}
              </div>

              <button
                onClick={() => setShowLogo(true)}
                className="w-full flex flex-col items-center gap-1.5 rounded-lg border border-dashed border-gray-200 bg-gray-50 hover:border-violet-300 hover:bg-violet-50 px-3 py-6 text-xs text-gray-400 hover:text-violet-600 transition-all"
              >
                <UploadCloud className="h-5 w-5" />
                <span>點擊或拖曳圖片到這裡</span>
              </button>

              {/* 柔和投影：實際開關在「放置標誌」視窗內（LogoPlacerModal 內建 shadow
                  狀態），呢度純顯示提示，未直接接線——避免喺呢層重複維護一份會同
                  modal 入面嗰個唔同步嘅開關狀態。 */}
              <label className="flex items-center gap-2 text-xs text-gray-400">
                <input type="checkbox" disabled className="accent-violet-600" />
                柔和投影（於「放置標誌」視窗內設定）
              </label>
            </div>
          )}
        </div>
      </div>

      {/* 放置標誌 modal —— 合成後推入歷史堆疊，走既有「儲存草稿」流程 */}
      {showLogo && (
        <LogoPlacerModal
          imageUrl={currentImage}
          logoVersions={availableLogos}
          onConfirm={(url) => {
            setImageHistory((h) => [...h, url]);
            setRedoStack([]);
            setSaved(false);
            setShowLogo(false);
          }}
          onClose={() => setShowLogo(false)}
        />
      )}

      <UnsavedChangesModal
        open={!!pendingHref}
        saving={saving}
        onCancel={cancelLeave}
        onLeaveWithoutSaving={confirmLeave}
        onSaveAndLeave={async () => { await handleSave(); confirmLeave(); }}
      />
    </div>
  );
}
