"use client";
/* ============================================================
   Magic Layers — 分層合成工具 (reliable path)
   AI-generate (or upload / pick from 素材庫) a background + upload product images
   + type the copy → compose EDITABLE layers → Magic Layers editor. No decomposition.

   Renders INSIDE the app shell (<main>), so the brand sidebar stays visible.
   clientId comes from the route (brand-scoped) or, for the standalone
   /magic-layers/compose route, from the sessionStorage handoff.

   Background source is an explicit 3-way mode — 素材庫 / 上傳 / AI 生成 — so only
   the relevant control shows (no overlapping/redundant fields). 比例 only matters
   for AI 生成 (picked/uploaded backgrounds drive the canvas by their real size).
   ============================================================ */
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { MagicLayersEditor, type SavedLayer } from "@/components/magic-layers/MagicLayersEditor.tsx";
import type { LayerData, SemanticId } from "@/lib/magic-layers/types.ts";
import { ML_COMPOSE_BG_KEY, ML_COMPOSE_CLIENT_KEY, ML_WIZARD_SEED_KEY } from "@/components/activities/RolePickerModal";

// 把存起來的 SavedLayer[] 還原成編輯器吃的 LayerData[]（含執行期旗標塞進 meta）。
function savedToLayerData(sl: SavedLayer): LayerData {
  const semanticId: SemanticId = sl.type === "independent_text" ? "text" : (sl.type as SemanticId);
  return {
    id: sl.id, type: sl.type, name: sl.name, semanticId, instanceId: sl.id, parentId: null,
    bbox: { x: sl.x, y: sl.y, w: sl.w, h: sl.h }, mask: null,
    image: sl.isText ? null : (sl.image ?? null),
    x: sl.x, y: sl.y, width: sl.w, height: sl.h, rotation: sl.rotation,
    zIndex: sl.zIndex, confidence: 1, source: "generated", editable: true,
    embeddedText: [], children: [],
    meta: {
      visible: sl.visible, locked: sl.locked, opacity: sl.opacity, groupId: sl.groupId ?? null,
      ...(sl.isText ? { style: { text: sl.text, fontSizePx: sl.fontSize, fontWeight: sl.fontWeight, color: sl.color, align: sl.align, fontFamily: sl.fontFamily, fx: sl.fx ?? null }, textObject: { text: sl.text } } : {}),
      ...(sl.isArt ? { isArt: true, artText: sl.text ?? "", ...(sl.artRefImage ? { artRefImage: sl.artRefImage } : {}) } : {}),
      ...(sl.shape ? { shape: sl.shape } : {}),
    },
  };
}
// 造一張 docW×docH 的空白圖，只用來給編輯器決定畫布尺寸（圖層自己帶各自的圖）。
function blankImage(w: number, h: number): Promise<HTMLImageElement> {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  return new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = c.toDataURL("image/png"); });
}

type BgMode = "library" | "upload" | "ai";

function fileToDataUrl(f: File): Promise<string> {
  return new Promise((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(f); });
}
function loadImg(url: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => { const i = new Image(); i.crossOrigin = "anonymous"; i.onload = () => res(i); i.onerror = rej; i.src = url; });
}

export function ComposeView({ clientId: clientIdProp }: { clientId?: string }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  // 經 handoff（自由排版精靈 seed / 空白 blank / 載入既有排版 activity）進來 → 「返回」離開編輯器，
  // 唔好跌返舊版分層合成表單（已被精靈取代）。表單流程（直接開 compose 頁填表）先維持原本「返回＝回表單」。
  const [fromHandoff, setFromHandoff] = useState(false);
  const [bgMode, setBgMode] = useState<BgMode>(clientIdProp ? "library" : "ai");
  const [bgPrompt, setBgPrompt] = useState("典雅浴室，大理石檯面，柔和自然光，清新留白背景，無產品無文字");
  const [libUrl, setLibUrl] = useState<string>("");       // 選中的素材庫背景
  const [uploadUrl, setUploadUrl] = useState<string>(""); // 上傳的背景
  // clientId：品牌路由用 prop（會被側邊欄高亮）；獨立頁退回 sessionStorage handoff。
  const [clientId, setClientId] = useState<string | null>(clientIdProp ?? null);
  const [productUrls, setProductUrls] = useState<string[]>([]);
  const [title, setTitle] = useState("早鳥預購 88 折");
  const [subtitle, setSubtitle] = useState("預購立即享 88 折");
  const [ratio, setRatio] = useState("1:1");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [layers, setLayers] = useState<LayerData[] | null>(null);
  const [bgLibrary, setBgLibrary] = useState<{ url: string; label?: string }[]>([]);
  const [activityId, setActivityId] = useState<string | null>(null); // 已存草稿活動 id → 之後儲存變更新同一筆
  const [docName, setDocName] = useState<string | null>(null);       // 設計名稱（可重新命名）
  const [logos, setLogos] = useState<string[]>([]);                  // 品牌 logo（Logo 工具用）
  const prodRef = useRef<HTMLInputElement>(null);
  const bgRef = useRef<HTMLInputElement>(null);

  // 素材庫「用這張做背景排版」帶進來的背景圖（+ 獨立頁的 clientId）→ 落在素材庫模式並選中。
  useEffect(() => {
    try {
      const url = sessionStorage.getItem(ML_COMPOSE_BG_KEY);
      const cid = sessionStorage.getItem(ML_COMPOSE_CLIENT_KEY);
      if (url) { sessionStorage.removeItem(ML_COMPOSE_BG_KEY); setLibUrl(url); setBgMode("library"); }
      if (cid) { sessionStorage.removeItem(ML_COMPOSE_CLIENT_KEY); if (!clientIdProp) setClientId(cid); }
    } catch { /* ignore */ }
  }, [clientIdProp]);

  // 首頁「自由排版」帶 ?blank=1 → 跳過表單，直接開一張空白畫布進編輯器。
  useEffect(() => {
    if (searchParams.get("blank") !== "1") return;
    let cancelled = false;
    (async () => {
      const cid = searchParams.get("clientId");
      if (cid && !clientIdProp) setClientId(cid);
      const im = await blankImage(1200, 1200);
      if (cancelled) return;
      setImg(im);
      setLayers([]);
      setFromHandoff(true);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // [自由排版精靈] 網址帶 ?seed=1 → 讀 sessionStorage 已 compose 好嘅 layers/尺寸，直接落地編輯器。
  useEffect(() => {
    if (searchParams.get("seed") !== "1") return;
    let cancelled = false;
    (async () => {
      try {
        const raw = sessionStorage.getItem(ML_WIZARD_SEED_KEY);
        if (!raw) return;
        const seed = JSON.parse(raw) as {
          layers: LayerData[]; docW: number; docH: number;
          clientId?: string; title?: string; subtitle?: string;
        };
        const im = await blankImage(seed.docW, seed.docH);
        if (cancelled) return;
        setImg(im);
        setLayers(seed.layers);
        setFromHandoff(true);
        if (seed.clientId && !clientIdProp) setClientId(seed.clientId);
        if (seed.title) { setTitle(seed.title); setDocName(seed.title); }
        sessionStorage.removeItem(ML_WIZARD_SEED_KEY);
      } catch { /* ignore — falls back to the form */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 續編：網址帶 ?activity=<id>（草稿活動）或舊的 ?layout=<libraryImageId>
  // → 抓已存排版、還原成 LayerData[] + 空白尺寸圖 → 直接進編輯器。
  useEffect(() => {
    let cancelled = false;
    let q = "";
    try {
      const sp = new URLSearchParams(window.location.search);
      const a = sp.get("activity"); const l = sp.get("layout");
      if (a) q = `activity=${encodeURIComponent(a)}`; else if (l) q = `id=${encodeURIComponent(l)}`;
    } catch { /* ignore */ }
    if (!q) return;
    (async () => {
      try {
        const r = await fetch(`/api/magic-layers/save?${q}`);
        const d = await r.json();
        if (!r.ok || cancelled) return;
        const im = await blankImage(d.docW, d.docH);
        if (cancelled) return;
        setImg(im);
        setLayers((d.layers as SavedLayer[]).map(savedToLayerData));
        setFromHandoff(true);
        if (d.activityId) setActivityId(d.activityId);
        if (d.name) { setTitle(d.name); setDocName(d.name); }
      } catch { /* ignore — falls back to the form */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // 素材庫縮圖清單連動該品牌素材庫（有 clientId 讀 gallery，否則退回全域 + 樣本）。
  useEffect(() => {
    let ignore = false;
    const apply = (list: { url: string; label?: string }[]) => { if (!ignore) setBgLibrary(list); };
    const samples = [{ url: "/ml-socie.jpg", label: "樣本背景 A" }, { url: "/ml-hero.PNG", label: "樣本背景 B" }];
    if (clientId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fetch(`/api/library/gallery?clientId=${encodeURIComponent(clientId)}`).then((r) => r.json()).then((items: any[]) => {
        apply((Array.isArray(items) ? items : [])
          .filter((it) => it?.imageUrl && (it.kind !== "generated" || it.status === "DONE"))
          .map((it) => ({ url: it.imageUrl as string, label: (it.name || it.subject || it.prompt?.slice?.(0, 18) || "") as string }))
          .slice(0, 80));
      }).catch(() => apply([]));
    } else {
      fetch("/api/magic-layers/backgrounds").then((r) => r.json()).then((d) => {
        const list = (d.backgrounds ?? []) as { url: string; label?: string }[];
        apply(list.length ? list : samples);
      }).catch(() => apply(samples));
    }
    return () => { ignore = true; };
  }, [clientId]);

  // 品牌 logo（給編輯器「Logo」工具插入用）
  useEffect(() => {
    if (!clientId) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fetch(`/api/clients/${clientId}`).then((r) => r.json()).then((c: any) => {
      const arr: string[] = [];
      const many = c?.logoUrls;  // 多版本（若 schema 有）
      if (Array.isArray(many)) arr.push(...many);
      else if (typeof many === "string" && many) { try { arr.push(...JSON.parse(many)); } catch { arr.push(many); } }
      if (typeof c?.logoUrl === "string" && c.logoUrl) arr.push(c.logoUrl);  // 單一 logo（此 schema 的欄位）
      setLogos([...new Set(arr.filter(Boolean))]);
    }).catch(() => { /* ignore */ });
  }, [clientId]);

  const addProducts = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fs = Array.from(e.target.files ?? []);
    const urls = await Promise.all(fs.map(fileToDataUrl));
    setProductUrls((p) => [...p, ...urls]); e.target.value = "";
  }, []);
  const onUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return; setUploadUrl(await fileToDataUrl(f)); e.target.value = "";
  }, []);

  // 送出時用的背景（素材庫/上傳給 URL，AI 給 prompt）。
  const activeBg = bgMode === "library" ? libUrl : bgMode === "upload" ? uploadUrl : "";

  const compose = useCallback(async () => {
    if (busy) return;
    if (bgMode !== "ai" && !activeBg) { alert(bgMode === "library" ? "請先從素材庫選一張背景" : "請先上傳一張背景圖"); return; }
    setBusy(true); setProgress(bgMode === "ai" ? "AI 生背景 + 去背 + 合成中…" : "去背 + 合成中…");
    try {
      const body: Record<string, unknown> = {
        ratio, productImageUrls: productUrls,
        texts: [
          title.trim() && { text: title.trim(), color: "#d4a017", fontWeight: 800, align: "center" },
          subtitle.trim() && { text: subtitle.trim(), color: "#8a6d1f", fontWeight: 600, align: "center" },
        ].filter(Boolean),
      };
      if (bgMode === "ai") body.backgroundPrompt = bgPrompt; else body.backgroundUrl = activeBg;
      const r = await fetch("/api/magic-layers/compose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? r.statusText);
      const bg = await loadImg(data.backgroundUrl);
      setImg(bg); setLayers(data.layers);
    } catch (err) { console.error(err); alert("合成失敗：" + (err instanceof Error ? err.message : String(err))); }
    finally { setBusy(false); setProgress(""); }
  }, [busy, bgMode, activeBg, ratio, productUrls, title, subtitle, bgPrompt]);

  // 儲存 / 下載：壓平圖 + 圖層 JSON → 存進素材庫（第一次新增、之後更新同一筆）。
  const handleSave = useCallback(async (payload: { docW: number; docH: number; layers: SavedLayer[]; imageDataUrl: string; finalize: boolean }) => {
    const r = await fetch("/api/magic-layers/save", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, activityId, name: (docName ?? title).trim() || "未命名排版", ...payload }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error ?? r.statusText);
    if (d.activityId) setActivityId(d.activityId);
  }, [clientId, activityId, docName, title]);

  // 編輯器：填滿 <main> 內容區（圓角面板），品牌側邊欄仍在左側。
  if (layers && img) {
    return (
      <div style={S.editorPanel}>
        <MagicLayersEditor image={img} layers={layers} backgrounds={bgLibrary} logos={logos}
          name={docName ?? title} onRename={setDocName}
          onBack={() => {
            // handoff（精靈/空白/續編）進來 → 返回離開編輯器（回上一頁）；表單流程 → 返回回表單。
            if (fromHandoff) { router.back(); }
            else { setLayers(null); setImg(null); }
          }} onSave={handleSave} />
      </div>
    );
  }

  const modes: { key: BgMode; label: string }[] = [
    { key: "library", label: "素材庫" }, { key: "upload", label: "上傳" }, { key: "ai", label: "AI 生成" },
  ];

  return (
    <div style={S.wrap}>
      <div style={S.card}>
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>分層合成 <span style={{ color: "#7c3aed" }}>→ 可編輯排版</span></h1>
        <p style={S.hint}>生成時就分層（背景 + 去背產品 + 真·可編輯文字），事後自由排版。不做任何拆解。</p>

        <label style={S.label}>背景</label>
        {/* 三選一模式切換：只顯示當前模式的控制項 */}
        <div style={S.seg}>
          {modes.map((m) => (
            <button key={m.key} onClick={() => setBgMode(m.key)}
              style={{ ...S.segBtn, ...(bgMode === m.key ? S.segActive : {}) }}>{m.label}</button>
          ))}
        </div>

        {bgMode === "library" && (
          <div style={{ margin: "0 0 14px" }}>
            {bgLibrary.length > 0 ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, maxHeight: 220, overflowY: "auto", padding: 2 }}>
                {bgLibrary.map((b, i) => (
                  <img key={i} src={b.url} alt={b.label ?? ""} title={b.label ?? ""} onClick={() => setLibUrl(b.url)}
                    style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 10, cursor: "pointer",
                      border: libUrl === b.url ? "2px solid #7c3aed" : "1px solid #e5e7eb",
                      outline: libUrl === b.url ? "2px solid #ddd6fe" : "none" }} />
                ))}
              </div>
            ) : (
              <p style={{ ...S.hint, margin: "4px 0 0" }}>此品牌素材庫還沒有圖。先去「素材庫」生成／上傳，或切到「AI 生成」直接生一張。</p>
            )}
          </div>
        )}

        {bgMode === "upload" && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", margin: "0 0 14px" }}>
            <button onClick={() => bgRef.current?.click()} style={S.btnGhost}>選擇背景圖…</button>
            {uploadUrl && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "#7c3aed", fontSize: 13, fontWeight: 600 }}>
                <img src={uploadUrl} alt="" style={{ width: 34, height: 34, objectFit: "cover", borderRadius: 8, border: "1px solid #e5e7eb" }} />
                已選上傳背景
                <button onClick={() => setUploadUrl("")} style={S.link}>清除</button>
              </span>
            )}
            <input ref={bgRef} type="file" accept="image/*" onChange={onUpload} style={{ display: "none" }} />
          </div>
        )}

        {bgMode === "ai" && (
          <textarea value={bgPrompt} onChange={(e) => setBgPrompt(e.target.value)} rows={2} placeholder="描述你想要的背景畫面（英文描述效果較準）"
            style={{ ...S.input, margin: "0 0 14px" }} />
        )}

        <label style={S.label}>產品圖（可多張，會自動去背疊上）</label>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", margin: "0 0 14px" }}>
          <button onClick={() => prodRef.current?.click()} style={S.btnGhost}>＋ 上傳產品</button>
          {productUrls.map((u, i) => <img key={i} src={u} alt="" style={{ width: 34, height: 34, objectFit: "cover", borderRadius: 8, border: "1px solid #e5e7eb" }} />)}
          {productUrls.length > 0 && <button onClick={() => setProductUrls([])} style={S.link}>清除</button>}
          <input ref={prodRef} type="file" accept="image/*" multiple onChange={addProducts} style={{ display: "none" }} />
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}><label style={S.label}>標題</label><input value={title} onChange={(e) => setTitle(e.target.value)} style={S.input} /></div>
          <div style={{ flex: 1 }}><label style={S.label}>副標</label><input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} style={S.input} /></div>
          {/* 比例只有 AI 生成用得到（素材庫/上傳背景以圖的實際尺寸為畫布） */}
          {bgMode === "ai" && (
            <div style={{ width: 90 }}><label style={S.label}>比例</label>
              <select value={ratio} onChange={(e) => setRatio(e.target.value)} style={S.input}>
                {["1:1", "4:5", "3:4", "16:9", "9:16", "4:3"].map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          )}
        </div>

        <button onClick={compose} disabled={busy} style={{ ...S.btn, width: "100%", marginTop: 20, height: 46, borderRadius: 12, border: "none", color: "#fff", fontWeight: 700, fontSize: 14, background: busy ? "#a78bfa" : "linear-gradient(135deg,#8b5cf6,#7c3aed)", cursor: busy ? "default" : "pointer" }}>
          {busy ? (progress || "合成中…") : "🧩 合成 → 進編輯器排版"}
        </button>
        <p style={{ color: "#9ca3af", fontSize: 12, marginTop: 12 }}>需要 .env.local 的 FAL_KEY（背景生成 + 產品去背）。</p>
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  // fills the padded <main> content area (no fixed overlay → sidebar stays visible)
  wrap: { display: "flex", alignItems: "center", justifyContent: "center", minHeight: "calc(100vh - 48px)", fontFamily: "'Manrope','Noto Sans TC',system-ui,sans-serif" },
  card: { width: "min(680px,100%)", background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 20, padding: 28, color: "#1f2937", boxShadow: "0 10px 40px rgba(0,0,0,.06)" },
  editorPanel: { height: "100%", overflow: "hidden", background: "#fff" },
  hint: { color: "#6b7280", fontSize: 13, lineHeight: 1.6, margin: "8px 0 18px" },
  label: { display: "block", fontSize: 12, color: "#6b7280", margin: "0 0 4px", fontWeight: 600 },
  input: { width: "100%", background: "#ffffff", border: "1px solid #e5e7eb", color: "#1f2937", borderRadius: 10, padding: "9px 11px", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" },
  btn: { height: 36, padding: "0 14px", border: "1px solid #e5e7eb", background: "#ffffff", color: "#374151", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer" },
  btnGhost: { height: 34, padding: "0 12px", border: "1px dashed #d1d5db", background: "transparent", color: "#6b7280", borderRadius: 10, fontSize: 13, cursor: "pointer" },
  link: { border: "none", background: "transparent", color: "#7c3aed", fontSize: 12, cursor: "pointer", textDecoration: "underline" },
  // segmented control
  seg: { display: "inline-flex", gap: 4, padding: 4, background: "#f3f4f6", borderRadius: 12, margin: "0 0 12px" },
  segBtn: { height: 32, padding: "0 16px", border: "none", background: "transparent", color: "#6b7280", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: "pointer" },
  segActive: { background: "#ffffff", color: "#7c3aed", boxShadow: "0 1px 3px rgba(0,0,0,.08)" },
};
