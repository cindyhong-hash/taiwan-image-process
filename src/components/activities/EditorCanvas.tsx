"use client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Loader2, Sparkles, Wand2, RotateCcw, RotateCw, CheckCircle2, ImagePlus, X, Stamp } from "lucide-react";
import { MaskCanvas, type SelectionBounds } from "@/components/activities/MaskCanvas";
import LogoPlacerModal, { type LogoVersion } from "@/components/activities/LogoPlacerModal";
import { UnsavedChangesModal } from "@/components/activities/UnsavedChangesModal";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";

type Props = {
  layout: { id: string; imageUrl: string; copyText: string; layoutType: string };
  brandLogoUrl?: string;
  logoVersions?: LogoVersion[];
};

const COPY_TRANSFORMS = [
  { label: "再簡短一點", instruction: "請把這段文案縮短一半，保留核心意思" },
  { label: "更有衝勁",   instruction: "請讓這段文案更有能量、更有購買衝動感" },
  { label: "更正式",     instruction: "請讓這段文案更專業正式" },
  { label: "換諧音梗",   instruction: "請在這段文案中加入一個有趣的諧音梗或雙關語" },
];

export function EditorCanvas({ layout, brandLogoUrl, logoVersions = [] }: Props) {
  // 標題列同 banner 嘅闊度，跟返 MaskCanvas 個框（即張圖）嘅真實 render 闊度。
  // 淨係 set 落標題列/banner 自己身上，唔可以 set 落佢哋同張圖嘅共同父層——
  // 否則會反過來限制返張圖闊度，形成「量度→縮圖→再量度」嘅迴圈。
  const [colWidth, setColWidth] = useState<number | undefined>(undefined);
  const [showLogo,    setShowLogo]    = useState(false);
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
  // 重做棧：撳「上一步」彈出嘅版本會推入呢度，新改動（inpaint/放置標誌）會清空（標準 redo 慣例）。
  const [redoStack, setRedoStack] = useState<string[]>([]);
  const currentImage = imageHistory[imageHistory.length - 1];
  const previousImage = imageHistory.length > 1 ? imageHistory[imageHistory.length - 2] : null;
  const canUndo      = imageHistory.length > 1;
  const canRedo       = redoStack.length > 0;
  // isModified 淨係比較「而家張圖」同「呢頁一開始個 layout.imageUrl」——但
  // layout 係 prop，撳完「完成此版本」都唔會自動更新，所以 isModified 撳完
  // 儲存都仲係 true。banner 本身要靠呢個先顯示得返「已儲存」嘅綠框（唔可以
  // 一撳完儲存就即刻連框都冧埋），所以離開警告淨係加 `&& !saved` 傳落
  // useUnsavedChangesGuard，唔改 isModified 本身。
  const isModified   = currentImage !== layout.imageUrl;
  // 有未儲存改動就攔截「離開呢頁」（返上一頁箭嘴／側欄品牌名都算），彈確認框先過；
  // 已經撳咗「完成此版本」（saved=true）就唔應該再攔（bug：之前冇 `&& !saved`，
  // 令撳完儲存都仲會彈警告）。
  const { pendingHref, confirmLeave, cancelLeave } = useUnsavedChangesGuard(isModified && !saved);

  // 「圖片已修改，尚未儲存」banner 改返做正常排版一部分（唔再 fixed 貼死視窗底）。
  // 試過加自動捲動見一次，但撳上一步/重做仲係會跳（疑似 scrollIntoView 同滑鼠手勢
  // 撞埋），用戶話唔捲都冇所謂——banner 本身喺 w-fit 欄入面，跟實圖片，唔會再成條
  // bar 霸住成個畫面底部，唔捲都揾得到，所以索性唔再自動捲。

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

      // 推入歷史，同時重置 mask（key 改變 → MaskCanvas 重新 mount，遮罩清除）
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

  // ≥xl（1280px）先夠位擺 3 欄橫排；窄過嗰個闊度就全部直向疊晒（唔再用 2 欄），
  // 避免之前「2 欄 + 文案微調跌咗去自己一行、留低一大截空白」嗰種爛版位。
  // 第一欄用 `minmax(0,440px)`（唔用 auto）——auto 會跟「入面最闊嗰嚿嘢」計闊度，所以
  // 9:16 呢類窄圖同 1:1／4:3 出嚟嘅欄闊唔一樣，而且 banner 一出現／撳上一步重做都會
  // 即刻改變欄闊，令中間「圖片微調」成段左右彈位。minmax 個 min 係 0＝完全唔理入面
  // 擺咩，所以任何比例、有冇 banner，欄闊都一樣；max 封頂 440 令窄圖（9:16）左右唔會
  // 留低一大截空位（440 減返 9:16 圖闊約 390，兩邊各 25px，同其他比例睇齊）；空間唔
  // 夠嗰陣（例如啱啱過 1280）佢會自己縮，唔會撐爆版面。
  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,440px)_340px_340px] gap-8 items-start xl:justify-center">

      {/* ── Col 1: Image ── */}
      {/* 分兩層：
          • 內層 `w-fit`＝「圖片組」（標題列＋張圖＋長按提示），闊度嚴格跟張圖。標題列
            如果唔鎖闊度，佢三粒掣闊過張圖嗰陣（矮螢幕令 9:16 圖被 max-height 壓到好窄
            就會）就會反過來贏咗 w-fit、將呢組撐闊，張圖被 mx-auto 推到置中，睇落就係
            標題列「凸出」咗喺圖右邊界之外——所以標題列要用量度返嚟嘅 colWidth 鎖實。
          • 外層＝呢個 grid 格，banner 擺喺呢度做內層嘅「兄弟」而唔係「仔女」。`w-fit`
            係跟自己嘅內容計闊度、唔理兄弟，所以 banner 想幾闊都得（唔使跟返窄圖闊度、
            「完成此版本」唔會被逼到跌落第二行），但完全影響唔到上面圖片組嘅對齊。 */}
      <div className="space-y-3">
      <div className="space-y-3 w-fit mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-y-2" style={colWidth ? { width: colWidth } : undefined}>
          <h2 className="font-medium">圖片預覽</h2>
          {/* flex-wrap：標題列闊度鎖實跟張圖之後，好窄嘅圖（矮螢幕嗰陣）可能連 3 粒掣
              都擠唔晒一行，寧願跌落第二行都好過畀掣逼到橫向溢出（超出張圖右邊界）。 */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* 上一步/重做擺喺放置標誌左邊——放置標誌會跟住 inpainting 狀態隱藏/顯示，
                如果佢排喺上一步/重做前面，佢一消失兩粒掣就會向左跳位。上一步/重做兩粒
                掣預設要隱藏（未有歷史可返之前唔想見到兩粒灰晒嘅掣阻眼），但淨係靠
                canUndo||canRedo 決定「掛唔掛落 DOM」會令第一次改完圖嗰刻先突然插入
                呢兩粒掣，將放置標誌撞去右邊，一樣係跳位。改用 invisible（唔靠
                mount/unmount）——冇歷史時用 invisible 隱藏但保留返個位，位一早留低，
                放置標誌永遠唔會再移位。 */}
            {!inpainting && (
              <div className={`flex items-center gap-2 ${canUndo || canRedo ? "" : "invisible"}`}>
                <button
                  onClick={undo} disabled={!canUndo}
                  className={`flex items-center gap-1 text-xs rounded-lg px-2 py-1 border transition-all ${
                    canUndo ? "text-gray-600 hover:text-violet-600 border-gray-200 hover:border-violet-300 hover:bg-violet-50"
                    : "opacity-30 cursor-not-allowed text-gray-400 border-gray-200"}`}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  上一步
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
            )}
            {!inpainting && (
              <button
                onClick={() => setShowLogo(true)}
                className="flex items-center gap-1 text-xs text-gray-600 hover:text-violet-600 border border-gray-200 hover:border-violet-300 hover:bg-violet-50 rounded-lg px-2 py-1 transition-all"
              >
                <Stamp className="h-3.5 w-3.5" />
                放置標誌
              </button>
            )}
          </div>
        </div>

        {/* Canvas — key={currentImage} 讓 inpaint 完成後遮罩自動清除。loading 遮罩透過
            overlay prop 交返俾 MaskCanvas 自己喺跟實圖片闊度嗰層度掛出，唔喺呢度外層
            再包一層 rounded-xl overflow-hidden——嗰層會連埋 MaskCanvas 下面成個
            space-y-3（包括「長按圖片可預覽上一步版本」提示文字）一齊裁走，窄圖（9:16）
            嗰陣提示文字夠貼近邊界，就俾轉角個 radius 裁走個「本」字。 */}
        {/* 刻意冇 key={currentImage}——用 key 逼 remount 嚟清遮罩會令成段「圖片預覽」
            消失一下再出現（閃跳）。清遮罩改由 MaskCanvas 入面 imageUrl 一變就做（見
            嗰邊個 effect），component 唔使拆，換圖亦唔會閃。 */}
        <MaskCanvas
          imageUrl={currentImage}
          onMaskChange={setMaskDataUrl}
          onSelectionChange={setSelectionBounds}
          previousImageUrl={previousImage}
          onWidthChange={setColWidth}
          reservedWidth={colWidth}
          overlay={inpainting && (
            <div className="absolute inset-0 bg-black/65 backdrop-blur-[2px] flex flex-col items-center justify-center gap-4">
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
        />
      </div>

        {/* 完成此版本 banner — 有修改且尚未儲存時顯示（方案二：頁面內排版，2026-08-26
            同用戶討論後定案）。唔再用 fixed 貼死視窗底——嗰種做法會成條橫 bar 長期霸住
            畫面底部，用戶唔鍾意。
            刻意擺喺上面個 w-fit「圖片組」外面（做佢兄弟），闊度用 colWidth 鎖實跟返
            張圖（同標題列一致）——原本用 `w-max`（跟內容闊度）會令「未儲存」（有掣、
            句子長）同「已儲存」（冇掣、句子短）兩個狀態變出兩個唔同嘅闊度，撳完「完成
            此版本」個框會突然縮窄，好突兀。 */}
        {isModified && !inpainting && (
          <div
            className={`mx-auto rounded-xl border p-3 ${
              saved ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}
            style={colWidth ? { width: colWidth } : undefined}
          >
          <div className="flex items-center justify-between gap-3 flex-wrap gap-y-2">
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
                variant="outline"
                className="shrink-0 gap-1.5 border-gray-200 text-gray-600 hover:border-violet-300 hover:text-violet-600 hover:bg-violet-50"
              >
                {saving
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <CheckCircle2 className="h-3.5 w-3.5" />}
                <span>{saving ? "儲存中…" : "完成此版本"}</span>
              </Button>
            )}
          </div>
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

      {/* 放置標誌 modal —— 合成後推入歷史堆疊，走既有「完成此版本」儲存流程 */}
      {showLogo && (
        <LogoPlacerModal
          imageUrl={currentImage}
          logoVersions={logoVersions.length ? logoVersions : (brandLogoUrl ? [{ url: brandLogoUrl, label: "品牌 Logo" }] : [])}
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
