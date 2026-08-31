"use client";
/**
 * FreeLayoutWizard — 「自由排版」建立精靈。
 * 三種起手式：空白畫布 / 從素材開始 / AI 幫我建立底圖 → 選畫布尺寸＋選填內容 → compose() →
 * 經 sessionStorage(ML_WIZARD_SEED_KEY) 帶 layers 落 Magic Layers 編輯器（?seed=1）。
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { File as FileIcon, Image as ImageIcon, Sparkles, X, Loader2, RotateCcw, ChevronRight } from "lucide-react";
import { ML_WIZARD_SEED_KEY } from "@/components/activities/RolePickerModal";

type Step = "method" | "material" | "aiPrompt" | "aiResult" | "canvas";
type Branch = "material" | "ai" | null;

type GalleryItem = { imageUrl: string; name?: string; subject?: string; prompt?: string; kind?: string };

const RATIOS: { value: string; label: string; px: string }[] = [
  { value: "1:1", label: "正方形", px: "1080×1080" },
  { value: "4:5", label: "直式貼文", px: "1080×1350" },
  { value: "16:9", label: "橫式寬幅", px: "1920×1080" },
  { value: "9:16", label: "直式限動", px: "1080×1920" },
];

function fileToDataUrl(f: File): Promise<string> {
  return new Promise((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(f); });
}

export function FreeLayoutWizard({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("method");
  const [branch, setBranch] = useState<Branch>(null);
  const [bgUrl, setBgUrl] = useState<string>("");
  const [materialTab, setMaterialTab] = useState<"library" | "upload">("library");
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loadingGallery, setLoadingGallery] = useState(true);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiRefUrl, setAiRefUrl] = useState("");
  const [ratio, setRatio] = useState("1:1");
  const [products, setProducts] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [autoAdd, setAutoAdd] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");

  // 進入「從素材開始」步驟時抓一次該品牌素材庫。
  useEffect(() => {
    if (step !== "material") return;
    let ignore = false;
    fetch(`/api/library/gallery?clientId=${encodeURIComponent(clientId)}`)
      .then((r) => r.json())
      .then((d: GalleryItem[]) => { if (!ignore) setItems(Array.isArray(d) ? d.filter((i) => i.imageUrl) : []); })
      .catch(() => { if (!ignore) setItems([]); })
      .finally(() => { if (!ignore) setLoadingGallery(false); });
    return () => { ignore = true; };
  }, [step, clientId]);

  const handleUploadMaterial = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    setBgUrl(await fileToDataUrl(f)); e.target.value = "";
  }, []);

  const handleUploadRef = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    setAiRefUrl(await fileToDataUrl(f)); e.target.value = "";
  }, []);

  const handleAddProducts = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fs = Array.from(e.target.files ?? []);
    const urls = await Promise.all(fs.map(fileToDataUrl));
    setProducts((p) => [...p, ...urls].slice(0, 3));
    e.target.value = "";
  }, []);

  const handleGenerateBg = useCallback(async () => {
    if (!aiPrompt.trim() || busy) return;
    setBusy(true); setProgress("AI 生成背景中…");
    try {
      const r = await fetch("/api/magic-layers/compose", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ backgroundPrompt: aiPrompt.trim(), backgroundRefUrl: aiRefUrl || undefined, ratio: "1:1", productImageUrls: [], texts: [] }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? r.statusText);
      setBgUrl(data.backgroundUrl);
      setStep("aiResult");
    } catch (err) {
      alert("生成失敗：" + (err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false); setProgress("");
    }
  }, [aiPrompt, aiRefUrl, busy]);

  const handleCreate = useCallback(async () => {
    if (busy) return;
    setBusy(true); setProgress("建立畫布中…");
    try {
      const texts = autoAdd
        ? [
            title.trim() && { text: title.trim(), color: "#d4a017", fontWeight: 800, align: "center" },
            subtitle.trim() && { text: subtitle.trim(), color: "#8a6d1f", fontWeight: 600, align: "center" },
          ].filter(Boolean)
        : [];
      const res = await fetch("/api/magic-layers/compose", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          backgroundUrl: bgUrl, ratio, fitMode: "contain",
          productImageUrls: autoAdd ? products : [], texts,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? res.statusText);
      sessionStorage.setItem(ML_WIZARD_SEED_KEY, JSON.stringify({
        layers: data.layers, docW: data.canvasWidth, docH: data.canvasHeight,
        clientId, title: title.trim(), subtitle: subtitle.trim(),
      }));
      router.push(`/clients/${clientId}/magic-layers/compose?seed=1`);
      onClose();
    } catch (err) {
      alert("建立畫布失敗：" + (err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false); setProgress("");
    }
  }, [busy, autoAdd, title, subtitle, bgUrl, ratio, products, clientId, router, onClose]);

  const optionBtn = "w-full flex items-start gap-3 rounded-xl border p-4 text-left hover:border-violet-300 hover:bg-violet-50/30 transition";

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative w-full max-w-3xl bg-white rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {busy && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-white/85 backdrop-blur-sm">
            <Loader2 className="h-6 w-6 animate-spin text-violet-600" />
            <div className="text-sm text-gray-600">{progress}</div>
          </div>
        )}

        {step === "method" && (
          <div className="p-6">
            <button type="button" onClick={onClose} className="absolute right-4 top-4 z-20 p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600">
              <X className="h-4 w-4" />
            </button>
            <WizardSteps activeIndex={1} />
            <h2 className="flex items-center gap-2 text-2xl font-bold text-gray-900">建立自由排版 <Sparkles className="h-5 w-5 text-violet-500" /></h2>
            <p className="mt-1 mb-6 text-sm text-gray-400">選擇一個起點，進入畫布後都可以自由加入圖片、產品與文字。</p>
            <div className="grid grid-cols-3 gap-4">
              {[
                { key: "blank", title: "空白開始", sub: "建立全新空白畫布", badge: "最自由設計", icon: <FileIcon className="h-7 w-7" />, iconCls: "bg-violet-600 text-white", badgeCls: "bg-violet-600 text-white", onClick: () => { router.push(`/clients/${clientId}/magic-layers/compose?blank=1`); onClose(); } },
                { key: "material", title: "從素材開始", sub: "選一張素材作為底圖", badge: "已有商品圖片", icon: <ImageIcon className="h-7 w-7" />, iconCls: "bg-violet-100 text-violet-500", badgeCls: "bg-gray-100 text-gray-500", onClick: () => { setBranch("material"); setStep("material"); } },
                { key: "ai", title: "AI 幫我建立底圖", sub: "描述想要的背景圖案", badge: "快速建立場景", icon: <Sparkles className="h-7 w-7" />, iconCls: "bg-violet-100 text-violet-500", badgeCls: "bg-gray-100 text-gray-500", onClick: () => { setBranch("ai"); setStep("aiPrompt"); } },
              ].map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={c.onClick}
                  className="group flex flex-col rounded-2xl border border-gray-200 p-5 text-left transition-all hover:border-violet-400 hover:bg-violet-50/40"
                >
                  <div className="mb-4 flex items-start justify-between">
                    <span className={`flex h-14 w-14 items-center justify-center rounded-2xl ${c.iconCls}`}>{c.icon}</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${c.badgeCls}`}>{c.badge}</span>
                  </div>
                  <div className="text-lg font-bold text-gray-900">{c.title}</div>
                  <div className="mt-1 text-sm text-gray-400">{c.sub}</div>
                  <div className="mt-4 flex items-center gap-0.5 text-sm font-medium text-gray-400 group-hover:text-violet-600">
                    點擊選擇 <ChevronRight className="h-4 w-4" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === "material" && (
          <div className="p-6">
            <WizardSteps activeIndex={1} />
            <h2 className="text-base font-semibold text-gray-900 mb-3">選擇起始素材</h2>
            <div className="flex gap-4 border-b border-gray-200 mb-4">
              {(["library", "upload"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setMaterialTab(t)}
                  className={`pb-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                    materialTab === t ? "border-violet-600 text-violet-600" : "border-transparent text-gray-400 hover:text-gray-600"
                  }`}
                >
                  {t === "library" ? "素材庫" : "上傳圖片"}
                </button>
              ))}
            </div>
            <div className="min-h-[240px] max-h-[360px] overflow-y-auto">
              {materialTab === "library" ? (
                loadingGallery ? (
                  <div className="text-center text-gray-400 py-10 text-sm">載入中…</div>
                ) : items.length === 0 ? (
                  <div className="text-center text-gray-400 py-10 text-sm">沒有素材</div>
                ) : (
                  <div className="grid grid-cols-4 gap-3">
                    {items.map((it) => (
                      <button
                        key={it.imageUrl}
                        type="button"
                        onClick={() => setBgUrl(it.imageUrl)}
                        title={it.subject || it.name || ""}
                        className={`rounded-xl border p-1 bg-white transition-all ${
                          bgUrl === it.imageUrl ? "ring-2 ring-violet-500 border-violet-400" : "border-gray-200 hover:border-violet-300"
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={it.imageUrl} alt="" loading="lazy" className="w-full aspect-square object-contain bg-gray-50 rounded-lg" />
                      </button>
                    ))}
                  </div>
                )
              ) : (
                <label className="flex flex-col items-center justify-center gap-2 h-40 rounded-xl border-2 border-dashed border-gray-300 text-gray-400 hover:border-violet-300 hover:text-violet-500 cursor-pointer transition-colors">
                  <ImageIcon className="h-6 w-6" />
                  <span className="text-sm">點擊上傳圖片</span>
                  <input type="file" accept="image/*" className="hidden" onChange={handleUploadMaterial} />
                </label>
              )}
              {materialTab === "upload" && bgUrl && (
                <div className="mt-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={bgUrl} alt="" className="h-24 rounded-lg border border-gray-200 object-contain" />
                </div>
              )}
            </div>
            <div className="flex items-center justify-between mt-5 pt-4 border-t border-gray-100">
              <span className={`text-sm ${bgUrl ? "text-violet-600 font-medium" : "text-gray-400"}`}>
                ✓ 已選擇 {bgUrl ? 1 : 0} 張素材
              </span>
              <div className="flex gap-2">
                <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-gray-600 hover:bg-gray-100">取消</button>
                <button
                  type="button"
                  disabled={!bgUrl}
                  onClick={() => setStep("canvas")}
                  className="px-4 py-2 rounded-xl text-sm font-medium bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  下一步
                </button>
              </div>
            </div>
          </div>
        )}

        {step === "aiPrompt" && (
          <div className="p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-gray-900">AI 建立底圖</h2>
              <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">畫面描述</label>
                <textarea
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="例：夏日海灘，清爽日系廣告風格。陽光燦爛，乾淨簡約的背景…"
                  rows={4}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 placeholder:text-gray-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">參考圖片（選填）</label>
                {aiRefUrl ? (
                  <div className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={aiRefUrl} alt="" className="h-16 w-16 object-cover rounded-lg border border-gray-200" />
                    <label className="text-sm text-violet-600 hover:underline cursor-pointer">
                      更換圖片
                      <input type="file" accept="image/*" className="hidden" onChange={handleUploadRef} />
                    </label>
                  </div>
                ) : (
                  <label className="flex items-center justify-center gap-2 h-20 rounded-xl border-2 border-dashed border-gray-300 text-gray-400 hover:border-violet-300 hover:text-violet-500 cursor-pointer transition-colors">
                    <ImageIcon className="h-5 w-5" />
                    <span className="text-sm">點擊上傳參考圖</span>
                    <input type="file" accept="image/*" className="hidden" onChange={handleUploadRef} />
                  </label>
                )}
              </div>
              <button
                type="button"
                disabled={!aiPrompt.trim() || busy}
                onClick={handleGenerateBg}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-violet-600 text-white py-2.5 text-sm font-medium hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {busy ? (<><Loader2 className="h-4 w-4 animate-spin" />{progress || "生成中…"}</>) : "生成背景"}
              </button>
            </div>
          </div>
        )}

        {step === "aiResult" && (
          <div className="p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-gray-900">AI 生成底圖結果</h2>
              <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-center justify-center bg-gray-50 rounded-xl p-4 mb-5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={bgUrl} alt="" className="max-h-[360px] object-contain rounded-lg" />
            </div>
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setStep("aiPrompt")}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
              >
                <RotateCcw className="h-3.5 w-3.5" />重新生成
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setStep("aiPrompt")}
                  className="px-4 py-2 rounded-xl text-sm border border-gray-200 text-gray-600 hover:border-gray-300"
                >
                  返回修改
                </button>
                <button
                  type="button"
                  onClick={() => setStep("canvas")}
                  className="px-4 py-2 rounded-xl text-sm font-medium bg-violet-600 text-white hover:bg-violet-700"
                >
                  選用此背景
                </button>
              </div>
            </div>
          </div>
        )}

        {step === "canvas" && (
          <div className="p-6 max-h-[85vh] overflow-y-auto">
            <WizardSteps activeIndex={2} />
            <section className="mb-6">
              <h3 className="text-sm font-semibold text-gray-900">選擇畫布尺寸 ✨</h3>
              <p className="text-xs text-gray-400 mb-3">選擇最合適的尺寸開始設計，所有尺寸都可在編輯器中自由調整。</p>
              <div className="grid grid-cols-4 gap-3">
                {RATIOS.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setRatio(r.value)}
                    className={`rounded-xl border p-3 text-center transition-all ${
                      ratio === r.value ? "border-violet-400 bg-violet-50 ring-1 ring-violet-500" : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <div className="font-bold text-gray-900">{r.value}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{r.label}</div>
                    <div className="text-[11px] text-gray-400">{r.px}</div>
                  </button>
                ))}
              </div>
            </section>

            <section className="mb-5">
              <h3 className="text-sm font-semibold text-gray-900">加入內容 (選填)</h3>
              <p className="text-xs text-gray-400 mb-3">先加入需要的內容，進入編輯器後仍可自由修改</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs font-medium text-gray-600 mb-1.5">產品圖 (選填)</div>
                  <label className="flex flex-col items-center justify-center gap-1 h-24 rounded-xl border-2 border-dashed border-gray-300 text-gray-400 hover:border-violet-300 hover:text-violet-500 cursor-pointer transition-colors">
                    <span className="text-sm">＋ 上傳產品</span>
                    <span className="text-[11px]">最多 3 張，AI 自動去背</span>
                    <input type="file" accept="image/*" multiple className="hidden" onChange={handleAddProducts} disabled={products.length >= 3} />
                  </label>
                  {products.length > 0 && (
                    <div className="flex gap-2 mt-2 flex-wrap">
                      {products.map((p, i) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={i} src={p} alt="" className="h-12 w-12 object-cover rounded-lg border border-gray-200" />
                      ))}
                    </div>
                  )}
                  <div className="text-[11px] text-gray-400 mt-1">已上傳 {products.length}/3</div>
                </div>
                <div>
                  <div className="text-xs font-medium text-gray-600 mb-1.5">文字內容 (選填)</div>
                  <div className="space-y-2">
                    <div>
                      <input
                        value={title}
                        maxLength={50}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="標題"
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 placeholder:text-gray-400"
                      />
                      <div className="text-[11px] text-gray-300 text-right">{title.length}/50</div>
                    </div>
                    <div>
                      <input
                        value={subtitle}
                        maxLength={50}
                        onChange={(e) => setSubtitle(e.target.value)}
                        placeholder="副標"
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 placeholder:text-gray-400"
                      />
                      <div className="text-[11px] text-gray-300 text-right">{subtitle.length}/50</div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <label className="flex items-center gap-2 text-sm text-gray-600 mb-5 cursor-pointer">
              <input type="checkbox" checked={autoAdd} onChange={(e) => setAutoAdd(e.target.checked)} className="rounded border-gray-300 text-violet-600 focus:ring-violet-400" />
              進入畫布時自動加入以上內容
            </label>

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setStep(branch === "ai" ? "aiResult" : "material")}
                className="px-4 py-2 rounded-xl text-sm border border-gray-200 text-gray-600 hover:border-gray-300"
              >
                上一步
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleCreate}
                className="px-4 py-2 rounded-xl text-sm font-medium bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                建立畫布
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// 頂部步驟指示：① 選擇開始方式 ﹥ ② 畫布內容（圓形數字徽章＋粗體字＋底線分隔）。
function WizardSteps({ activeIndex }: { activeIndex: 1 | 2 }) {
  const step = (n: 1 | 2, label: string) => {
    const active = activeIndex === n;
    const done = activeIndex > n;
    return (
      <div className="flex items-center gap-2.5">
        <span className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold ${
          active || done ? "bg-violet-600 text-white" : "bg-gray-200 text-gray-500"}`}>
          {n}
        </span>
        <span className={`text-lg font-bold ${active ? "text-violet-600" : done ? "text-gray-400" : "text-gray-800"}`}>{label}</span>
      </div>
    );
  };
  return (
    <div className="mb-6">
      <div className="flex items-center gap-4">
        {step(1, "選擇開始方式")}
        <ChevronRight className="h-5 w-5 text-gray-300" />
        {step(2, "畫布內容")}
      </div>
      <div className="mt-4 border-b border-gray-100" />
    </div>
  );
}
