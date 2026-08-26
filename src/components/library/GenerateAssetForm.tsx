"use client";
/**
 * GenerateAssetForm — 素材生成表單內容（背景 / 人像 / 插畫）。
 * ────────────────────────────────────────────────
 * 抽自舊 GenerateAssetModal：拆走 modal 外殼（backdrop / 置中卡 / X 關閉），
 * 淨係表單內容，用喺「新增產品／素材圖片」全頁（唔再係 popup）。
 * 類型（背景/人像/插畫）由上層頁面嘅「已選類型」切換器控制，用 key={type}
 * remount 呢個 component 令內部 state 隨類型重置，唔再有內部「素材類型」揀選。
 *   • 背景 — 純背景圖（無文字/人物/產品），FLUX.1；選取後存為 背景素材（BACKGROUND 組件，可重用）。
 *   • 人像 — 真人寫實，FLUX.2 pro（預設亞裔/台港面孔）；選取後存為圖庫成圖（genType=person）。
 *   • 插畫 — 2D 插畫，Recraft V3；選取後存為圖庫成圖（genType=illustration）。
 * 生成用 draftOnly（存檔不入庫），未選的不會出現在圖庫。可先「✨潤色」擴寫描述再生成。
 */

import { useState, useRef, useEffect } from "react";
import { Wand2, Loader2, Check, Save, Link2, Sparkles, Upload, RefreshCw, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRotatingHint } from "@/hooks/useRotatingHint";
import { pollLibraryImage } from "@/lib/pollLibraryImage";

const GEN_HINTS = ["正在生成 AI 素材…", "分析色調 / 光影…", "描繪細節中…", "快好喇，請稍候…"];

type GeneratedItem = { imageUrl: string; selected: boolean; id?: string };
export type AssetType = "background" | "person" | "illustration";

type Props = {
  clientId: string | null;
  type: AssetType;
  onSaved: () => void;
  /** 撳「生成」送出去 server 嗰刻（未等生成完）即刻通知上層 —— 令主畫廊即刻見到「生成中」佔位卡。 */
  onStarted?: () => void;
  /** Pre-fill values when opening from a popup's「重新生成/調整」action. */
  init?: { description?: string; refImageUrl?: string; engine?: "flux" | "nano" };
};

const TYPE_META: Record<AssetType, { label: string; sub: string; placeholder: string }> = {
  background: { label: "背景", sub: "FLUX.1 · 純背景底圖", placeholder: "例：清新白色棚拍背景、柔和漫射光\n例：米白漸層棚拍、淡淡投影\n例：夏日戶外自然場景、柔光" },
  person: { label: "人像", sub: "FLUX.2 pro · 真人寫實", placeholder: "例：微笑的年輕女性，自然妝容，戶外咖啡店\n例：專業男士，西裝，辦公室，自信表情" },
  illustration: { label: "插畫", sub: "Recraft V3 · 2D 插畫", placeholder: "例：可愛貓咪吉祥物，扁平插畫風，手持產品\n例：清新夏日海灘，2D 插畫，柔和色塊" },
};

// 編號分段標題（同產品圖生成台一致）
function SectionLabel({ step, title, hint }: { step: string; title: string; hint?: string }) {
  return (
    <div className="flex items-baseline gap-2 border-b pb-1.5">
      <span className="text-[10px] font-bold text-gray-400 tracking-widest">{step}</span>
      <span className="text-sm font-semibold text-gray-800">{title}</span>
      {hint && <span className="text-xs text-gray-400 font-normal">{hint}</span>}
    </div>
  );
}

export function GenerateAssetForm({ clientId, type, onSaved, onStarted, init }: Props) {
  const [description, setDescription] = useState(init?.description ?? "");
  const [count, setCount] = useState(3);
  // 尺寸 — 8 比例（同活動圖/產品圖頁一致）+ 自訂；一律換算成確切 W×H 送 size:"custom"。
  const RATIO_DIMS: Record<string, { w: number; h: number }> = {
    "1:1": { w: 1200, h: 1200 }, "4:5": { w: 1200, h: 1500 }, "3:4": { w: 1200, h: 1600 },
    "2:3": { w: 1200, h: 1800 }, "9:16": { w: 1080, h: 1920 }, "4:3": { w: 1600, h: 1200 },
    "3:2": { w: 1800, h: 1200 }, "16:9": { w: 1920, h: 1080 },
  };
  const [ratio, setRatio] = useState<string>("1:1");
  const [customW, setCustomW] = useState(1200);
  const [customH, setCustomH] = useState(1200);
  // 揀比例 → 自動填 W×H（可再改，改時鎖住比例）；自訂 → 自由 W×H。outDims 一律用 customW/H。
  const outDims = { w: customW, h: customH };
  const pickRatio = (r: string) => { setRatio(r); if (r !== "custom") { setCustomW(RATIO_DIMS[r].w); setCustomH(RATIO_DIMS[r].h); } };
  const changeDim = (which: "w" | "h", v: number) => {
    const rd = RATIO_DIMS[ratio];
    if (which === "w") { setCustomW(v); if (ratio !== "custom" && rd) setCustomH(Math.round(v * rd.h / rd.w)); }
    else { setCustomH(v); if (ratio !== "custom" && rd) setCustomW(Math.round(v * rd.w / rd.h)); }
  };
  const [asianFirst, setAsianFirst] = useState(true); // 人像：預設亞裔（台/港受眾）
  const [refImageUrl, setRefImageUrl] = useState<string>(init?.refImageUrl ?? "");
  const [refUploading, setRefUploading] = useState(false);
  const [refDescribing, setRefDescribing] = useState(false);
  const [engine, setEngine] = useState<"flux" | "nano">(init?.engine ?? "flux");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [generating, setGenerating] = useState(false);
  const genHint = useRotatingHint(generating, GEN_HINTS);
  const [polishing, setPolishing] = useState(false);
  // 潤色前嘅快照，等「還原」可以一鍵返去潤色之前個版本（null = 未潤色過／已還原）。
  const [prePolishDescription, setPrePolishDescription] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<GeneratedItem[]>([]);
  const [saving, setSaving] = useState(false);
  const resultsRef = useRef<HTMLDivElement | null>(null);

  // 生成完（items 由空變有）自動 scroll 落結果區，俾用戶即刻見到成品。
  useEffect(() => {
    if (items.length > 0) {
      requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }, [items.length]);

  const genType = type === "background" ? undefined : type; // 背景走預設(場景)模型；人像/插畫走對應模型

  /** 組裝送去生成嘅繁中 brief（route 會翻英）。 */
  function buildPrompt(desc: string): string {
    const base = desc.trim();
    if (type === "background") {
      // 純背景：英文硬約束，杜絕人物/產品/文字。
      return `${base}, pure background scene only, absolutely no people no faces no text no logos no watermarks no products, seamless background texture or environment, studio quality, photorealistic`;
    }
    if (type === "person") {
      const asian = asianFirst ? "亞裔（台灣／香港）人物，" : "";
      return `${asian}${base}，真人寫實人像攝影，自然光，高品質，無浮水印無文字`;
    }
    // illustration
    return `${base}，2D 扁平數位插畫風格，乾淨線條與色塊，無浮水印無文字`;
  }

  /**
   * AI 讀圖填描述：用 vision 分析參考圖，生成簡潔生成 brief（50–80 字）。
   * force=true 時不管現有描述是否為空，都覆寫。
   */
  async function handleDescribeRef(url: string, force = false) {
    if (!url.trim()) return;
    if (!force && description.trim()) return; // 已有描述時不自動覆蓋
    setRefDescribing(true);
    setError(null);
    try {
      const res = await fetch("/api/library/describe", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: url.trim(), kind: "brief", genType: type }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "AI 讀圖失敗");
      const desc = (data.text ?? data.subject ?? "").trim();
      if (desc) setDescription(desc);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "AI 讀圖失敗");
    } finally {
      setRefDescribing(false);
    }
  }

  /** 上傳本地圖片為參考風格圖；上傳成功後自動 AI 讀圖填描述。 */
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setRefUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error ?? "上傳失敗");
      setRefImageUrl(data.url);
      // 上傳後自動讀圖填描述（描述空時才填，有描述時靜默不覆蓋）
      await handleDescribeRef(data.url, false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "上傳失敗");
    } finally {
      setRefUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  /**
   * ✨潤色：擴寫描述，回填可編輯。
   * 如有參考圖且描述為空，先 AI 讀圖填描述，再潤色。
   * 如有參考圖且描述有內容，直接融入風格潤色。
   */
  async function polish() {
    const hasRef = !!refImageUrl.trim();
    const hasDesc = !!description.trim();
    if (!hasDesc && !hasRef) return;
    const snapshot = description;
    setPolishing(true);
    setError(null);
    try {
      // 有圖無描述：先讀圖產生初稿，然後以該初稿潤色
      let currentDesc = description.trim();
      if (!hasDesc && hasRef) {
        setRefDescribing(true);
        const descRes = await fetch("/api/library/describe", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageUrl: refImageUrl.trim(), kind: "brief", genType: type }),
        });
        const descData = await descRes.json();
        setRefDescribing(false);
        currentDesc = (descData.text ?? descData.subject ?? "").trim();
        if (currentDesc) setDescription(currentDesc);
        if (!currentDesc) throw new Error("AI 讀圖未能產生描述，請手動輸入");
      }
      const res = await fetch("/api/library/polish", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief: currentDesc, genType: genType ?? "scene", clientId, ...(hasRef ? { refImageUrl: refImageUrl.trim() } : {}) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "潤色失敗");
      setPrePolishDescription(snapshot);
      setDescription(data.brief ?? currentDesc);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "潤色失敗");
    } finally {
      setPolishing(false);
      setRefDescribing(false);
    }
  }

  function revertPolish() {
    if (prePolishDescription === null) return;
    setDescription(prePolishDescription);
    setPrePolishDescription(null);
  }

  async function handleGenerate() {
    if (!description.trim()) return;
    setGenerating(true);
    setError(null);
    setItems([]);
    try {
      const prompt = buildPrompt(description);
      const batchId = `gam-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      // 送出即刻落 DB（status:GENERATING），poll 到完成先攞返 imageUrl——即刻安全，
      // 就算中途行開呢頁，server 都會用 after() 繼續生成完，唔會流失。
      // 呢個 flag 淨係俾同一個 batch 觸發一次 onStarted——如果每張圖各自 call 一次
      // （count 張 = N 次 refresh），主畫廊會喺短時間內連續跳幾次，好唐突。
      let notifiedStart = false;
      const results = await Promise.allSettled(
        Array.from({ length: count }, async () => {
          const { id } = await fetch("/api/library/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              clientId,
              subject: description.trim(),
              customPrompt: prompt,
              size: "custom", customW: outDims.w, customH: outDims.h,
              genType,
              batchId,
              ...(refImageUrl.trim() ? { refImageUrl: refImageUrl.trim() } : {}),
              engine,
            }),
          }).then((r) => r.json());
          if (!id) throw new Error("生成請求送出失敗");
          if (!notifiedStart) { notifiedStart = true; onStarted?.(); } // 呢個 batch 已經有記錄落咗 DB → 通知主畫廊 refresh 一次
          const item = await pollLibraryImage(id);
          if (item.status !== "DONE") throw new Error(item.errorMessage ?? "生成失敗");
          return { id: item.id, imageUrl: item.imageUrl };
        })
      );
      const ok: GeneratedItem[] = results
        .filter((r): r is PromiseFulfilledResult<{ id: string; imageUrl: string }> => r.status === "fulfilled" && !!r.value?.imageUrl)
        .map((r) => ({ id: r.value.id, imageUrl: r.value.imageUrl, selected: true }));
      if (ok.length === 0) throw new Error("所有圖片生成失敗，請重試");
      setItems(ok);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "生成失敗");
    } finally {
      setGenerating(false);
    }
  }

  function toggle(url: string) {
    setItems((prev) => prev.map((it) => it.imageUrl === url ? { ...it, selected: !it.selected } : it));
  }

  async function handleSave() {
    const selected = items.filter((it) => it.selected);
    const unselected = items.filter((it) => !it.selected);
    if (selected.length === 0) { setError("請至少選取一張圖片"); return; }
    setSaving(true);
    setError(null);
    const name0 = description.trim().slice(0, 20);
    try {
      if (type === "background") {
        // 背景 → 額外存為可重用 背景素材（BACKGROUND 組件）；LibraryImage 記錄本身已經
        // 生成嗰刻落咗 DB，唔使再建一次，畫廊 dedup 邏輯會當佢係同一張。
        await Promise.all(selected.map((it, i) =>
          fetch("/api/components", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "BACKGROUND", clientId,
              name: `${name0}${selected.length > 1 ? ` #${i + 1}` : ""}`,
              data: { imageUrl: it.imageUrl, mode: engine === "nano" ? "nano-banana" : "flux-scene", ...(refImageUrl.trim() ? { refImageUrl: refImageUrl.trim() } : {}) }, aiPromptText: description.trim(), previewUrl: it.imageUrl,
            }),
          })
        ));
      } else {
        // 人像 / 插畫：生成嗰刻已經係真 LibraryImage 記錄，呢步淨係完善最終 metadata。
        await Promise.all(selected.filter((it) => it.id).map((it) =>
          fetch(`/api/library/images/${it.id}`, {
            method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              subject: name0,
              paramsJson: JSON.stringify({ genType, mode: engine === "nano" ? "nano-banana" : (type === "person" ? "flux2-person" : "recraft-illustration"), ...(refImageUrl.trim() ? { refImageUrl: refImageUrl.trim() } : {}) }),
            }),
          })
        ));
      }
      // 冇揀嗰幾張：已經生成完、真係存在 DB，用戶明確唔要 → 刪走，唔留喺畫廊佔位。
      await Promise.all(unselected.filter((it) => it.id).map((it) => fetch(`/api/library/images/${it.id}`, { method: "DELETE" })));
      onSaved();
    } catch {
      setError("儲存失敗，請重試");
    } finally {
      setSaving(false);
    }
  }

  const selectedCount = items.filter((it) => it.selected).length;
  const meta = TYPE_META[type];
  const saveTarget = type === "background" ? "🌄 背景素材" : type === "person" ? "🧑 人像（圖庫）" : "🎨 插畫（圖庫）";
  // FLUX option label changes per type — each type has its own default engine.
  const fluxLabel = type === "person"
    ? { name: "FLUX.2 pro", sub: "純文字生圖 · 真人寫實" }
    : type === "illustration"
    ? { name: "Recraft V3", sub: "純文字生圖 · 2D 插畫" }
    : { name: "FLUX.1", sub: "schnell · 純文字生圖" };

  return (
    <div className="space-y-5 pb-20">
      {/* ── 01 主體描述 ── */}
      <SectionLabel step="01" title="主體描述" hint="主要輸入 · 可 AI 潤色" />
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5">
            <label className="text-xs font-semibold text-gray-600">{meta.label}描述</label>
            {refDescribing && (
              <span className="flex items-center gap-1 text-[10px] text-violet-500">
                <Loader2 className="h-2.5 w-2.5 animate-spin" />讀圖中…
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {refImageUrl.trim() && (
              <button onClick={() => handleDescribeRef(refImageUrl, true)} disabled={refDescribing || polishing}
                title="AI 重新讀取參考圖，生成描述初稿（會覆蓋現有內容）"
                className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border transition-all ${
                  !refDescribing && !polishing ? "bg-sky-50 border-sky-300 text-sky-700 hover:bg-sky-100" : "opacity-40 cursor-not-allowed border-gray-200 text-gray-400"}`}>
                <RefreshCw className="h-3 w-3" />重新讀圖
              </button>
            )}
            <button onClick={polish} disabled={(!description.trim() && !refImageUrl.trim()) || polishing || refDescribing}
              className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border transition-all ${
                (description.trim() || refImageUrl.trim()) && !polishing && !refDescribing ? "bg-violet-50 border-violet-300 text-violet-700 hover:bg-violet-100" : "opacity-40 cursor-not-allowed border-gray-200 text-gray-400"}`}
              title="把描述擴寫成簡潔有創意的生成 brief（可再編輯）">
              {polishing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
              {polishing ? "潤色中…" : "潤色"}
            </button>
            <button onClick={revertPolish} disabled={prePolishDescription === null}
              className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border transition-all ${
                prePolishDescription !== null ? "bg-white border-gray-200 text-gray-600 hover:border-gray-400"
                : "opacity-30 cursor-not-allowed border-gray-200 text-gray-400"}`}
              title="還原到潤色之前的版本">
              <RotateCcw className="h-3 w-3" />還原
            </button>
          </div>
        </div>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4}
          placeholder={meta.placeholder}
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-violet-400 transition" />
      </div>

      {/* 人像：亞裔優先（緊貼主體描述） */}
      {type === "person" && (
        <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
          <button type="button" onClick={() => setAsianFirst((v) => !v)}
            className={`w-4 h-4 rounded border flex items-center justify-center ${asianFirst ? "bg-violet-600 border-violet-600" : "border-gray-300 bg-white"}`}>
            {asianFirst && <Check className="h-3 w-3 text-white" />}
          </button>
          優先生成亞裔（台灣／香港）面孔
        </label>
      )}

      {/* ── 02 參考風格圖 ── */}
      <SectionLabel step="02" title="參考風格圖" hint="選填 · AI 讀色調/光影/質感" />
      <div>
        <label className="text-xs font-semibold text-gray-600 mb-1.5 flex items-center gap-1">
          <Link2 className="h-3 w-3" />參考風格圖
          <span className="font-normal text-gray-400 ml-1">（選填）— AI 讀取色調、光影、質感做風格參考</span>
        </label>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
        <div className="flex gap-2">
          <input
            type="url"
            value={refImageUrl}
            onChange={(e) => setRefImageUrl(e.target.value)}
            onBlur={(e) => {
              const url = e.target.value.trim();
              if (url.startsWith("http")) handleDescribeRef(url, false);
            }}
            placeholder="貼上圖片網址（https://…）"
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-violet-400 transition"
          />
          <button onClick={() => fileInputRef.current?.click()} disabled={refUploading}
            title="從電腦上傳圖片"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-500 hover:bg-gray-50 transition-colors whitespace-nowrap disabled:opacity-50">
            {refUploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
            {refUploading ? "上傳中…" : "上傳"}
          </button>
          {refImageUrl.trim() && (
            <button onClick={() => setRefImageUrl("")}
              className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-500 hover:bg-gray-50 transition-colors whitespace-nowrap">
              清除
            </button>
          )}
        </div>
        {refImageUrl.trim() && (
          <div className="mt-2 rounded-xl overflow-hidden border border-gray-100 bg-gray-50">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={refImageUrl} alt="參考圖" className="w-full max-h-48 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          </div>
        )}
      </div>

      {/* ── 03 輸出設定 ── */}
      <SectionLabel step="03" title="輸出設定" hint="引擎 · 尺寸 · 數量" />

      {/* 生成引擎（Nano Banana 需要參考圖；FLUX 標籤依素材類型）*/}
      <div>
        <label className="text-xs font-semibold text-gray-600 mb-1.5 flex items-center gap-1">
          <Sparkles className="h-3 w-3" />生成引擎
        </label>
        <div className="flex gap-1.5">
          <button onClick={() => setEngine("flux")}
            className={`flex-1 text-xs px-3 py-2 rounded-lg border transition-colors ${engine === "flux" ? "bg-violet-600 text-white border-violet-600" : "bg-white border-gray-200 text-gray-600 hover:border-violet-300"}`}>
            <div className="font-semibold">{fluxLabel.name}</div>
            <div className={`text-[10px] ${engine === "flux" ? "text-violet-100" : "text-gray-400"}`}>{fluxLabel.sub}</div>
          </button>
          <button onClick={() => setEngine("nano")}
            title={refImageUrl.trim() ? "以參考圖色調、光影、質感做風格遷移生成" : "純文字生圖（有參考圖時自動轉風格遷移）"}
            className={`flex-1 text-xs px-3 py-2 rounded-lg border transition-colors ${engine === "nano" ? "bg-violet-600 text-white border-violet-600" : "bg-white border-gray-200 text-gray-600 hover:border-violet-300"}`}>
            <div className="font-semibold">Nano Banana</div>
            <div className={`text-[10px] ${engine === "nano" ? "text-violet-100" : "text-gray-400"}`}>{refImageUrl.trim() ? "參考圖風格遷移" : "純文字生圖"}</div>
          </button>
        </div>
      </div>

      {/* 輸出尺寸（比例）— 揀比例自動填 W×H，可再改（非自訂會鎖比例）*/}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-gray-600">輸出尺寸（比例）</label>
        <div className="relative w-full max-w-md">
          <select value={ratio} onChange={(e) => pickRatio(e.target.value)}
            className="w-full appearance-none border border-gray-200 rounded-lg px-3 py-2 pr-8 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-gray-300 cursor-pointer">
            {["1:1", "4:5", "3:4", "2:3", "9:16", "4:3", "3:2", "16:9"].map((r) => (
              <option key={r} value={r}>{r}（{RATIO_DIMS[r].w}×{RATIO_DIMS[r].h}）</option>
            ))}
            <option value="custom">自訂…</option>
          </select>
          <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
        <div className="flex items-center gap-2 pt-1.5">
          <input type="number" min={256} max={2400} value={customW} onChange={(e) => changeDim("w", Number(e.target.value))}
            className="w-24 border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-violet-400" />
          <span className="text-xs text-gray-400">×</span>
          <input type="number" min={256} max={2400} value={customH} onChange={(e) => changeDim("h", Number(e.target.value))}
            className="w-24 border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-violet-400" />
          <span className="text-[11px] text-gray-400">px · {ratio === "custom" ? "自由尺寸（256–2400）" : `改任一邊自動鎖 ${ratio} 比例`}</span>
        </div>
      </div>

      {/* 生成數量 — 04 最後 */}
      <div className="flex items-center gap-3">
        <label className="text-xs font-semibold text-gray-600 whitespace-nowrap">生成數量</label>
        <div className="flex gap-1.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} onClick={() => setCount(n)}
              className={`w-9 h-9 rounded-lg border text-sm font-medium transition-colors ${count === n ? "bg-violet-600 text-white border-violet-600" : "bg-white border-gray-200 text-gray-600 hover:border-violet-300"}`}>
              {n}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">⚠️ {error}</div>
      )}

      {/* Results */}
      {items.length > 0 && (
        <div ref={resultsRef} className="scroll-mt-2 rounded-xl border border-violet-200 bg-violet-50/40 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold text-violet-700">
              點擊選取要保留的圖片（已選 {selectedCount}/{items.length}）
            </div>
            <button onClick={() => setItems([])}
              className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors whitespace-nowrap bg-white">
              <Wand2 className="h-3 w-3" />重新生成/調整
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {items.map((item) => (
              <div key={item.imageUrl}
                className={`relative rounded-xl border-2 overflow-hidden cursor-pointer transition-all ${item.selected ? "border-violet-500 shadow-md" : "border-gray-200 opacity-50"}`}
                onClick={() => toggle(item.imageUrl)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.imageUrl} alt="generated" className="w-full aspect-square object-contain bg-white" />
                <div className={`absolute inset-0 transition-colors ${item.selected ? "bg-transparent" : "bg-gray-100/30"}`} />
                {item.selected && (
                  <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-violet-600 flex items-center justify-center shadow">
                    <Check className="h-3 w-3 text-white" />
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions — fixed 貼實 viewport 底（外層 <main class="overflow-auto"> 令 sticky 失效，
          見 QuickAddForm 註解）。生成前顯示「生成」，出咗結果就轉「重新調整／保留」。 */}
      <div className="fixed bottom-0 left-60 right-0 z-30 bg-white border-t">
        <div className="max-w-3xl ml-6 py-3 flex items-center gap-3">
          {items.length === 0 ? (
            <Button onClick={handleGenerate} disabled={!description.trim() || generating}
              className="w-full gap-2 bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-40">
              {generating
                ? <><Loader2 className="h-4 w-4 animate-spin" />{genHint}（每張約 10–40 秒）</>
                : <><Wand2 className="h-4 w-4" />生成 {count} 張{meta.label}</>}
            </Button>
          ) : (
            <>
              <button onClick={() => setItems([])}
                className="px-3 py-2 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-100 transition-colors whitespace-nowrap bg-white">
                重新調整
              </button>
              <button onClick={handleSave} disabled={saving || selectedCount === 0}
                className="flex-1 py-2 rounded-lg bg-violet-600 text-white text-xs font-medium hover:bg-violet-700 disabled:opacity-50 flex items-center justify-center gap-1.5 transition-colors">
                {saving
                  ? <><Loader2 className="h-4 w-4 animate-spin" />儲存中…</>
                  : <><Save className="h-4 w-4" />保留 {selectedCount} 張 → {saveTarget}</>}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// re-export type meta 俾頁面 header 嘅「已選類型」切換器用
export { TYPE_META as ASSET_TYPE_META };
