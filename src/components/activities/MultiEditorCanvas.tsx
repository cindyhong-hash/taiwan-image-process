"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Loader2, Sparkles, CheckCircle2, X, ChevronLeft, Pencil,
  Maximize2, SplitSquareHorizontal, RotateCcw, RotateCw,
  ChevronDown, ChevronUp, UploadCloud, FileText, LayoutGrid,
} from "lucide-react";
import { MaskCanvas, type SelectionBounds } from "@/components/activities/MaskCanvas";
import LogoPlacerModal, { type LogoVersion } from "@/components/activities/LogoPlacerModal";
import { UnsavedChangesModal } from "@/components/activities/UnsavedChangesModal";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";

type Props = {
  layoutRecordId: string;          // GeneratedLayout id
  layoutType: string;              // 多圖版型 id（two-lr / four-grid…）
  initialComposite: string;        // 拼版大圖 URL
  initialCells: string[];          // 各格圖 URL
  initialCopy: string;             // 文案
  ratio: string;                   // 圖片比例
  brandLogoUrl?: string;
  logoMode?: string;
  logoVersions?: LogoVersion[];    // 多版本品牌 logo（放置標誌可選）
  /** 活動主題 — 顯示喺頂欄標題（同單圖版 EditorCanvas.tsx 一致）。 */
  theme?: string;
  /** 頂欄「返回」連結。 */
  backHref?: string;
};

// view：要在中央大圖顯示的對象 — "composite"（整體拼版，唯讀）或某一格 index（可編輯）
type View = "composite" | number;

const COPY_TRANSFORMS = [
  { label: "再簡短一點", instruction: "請把這段文案縮短一半，保留核心意思" },
  { label: "更有衝勁",   instruction: "請讓這段文案更有能量、更有購買衝動感" },
  { label: "更正式",     instruction: "請讓這段文案更專業正式" },
  { label: "換個花樣",   instruction: "請用不同的角度重寫這段文案，保留核心訊息" },
];

export function MultiEditorCanvas({
  layoutRecordId, layoutType, initialComposite, initialCells, initialCopy, ratio, brandLogoUrl, logoMode, logoVersions = [], theme, backHref,
}: Props) {
  // 單格大圖嘅框闊度——換格／上一步重做會令 MaskCanvas remount，新圖未載完之前個框
  // 會塌窄再彈返（閃跳），保住上次闊度喺載入期間頂住個位（見 MaskCanvas reservedWidth）。
  const [cellWidth, setCellWidth] = useState<number | undefined>(undefined);

  const [showLogo, setShowLogo] = useState(false);
  const [cells, setCells] = useState<string[]>(initialCells);
  const [composite, setComposite] = useState<string>(initialComposite);
  const [view, setView] = useState<View>(0);   // 一進來顯示第 1 格（單張）
  const [copyText, setCopyText] = useState<string>(initialCopy);
  const [transforming, setTransforming] = useState(false);

  const [maskDataUrl, setMaskDataUrl] = useState<string | null>(null);
  const [selectionBounds, setSelectionBounds] = useState<SelectionBounds | null>(null);
  const [prompt, setPrompt] = useState("");
  const [refImageDataUrl, setRefImageDataUrl] = useState<string | null>(null);
  const [refImageName, setRefImageName] = useState<string | null>(null);
  const refInputRef = useRef<HTMLInputElement>(null);

  const [inpainting, setInpainting] = useState(false);
  const [recompositing, setRecompositing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // 右側面板分頁：修改圖片／放置LOGO；文案微調 collapsible（預設展開）；左側
  // 圖片工具列：縮放（0.5~2）＋對比（按住顯示上一步版本）——同單圖版 EditorCanvas.tsx 一致。
  const [tab, setTab] = useState<"edit" | "logo">("edit");
  const [copyOpen, setCopyOpen] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [compare, setCompare] = useState(false);

  // 回上一步：每次 AI 修改 / 文案轉換前，先把當前狀態存進歷史堆疊
  type Snapshot = { cells: string[]; composite: string; copyText: string };
  const [history, setHistory] = useState<Snapshot[]>([]);
  // 重做棧：回上一步彈出嗰版會推入呢度；新改動（pushHistory 一 call）會清空（標準 redo 慣例）。
  const [redoStack, setRedoStack] = useState<Snapshot[]>([]);
  // isModified：同單圖版 EditorCanvas.tsx 一致嘅概念——用嚟決定頂欄「已儲存」pill
  // 同「儲存草稿」按鈕嘅顯示/可用狀態。有歷史（即改過嘢）先算 modified。
  const isModified = history.length > 0;
  // 有未儲存改動就攔截「離開呢頁」（返上一頁箭嘴／側欄品牌名都算），彈確認框先過。
  const { pendingHref, confirmLeave, cancelLeave } = useUnsavedChangesGuard(isModified && !saved);

  const pushHistory = () => {
    setHistory((h) => [...h, { cells, composite, copyText }].slice(-30));
    setRedoStack([]);
  };
  const undo = () => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setRedoStack((r) => [{ cells, composite, copyText }, ...r].slice(0, 30));
    setCells(prev.cells);
    setComposite(prev.composite);
    setCopyText(prev.copyText);
    setHistory((h) => h.slice(0, -1));
    setMaskDataUrl(null);
    setSelectionBounds(null);
    setSaved(false);
  };
  const redo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[0];
    setHistory((h) => [...h, { cells, composite, copyText }].slice(-30));
    setCells(next.cells);
    setComposite(next.composite);
    setCopyText(next.copyText);
    setRedoStack((r) => r.slice(1));
    setMaskDataUrl(null);
    setSelectionBounds(null);
    setSaved(false);
  };

  const isCell = typeof view === "number";
  const activeCell = isCell ? (view as number) : -1;
  const busy = inpainting || recompositing;
  const peekPreviousImage = history.length === 0 ? null
    : isCell ? history[history.length - 1].cells[activeCell]
    : history[history.length - 1].composite;

  const selectView = (v: View) => {
    setView(v);
    setMaskDataUrl(null);
    setSelectionBounds(null);
  };

  const handleRefChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRefImageName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => setRefImageDataUrl(ev.target?.result as string);
    reader.readAsDataURL(file);
    e.target.value = "";
  };
  const clearRef = () => { setRefImageDataUrl(null); setRefImageName(null); };

  const recomposite = async (nextCells: string[]) => {
    setRecompositing(true);
    try {
      const res = await fetch("/api/composite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // [logo] 重新拼版不再自動疊 logo；logo 改由「放置標誌」手動放置在拼版大圖上。
        body: JSON.stringify({ cellUrls: nextCells, layoutId: layoutType, ratio, logoMode: "none" }),
      });
      const data = await res.json();
      if (data.imageUrl) setComposite(data.imageUrl);
    } finally {
      setRecompositing(false);
    }
  };

  const editActiveCell = async () => {
    if (!isCell) return;
    if (!prompt.trim() && !selectionBounds && !refImageDataUrl) return;
    setInpainting(true);
    try {
      const res = await fetch("/api/inpaint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: cells[activeCell],
          maskDataUrl,
          selectionBounds,
          prompt,
          referenceImageDataUrl: refImageDataUrl ?? undefined,
          brandLogoUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "修改失敗");
      pushHistory();  // 存修改前狀態，供「回上一步」
      const nextCells = cells.map((c, i) => (i === activeCell ? data.imageUrl : c));
      setCells(nextCells);
      setMaskDataUrl(null);
      setSelectionBounds(null);
      setPrompt("");
      clearRef();
      setSaved(false);
      await recomposite(nextCells);
    } catch (err) {
      alert(err instanceof Error ? err.message : "修改失敗，請查看 console");
    } finally {
      setInpainting(false);
    }
  };

  const transformCopy = async (instruction: string) => {
    if (!copyText.trim()) return;
    setTransforming(true);
    try {
      const res = await fetch("/api/transform-copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ copyText, instruction }),
      });
      const data = await res.json();
      if (data.result) { pushHistory(); setCopyText(data.result); setSaved(false); }
    } finally {
      setTransforming(false);
    }
  };

  const handleSave = async () => {
    if (!isModified) return;
    setSaving(true);
    try {
      await fetch(`/api/layouts/${layoutRecordId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: composite, cellImageUrls: JSON.stringify(cells), copyText }),
      });
      setSaved(true);
      // 同單圖版一致：儲存後把歷史清空（下次回來仍顯示最新結果）
      setHistory([]);
      setRedoStack([]);
    } catch {
      alert("儲存失敗");
    } finally {
      setSaving(false);
    }
  };

  const zoomIn  = () => setZoom((z) => Math.min(2,   +(z + 0.1).toFixed(2)));
  const zoomOut = () => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2)));
  const fitZoom = () => setZoom(1);

  const availableLogos: LogoVersion[] =
    logoVersions.length ? logoVersions : (brandLogoUrl ? [{ url: brandLogoUrl, label: "品牌 Logo" }] : []);

  return (
    <div>
      {/* ── 頂欄（同單圖版 EditorCanvas.tsx 一致）── */}
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

        {/* Left: 小圖列 + 中央大圖 */}
        <div className="space-y-3">
          <div className="flex gap-3 items-start">
            {/* 小圖列——比單圖版多出嚟嘅一段：拼版總覽＋逐格縮圖 */}
            <div className="flex flex-col gap-2 shrink-0 w-20 max-h-[75vh] overflow-y-auto pr-0.5">
              <button
                onClick={() => selectView("composite")}
                className={`relative rounded-lg overflow-hidden border-2 transition-all ${
                  view === "composite" ? "border-violet-500 shadow" : "border-gray-200 hover:border-gray-400"
                }`}
              >
                <img src={composite} alt="拼版" className="w-full aspect-square object-cover" />
                <span className="absolute bottom-0 inset-x-0 bg-violet-600/80 text-white text-[9px] py-0.5 flex items-center justify-center gap-0.5">
                  <LayoutGrid className="h-2.5 w-2.5" />拼版
                </span>
              </button>
              {cells.map((url, i) => (
                <button
                  key={i}
                  onClick={() => selectView(i)}
                  className={`relative rounded-lg overflow-hidden border-2 transition-all ${
                    activeCell === i ? "border-violet-500 shadow" : "border-gray-200 hover:border-gray-400"
                  }`}
                >
                  <img src={url} alt={`圖 ${i + 1}`} className="w-full aspect-square object-cover" />
                  <span className="absolute bottom-0 inset-x-0 bg-black/55 text-white text-[9px] py-0.5 text-center">
                    圖 {i + 1}
                  </span>
                </button>
              ))}
            </div>

            {/* 中央大圖——結構同單圖版 EditorCanvas.tsx 一致（縮放 wrapper + 對比疊層） */}
            <div className="flex-1 min-w-0 rounded-2xl border bg-gray-50/50 overflow-auto max-h-[75vh] flex justify-center p-4">
              {isCell ? (
                <div style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }} className="relative inline-block">
                  <MaskCanvas
                    imageUrl={cells[activeCell]}
                    onMaskChange={setMaskDataUrl}
                    onSelectionChange={setSelectionBounds}
                    previousImageUrl={peekPreviousImage}
                    reservedWidth={cellWidth}
                    onWidthChange={setCellWidth}
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
                  {recompositing && (
                    <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-3 z-20 rounded-xl">
                      <Loader2 className="h-7 w-7 text-white animate-spin" />
                      <p className="text-white text-sm">重新拼版中…</p>
                    </div>
                  )}
                  {compare && peekPreviousImage && (
                    <img
                      src={peekPreviousImage}
                      alt="上一步版本"
                      className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none z-50 bg-white"
                    />
                  )}
                </div>
              ) : (
                <div style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }} className="relative inline-block rounded-xl overflow-hidden border">
                  <img src={composite} alt="拼版總覽" draggable={false} className="max-w-[560px] w-full object-contain bg-gray-50 select-none" />
                  {compare && peekPreviousImage && (
                    <img
                      src={peekPreviousImage}
                      alt="上一步版本"
                      className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none z-50 bg-white"
                    />
                  )}
                  {busy && (
                    <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-3 z-20">
                      <Loader2 className="h-7 w-7 text-white animate-spin" />
                      <p className="text-white text-sm">{inpainting ? "AI 修改中…" : "重新拼版中…"}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 底部工具列（同單圖版 EditorCanvas.tsx 一致） */}
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
              onPointerDown={() => peekPreviousImage && setCompare(true)}
              onPointerUp={() => setCompare(false)}
              onPointerLeave={() => setCompare(false)}
              disabled={!peekPreviousImage}
              className="flex items-center gap-1 text-xs text-gray-600 border border-gray-200 rounded-lg px-2 py-1 hover:border-violet-300 hover:text-violet-600 hover:bg-violet-50 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <SplitSquareHorizontal className="h-3.5 w-3.5" />
              對比
            </button>
            <div className="ml-auto flex items-center gap-1.5">
              <button
                onClick={undo} disabled={history.length === 0}
                className={`flex items-center gap-1 text-xs rounded-lg px-2 py-1 border transition-all ${
                  history.length > 0 ? "text-gray-600 hover:text-violet-600 border-gray-200 hover:border-violet-300 hover:bg-violet-50"
                  : "opacity-30 cursor-not-allowed text-gray-400 border-gray-200"}`}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                復原
              </button>
              <button
                onClick={redo} disabled={redoStack.length === 0}
                className={`flex items-center gap-1 text-xs rounded-lg px-2 py-1 border transition-all ${
                  redoStack.length > 0 ? "text-gray-600 hover:text-violet-600 border-gray-200 hover:border-violet-300 hover:bg-violet-50"
                  : "opacity-30 cursor-not-allowed text-gray-400 border-gray-200"}`}
              >
                <RotateCw className="h-3.5 w-3.5" />
                重做
              </button>
            </div>
          </div>
        </div>

        {/* Right: AI 微調面板（同單圖版 EditorCanvas.tsx 一致） */}
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
              {!isCell ? (
                <div className="rounded-lg border bg-gray-50 p-4 text-sm text-gray-400 text-center">
                  目前顯示整體拼版。<br />請從左側選一格（圖 1、圖 2…）來修改。
                </div>
              ) : (
                <>
                  <p className="text-xs text-gray-400">
                    正在修改「圖 {activeCell + 1}」。請選取畫面中的物件，或直接告訴 AI 想怎麼修改，完成會自動更新拼版。
                  </p>

                  {maskDataUrl && (
                    <div className="flex items-center gap-2 text-xs rounded-lg px-3 py-2 border bg-blue-50 border-blue-200 text-blue-700">
                      <span className="w-2 h-2 rounded-full inline-block bg-blue-500" />
                      已選取修改範圍
                    </div>
                  )}

                  <div>
                    <label className="text-xs font-medium text-gray-600 mb-1.5 block">告訴 AI 你想怎麼修改</label>
                    <textarea
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      rows={4}
                      placeholder="例：把背景改成日落沙灘 / 移除右下角的水印 / 文字改成：限時優惠中"
                      className="w-full rounded-lg border border-gray-200 bg-white p-3 text-sm resize-none placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-400 transition"
                    />
                    <p className="text-[11px] text-gray-400 mt-1.5">
                      想改文字內容：用「文字改成：新內容」呢個句式最準，或者圈選好文字範圍後直接打新內容都得。
                    </p>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-medium text-gray-600">加入參考圖（選填）</p>
                    {refImageDataUrl ? (
                      <div className="flex items-center gap-3 rounded-lg border border-violet-200 bg-white p-2">
                        <img src={refImageDataUrl} alt="參考圖" className="h-14 w-14 rounded-md object-cover shrink-0 border" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-700 truncate">{refImageName}</p>
                        </div>
                        <button onClick={clearRef} className="shrink-0 text-gray-400 hover:text-red-500 transition-colors">
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
                    <input ref={refInputRef} type="file" accept="image/*" className="hidden" onChange={handleRefChange} />
                  </div>

                  <Button
                    onClick={editActiveCell}
                    disabled={busy || (!prompt.trim() && !selectionBounds && !refImageDataUrl)}
                    className="w-full gap-2 bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-50"
                  >
                    {inpainting
                      ? <><Loader2 className="h-4 w-4 animate-spin" /><span>生成中…</span></>
                      : <><Sparkles className="h-4 w-4" /><span>產生修改 ✨</span></>}
                  </Button>
                </>
              )}

              {/* 文案微調——多圖係整組共用一份文案，唔跟住揀邊格而變，所以擺喺
                  cell-conditional 表單之外，composite／cell view 都見得到。 */}
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
                      onChange={(e) => { setCopyText(e.target.value); setSaved(false); }}
                      rows={6}
                      placeholder="這組多圖的文案…"
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
                    <p className="text-xs text-gray-400">文案會在「儲存草稿」時一併存回。</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === "logo" && (
            <div className="space-y-4">
              <p className="text-xs text-gray-400">
                將標誌放置在「{isCell ? `圖 ${activeCell + 1}` : "拼版總覽"}」上：某一格會合成到該格後自動重新拼版，拼版總覽則直接疊在整張大圖上。
              </p>
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
                  modal 入面嗰個唔同步嘅開關狀態（同單圖版 EditorCanvas.tsx 一致）。 */}
              <label className="flex items-center gap-2 text-xs text-gray-400">
                <input type="checkbox" disabled className="accent-violet-600" />
                柔和投影（於「放置標誌」視窗內設定）
              </label>
            </div>
          )}
        </div>
      </div>

      {/* 放置標誌 modal —— 針對「目前顯示的那張圖」：
          某一格 → 合成到該格後自動重新拼版；拼版總覽 → 直接疊在整張大圖上。 */}
      {showLogo && (
        <LogoPlacerModal
          imageUrl={isCell ? cells[activeCell] : composite}
          logoVersions={availableLogos}
          onConfirm={(url) => {
            setShowLogo(false);
            setSaved(false);
            pushHistory();
            if (isCell) {
              const nextCells = cells.map((c, i) => (i === activeCell ? url : c));
              setCells(nextCells);
              void recomposite(nextCells);
            } else {
              setComposite(url);
            }
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
