"use client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles, CheckCircle2, Wand2, ImagePlus, X, LayoutGrid, Undo2 } from "lucide-react";
import { MaskCanvas, type SelectionBounds } from "@/components/activities/MaskCanvas";

type Props = {
  layoutRecordId: string;          // GeneratedLayout id
  layoutType: string;              // 多圖版型 id（two-lr / four-grid…）
  initialComposite: string;        // 拼版大圖 URL
  initialCells: string[];          // 各格圖 URL
  initialCopy: string;             // 文案
  ratio: string;                   // 圖片比例
  brandLogoUrl?: string;
  logoMode?: string;
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
  layoutRecordId, layoutType, initialComposite, initialCells, initialCopy, ratio, brandLogoUrl, logoMode,
}: Props) {
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
  const pushHistory = () =>
    setHistory((h) => [...h, { cells, composite, copyText }].slice(-30));
  const undo = () => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setCells(prev.cells);
    setComposite(prev.composite);
    setCopyText(prev.copyText);
    setHistory((h) => h.slice(0, -1));
    setMaskDataUrl(null);
    setSelectionBounds(null);
    setSaved(false);
  };

  const isCell = typeof view === "number";
  const activeCell = isCell ? (view as number) : -1;
  const busy = inpainting || recompositing;

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
        body: JSON.stringify({ cellUrls: nextCells, layoutId: layoutType, ratio, logoUrl: brandLogoUrl, logoMode }),
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

  return (
    <div className="grid grid-cols-[1fr_1fr] xl:grid-cols-[1fr_340px_340px] gap-8 items-start">
      {/* ── 圖片預覽：左側小圖列（含拼版總覽）+ 中央大圖 ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium text-gray-700">圖片預覽</h2>
          {recompositing && (
            <span className="flex items-center gap-1 text-xs text-violet-500">
              <Loader2 className="h-3 w-3 animate-spin" />拼版更新中…
            </span>
          )}
        </div>

        <div className="flex gap-3">
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

          {/* 中央大圖（填滿欄位，比例同單圖）*/}
          <div className="relative flex-1 rounded-xl overflow-hidden border">
            {isCell ? (
              <MaskCanvas
                key={`${activeCell}-${cells[activeCell]}`}
                imageUrl={cells[activeCell]}
                onMaskChange={setMaskDataUrl}
                onSelectionChange={setSelectionBounds}
              />
            ) : (
              <img src={composite} alt="拼版總覽" className="w-full object-contain bg-gray-50" />
            )}
            {busy && (
              <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-3 z-20">
                <Loader2 className="h-7 w-7 text-white animate-spin" />
                <p className="text-white text-sm">{inpainting ? "AI 修改中…" : "重新拼版中…"}</p>
              </div>
            )}
          </div>
        </div>

        {/* 回上一步 + 完成此版本 */}
        <div className="flex items-center gap-2">
          <Button
            onClick={undo}
            disabled={history.length === 0 || busy}
            variant="outline"
            className="gap-1.5"
            title={history.length === 0 ? "沒有可復原的修改" : `回上一步（還可復原 ${history.length} 步）`}
          >
            <Undo2 className="h-4 w-4" />
            <span>回上一步{history.length > 0 ? `（${history.length}）` : ""}</span>
          </Button>
          <Button onClick={handleSave} disabled={saving} variant={saved ? "outline" : "default"} className="gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : null}
            <span>{saving ? "儲存中…" : saved ? "已儲存最新拼版" : "完成此版本"}</span>
          </Button>
        </div>
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
              placeholder="例：把背景改成日落沙灘 / 移除右下角的水印"
              className="w-full rounded-lg border border-violet-200 bg-white p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-400"
            />

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
    </div>
  );
}
