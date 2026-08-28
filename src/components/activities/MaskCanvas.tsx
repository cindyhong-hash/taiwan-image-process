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
  /** 有提供就開啟「長按圖片預覽上一步版本」；冇提供／null 就冇呢個功能。 */
  previousImageUrl?: string | null;
  /** 疊喺圖片上面嘅內容（例如 inpainting 中嘅 loading 遮罩）。刻意由呢個
   *  component 自己喺跟實圖片闊度嘅 w-fit 容器入面掛出，唔畀呼叫端自己包多層
   *  rounded-xl overflow-hidden——嗰層會連埋下面成個 space-y-3（包括提示文字）
   *  一齊裁埋，逼窄圖（9:16）嗰陣提示文字啱啱夠貼近邊界，就俾轉角個 radius 裁走。 */
  overlay?: React.ReactNode;
  /** 每次呢個跟實圖片闊度嘅框改變闊度就通知上層。上層嘅標題列同 banner 同呢個框
   *  同一層 w-fit，而 w-fit 係跟「最闊嗰個仔女」——矮螢幕令 9:16 圖被 max-height
   *  壓到好窄嗰陣，標題列 3 粒掣會反過來贏，將成欄撐闊過張圖，睇落就係標題列
   *  「凸出」咗喺圖右邊界之外。上層攞到呢個闊度之後，要 set 落標題列同 banner
   *  自己身上——唔可以 set 落共同父層，否則會反過來限制返張圖，形成
   *  「量度→縮圖→再量度」嘅迴圈。 */
  onWidthChange?: (width: number) => void;
  /** 上一次量到嘅框闊度（由上層保存，唔會隨呢個 component remount 而清空）。
   *  呢個 component 每次 imageUrl 變都會俾 `key` 逼住 remount（為咗清走遮罩），
   *  新張圖未載完之前 <img> 冇尺寸，個 w-fit 框會即刻塌到得返幾 px 闊、載完又彈返，
   *  肉眼就係撳「上一步／重做」嗰下「變窄閃跳」。有咗呢個值就可以喺載入期間用
   *  min-width 頂住個位，載完即刻放返手（唔會長期黐住舊闊度）。 */
  reservedWidth?: number;
};

type DragState = { startX: number; startY: number } | null;
type Rect      = { x: number; y: number; w: number; h: number } | null;

export function MaskCanvas({ imageUrl, onMaskChange, onSelectionChange, previousImageUrl, overlay, onWidthChange, reservedWidth }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const imgRef       = useRef<HTMLImageElement>(null);
  const drag         = useRef<DragState>(null);

  const [rect, setRect]       = useState<Rect>(null);
  const [hasSelection, setHasSelection] = useState(false);

  // 長按圖片預覽上一步：喺呢個 container 度做（唔喺外層再包一層），因為呢個
  // container 本身先係跟實圖片闊度嘅框（w-fit mx-auto）——喺外層加疊層會攞唔實
  // 呢個闊度，peek 嗰陣個框會「彈到」外層嗰個較闊嘅盒，睇落好似圖片突然變闊、
  // 冧走咗圓角同邊框（因為嗰盒本身冇 border）。held 住 450ms 先觸發，避免同
  // 拖拉揀範圍嘅手勢撞埋——一有明顯移動即刻取消。
  const [peeking, setPeeking] = useState(false);
  const peekTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const peekStartPos = useRef<{ x: number; y: number } | null>(null);
  const startPeek = (e: React.PointerEvent) => {
    if (!previousImageUrl) return;
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

  // rect 嘅最新值——ResizeObserver callback 註冊一次就唔會再變（closure 停喺初次
  // 嗰個值），要靠 ref 先攞到 resize 嗰一刻真正嘅選框，用嚟喺 resize 後重畫。
  const rectRef = useRef<Rect>(null);
  useEffect(() => { rectRef.current = rect; }, [rect]);

  // ── Draw selection rect（抽出嚟俾 resize 之後都可以重畫，唔止 rect 變嗰陣）──────
  const drawRect = useCallback((r: Rect) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!r) return;

    const { x, y, w, h } = r;

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
  }, []);

  useEffect(() => { drawRect(rect); }, [rect, drawRect]);

  // 報返呢個框（跟實圖片闊度嗰個）嘅 border-box 闊度俾上層，等標題列/banner 對得齊；
  // 同時自己留一份，落面「清除選區＋提示文字」嗰組都要跟返同一闊度——嗰組嘅文字可以
  // 闊過張圖（窄圖尤其明顯），唔鎖住嘅話佢就會反過來撐闊成欄，令張圖被 mx-auto 推到
  // 置中、同上面標題列對唔齊。
  const [frameWidth, setFrameWidth] = useState<number | undefined>(undefined);
  // 新張圖載完之前先用 reservedWidth 頂住個框闊度，載完就放返手（見 reservedWidth prop）。
  const [imgLoaded, setImgLoaded] = useState(false);
  const reportWidth = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    setFrameWidth(el.offsetWidth);
    onWidthChange?.(el.offsetWidth);
  }, [onWidthChange]);

  // ── Canvas size synced to container ──────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    const canvas    = canvasRef.current;
    if (!container || !canvas) return;
    const ro = new ResizeObserver(([e]) => {
      canvas.width  = Math.round(e.contentRect.width);
      canvas.height = Math.round(e.contentRect.height);
      // 改 canvas.width/height 本身會清空畫布——縮放/佈局變動（例如揀咗第一格之後
      // 側欄／提示文字令容器高度變化）都會觸發呢個 observer，之前淨係靠下面
      // 「Draw selection rect」個 effect 去重畫，但嗰個 effect 淨係喺 rect state
      // 改變先會 rerun，resize 本身唔算 state 改變，所以畫好嘅選框會突然消失
      // （但 rect/hasSelection state 冇變，所以「已選取區域」badge 仍然啱）。
      // 呢度直接用返最新嘅 rectRef 重畫，先真正跟得切 resize。
      drawRect(rectRef.current);
      reportWidth();
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [drawRect, reportWidth]);

  // 除咗上面個 ResizeObserver，仲要喺 mount／視窗改變／圖片載入完各報一次闊度：
  // ResizeObserver 唔係喺所有環境都一定 fire（實測有啲 embedded browser 完全唔會
  // delivery notification），淨靠佢會令標題列永遠攞唔到闊度、fallback 返 w-fit。
  useEffect(() => {
    reportWidth();
    const onResize = () => reportWidth();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [reportWidth]);

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

  // 換圖（AI 修改完／放置標誌／上一步／重做）就自動清走選區同重設載入狀態。
  // 呢個效果本身就係以前靠外層 `key={currentImage}` 逼成個 component remount 去做嘅
  // 嘢——但 remount 會令成段「圖片預覽」（標題列、張圖、提示文字）由 DOM 度拆走再
  // 掛返，肉眼就係整段嘢消失一下再出現嗰種閃跳。改用 effect 做同一件事，component
  // 由頭到尾唔使拆，<img> 亦會一路顯示住舊圖直到新圖載完先換，完全冇閃。
  const isFirstRunRef = useRef(true);
  useEffect(() => {
    if (isFirstRunRef.current) { isFirstRunRef.current = false; return; }
    setImgLoaded(false);
    clearSelection();
  }, [imageUrl, clearSelection]);

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3">
      <div
        ref={containerRef}
        // w-fit + mx-auto：呢個帶邊框嘅框務必跟返圖片本身闊度，唔可以靠外層 grid/flex
        // 嘅斷點小聰明（例如淨係大螢幕先 auto、細螢幕/多圖版仲係逼滿）。冇呢兩個
        // class，框會攤到跟父層一樣闊，窄長圖（9:16）就會喺框入面兩側留白邊。
        className="relative w-fit mx-auto rounded-xl overflow-hidden border select-none"
        style={{ cursor: "crosshair", ...(!imgLoaded && reservedWidth ? { minWidth: reservedWidth } : {}) }}
        onPointerDown={startPeek} onPointerMove={checkPeekMove}
        onPointerUp={cancelPeek} onPointerLeave={cancelPeek} onPointerCancel={cancelPeek}
      >
        <img
          ref={imgRef}
          src={imageUrl}
          alt="Layout preview"
          className="w-auto max-w-full max-h-[calc(100vh-210px)] object-contain block mx-auto"
          draggable={false}
          onLoad={() => { setImgLoaded(true); reportWidth(); }}
        />

        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
        />

        {/* 長按預覽：疊喺最上面顯示上一步版本，冇互動性，一鬆手即刻消失。
            擺喺呢個 w-fit container 入面，先會同真正顯示緊嗰張圖一樣大細/一樣圓角。
            用 previousImageUrl 存在就常駐掛喺 DOM（淨係用 opacity 切換顯示），令瀏覽器
            提早響背景下載好張圖——如果淨係喺 peeking 先掛落去，第一次長按會撞正張圖
            仲未下載完，出現一下閃（半張圖/白色）先變返完整。 */}
        {previousImageUrl && (
          <img src={previousImageUrl} alt="上一步版本" draggable={false}
            className={`absolute inset-0 w-full h-full object-contain pointer-events-none select-none z-30 bg-white transition-none ${
              peeking ? "opacity-100" : "opacity-0"}`} />
        )}

        {overlay && <div className="absolute inset-0 z-40">{overlay}</div>}

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

      {/* 長按提示同「清除選區」列企埋一齊先夾（同一組相關資訊）。淨係用 space-y 呢類
          margin 唔夠貼——「清除選區」係 size="sm" 嘅 Button，本身有 padding 令成行高過
          文字本身，肉眼睇落文字落面仲有大截透明位，加落去嘅 margin 會疊埋喺嗰截透明
          位上面，睇落間隔仲係好大。改用負 margin（-mt-3）主動拉近，抵銷返 Button 嘅
          padding。 */}
      <div className="mx-auto" style={(frameWidth ?? reservedWidth) ? { width: frameWidth ?? reservedWidth } : undefined}>
        <div className="flex items-center gap-2 flex-wrap gap-y-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clearSelection}
            disabled={!hasSelection}
            className="gap-1.5 text-red-500 hover:text-red-600 hover:bg-red-50 disabled:opacity-30 shrink-0"
          >
            <Trash2 className="h-3.5 w-3.5" />
            清除選區
          </Button>
          <span className="ml-auto text-xs text-gray-400 text-right">
            {hasSelection ? "選區已設定，輸入修改指令後點「開始修改」" : "拖拉圈選要修改的區域"}
          </span>
        </div>
        {/* 長按提示靠右——之前個「本」字被裁真正成因係外層 EditorCanvas.tsx 多包咗一層
            rounded-xl overflow-hidden 連呢個 component 成個 space-y-3 一齊裁走（已喺
            嗰邊拆走，見 EditorCanvas.tsx 個 overlay prop），唔關左/右對齊事，獨立成一行
            淨係為咗唔夾喺「清除選區」同狀態文字之間逼位。 */}
        {previousImageUrl && (
          <p className="text-xs text-gray-400 text-right -mt-1">💡 長按圖片可預覽上一步版本</p>
        )}
      </div>
    </div>
  );
}
