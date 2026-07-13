"use client";
/**
 * QuickAddModal (v3)
 * ──────────────────
 * Four素材 types shown together (構圖 / 配色 / 語氣 / 背景), each toggleable.
 *   1. Upload a reference image (optional) → AI 讀取圖片 fills 構圖/配色/語氣
 *   2. 配色 is a 5-color palette (主色/輔色/強調色/中性色/點綴色); each color toggleable
 *   3. 背景 is upload-only (no AI): its own image + description
 *   4. 儲存 → POSTs one component per checked section in parallel
 */

import { useState, useRef, useEffect } from "react";
import { X, Upload, Sparkles, Loader2, Plus, Trash2, Check } from "lucide-react";
import { CATEGORY_META, PALETTE_ROLES, getColors } from "@/types/library";
import type { PaletteRole, StyleComponent, ComponentCategory } from "@/types/library";
import { useRotatingHint } from "@/hooks/useRotatingHint";
// AI 分析（生成素材積木）loading 輪播提示
const ANALYZE_HINTS = ["AI 分析構圖中…", "抽取配色…", "解讀風格語氣…", "整理素材積木…", "快好喇…"];
// INDUSTRY_PRESETS moved to PromptComposer (積木組合台)
import { ColorCards } from "./ColorCards";

type Props = {
  clientId: string | null;
  initialImageUrl?: string | null;
  editComponent?: StyleComponent | null;
  /** Image-based edit: prefill ALL of an image's components (構圖/配色/語氣) to edit together. */
  prefillComponents?: StyleComponent[] | null;
  /** Set when editing a GENERATED image → save rewrites that image's paramsJson.slots
   *  instead of writing StyleComponent rows (which the generated-image modal never reads). */
  libraryImageId?: string;
  onClose: () => void;
  onSaved: () => void;
};

type PaletteEntry = { role: PaletteRole; label: string; hex: string; enabled: boolean };

const DEFAULT_PALETTE: PaletteEntry[] = PALETTE_ROLES.map((r, idx) => ({
  role: r.role,
  label: r.label,
  hex: idx === 0 ? "#3b82f6" : idx === 1 ? "#1f2937" : "#e5e7eb",
  enabled: idx < 2, // primary + secondary on by default
}));

export function QuickAddModal({ clientId, initialImageUrl, editComponent, prefillComponents, libraryImageId, onClose, onSaved }: Props) {
  const isEdit = !!editComponent || (!!prefillComponents && prefillComponents.length > 0);
  // ── Reference image (for AI analyze) ──
  const [imageUrl, setImageUrl] = useState<string | null>(initialImageUrl ?? null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Edit-mode: type and clientId change ──
  const [editType, setEditType] = useState<ComponentCategory>(editComponent?.type ?? "COMPOSITION");
  const [editClientId, setEditClientId] = useState<string | null>(editComponent?.clientId ?? clientId);
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);

  // ── Section toggles ──
  const [include, setInclude] = useState({
    COMPOSITION: true,
    COLOR_SCHEME: true,
    COPY_TONE: false,  // 語氣積木已移除（wireframe ⑧）—— 預設唔包含、section 已隱藏
    BACKGROUND: false,
  });

  // ── COMPOSITION ──
  const [compName, setCompName] = useState("");
  const [description, setDescription] = useState("");
  const [compPrompt, setCompPrompt] = useState("");

  // ── COLOR_SCHEME (5-color palette) ──
  const [colorName, setColorName] = useState("");
  const [palette, setPalette] = useState<PaletteEntry[]>(DEFAULT_PALETTE);
  const [colorPrompt, setColorPrompt] = useState("");

  // ── COPY_TONE ──
  const [toneName, setToneName] = useState("");
  const [toneLabels, setToneLabels] = useState<string[]>([]);
  const [toneInput, setToneInput] = useState("");
  const [tonePrompt, setTonePrompt] = useState("");

  // ── BACKGROUND (upload-only) ──
  const [bgName, setBgName] = useState("");
  const [bgImageUrl, setBgImageUrl] = useState<string | null>(null);
  // (背景 is image-only now — no description / aiPrompt fields)

  // (套用行業範本 moved to PromptComposer / 積木組合台)

  // ── AI ──
  const [analyzing, setAnalyzing] = useState(false);
  const analyzeHint = useRotatingHint(analyzing, ANALYZE_HINTS);
  // Which single section is being (re)analyzed via its per-block AI button (null = none).
  const [sectionAnalyzing, setSectionAnalyzing] = useState<ComponentCategory | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  // ── Save ──
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Load client list for project selector
  useEffect(() => {
    fetch("/api/clients").then((r) => r.json()).then((data) => setClients(Array.isArray(data) ? data : []));
  }, []);

  // ── Edit-mode init: prefill the one section being edited ──
  useEffect(() => {
    if (!editComponent) return;
    const t = editComponent.type as ComponentCategory;
    setEditType(t);
    setEditClientId(editComponent.clientId ?? clientId);
    setInclude({ COMPOSITION: t === "COMPOSITION", COLOR_SCHEME: t === "COLOR_SCHEME", COPY_TONE: t === "COPY_TONE", BACKGROUND: t === "BACKGROUND" });
    const d = editComponent.data ?? {};
    if (t === "COMPOSITION") { setCompName(editComponent.name); setDescription((d.description as string) ?? ""); setCompPrompt(editComponent.aiPromptText); }
    if (t === "COLOR_SCHEME") {
      setColorName(editComponent.name); setColorPrompt(editComponent.aiPromptText);
      const cols = getColors(d);
      setPalette(PALETTE_ROLES.map((r, idx) => {
        const c = cols.find((c) => c.role === r.role);
        return { role: r.role, label: r.label, hex: c?.hex ?? (idx === 0 ? "#3b82f6" : idx === 1 ? "#1f2937" : "#e5e7eb"), enabled: !!c };
      }));
    }
    if (t === "COPY_TONE") { setToneName(editComponent.name); setToneLabels((d.toneLabels as string[]) ?? []); setTonePrompt(editComponent.aiPromptText); }
    if (t === "BACKGROUND") { setBgName(editComponent.name); setBgImageUrl((d.imageUrl as string) ?? editComponent.previewUrl ?? null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Image-based edit init: prefill ALL of the image's components (構圖/配色/語氣) ──
  useEffect(() => {
    if (!prefillComponents || prefillComponents.length === 0) return;
    const present = { COMPOSITION: false, COLOR_SCHEME: false, COPY_TONE: false, BACKGROUND: false };
    setEditClientId(prefillComponents[0].clientId ?? clientId);
    for (const comp of prefillComponents) {
      const t = comp.type as ComponentCategory;
      const d = comp.data ?? {};
      present[t] = true;
      if (t === "COMPOSITION") { setCompName(comp.name); setDescription((d.description as string) ?? ""); setCompPrompt(comp.aiPromptText); }
      if (t === "COLOR_SCHEME") {
        setColorName(comp.name); setColorPrompt(comp.aiPromptText);
        const cols = getColors(d);
        setPalette(PALETTE_ROLES.map((r, idx) => {
          const c = cols.find((c) => c.role === r.role);
          return { role: r.role, label: r.label, hex: c?.hex ?? (idx === 0 ? "#3b82f6" : idx === 1 ? "#1f2937" : "#e5e7eb"), enabled: !!c };
        }));
      }
      if (t === "COPY_TONE") { setToneName(comp.name); setToneLabels((d.toneLabels as string[]) ?? []); setTonePrompt(comp.aiPromptText); }
    }
    setInclude({ COMPOSITION: present.COMPOSITION, COLOR_SCHEME: present.COLOR_SCHEME, COPY_TONE: present.COPY_TONE, BACKGROUND: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const checkedCount = Object.values(include).filter(Boolean).length;

  // ── Handlers ──
  async function uploadFile(file: File): Promise<string> {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    const { url } = await res.json();
    return url;
  }

  async function handleUpload(file: File) {
    setUploading(true);
    setImageUrl(await uploadFile(file));
    setUploading(false);
  }

  function updateColor(role: PaletteRole, patch: Partial<PaletteEntry>) {
    setPalette((prev) => prev.map((p) => (p.role === role ? { ...p, ...patch } : p)));
  }

  // Call the analyze endpoint once; throws on error. Returns { composition, colorScheme, copyTone, ... }.
  async function runAnalyze() {
    const res = await fetch("/api/components/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageUrl }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "AI 分析失敗");
    return data;
  }

  // ── Per-section appliers (used by both「填入全部」and per-block buttons) ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function applyComposition(c: any) {
    if (!c) return;
    setCompName(c.name ?? "");
    setDescription(c.description ?? "");
    setCompPrompt(c.aiPromptText ?? "");
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function applyColorScheme(cs: any) {
    if (!cs) return;
    setColorName(cs.name ?? "");
    setColorPrompt(cs.aiPromptText ?? "");
    // Map primary, secondary, then extraColors → accent/neutral/highlight
    const extra: string[] = Array.isArray(cs.extraColors) ? cs.extraColors : [];
    setPalette((prev) =>
      prev.map((p, idx) => {
        if (p.role === "primary" && cs.primaryColor) return { ...p, hex: cs.primaryColor, enabled: true };
        if (p.role === "secondary" && cs.secondaryColor) return { ...p, hex: cs.secondaryColor, enabled: true };
        const extraIdx = idx - 2; // accent=0, neutral=1, highlight=2
        if (extraIdx >= 0 && extra[extraIdx]) return { ...p, hex: extra[extraIdx], enabled: true };
        return p;
      }),
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function applyCopyTone(t: any) {
    if (!t) return;
    setToneName(t.name ?? "");
    setToneLabels(t.toneLabels ?? []);
    setTonePrompt(t.aiPromptText ?? "");
  }

  // 「AI 讀取圖片，填入欄位」— fill ALL three sections at once.
  async function handleAnalyze() {
    if (!imageUrl) return;
    setAnalyzing(true);
    setAiError(null);
    try {
      const data = await runAnalyze();
      applyComposition(data.composition);
      applyColorScheme(data.colorScheme);
      applyCopyTone(data.copyTone);
      // NOTE: 背景 is a standalone image asset, NOT derived from analysis — left untouched here.
    } catch (e: unknown) {
      setAiError(e instanceof Error ? e.message : "AI 分析失敗，請重試");
    } finally {
      setAnalyzing(false);
    }
  }

  // Per-block AI: (re)analyze the image but apply ONLY the chosen section — others stay intact.
  async function analyzeSection(section: ComponentCategory) {
    if (!imageUrl) return;
    setSectionAnalyzing(section);
    setAiError(null);
    try {
      const data = await runAnalyze();
      if (section === "COMPOSITION") applyComposition(data.composition);
      else if (section === "COLOR_SCHEME") applyColorScheme(data.colorScheme);
      else if (section === "COPY_TONE") applyCopyTone(data.copyTone);
      setInclude((p) => ({ ...p, [section]: true })); // ensure the filled section is enabled
    } catch (e: unknown) {
      setAiError(e instanceof Error ? e.message : "AI 分析失敗，請重試");
    } finally {
      setSectionAnalyzing(null);
    }
  }

  // Build the {name,data,aiPromptText,previewUrl} payload for one section.
  function payloadFor(type: ComponentCategory) {
    const enabledColors = palette.filter((p) => p.enabled && p.hex);
    const primaryHex = (enabledColors.find((c) => c.role === "primary") ?? enabledColors[0])?.hex;
    const secondaryHex = (enabledColors.find((c) => c.role === "secondary") ?? enabledColors[1])?.hex;
    switch (type) {
      case "COMPOSITION":
        return { name: compName.trim(), data: { description }, aiPromptText: compPrompt, previewUrl: imageUrl };
      case "COLOR_SCHEME":
        return {
          name: colorName.trim(),
          data: { colors: enabledColors.map(({ hex, role, label }) => ({ hex, role, label })), primaryColor: primaryHex, secondaryColor: secondaryHex },
          aiPromptText: colorPrompt, previewUrl: imageUrl,
        };
      case "COPY_TONE":
        return { name: toneName.trim(), data: { toneLabels }, aiPromptText: tonePrompt, previewUrl: imageUrl };
      case "BACKGROUND":
        return { name: bgName.trim(), data: { imageUrl: bgImageUrl }, aiPromptText: "", previewUrl: bgImageUrl };
    }
  }

  async function handleSave() {
    const errors: string[] = [];
    if (include.COMPOSITION && !compName.trim()) errors.push("構圖");
    if (include.COLOR_SCHEME && !colorName.trim()) errors.push("配色");
    if (include.COPY_TONE && !toneName.trim()) errors.push("語氣");
    if (include.BACKGROUND && (!bgName.trim() || !bgImageUrl)) errors.push("背景（需名稱＋圖片）");
    if (errors.length) { setSaveError(`請填寫名稱：${errors.join("、")}`); return; }
    // Allow uncheck-all only in image-based edit (= delete all that image's components).
    if (checkedCount === 0 && !prefillComponents) { setSaveError("請至少勾選一個素材類型"); return; }

    setSaving(true);
    setSaveError(null);

    // Generated-image edit（「調整」）：只把「調整意圖」送去 server，由 server 用「擁有權規則」決定
    // 每個 block 係「改自己」定「fork 新 block」——因為要判斷 block 有冇俾其他圖共用，需要掃 DB（server 先做到）。
    //   • 自己專屬（冇其他圖用、亦唔係第二張圖分析出嚟嘅 block）→ 就地改（change itself）
    //   • 借用（其他圖／參考圖擁有）→ fork 一個屬於自己嘅新 block，唔郁原本嗰個
    if (libraryImageId) {
      const byType = Object.fromEntries((prefillComponents ?? []).map((c) => [c.type, c]));
      const mkEdit = (type: ComponentCategory) => {
        if (!include[type]) return null; // unchecked → 由快照移除
        const p = payloadFor(type)!;
        const orig = byType[type];
        const changed = !orig
          || orig.name !== p.name
          || (orig.aiPromptText ?? "") !== (p.aiPromptText ?? "")
          || JSON.stringify(orig.data ?? {}) !== JSON.stringify(p.data ?? {});
        return { type, name: p.name, data: p.data, aiPromptText: p.aiPromptText, prevBlockId: orig?.id ?? null, changed };
      };
      const res = await fetch(`/api/library/images/${libraryImageId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blockEdits: { layout: mkEdit("COMPOSITION"), color: mkEdit("COLOR_SCHEME"), tone: mkEdit("COPY_TONE") },
          background: byType["BACKGROUND"] ?? null, // 背景 here is not editable — keep as-is
          clientId: editClientId ?? null,
        }),
      });
      setSaving(false);
      if (!res.ok) { setSaveError("儲存失敗，請重試"); return; }
      onSaved();
      onClose();
      return;
    }

    // Edit mode: PATCH the single component in place.
    if (isEdit && editComponent) {
      // Build the payload for the (possibly changed) type.
      const p = payloadFor(editType);
      // CRITICAL: preserve the component's ORIGINAL previewUrl. The previewUrl identifies which
      // gallery image this component belongs to — editing its content must never move it to a
      // different gallery group. (Bug: payloadFor("BACKGROUND") returned previewUrl=bgImageUrl,
      // which differs from previewUrl when the bg image ≠ the analysed gallery photo, so saving
      // silently re-homed the component and the original tile appeared "not updated".)
      const res = await fetch(`/api/components/${editComponent.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...p, type: editType, clientId: editClientId, previewUrl: editComponent.previewUrl }),
      });
      setSaving(false);
      if (!res.ok) { setSaveError("儲存失敗，請重試"); return; }
      onSaved();
      onClose();
      return;
    }

    // POST upserts by previewUrl+type, so image-based edit re-uses this path (updates in place).
    const post = (type: ComponentCategory) =>
      fetch("/api/components", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, clientId: editClientId, ...payloadFor(type) }),
      });

    const saves: Promise<Response>[] = [];
    // Image-based edit: a prefilled component whose section was UNCHECKED → delete it.
    if (prefillComponents) {
      for (const comp of prefillComponents) {
        if (!include[comp.type as keyof typeof include]) {
          saves.push(fetch(`/api/components/${comp.id}`, { method: "DELETE" }));
        }
      }
    }
    if (include.COMPOSITION) saves.push(post("COMPOSITION"));
    if (include.COLOR_SCHEME) saves.push(post("COLOR_SCHEME"));
    if (include.COPY_TONE) saves.push(post("COPY_TONE"));
    if (include.BACKGROUND) saves.push(post("BACKGROUND"));

    const results = await Promise.all(saves);
    setSaving(false);
    if (results.some((r) => !r.ok)) { setSaveError("部分素材儲存失敗，請重試"); return; }
    onSaved();
    onClose();
  }

  const compMeta = CATEGORY_META["COMPOSITION"];
  const colorMeta = CATEGORY_META["COLOR_SCHEME"];
  const toneMeta = CATEGORY_META["COPY_TONE"];

  const enabledColors = palette.filter((p) => p.enabled && p.hex);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-lg bg-white h-full shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="text-base font-semibold">{isEdit ? "編輯素材" : "快速加入素材"}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{isEdit ? "修改後儲存即覆蓋原素材" : "構圖・配色・背景可同時新增"}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Edit-mode: project selector only (type is fixed — an image's 構圖/配色/語氣 are edited together) */}
        {isEdit && (
          <div className="px-6 py-3 border-b bg-gray-50/60 flex items-center gap-2 flex-wrap">
            <label className="text-xs font-semibold text-gray-500 whitespace-nowrap">專案</label>
            <select value={editClientId ?? ""} onChange={(e) => setEditClientId(e.target.value || null)}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white">
              <option value="">全部（無分類）</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Reference image upload + AI analyze — available in both create and edit mode */}
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-2 block">
              參考圖片（選填，供 AI 分析構圖／配色／背景）
            </label>
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { if (e.target.files?.[0]) handleUpload(e.target.files[0]); }} />
            {imageUrl ? (
              <div className="relative group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageUrl} alt="preview" className="w-full h-64 object-contain rounded-xl border bg-gray-50" />
                <button onClick={() => setImageUrl(null)}
                  className="absolute top-2 right-2 bg-white/90 hover:bg-white p-1.5 rounded-lg shadow opacity-0 group-hover:opacity-100 transition-opacity">
                  <Trash2 className="h-3.5 w-3.5 text-red-500" />
                </button>
                <button onClick={handleAnalyze} disabled={analyzing}
                  className="absolute bottom-3 right-3 flex items-center gap-1.5 text-xs font-medium bg-violet-600 hover:bg-violet-700 text-white px-3 py-1.5 rounded-lg shadow transition-colors disabled:opacity-60">
                  {analyzing
                    ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />{analyzeHint}</>
                    : <><Sparkles className="h-3.5 w-3.5" />AI 讀取圖片，填入欄位</>}
                </button>
              </div>
            ) : (
              <button onClick={() => fileRef.current?.click()} disabled={uploading}
                className="w-full h-32 border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center gap-2 text-gray-400 hover:border-violet-300 hover:text-violet-500 transition-colors">
                {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
                <span className="text-xs">{uploading ? "上傳中…" : "點擊上傳圖片（可用 AI 自動填入欄位）"}</span>
              </button>
            )}
            {aiError && <p className="text-xs text-red-500 mt-1.5">{aiError}</p>}
          </div>

          {/* COMPOSITION */}
          <SectionWrapper meta={compMeta} label="構圖" checked={include.COMPOSITION}
            onToggle={() => setInclude((p) => ({ ...p, COMPOSITION: !p.COMPOSITION }))}
            action={imageUrl ? <SectionAIButton loading={sectionAnalyzing === "COMPOSITION"} disabled={!!sectionAnalyzing || analyzing} onClick={() => analyzeSection("COMPOSITION")} /> : null}>
            <Field label="素材名稱 *">
              <input value={compName} onChange={(e) => setCompName(e.target.value)} placeholder="例：留白極簡構圖"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </Field>
            <Field label="構圖描述">
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="例：主體置中，大量留白，視覺乾淨" rows={2}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </Field>
          </SectionWrapper>

          {/* COLOR_SCHEME — 5-color palette */}
          <SectionWrapper meta={colorMeta} label="配色" checked={include.COLOR_SCHEME}
            onToggle={() => setInclude((p) => ({ ...p, COLOR_SCHEME: !p.COLOR_SCHEME }))}
            action={imageUrl ? <SectionAIButton loading={sectionAnalyzing === "COLOR_SCHEME"} disabled={!!sectionAnalyzing || analyzing} onClick={() => analyzeSection("COLOR_SCHEME")} /> : null}>
            <Field label="素材名稱 *">
              <input value={colorName} onChange={(e) => setColorName(e.target.value)} placeholder="例：暖橙系配色"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400" />
            </Field>
            <Field label="色盤（最多 5 色，可勾選啟用）">
              {enabledColors.length > 0 && <div className="mb-2"><ColorCards colors={enabledColors} height="h-12" /></div>}
              <div className="space-y-1.5">
                {palette.map((c) => {
                  const roleMeta = PALETTE_ROLES.find((r) => r.role === c.role)!;
                  return (
                    <div key={c.role} className={`flex items-center gap-2 ${c.enabled ? "" : "opacity-45"}`}>
                      <button type="button" onClick={() => roleMeta.toggleable && updateColor(c.role, { enabled: !c.enabled })}
                        disabled={!roleMeta.toggleable}
                        className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${c.enabled ? "bg-rose-500 border-rose-500" : "border-gray-300 bg-white"} ${roleMeta.toggleable ? "" : "cursor-default"}`}
                        title={roleMeta.toggleable ? "啟用 / 停用" : "主色必用"}>
                        {c.enabled && <Check className="h-3 w-3 text-white" />}
                      </button>
                      <input type="color" value={c.hex} onChange={(e) => updateColor(c.role, { hex: e.target.value })}
                        className="w-8 h-8 rounded-lg border border-gray-200 cursor-pointer p-0.5 shrink-0" />
                      <input value={c.hex} onChange={(e) => updateColor(c.role, { hex: e.target.value })}
                        className="w-24 border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-rose-400 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-gray-700 leading-none">{c.label}</div>
                        <div className="text-[10px] text-gray-400 leading-none mt-0.5 truncate">{roleMeta.hint}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Field>
          </SectionWrapper>

          {/* COPY_TONE — 語氣積木已移除（wireframe ⑧），暫隱藏（保留 code 供日後） */}
          {false && (
          <SectionWrapper meta={toneMeta} label="語氣" checked={include.COPY_TONE}
            onToggle={() => setInclude((p) => ({ ...p, COPY_TONE: !p.COPY_TONE }))}
            action={imageUrl ? <SectionAIButton loading={sectionAnalyzing === "COPY_TONE"} disabled={!!sectionAnalyzing || analyzing} onClick={() => analyzeSection("COPY_TONE")} /> : null}>
            <Field label="素材名稱 *">
              <input value={toneName} onChange={(e) => setToneName(e.target.value)} placeholder="例：活潑親切語氣"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
            </Field>
            <Field label="語氣標籤">
              <div className="flex flex-wrap gap-1.5 mb-2">
                {toneLabels.map((l, i) => (
                  <span key={i} className="flex items-center gap-1 bg-amber-100 text-amber-700 text-xs px-2 py-1 rounded-full border border-amber-200">
                    {l}
                    <button onClick={() => setToneLabels(toneLabels.filter((_, j) => j !== i))}><X className="h-3 w-3" /></button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input value={toneInput} onChange={(e) => setToneInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && toneInput.trim()) { e.preventDefault(); setToneLabels([...toneLabels, toneInput.trim()]); setToneInput(""); } }}
                  placeholder="輸入標籤後按 Enter"
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                <button onClick={() => { if (toneInput.trim()) { setToneLabels([...toneLabels, toneInput.trim()]); setToneInput(""); } }}
                  className="px-3 py-1.5 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg text-sm hover:bg-amber-100 transition-colors">
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </Field>
          </SectionWrapper>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-gray-50 flex items-center gap-3">
          {saveError && <p className="text-xs text-red-500 flex-1">{saveError}</p>}
          <button onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-100 transition-colors">
            取消
          </button>
          <button onClick={handleSave} disabled={saving || checkedCount === 0}
            className="flex-1 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5">
            {saving ? <><Loader2 className="h-4 w-4 animate-spin" />儲存中…</> : isEdit ? <>儲存修改</> : <>儲存已選素材（{checkedCount}）</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Small helpers ──
function SectionWrapper({ meta, label, checked, onToggle, children, action }: {
  meta: { bg: string; border: string; color: string };
  label: string;
  checked: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  /** Optional control rendered at the right of the header (e.g. per-block AI button). */
  action?: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl border transition-opacity ${checked ? "" : "opacity-40"} ${meta.bg} ${meta.border}`}>
      <div className="w-full flex items-center gap-2 px-4 pt-3 pb-2">
        <button onClick={onToggle} className="flex items-center gap-2 text-left flex-1 min-w-0">
          <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${checked ? `${meta.border} ${meta.bg}` : "border-gray-300 bg-white"}`}>
            {checked && <Check className={`h-3 w-3 ${meta.color}`} />}
          </span>
          <span className={`text-xs font-semibold ${meta.color}`}>{label}</span>
        </button>
        {action}
      </div>
      {checked && <div className="px-4 pb-4 space-y-3">{children}</div>}
    </div>
  );
}

// Small per-block「AI 生成此項」button shown in a section header.
function SectionAIButton({ loading, disabled, onClick }: { loading: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={loading || disabled}
      title="只用 AI 重新生成此項（不影響其他積木）"
      className="flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-lg border border-violet-200 text-violet-600 bg-white hover:bg-violet-50 transition-colors disabled:opacity-50 shrink-0">
      {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
      AI 生成此項
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-gray-500 mb-1 block">{label}</label>
      {children}
    </div>
  );
}
