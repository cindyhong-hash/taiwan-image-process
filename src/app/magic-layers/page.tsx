"use client";
/* ============================================================
   Magic Layers demo page.
   Two paths, same editor:
     • Mock   — client-side analyze() with mock detector + mask providers (no API)
     • 真實 AI — POST /api/magic-layers → OpenRouter VLM + fal SAM2/BiRefNet
   The original image bytes are sent verbatim (read as data URL, no re-encode),
   so resolution is preserved.
   ============================================================ */
import { useCallback, useRef, useState } from "react";
import { MagicLayersEditor } from "@/components/magic-layers/MagicLayersEditor.tsx";
import { analyze } from "@/lib/magic-layers/analysis.ts";
import { MockDetector } from "@/lib/magic-layers/mock-detector.ts";
import { MockSamMaskProvider, MockBiRefNetMaskProvider, FallbackMaskProvider } from "@/lib/magic-layers/mask-providers/mock.ts";
import { buildLayerManifest } from "@/lib/magic-layers/export-psd.ts";
import type { LayerData, FragmentationReport } from "@/lib/magic-layers/types.ts";

export default function MagicLayersPage() {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [srcDataUrl, setSrcDataUrl] = useState<string>("");
  const [layers, setLayers] = useState<LayerData[] | null>(null);
  const [frag, setFrag] = useState<FragmentationReport | undefined>();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [inpaintBg, setInpaintBg] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      const image = new Image();
      image.onload = () => { setImg(image); setSrcDataUrl(dataUrl); setLayers(null); setFrag(undefined); };
      image.src = dataUrl;
    };
    reader.readAsDataURL(f);   // original bytes, no re-encode
    e.target.value = "";
  }, []);

  const runMock = useCallback(async () => {
    if (!img || busy) return;
    setBusy(true); setProgress("Analyzing (mock)...");
    try {
      const maskProvider = FallbackMaskProvider(MockSamMaskProvider(), MockBiRefNetMaskProvider());
      const res = await analyze({ url: img.src, width: img.naturalWidth, height: img.naturalHeight },
        { detector: MockDetector(), maskProvider, onProgress: (p) => setProgress(p.label) });
      setLayers(res.layers); setFrag(res.fragmentation);
    } catch (err) { console.error(err); alert("Mock 分析失敗：" + msg(err)); }
    finally { setBusy(false); setProgress(""); }
  }, [img, busy]);

  const runReal = useCallback(async () => {
    if (!img || busy) return;
    setBusy(true); setProgress("真實 AI 分析中（OpenRouter → SAM2/BiRefNet）…");
    try {
      const r = await fetch("/api/magic-layers", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl: srcDataUrl, width: img.naturalWidth, height: img.naturalHeight, inpaintBackground: inpaintBg }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? r.statusText);
      setLayers(data.layers); setFrag(data.fragmentation);
    } catch (err) { console.error(err); alert("真實 AI 分析失敗：" + msg(err)); }
    finally { setBusy(false); setProgress(""); }
  }, [img, busy, srcDataUrl, inpaintBg]);

  // Demo of the reliable path: compose editable layers (background + editable
  // text) directly, instead of decomposing a flattened poster.
  const runComposeDemo = useCallback(async () => {
    if (busy) return;
    setBusy(true); setProgress("分層合成中…");
    try {
      const r = await fetch("/api/magic-layers/compose", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          backgroundUrl: "/ml-socie.jpg", canvasWidth: 1254, canvasHeight: 1254,
          texts: [
            { text: "盛夏美人祭", color: "#d4a017", fontWeight: 800, align: "center" },
            { text: "滿額好禮大方送", color: "#e8c34a", fontWeight: 700, align: "center" },
          ],
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? r.statusText);
      const image = new Image();
      image.onload = () => { setImg(image); setLayers(data.layers); setFrag(undefined); setBusy(false); setProgress(""); };
      image.src = "/ml-socie.jpg";
    } catch (err) { console.error(err); alert("分層合成失敗：" + msg(err)); setBusy(false); setProgress(""); }
  }, [busy]);

  const exportManifest = useCallback(() => {
    if (!layers || !img) return;
    const manifest = buildLayerManifest(layers, { width: img.naturalWidth, height: img.naturalHeight });
    const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "layers.json"; a.click();
    URL.revokeObjectURL(a.href);
  }, [layers, img]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#1a1b1f" }}>
      {layers && img ? (
        <div style={{ position: "absolute", inset: 0 }}>
          <div style={{ position: "absolute", top: 8, right: 12, zIndex: 20, display: "flex", gap: 8 }}>
            <label style={{ ...btn, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input type="checkbox" checked={inpaintBg} onChange={(e) => setInpaintBg(e.target.checked)} /> 重建背景
            </label>
            <button onClick={runMock} disabled={busy} style={btn}>⟳ Mock</button>
            <button onClick={runReal} disabled={busy} style={{ ...btn, background: "#4d8bff", borderColor: "#4d8bff" }}>🚀 真實 AI</button>
            <button onClick={exportManifest} style={btn}>⬇ 匯出</button>
            <button onClick={() => fileRef.current?.click()} style={btn}>＋ 換圖</button>
          </div>
          <MagicLayersEditor image={img} layers={layers} fragmentation={frag} />
        </div>
      ) : (
        <div style={center}>
          <div style={{ textAlign: "center", color: "#e9eaf0", maxWidth: 480, fontFamily: "'Manrope','Noto Sans TC',system-ui,sans-serif" }}>
            <h1 style={{ fontSize: 22, marginBottom: 10 }}>Magic <span style={{ color: "#5b8cff" }}>Layers</span></h1>
            <p style={{ color: "#9a9cab", fontSize: 14, lineHeight: 1.7, marginBottom: 22 }}>
              上傳平面設計圖 → AI 辨識完整語意物件（人物 / 產品 / 文字…）→ 沿真實輪廓去背 → 每個物件成為一個可自由移動的圖層。
            </p>
            {img && <div style={{ marginBottom: 16, color: "#9a9cab", fontSize: 13 }}>已載入 {img.naturalWidth}×{img.naturalHeight}</div>}
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              <button onClick={() => fileRef.current?.click()} style={btn}>＋ 上傳圖片</button>
              {img && <button onClick={runMock} disabled={busy} style={btn}>✨ Mock 測試</button>}
              {img && <button onClick={runReal} disabled={busy} style={{ ...btn, background: "#4d8bff", borderColor: "#4d8bff" }}>🚀 真實 AI</button>}
              <button onClick={runComposeDemo} disabled={busy} style={{ ...btn, background: "#43a047", borderColor: "#43a047" }}>🧩 分層合成 Demo</button>
            </div>
            <p style={{ color: "#6b6d7a", fontSize: 12, marginTop: 16 }}>
              「分層合成」= 生成時就分層（背景 + 去背產品 + 可編輯文字）→ 事後可自由編輯排版（可靠路線）。<br />
              「上傳 + 真實 AI」= 事後拆解成品圖（複雜海報不保證乾淨）。
            </p>
          </div>
        </div>
      )}
      <input ref={fileRef} type="file" accept="image/png,image/jpeg" onChange={onFile} style={{ display: "none" }} />
      {busy && <div style={overlay}><div style={{ color: "#fff", fontWeight: 700, textAlign: "center" }}>{progress || "分析中…"}</div></div>}
    </div>
  );
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const btn: React.CSSProperties = { height: 34, padding: "0 14px", border: "1px solid #3a3c46", background: "#2d2f37", color: "#e9eaf0", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" };
const center: React.CSSProperties = { position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 };
const overlay: React.CSSProperties = { position: "absolute", inset: 0, background: "rgba(18,19,24,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 30, backdropFilter: "blur(2px)" };
