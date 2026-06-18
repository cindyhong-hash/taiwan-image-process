"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Loader2, Sparkles, Wand2 } from "lucide-react";
import { MaskCanvas } from "@/components/activities/MaskCanvas";

type Props = {
  layout: { id: string; imageUrl: string; copyText: string; layoutType: string };
};

const COPY_TRANSFORMS = [
  { label: "再簡短一點", instruction: "請把這段文案縮短一半，保留核心意思" },
  { label: "更有衝勁", instruction: "請讓這段文案更有能量、更有購買衝動感" },
  { label: "更正式", instruction: "請讓這段文案更專業正式" },
  { label: "換諧音梗", instruction: "請在這段文案中加入一個有趣的諧音梗或雙關語" },
];

export function EditorCanvas({ layout }: Props) {
  const [copyText, setCopyText] = useState(layout.copyText);
  const [bgColor, setBgColor] = useState("#ffffff");
  const [transforming, setTransforming] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [maskDataUrl, setMaskDataUrl] = useState<string | null>(null);
  const [imagePrompt, setImagePrompt] = useState("");
  const [inpainting, setInpainting] = useState(false);
  const [inpaintResult, setInpaintResult] = useState<string | null>(null);

  /** 送出局部修改請求（目前 console.log，待後端 API 接好後替換） */
  const handleInpaint = async () => {
    if (!imagePrompt.trim()) return;
    setInpainting(true);
    try {
      // TODO: 替換為真實 inpainting API
      // const res = await fetch("/api/inpaint", {
      //   method: "POST",
      //   headers: { "Content-Type": "application/json" },
      //   body: JSON.stringify({
      //     imageUrl: layout.imageUrl,   // 原圖
      //     maskDataUrl,                 // 塗鴉遮罩 (白=修改區, 黑=保留區)
      //     prompt: imagePrompt,         // 修改指令
      //   }),
      // });
      // const data = await res.json();
      // setInpaintResult(data.imageUrl);
      console.log("[Inpaint payload]", {
        imageUrl: layout.imageUrl,
        hasMask: !!maskDataUrl,
        prompt: imagePrompt,
      });
      await new Promise((r) => setTimeout(r, 1500)); // mock delay
    } finally {
      setInpainting(false);
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
        body: JSON.stringify({ imageUrl: layout.imageUrl, size }),
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
    <div className="grid grid-cols-[1fr_1fr] xl:grid-cols-[1fr_340px_340px] gap-8 items-start">

      {/* ── Col 1: Image preview + mask canvas ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">圖片預覽</h2>
          {maskDataUrl && (
            <span className="text-xs text-blue-500 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
              遮罩已就緒
            </span>
          )}
        </div>

        <div style={{ backgroundColor: bgColor }} className="rounded-xl overflow-hidden">
          <MaskCanvas
            imageUrl={inpaintResult ?? layout.imageUrl}
            brushSize={20}
            onMaskChange={setMaskDataUrl}
          />
        </div>

        {/* bg color + export */}
        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-600">背景色</label>
          <input
            type="color"
            value={bgColor}
            onChange={(e) => setBgColor(e.target.value)}
            className="h-8 w-10 rounded border cursor-pointer"
          />
          <span className="text-xs text-gray-400">{bgColor}</span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => exportImage("fb")} disabled={exporting}>
            {exporting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
            FB 尺寸
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportImage("ig")} disabled={exporting}>
            {exporting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
            IG 尺寸
          </Button>
        </div>
      </div>

      {/* ── Col 2: Image prompt (inpainting) ── */}
      <div className="space-y-4">
        <h2 className="font-medium flex items-center gap-1.5">
          <Wand2 className="h-4 w-4 text-violet-500" />
          圖片微調
        </h2>

        {/* Instruction card */}
        <div className="rounded-xl border bg-violet-50/60 p-4 space-y-3">
          <p className="text-xs text-violet-700 leading-relaxed">
            <span className="font-semibold">使用方式：</span>先在左側圖片上塗抹想修改的區域，再輸入修改指令，點擊「開始修改」。
          </p>

          {/* Mask status indicator */}
          <div className={`flex items-center gap-2 text-xs rounded-lg px-3 py-2 border ${
            maskDataUrl
              ? "bg-blue-50 border-blue-200 text-blue-700"
              : "bg-gray-50 border-gray-200 text-gray-400"
          }`}>
            <span className={`inline-block w-2 h-2 rounded-full ${maskDataUrl ? "bg-blue-500" : "bg-gray-300"}`} />
            {maskDataUrl ? "已選取修改範圍（塗鴉遮罩）" : "尚未圈選範圍（可選）"}
          </div>

          {/* Prompt textarea */}
          <textarea
            value={imagePrompt}
            onChange={(e) => setImagePrompt(e.target.value)}
            rows={5}
            placeholder="請輸入修改指令，例如：&#10;・把腳踏車換成奔跑的黑熊&#10;・將背景改為日落沙灘&#10;・移除右下角的水印"
            className="w-full rounded-lg border border-violet-200 bg-white p-3 text-sm resize-none placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-400 transition"
          />

          {/* Submit */}
          <Button
            onClick={handleInpaint}
            disabled={inpainting || !imagePrompt.trim()}
            className="w-full gap-2 bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-50"
          >
            {inpainting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                生成中…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                開始修改
              </>
            )}
          </Button>

          {/* Payload preview (dev helper, remove in prod) */}
          {(maskDataUrl || imagePrompt) && (
            <details className="text-xs text-gray-400">
              <summary className="cursor-pointer select-none">送出資料預覽</summary>
              <pre className="mt-1 overflow-auto whitespace-pre-wrap break-all rounded bg-gray-100 p-2 text-[10px]">
                {JSON.stringify(
                  {
                    imageUrl: inpaintResult ?? layout.imageUrl,
                    hasMask: !!maskDataUrl,
                    maskDataUrl: maskDataUrl ? maskDataUrl.slice(0, 60) + "…" : null,
                    prompt: imagePrompt,
                  },
                  null,
                  2
                )}
              </pre>
            </details>
          )}
        </div>
      </div>

      {/* ── Col 3: Copy editor ── */}
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
              <Button
                key={t.label}
                variant="outline"
                size="sm"
                onClick={() => transformCopy(t.instruction)}
                disabled={transforming}
              >
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
