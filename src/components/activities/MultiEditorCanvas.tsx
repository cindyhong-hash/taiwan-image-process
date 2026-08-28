"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles, CheckCircle2, Wand2, ImagePlus, X, LayoutGrid, RotateCcw, RotateCw, Stamp } from "lucide-react";
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
  layoutRecordId, layoutType, initialComposite, initialCells, initialCopy, ratio, brandLogoUrl, logoMode, logoVersions = [],
}: Props) {
  // 標題列同 banner 嘅闊度，跟返「小圖列+主圖」個 row 嘅真實 render 闊度。淨係 set
  // 落標題列/banner 自己身上，唔可以 set 落共同父層（見 EditorCanvas.tsx 同一註解）。
  const [colWidth, setColWidth] = useState<number | undefined>(undefined);
  // 單格大圖嘅框闊度——換格／上一步重做會令 MaskCanvas remount，新圖未載完之前個框
  // 會塌窄再彈返（閃跳），保住上次闊度喺載入期間頂住個位（見 MaskCanvas reservedWidth）。
  const [cellWidth, setCellWidth] = useState<number | undefined>(undefined);
  const rowRef = useRef<HTMLDivElement>(null);
  // ResizeObserver 唔係喺所有環境都一定 fire（實測有啲 embedded browser 完全唔會
  // delivery notification），所以除咗佢仲要喺 mount／視窗改變各量一次。
  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const measure = () => setColWidth(row.offsetWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(row);
    window.addEventListener("resize", measure);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); };
  }, []);

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

  // 回上一步：每次 AI 修改 / 文案轉換前，先把當前狀態存進歷史堆疊
  type Snapshot = { cells: string[]; composite: string; copyText: string };
  const [history, setHistory] = useState<Snapshot[]>([]);
  // 重做棧：回上一步彈出嗰版會推入呢度；新改動（pushHistory 一 call）會清空（標準 redo 慣例）。
  const [redoStack, setRedoStack] = useState<Snapshot[]>([]);
  // 有未儲存改動就攔截「離開呢頁」（返上一頁箭嘴／側欄品牌名都算），彈確認框先過。
  const { pendingHref, confirmLeave, cancelLeave } = useUnsavedChangesGuard(history.length > 0 && !saved);

  // 「拼版已修改，尚未儲存」banner 改返做正常排版一部分（唔再 fixed 貼死視窗底，
  // 同單圖版 EditorCanvas.tsx 一致嘅方案二做法）。試過加自動捲動，但撳上一步/重做
  // 仲係會跳，用戶話唔捲都冇所謂——banner 跟實圖片闊度，唔會再霸住成個畫面底部，
  // 唔捲都揾得到，所以索性唔再自動捲。
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

  // 長按圖片預覽上一步：同單圖版 EditorCanvas.tsx 一致嘅 450ms 判斷（避免同 MaskCanvas
  // 「按住拖拉揀範圍」手勢撞埋——一有明顯移動即刻取消，唔會誤觸預覽）。
  const [peeking, setPeeking] = useState(false);
  const peekTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const peekStartPos = useRef<{ x: number; y: number } | null>(null);
  const startPeek = (e: React.PointerEvent) => {
    if (!peekPreviousImage) return;
    peekStartPos.current = { x: e.clientX, y: e.clientY };
    peekTimerRef.current = setTimeout(() => setPeeking(true), 450);
  };
  const cancelPeek = () => {
    if (peekTimerRef.current) { clearTimeout(peekTimerRef.current); peekTimerRef.current = null; }
    peekStartPos.current = null;
    setPeeking(false);
  };
  const checkPeekMove = (e: React.PointerEvent) => {
    if (!peekStartPos.current || peeking) return;
    const dx = e.clientX - peekStartPos.current.x, dy = e.clientY - peekStartPos.current.y;
    if (Math.hypot(dx, dy) > 6) cancelPeek();
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
    setSaving(true);
    try {
      await fetch(`/api/layouts/${layoutRecordId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: composite, cellImageUrls: JSON.stringify(cells), copyText }),
      });
      setSaved(true);
    } catch {
      alert("儲存失敗");
    } finally {
      setSaving(false);
    }
  };

  // ≥xl（1280px）先夠位擺 3 欄橫排；窄過嗰個闊度就全部直向疊晒（唔再用 2 欄），
  // 避免之前「2 欄 + 文案微調跌咗去自己一行、留低一大截空白」嗰種爛版位。
  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px_340px] gap-8 items-start">
      {/* ── 圖片預覽：左側小圖列（含拼版總覽）+ 中央大圖 ── */}
      {/* 分兩層（同 EditorCanvas.tsx 一樣，詳細解釋見嗰邊）：內層 w-fit＝「圖片組」
          （標題列＋小圖列＋主圖），標題列用 colWidth 鎖實跟個 row；banner 擺喺外層做
          兄弟，闊度自由、唔會被逼到跌行，亦影響唔到圖片組對齊。 */}
      <div className="space-y-3">
      <div className="space-y-3 w-fit mx-auto">
        <div className="flex items-center justify-between flex-wrap gap-y-2" style={colWidth ? { width: colWidth } : undefined}>
          <h2 className="font-medium text-gray-700">圖片預覽</h2>
          {/* flex-wrap：標題列闊度鎖實跟「小圖列+主圖」之後，好窄嗰陣可能連 3 粒掣都
              擠唔晒一行，寧願跌落第二行都好過畀掣逼到橫向溢出。 */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* 上一步/重做擺喺放置標誌左邊——放置標誌會跟住 busy 狀態隱藏/顯示，如果佢排喺
                前面，佢一消失兩粒掣就會向左跳位。上一步/重做兩粒掣預設要隱藏（未有歷史
                可返之前唔想見到兩粒灰晒嘅掣阻眼），但淨係靠 mount/unmount 決定顯唔顯示
                會令第一次改完圖嗰刻先突然插入呢兩粒掣，將放置標誌撞去右邊，一樣係跳位
                （見 EditorCanvas.tsx 同一注釋）。改用 invisible——冇歷史時隱藏但保留返
                個位，放置標誌永遠唔會再移位；icon 同其他 4 個位一致用返 RotateCcw/
                RotateCw（之前呢度用緊 Undo2/Redo2，同其他位睇落唔一樣）。 */}
            {!busy && (
              <div className={`flex items-center gap-2 ${history.length > 0 || redoStack.length > 0 ? "" : "invisible"}`}>
                <button onClick={undo} disabled={history.length === 0}
                  className={`flex items-center gap-1 text-xs rounded-lg px-2 py-1 border transition-all ${
                    history.length > 0 ? "text-gray-600 hover:text-violet-600 border-gray-200 hover:border-violet-300 hover:bg-violet-50"
                    : "opacity-30 cursor-not-allowed text-gray-400 border-gray-200"}`}
                  title={history.length > 0 ? `上一步（還可復原 ${history.length} 步）` : "沒有可復原的修改"}>
                  <RotateCcw className="h-3.5 w-3.5" />
                  上一步
                </button>
                <button onClick={redo} disabled={redoStack.length === 0}
                  className={`flex items-center gap-1 text-xs rounded-lg px-2 py-1 border transition-all ${
                    redoStack.length > 0 ? "text-gray-600 hover:text-violet-600 border-gray-200 hover:border-violet-300 hover:bg-violet-50"
                    : "opacity-30 cursor-not-allowed text-gray-400 border-gray-200"}`}
                  title={redoStack.length > 0 ? `重做（還可重做 ${redoStack.length} 步）` : "沒有可重做的步驟"}>
                  <RotateCw className="h-3.5 w-3.5" />
                  重做
                </button>
              </div>
            )}
            {!busy && (
              <button
                onClick={() => setShowLogo(true)}
                className="flex items-center gap-1 text-xs text-gray-600 hover:text-violet-600 border border-gray-200 hover:border-violet-300 hover:bg-violet-50 rounded-lg px-2 py-1 transition-all"
              >
                <Stamp className="h-3.5 w-3.5" />
                放置標誌
              </button>
            )}
            {recompositing && (
              <span className="flex items-center gap-1 text-xs text-violet-500">
                <Loader2 className="h-3 w-3 animate-spin" />拼版更新中…
              </span>
            )}
          </div>
        </div>

        <div ref={rowRef} className="flex gap-3">
          {/* 小圖列 */}
          <div className="flex flex-col gap-2 shrink-0 w-[68px] max-h-[520px] overflow-y-auto pr-1">
            {/* 拼版總覽 */}
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
            {/* 各格 */}
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

          {/* 中央大圖——唔再用 flex-1 逼滿欄位闊度：flex-1 會令個框跟返欄位闊度
              （即使圖片本身好窄，例如 9:16），圖片喺框入面用 object-contain 置中，
              兩側就會多咗睇落好似「白邊」嘅留白。改做跟返圖片自身闊度（max-w 只係
              防止太闊嘅圖撐爆版面），同單圖版 EditorCanvas.tsx 嘅做法一致。*/}
          {isCell ? (
            // MaskCanvas 自己有一個跟實圖片闊度嘅 w-fit container——長按預覽同埋落面
            // 嘅提示文字都喺佢入面處理（見 MaskCanvas.tsx），唔再喺呢度外層加多層，
            // 否則 peek 嗰陣個疊層會攞外層（max-w-560）嗰個闊度，同真正張圖大細唔夾，
            // 睇落好似圖片突然變闊、冧走咗圓角同邊框。
            <div className="relative max-w-[560px]">
              {/* 刻意冇 key——用 key 逼 remount 嚟清遮罩會令成段圖片預覽閃一閃（見
                  EditorCanvas.tsx 同一注釋）；清遮罩改由 MaskCanvas 自己跟 imageUrl 做。 */}
              <MaskCanvas
                imageUrl={cells[activeCell]}
                onMaskChange={setMaskDataUrl}
                onSelectionChange={setSelectionBounds}
                previousImageUrl={peekPreviousImage}
                reservedWidth={cellWidth}
                onWidthChange={setCellWidth}
              />
              {busy && (
                <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-3 z-20 rounded-xl">
                  <Loader2 className="h-7 w-7 text-white animate-spin" />
                  <p className="text-white text-sm">{inpainting ? "AI 修改中…" : "重新拼版中…"}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="relative max-w-[560px] rounded-xl overflow-hidden border"
              onPointerDown={startPeek} onPointerMove={checkPeekMove}
              onPointerUp={cancelPeek} onPointerLeave={cancelPeek} onPointerCancel={cancelPeek}>
              <img src={composite} alt="拼版總覽" draggable={false} className="w-full object-contain bg-gray-50 select-none" />
              {/* 長按預覽：疊喺最上面顯示上一步版本，冇互動性，一鬆手即刻消失 */}
              {peeking && peekPreviousImage && (
                <img src={peekPreviousImage} alt="上一步版本" draggable={false}
                  className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none z-30 bg-white" />
              )}
              {peekPreviousImage && !busy && (
                <div className="absolute bottom-3 left-0 right-0 flex justify-center pointer-events-none">
                  <span className="bg-black/55 text-white text-xs px-3 py-1 rounded-full">
                    💡 長按圖片可預覽上一步版本
                  </span>
                </div>
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

        {/* 完成此版本 banner —— 上一步/重做已搬去頂部標題列，同放置標誌並排（同單圖版
            EditorCanvas.tsx 一致）。方案二：正常排版一部分（2026-08-26 定案），唔再
            fixed 貼死視窗底；擺喺 w-fit 圖片組外面做兄弟，闊度用 colWidth 鎖實跟返
            個 row（同標題列一致）——原本用 `w-max` 會令「未儲存」（有掣）同「已儲存」
            （冇掣）兩個狀態闊度唔一致，撳完「完成此版本」個框會突然縮窄。 */}
        {history.length > 0 && (
          <div
            className={`mx-auto rounded-xl border p-3 ${
              saved ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}
            style={colWidth ? { width: colWidth } : undefined}
          >
          <div className="flex items-center justify-between gap-3 flex-wrap gap-y-2">
            <div>
              <p className={`text-sm font-medium ${saved ? "text-emerald-700" : "text-amber-700"}`}>
                {saved ? "✅ 已儲存為最終版本" : "拼版已修改，尚未儲存"}
              </p>
              <p className={`text-xs mt-0.5 ${saved ? "text-emerald-600" : "text-amber-600"}`}>
                {saved ? "下次回到這個頁面會顯示此版本" : "點擊「完成此版本」將修改後的拼版存回系統"}
              </p>
            </div>
            {!saved && (
              <Button onClick={handleSave} disabled={saving} size="sm" variant="outline"
                className="shrink-0 gap-1.5 border-gray-200 text-gray-600 hover:border-violet-300 hover:text-violet-600 hover:bg-violet-50">
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                <span>{saving ? "儲存中…" : "完成此版本"}</span>
              </Button>
            )}
          </div>
          </div>
        )}
      </div>

      {/* ── 圖片微調（無文案微調）── */}
      <div className="space-y-4">
        <h2 className="font-medium flex items-center gap-1.5">
          <Wand2 className="h-4 w-4 text-violet-500" />
          圖片微調
        </h2>

        {!isCell ? (
          <div className="rounded-xl border bg-gray-50 p-4 text-sm text-gray-400 text-center">
            目前顯示整體拼版。<br />請從左側選一格（圖 1、圖 2…）來修改。
          </div>
        ) : (
          <div className="rounded-xl border bg-violet-50/60 p-4 space-y-3">
            <p className="text-xs text-violet-700">
              正在修改「圖 {activeCell + 1}」。在左側圖片塗抹要改的區域、輸入指令後點「開始修改」，完成會自動更新拼版。
            </p>

            <div className={`flex items-center gap-2 text-xs rounded-lg px-3 py-2 border ${
              maskDataUrl ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-gray-50 border-gray-200 text-gray-400"
            }`}>
              <span className={`w-2 h-2 rounded-full inline-block ${maskDataUrl ? "bg-blue-500" : "bg-gray-300"}`} />
              {maskDataUrl ? "已選取修改範圍" : "尚未圈選範圍（可選）"}
            </div>

            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              placeholder="例：把背景改成日落沙灘 / 移除右下角的水印 / 文字改成：限時優惠中"
              className="w-full rounded-lg border border-violet-200 bg-white p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-400"
            />
            <p className="text-[11px] text-gray-400 -mt-1.5">
              想改文字內容：用「文字改成：新內容」呢個句式最準（例：文字改成：限時優惠中），或者圈選好文字範圍後直接打新內容都得。
            </p>

            {/* 參考圖（選填）*/}
            <div className="space-y-2">
              <p className="text-xs text-gray-500 font-medium">參考圖（選填）</p>
              {refImageDataUrl ? (
                <div className="flex items-center gap-3 rounded-lg border border-violet-200 bg-white p-2">
                  <img src={refImageDataUrl} alt="參考圖" className="h-12 w-12 rounded-md object-cover border" />
                  <span className="text-xs text-gray-600 truncate flex-1">{refImageName}</span>
                  <button onClick={clearRef} className="text-gray-400 hover:text-red-500"><X className="h-4 w-4" /></button>
                </div>
              ) : (
                <button onClick={() => refInputRef.current?.click()}
                  className="w-full flex items-center gap-2 rounded-lg border border-dashed border-violet-200 bg-white hover:border-violet-400 px-3 py-2.5 text-sm text-gray-400 hover:text-violet-600">
                  <ImagePlus className="h-4 w-4" /><span>上傳參考圖</span>
                </button>
              )}
              <input ref={refInputRef} type="file" accept="image/*" className="hidden" onChange={handleRefChange} />
            </div>

            <Button onClick={editActiveCell} disabled={busy || (!prompt.trim() && !selectionBounds && !refImageDataUrl)}
              className="w-full gap-2 bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-50">
              {inpainting ? <><Loader2 className="h-4 w-4 animate-spin" /><span>修改中…</span></> : <><Sparkles className="h-4 w-4" /><span>開始修改</span></>}
            </Button>
          </div>
        )}
      </div>

      {/* ── 文案微調（多圖也有文案）── */}
      <div className="space-y-4">
        <h2 className="font-medium">文案微調</h2>
        <textarea
          value={copyText}
          onChange={(e) => { setCopyText(e.target.value); setSaved(false); }}
          rows={8}
          placeholder="這組多圖的文案…"
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
        <p className="text-xs text-gray-400">文案會在「完成此版本」時一併存回。</p>
      </div>

      {/* 放置標誌 modal —— 針對「目前顯示的那張圖」：
          某一格 → 合成到該格後自動重新拼版；拼版總覽 → 直接疊在整張大圖上。 */}
      {showLogo && (
        <LogoPlacerModal
          imageUrl={isCell ? cells[activeCell] : composite}
          logoVersions={logoVersions.length ? logoVersions : (brandLogoUrl ? [{ url: brandLogoUrl, label: "品牌 Logo" }] : [])}
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
