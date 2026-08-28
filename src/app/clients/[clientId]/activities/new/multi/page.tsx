"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, ImagePlus, X, ChevronDown, ChevronLeft, Sparkles, LayoutGrid, Pencil, Trash2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MultiLayoutPicker, LayoutThumb } from "@/components/activities/MultiLayoutPicker";
import { InspireButton } from "@/components/activities/InspireButton";
import { ACTIVITY_HANDOFF_KEY } from "@/components/activities/RolePickerModal";
import { SectionLabel, Field, AssetUploadCards } from "@/components/activities/formParts";
import { LibraryImagePickerModal } from "@/components/activities/LibraryImagePickerModal";
import { getMultiLayout } from "@/types/multiLayout";
import { useUnsavedGuard } from "@/components/common/UnsavedGuard";

type Cell = { description: string; mustText: string; assetUrls: string[] };

async function uploadFile(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: fd });
  return (await res.json()).url;
}

function emptyCell(): Cell {
  return { description: "", mustText: "", assetUrls: [] };
}

export default function NewMultiActivityPage({ params }: { params: Promise<{ clientId: string }> }) {
  const router = useRouter();
  const [clientId, setClientId] = useState("");
  const [layoutId, setLayoutId] = useState("");
  const [editId, setEditId] = useState<string | null>(null);   // 編輯模式：既有活動 id
  const [showPicker, setShowPicker] = useState(false);

  const [genMode, setGenMode] = useState<"unified" | "perCell">("unified");
  const [variantCount, setVariantCount] = useState<1 | 2>(1);  // 統一主題：生成幾組（暫時鎖定 1，同時生成 2 組喺 Vercel Hobby 會逾時）
  const [variantChoice, setVariantChoice] = useState<"A" | "B">("A");  // 生成組數=1 時，揀單組要 A 定 B

  // 模式 A（統一主題）
  const [theme, setTheme] = useState("");
  const [mustText, setMustText] = useState("");
  const [productUrls, setProductUrls] = useState<string[]>([]);
  const [refUrls, setRefUrls] = useState<string[]>([]);

  // 模式 B（各圖獨立）
  const [cells, setCells] = useState<Cell[]>([]);

  const [optimizing, setOptimizing] = useState(false);
  const [splitting, setSplitting] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzedDone, setAnalyzedDone] = useState(false); // AI 反推提示詞：分析完成狀態（同單圖版 AssetUploadCards 一致）
  const [saving, setSaving] = useState(false);
  const [uploadingProduct, setUploadingProduct] = useState(false);
  const [uploadingRef, setUploadingRef] = useState(false);
  const [showProductLibPicker, setShowProductLibPicker] = useState(false); // 從素材庫揀產品主圖
  const [showRefLibPicker, setShowRefLibPicker] = useState(false); // 從素材庫揀風格參考圖
  // AI 幫改（指令式修改主題 Prompt）
  const [editingPrompt, setEditingPrompt] = useState(false);
  const [editInstruction, setEditInstruction] = useState("");
  const [applyingEdit, setApplyingEdit] = useState(false);
  // 各圖獨立模式：每格畫面描述的 AI 優化 / AI 幫改
  const [cellOptimizingIdx, setCellOptimizingIdx] = useState<number | null>(null);
  const [cellEditingIdx, setCellEditingIdx] = useState<number | null>(null);
  const [cellEditText, setCellEditText] = useState("");
  const [cellApplying, setCellApplying] = useState(false);

  // 初始化：建立模式讀 layout query；編輯模式（?edit=id）載入既有活動
  useEffect(() => {
    params.then(({ clientId }) => setClientId(clientId));
    const sp = new URLSearchParams(window.location.search);
    const edit = sp.get("edit");
    if (edit) {
      setEditId(edit);
      // layout 覆寫：從單圖編輯頁切過來時，活動的 layoutId 還是 single，用 query 指定的多圖版型
      const override = sp.get("layout");
      fetch(`/api/activities/${edit}`).then((r) => r.json()).then((a) => {
        const storedLid = a.layoutId && a.layoutId !== "single" ? a.layoutId : null;
        const lid = override || storedLid || "two-lr";
        setLayoutId(lid);
        setGenMode(a.genMode === "perCell" ? "perCell" : "unified");
        setTheme(a.imagePrompt || "");
        setMustText(a.titleText || a.focusPoint || "");
        setProductUrls(Array.isArray(a.productImageUrls) ? a.productImageUrls : []);
        setRefUrls(Array.isArray(a.referenceImageUrls) ? a.referenceImageUrls : []);
        setVariantCount(a.variantCount === 2 ? 2 : 1);
        setVariantChoice(a.variantChoice === "B" ? "B" : "A");
        let parsed: Cell[] = [];
        try { parsed = typeof a.cells === "string" ? JSON.parse(a.cells) : (a.cells || []); } catch { parsed = []; }
        const l = getMultiLayout(lid);
        // 有覆寫（單圖轉多圖）→ 用該版型的空格數；否則用既有 cells
        setCells(!override && parsed.length ? parsed : Array.from({ length: l?.count ?? 1 }, emptyCell));
      });
    } else {
      // [MULTI] 這頁是「多圖」頁，預設就選一個多圖版型（避免預設顯示「單圖」造成誤會）；
      //         單圖是刻意選擇 → 由版型選單導去他的單圖頁 /activities/new。
      const p = sp.get("layout") ?? "three-h-top";
      setLayoutId(p);
      const l = getMultiLayout(p);
      setCells(Array.from({ length: l?.count ?? 1 }, emptyCell));
      // [UX] 從單圖頁切過來：帶回共用欄位（主題/必放文字/產品圖），避免重打；讀完清掉
      const raw = sessionStorage.getItem(ACTIVITY_HANDOFF_KEY);
      if (raw) {
        sessionStorage.removeItem(ACTIVITY_HANDOFF_KEY);
        try {
          const h = JSON.parse(raw);
          const cid = window.location.pathname.split("/")[2];  // 只在同一品牌才套用，避免帶到別客戶
          if (h.clientId === cid) {
            if (h.imagePrompt) setTheme(h.imagePrompt);
            if (h.requiredText) setMustText(h.requiredText);
            if (Array.isArray(h.productImageUrls) && h.productImageUrls.length) setProductUrls(h.productImageUrls);
            if (Array.isArray(h.referenceImageUrls) && h.referenceImageUrls.length) setRefUrls(h.referenceImageUrls);
          }
        } catch { /* ignore */ }
      }
    }
  }, [params]);

  const layout = getMultiLayout(layoutId);

  // 離開攔截：新增模式下有內容就攔截（編輯既有活動不算「新草稿」）
  const draftDirty = !editId && (theme.trim() !== "" || mustText.trim() !== "" || productUrls.length > 0 || refUrls.length > 0
    || cells.some((c) => (c.description || "").trim() !== "" || (c.mustText || "").trim() !== "" || (c.assetUrls?.length ?? 0) > 0));
  const saveDraft = async () => {
    const mp = genMode === "unified" ? theme : (cells[0]?.description ?? "");
    const mt = genMode === "unified" ? mustText : (cells[0]?.mustText ?? "");
    const mprod = genMode === "unified" ? productUrls : (cells[0]?.assetUrls ?? []);
    const mrefs = genMode === "unified" ? refUrls : [];
    const mcells = genMode === "perCell" ? cells : [];
    await fetch("/api/activities", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, layoutId, genMode, variantCount, variantChoice, imagePrompt: mp, requiredText: mt, productImageUrls: mprod, referenceImageUrls: mrefs, cells: mcells, status: "DRAFT" }),
    });
  };
  const { dialog: draftDialog } = useUnsavedGuard(draftDirty, saveDraft);

  if (!clientId || !layout) return <div className="text-gray-400 p-8">載入中…</div>;


  const repick = () => setShowPicker(true);

  const handlePickLayout = (id: string) => {
    // 選回單圖：編輯模式暫不支援切回單圖；新增模式跳回單張填寫頁
    if (id === "single") {
      if (editId) {
        alert("編輯模式無法改成單圖，請改用「新增活動」建立單圖。");
        setShowPicker(false);
        return;
      }
      // [UX] 切回單圖：主題／必放文字／產品圖帶過去（單圖頁會預填），不再清空重打；
      // 只有「各圖獨立填寫」有逐格內容、且無法帶過去時才提醒。
      const cellContent = cells.some((c) => c.description || c.mustText || c.assetUrls.length > 0);
      if (genMode === "perCell" && cellContent &&
          !window.confirm("切換為單圖：主題／必放文字／產品圖／參考圖會帶過去，但各格獨立填寫的內容不會保留。確定繼續？")) {
        setShowPicker(false);
        return;
      }
      try {
        sessionStorage.setItem(ACTIVITY_HANDOFF_KEY, JSON.stringify({
          clientId, imagePrompt: theme, requiredText: mustText, productImageUrls: productUrls, referenceImageUrls: refUrls,
        }));
      } catch { /* ignore */ }
      router.push(`/clients/${clientId}/activities/new`);  // [MULTI] 選單圖 → 走他的單圖流程
      return;
    }
    // 換成不同的多圖版型 → 只重設格數，保留共用欄位（主題/必放文字/產品圖/參考圖）
    if (id !== layoutId) {
      const cellContent = cells.some((c) => c.description || c.mustText || c.assetUrls.length > 0);
      // 只有「各圖獨立填寫」有逐格內容時才需確認（格數變了無法保留）；共用欄位一律保留
      if (genMode === "perCell" && cellContent &&
          !window.confirm("切換版型會重設「各圖獨立填寫」的逐格內容（主題／必放文字／產品圖會保留）。確定繼續？")) {
        setShowPicker(false);
        return;
      }
      const l = getMultiLayout(id);
      setCells(Array.from({ length: l?.count ?? 1 }, emptyCell));
      setLayoutId(id);
    }
    setShowPicker(false);
  };

  // 模式 A 圖片上傳
  const addAssets = async (
    files: FileList, max: number, current: string[], setter: (u: string[]) => void
  ) => {
    const room = max - current.length;
    const picked = Array.from(files).slice(0, room);
    const urls = await Promise.all(picked.map(uploadFile));
    setter([...current, ...urls]);
  };

  // 04 素材上傳卡：產品主圖 / 風格參考圖上傳（wrap addAssets，補 busy 狀態俾 AssetUploadCards）
  const onAddProductAsset = async (files: FileList) => {
    setUploadingProduct(true);
    try { await addAssets(files, 5, productUrls, setProductUrls); }
    finally { setUploadingProduct(false); }
  };
  const onAddRefAsset = async (files: FileList) => {
    setUploadingRef(true);
    setAnalyzedDone(false);
    try { await addAssets(files, 1, refUrls, setRefUrls); }
    finally { setUploadingRef(false); }
  };

  // 模式 B 單格上傳
  const addCellAsset = async (idx: number, files: FileList) => {
    const current = cells[idx]?.assetUrls ?? [];
    const room = 5 - current.length;
    if (room <= 0) return;
    const picked = Array.from(files).slice(0, room);
    const urls = await Promise.all(picked.map(uploadFile));
    setCells((prev) => prev.map((c, i) => i === idx ? { ...c, assetUrls: [...c.assetUrls, ...urls].slice(0, 5) } : c));
  };

  const updateCell = (idx: number, patch: Partial<Cell>) =>
    setCells((prev) => prev.map((c, i) => i === idx ? { ...c, ...patch } : c));

  const addCell = () => setCells((prev) => [...prev, emptyCell()]);
  const removeCell = (idx: number) => setCells((prev) => prev.filter((_, i) => i !== idx));

  // 每格畫面描述：AI 優化
  const optimizeCell = async (idx: number) => {
    const d = cells[idx]?.description ?? "";
    if (!d.trim()) return;
    setCellOptimizingIdx(idx);
    try {
      const res = await fetch("/api/ai/optimize-prompt", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: d }),
      });
      const data = await res.json();
      if (data.optimizedPrompt) updateCell(idx, { description: data.optimizedPrompt });
      else alert(data.error ?? "優化失敗，請稍後再試");
    } catch { alert("網路錯誤，請稍後再試"); }
    finally { setCellOptimizingIdx(null); }
  };

  // 每格畫面描述：AI 幫改（指令式修改）
  const applyCellEdit = async (idx: number) => {
    const d = cells[idx]?.description ?? "";
    if (!cellEditText.trim() || !d.trim()) return;
    setCellApplying(true);
    try {
      const res = await fetch("/api/ai/optimize-prompt", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: d, instruction: cellEditText }),
      });
      const data = await res.json();
      if (data.optimizedPrompt) {
        updateCell(idx, { description: data.optimizedPrompt });
        setCellEditingIdx(null); setCellEditText("");
      } else alert(data.error ?? "修改失敗，請稍後再試");
    } catch { alert("網路錯誤，請稍後再試"); }
    finally { setCellApplying(false); }
  };

  const optimizeTheme = async () => {
    if (!theme.trim()) return;
    setOptimizing(true);
    try {
      const res = await fetch("/api/ai/optimize-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: theme }),
      });
      const data = await res.json();
      if (data.optimizedPrompt) {
        setTheme(data.optimizedPrompt);
      } else {
        alert(data.error ?? "優化失敗，請稍後再試");
      }
    } catch {
      alert("網路錯誤，請稍後再試");
    } finally {
      setOptimizing(false);
    }
  };

  // AI 幫改：依指令修改主題 Prompt
  const handleEditPrompt = async () => {
    if (!editInstruction.trim() || !theme.trim()) return;
    setApplyingEdit(true);
    try {
      const res = await fetch("/api/ai/optimize-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: theme, instruction: editInstruction }),
      });
      const data = await res.json();
      if (data.optimizedPrompt) {
        setTheme(data.optimizedPrompt);
        setEditInstruction("");
        setEditingPrompt(false);
      } else {
        alert(data.error ?? "修改失敗，請稍後再試");
      }
    } catch {
      alert("網路錯誤，請稍後再試");
    } finally {
      setApplyingEdit(false);
    }
  };

  // 幫我拆解：把主題交給 AI 分鏡成 N 格 → 帶入各圖 → 切到模式 B
  const splitToCells = async () => {
    if (!theme.trim() || !layout) return;
    setSplitting(true);
    try {
      const res = await fetch("/api/ai/storyboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme, count: layout.count }),
      });
      const data = await res.json();
      if (Array.isArray(data.cells)) {
        // 保留既有素材（若有），只覆寫描述與必放文字
        setCells((prev) =>
          data.cells.map((c: { description: string; mustText: string }, i: number) => ({
            description: c.description ?? "",
            mustText: c.mustText ?? "",
            assetUrls: prev[i]?.assetUrls ?? [],
          }))
        );
        setGenMode("perCell");
        setVariantChoice("A");
      } else {
        alert(data.error ?? "拆解失敗，請稍後再試");
      }
    } catch {
      alert("網路錯誤，請稍後再試");
    } finally {
      setSplitting(false);
    }
  };

  // AI 反推提示詞：分析風格參考圖 → 內容直貼進主題 Prompt
  // opts.url / opts.prompt：由「揀完參考圖自動觸發」傳（state 未更新，直接用），手撳就讀 state（同單圖版 handleAnalyzeStyle 一致）。
  const analyzeRef = async (opts?: { url?: string; prompt?: string }) => {
    const refUrl = opts?.url ?? refUrls[0];
    if (!refUrl) return;
    const preset = (opts?.prompt ?? "").trim();
    setAnalyzedDone(false);
    setAnalyzing(true);
    try {
      let desc = preset;
      if (!desc) {
        const res = await fetch("/api/ai/analyze-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageUrl: refUrl }),
        });
        const data = await res.json();
        desc = data.styleDescription ?? "";
        if (!desc) { alert(data.error ?? "解析失敗，請稍後再試"); return; }
      } else {
        await new Promise((r) => setTimeout(r, 450));
      }
      const sep = theme.trim() ? "\n\n風格參考：" : "風格參考：";
      setTheme(theme + sep + desc);
      setAnalyzedDone(true);
    } catch {
      alert("網路錯誤，請稍後再試");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const mappedPrompt = genMode === "unified" ? theme : (cells[0]?.description ?? "");
      const mappedText = genMode === "unified" ? mustText : (cells[0]?.mustText ?? "");
      const mappedProducts = genMode === "unified" ? productUrls : (cells[0]?.assetUrls ?? []);
      const mappedRefs = genMode === "unified" ? refUrls : [];
      const mappedCells = genMode === "perCell" ? cells : [];

      if (editId) {
        // 編輯模式：PATCH 既有活動 + 重新生成（用明確欄位名，避免無效欄位）
        await fetch(`/api/activities/${editId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            theme: (mappedText || mappedPrompt || "").slice(0, 30) || "未命名活動",
            focusPoint: mappedText,
            titleText: mappedText,
            imagePrompt: mappedPrompt,
            layoutId, genMode,
            variantCount, variantChoice,
            productImageUrls: mappedProducts,
            referenceImageUrls: mappedRefs,
            cells: mappedCells,
            _regenerate: true,
          }),
        });
        router.push(`/clients/${clientId}/activities/${editId}`);
        return;
      }

      // 新增模式：POST 建立
      const res = await fetch("/api/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId, layoutId, genMode,
          variantCount, variantChoice,
          imagePrompt: mappedPrompt,
          requiredText: mappedText,
          productImageUrls: mappedProducts,
          referenceImageUrls: mappedRefs,
          cells: mappedCells,
        }),
      });
      const activity = await res.json();
      router.push(`/clients/${clientId}/activities/${activity.id}`);
    } finally {
      setSaving(false);
    }
  };

  const canExpand = layout.expandable && cells.length < (layout.maxCount ?? layout.count);

  // 生成前必填檢查：統一主題模式靠「活動核心主題 Prompt」；各圖獨立填寫要求每格
  // 都有內容（描述或者自己嘅產品圖）——用「幫我拆解」AI 分鏡帶入描述之後會自動
  // 解鎖；但如果直接撳「各圖獨立填寫」切換過去（cells 由 emptyCell() 全空開始），
  // 就要逐格填夠先解鎖，避免有格完全冇料就照樣送去生成。
  const canSubmit = genMode === "unified"
    ? theme.trim().length > 0
    : cells.length > 0 && cells.every((c) => c.description.trim().length > 0 || c.assetUrls.length > 0);

  return (
    <div className="max-w-3xl space-y-8 pb-10">
      {draftDialog}
      <div>
        {/* 標題（左）+ 版型標示／重選（右）— 與單圖編輯頁一致 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* 編輯模式返去嗰個活動；新增模式（冇 editId）返去 client 主頁，同單圖新增頁一致做法 */}
            <Link href={editId ? `/clients/${clientId}/activities/${editId}` : `/clients/${clientId}`} className="text-gray-400 hover:text-gray-700">
              <ChevronLeft className="h-5 w-5" />
            </Link>
            <h1 className="text-xl font-semibold">{editId ? "編輯活動（多圖）" : "新增活動（多圖）"}</h1>
          </div>
          <button
            type="button"
            onClick={repick}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-violet-600 border border-gray-200 hover:border-violet-300 rounded-lg px-3 py-1.5 transition-all shrink-0 whitespace-nowrap"
          >
            已選版型：<span className="font-medium text-gray-800">{layout.label}</span>
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>
        {/* [UX] 版型結構預覽：填之前就看到會排成什麼（左圖示意，深色＝主圖） */}
        <button
          type="button"
          onClick={repick}
          className="mt-3 w-full flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50/60 hover:border-violet-300 hover:bg-violet-50/30 p-3 text-left transition-all"
        >
          <span className="shrink-0"><LayoutThumb layout={layout} active /></span>
          <div className="min-w-0">
            <div className="text-sm font-medium text-gray-800">{layout.label}</div>
            <div className="text-xs text-gray-500 mt-0.5">左圖為拼版結構示意（深色＝主圖）。填好內容後 AI 會依此結構排版生成；點此可換版型。</div>
          </div>
        </button>
        {editId && (
          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
            儲存後將刪除舊的拼版，重新用 AI 生成新版本。
          </div>
        )}
      </div>

      {/* ── 01 生成設定 ─────────────────────────────────────── */}
      <div className="space-y-4">
        <SectionLabel step="01" title="生成設定" required />

        {/* 生成模式切換 */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">生成模式</Label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setGenMode("unified")}
              className={`flex-1 rounded-xl border px-4 py-2.5 text-sm transition-all ${
                genMode === "unified" ? "border-violet-500 bg-violet-50 text-violet-700" : "border-gray-200 text-gray-500"
              }`}
            >
              統一主題（AI 自動分鏡）
            </button>
            <button
              type="button"
              onClick={() => { setGenMode("perCell"); setVariantChoice("A"); }}
              className={`flex-1 rounded-xl border px-4 py-2.5 text-sm transition-all ${
                genMode === "perCell" ? "border-violet-500 bg-violet-50 text-violet-700" : "border-gray-200 text-gray-500"
              }`}
            >
              各圖獨立填寫（進階）
            </button>
          </div>
        </div>

        {/* 生成款式：統一主題 A 導購/B 敘事係真正唔同文案內容，先開放揀款；
            各圖獨立填寫嘅內容本身由用戶逐格手動填，A/B 冇實質分別，唔顯示（一律 A）。
            暫時只開放一次生成一款（同時生成 2 款會逾時），想要另一款可以再新增一次活動生成。 */}
        {genMode === "unified" && (
          <div className="space-y-2">
            <Label className="text-sm font-medium">生成款式</Label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setVariantCount(1); setVariantChoice("A"); }}
                className={`flex-1 rounded-xl border px-4 py-2.5 text-sm transition-all ${
                  variantChoice === "A" ? "border-violet-500 bg-violet-50 text-violet-700" : "border-gray-200 text-gray-500"
                }`}
              >
                A 導購版
              </button>
              <button
                type="button"
                onClick={() => { setVariantCount(1); setVariantChoice("B"); }}
                className={`flex-1 rounded-xl border px-4 py-2.5 text-sm transition-all ${
                  variantChoice === "B" ? "border-violet-500 bg-violet-50 text-violet-700" : "border-gray-200 text-gray-500"
                }`}
              >
                B 敘事版
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── 模式 A：統一主題 ── */}
      {genMode === "unified" && (
        <div className="space-y-8">
          {/* ── 02 活動核心主題 Prompt ─────────────────────────── */}
          <div className="space-y-4">
            <SectionLabel step="02" title="活動核心主題 Prompt" required />
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">畫面描述 Prompt</Label>
                <div className="flex items-center gap-1.5">
                  {/* 靈感：依品牌想選題，點了直接填入核心主題 */}
                  <InspireButton
                    clientId={clientId}
                    field="theme"
                    onPick={(text) => setTheme(text)}
                  />
                  {/* AI 幫改 */}
                  <button
                    type="button"
                    onClick={() => { setEditingPrompt((v) => !v); setEditInstruction(""); }}
                    disabled={!theme.trim()}
                    className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border transition-all ${
                      !theme.trim()
                        ? "opacity-40 cursor-not-allowed border-gray-200 text-gray-400"
                        : editingPrompt
                        ? "border-blue-300 text-blue-600 bg-blue-50"
                        : "border-gray-200 text-gray-500 hover:bg-gray-50"
                    }`}
                  >
                    <Pencil className="h-3 w-3" />
                    AI 幫改
                  </button>
                  {/* AI 優化提示詞 */}
                  <button
                    type="button"
                    onClick={optimizeTheme}
                    disabled={optimizing || !theme.trim()}
                    className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border border-violet-300 text-violet-600 hover:bg-violet-50 disabled:opacity-40"
                  >
                    {optimizing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                    <span>AI 幫我優化提示詞</span>
                  </button>
                </div>
              </div>
              <textarea
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                rows={4}
                placeholder="例：日系文青風的夏季芒果冰新品上市，整體色彩明亮、有清涼消暑感。"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-300"
              />
              {/* AI 幫改：指令式修改主題 Prompt */}
              {editingPrompt && (
                <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-3 space-y-2">
                  <p className="text-xs font-medium text-blue-700">✏️ 想怎麼改？</p>
                  <input
                    type="text"
                    value={editInstruction}
                    onChange={(e) => setEditInstruction(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleEditPrompt(); } }}
                    placeholder="例：品牌改為 Apple / 加入黃金時段光線"
                    className="w-full border border-blue-200 rounded-md px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-300 placeholder:text-gray-400"
                    autoFocus
                  />
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => { setEditingPrompt(false); setEditInstruction(""); }}
                      className="p-1 text-gray-400 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={handleEditPrompt}
                      disabled={applyingEdit || !editInstruction.trim()}
                      className={`flex items-center gap-1 text-xs px-3 py-1 rounded-md transition-all ${
                        applyingEdit || !editInstruction.trim()
                          ? "opacity-40 cursor-not-allowed bg-blue-300 text-white"
                          : "bg-blue-500 text-white hover:bg-blue-600"
                      }`}
                    >
                      {applyingEdit ? <><Loader2 className="h-3 w-3 animate-spin" />套用中…</> : "應用"}
                    </button>
                  </div>
                </div>
              )}
              {/* 幫我拆解：AI 依版型格數分鏡，帶入各圖並切換至模式 B */}
              <button
                type="button"
                onClick={splitToCells}
                disabled={splitting || !theme.trim()}
                className="mt-1.5 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
              >
                {splitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LayoutGrid className="h-3.5 w-3.5" />}
                <span>{splitting ? "AI 拆解中…" : `幫我拆解並切換至各圖獨立填寫（${layout.count} 格）`}</span>
              </button>
            </div>
          </div>

          {/* ── 03 必放文字 ────────────────────────────────────── */}
          <div className="space-y-4">
            <SectionLabel step="03" title="必放文字" />
            <Field label="必放文字（預設套用至主圖）" hint="AI 文案會包含這些文字">
              <Input
                value={mustText}
                onChange={(e) => setMustText(e.target.value)}
                placeholder="例：Title: 盛夏芒果慶典 / Sub: 第二杯半價 / 日期: 2026/06/15"
              />
            </Field>
          </div>

          {/* ── 04 素材上傳 ────────────────────────────────────── */}
          <div className="space-y-4">
            <SectionLabel step="04" title="素材上傳" />
            <AssetUploadCards
              productUrls={productUrls}
              refUrls={refUrls}
              onAddProduct={onAddProductAsset}
              onRemoveProduct={(i) => setProductUrls(productUrls.filter((_, x) => x !== i))}
              onPickProductLibrary={() => setShowProductLibPicker(true)}
              onAddRef={onAddRefAsset}
              onRemoveRef={(i) => { setRefUrls(refUrls.filter((_, x) => x !== i)); setAnalyzedDone(false); }}
              onPickRefLibrary={() => setShowRefLibPicker(true)}
              uploadingProduct={uploadingProduct}
              uploadingRef={uploadingRef}
              analyzeState={analyzing ? "analyzing" : analyzedDone ? "done" : "idle"}
              onAnalyze={() => analyzeRef()}
              canAnalyze={refUrls.length > 0}
            />
          </div>
        </div>
      )}

      {/* ── 模式 B：各圖獨立 ── */}
      {genMode === "perCell" && (
        <div className="space-y-4">
          <p className="text-xs text-gray-400">各格可獨立設定畫面描述、文字與素材，AI 會分別處理每一張圖。</p>
          <div className={cells.length > 1 ? "grid grid-cols-2 gap-4" : "space-y-4"}>
          {cells.map((cell, i) => {
            const isMain = i === 0;
            const isLast = i === cells.length - 1 && cells.length > 1;
            return (
              <div key={i} className="rounded-xl border border-gray-200 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">圖 {i + 1}</span>
                  <div className="flex items-center gap-1.5">
                    {isMain && <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">主視覺</span>}
                    {isLast && <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">結尾</span>}
                    {layout.expandable && cells.length > layout.count && (
                      <button type="button" onClick={() => removeCell(i)} className="text-gray-400 hover:text-red-500">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-gray-500">畫面描述</Label>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => { setCellEditingIdx(cellEditingIdx === i ? null : i); setCellEditText(""); }}
                        disabled={!cell.description.trim()}
                        className={`flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded border transition-all ${
                          !cell.description.trim() ? "opacity-40 cursor-not-allowed border-gray-200 text-gray-400"
                          : cellEditingIdx === i ? "border-blue-300 text-blue-600 bg-blue-50" : "border-gray-200 text-gray-500 hover:bg-gray-50"
                        }`}
                      >
                        <Pencil className="h-2.5 w-2.5" />AI 幫改
                      </button>
                      <button
                        type="button"
                        onClick={() => optimizeCell(i)}
                        disabled={cellOptimizingIdx === i || !cell.description.trim()}
                        className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded border border-violet-300 text-violet-600 hover:bg-violet-50 disabled:opacity-40"
                      >
                        {cellOptimizingIdx === i ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Sparkles className="h-2.5 w-2.5" />}
                        AI 優化
                      </button>
                    </div>
                  </div>
                  <textarea
                    value={cell.description}
                    onChange={(e) => updateCell(i, { description: e.target.value })}
                    rows={2}
                    placeholder="描述這一格的畫面…"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-300"
                  />
                  {cellEditingIdx === i && (
                    <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-2 space-y-1.5">
                      <input
                        type="text"
                        value={cellEditText}
                        onChange={(e) => setCellEditText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyCellEdit(i); } }}
                        placeholder="想怎麼改？例：改成海邊場景 / 加入金色光暈"
                        className="w-full border border-blue-200 rounded-md px-2 py-1 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
                        autoFocus
                      />
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => applyCellEdit(i)}
                          disabled={cellApplying || !cellEditText.trim()}
                          className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded transition-all ${
                            cellApplying || !cellEditText.trim() ? "opacity-40 cursor-not-allowed bg-blue-300 text-white" : "bg-blue-500 text-white hover:bg-blue-600"
                          }`}
                        >
                          {cellApplying ? <><Loader2 className="h-2.5 w-2.5 animate-spin" />套用中…</> : "應用"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-gray-500">必放文字</Label>
                  <Input
                    value={cell.mustText}
                    onChange={(e) => updateCell(i, { mustText: e.target.value })}
                    placeholder="留白＝不放文字"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-gray-500">上傳產品圖</Label>
                  <AssetStrip label="" sub="" urls={cell.assetUrls} max={5}
                    onAdd={(f) => addCellAsset(i, f)}
                    onRemove={(x) => updateCell(i, { assetUrls: cell.assetUrls.filter((_, k) => k !== x) })} />
                </div>
              </div>
            );
          })}
          </div>

          {canExpand && (
            <button
              type="button"
              onClick={addCell}
              className="w-full rounded-xl border border-dashed border-gray-200 py-3 text-sm text-gray-400 hover:border-violet-300 hover:text-violet-600"
            >
              ＋ 新增一格（上限 {layout.maxCount}）
            </button>
          )}
        </div>
      )}

      {/* AI 開始生成：跟單圖版一致——內嵌喺表單流程底部，靠左，唔用 fixed footer。 */}
      <div className="pt-2">
        <Button type="button" onClick={handleSubmit} disabled={saving || !canSubmit} className="inline-flex items-center gap-1.5 rounded-full bg-violet-600 hover:bg-violet-700 text-white px-6">
          {saving
            ? <><Loader2 className="h-4 w-4 animate-spin" />處理中…</>
            : <><Zap className="h-4 w-4" />{editId ? "儲存並重新生成" : "AI 開始生成"}</>}
        </Button>
      </div>

      {showPicker && (
        <MultiLayoutPicker selectedId={layoutId} onSelect={handlePickLayout} onClose={() => setShowPicker(false)} />
      )}

      {/* 從素材庫選取產品主圖（最多 5 張，逐張加入）*/}
      {showProductLibPicker && (
        <LibraryImagePickerModal
          clientId={clientId}
          title="從素材庫選取產品主圖"
          onPick={(url) => {
            setProductUrls([...productUrls, url].slice(0, 5));
            setShowProductLibPicker(false);
          }}
          onClose={() => setShowProductLibPicker(false)}
        />
      )}

      {/* 從素材庫選取風格參考圖：揀完自動反推提示詞（同單圖版一致）*/}
      {showRefLibPicker && (
        <LibraryImagePickerModal
          clientId={clientId}
          title="從素材庫選取參考圖"
          onPick={(url, promptText) => {
            setRefUrls([url]);
            setShowRefLibPicker(false);
            analyzeRef({ url, prompt: promptText ?? "" });
          }}
          onClose={() => setShowRefLibPicker(false)}
        />
      )}
    </div>
  );
}

// ── 小型素材上傳條 ──────────────────────────────────────────────────────────
function AssetStrip({
  label, sub, urls, max, onAdd, onRemove, size = "sm",
}: {
  label: string; sub: string; urls: string[]; max: number;
  onAdd: (files: FileList) => void; onRemove: (i: number) => void;
  /** "lg" — 同單圖版 UploadZone 一樣：完全未上傳時顯示大隻 dropzone（h-32），
   *  唔再係細細粒 56px tile，等單/多圖兩版嘅「素材上傳」睇落大細一致。
   *  一有圖之後兩種 size 都跟返細 tile row（同單圖版縮返細一致）。 */
  size?: "sm" | "lg";
}) {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const handle = async (files: FileList) => {
    setBusy(true);
    try { await onAdd(files); } finally { setBusy(false); }
  };
  const showBigEmptyZone = size === "lg" && urls.length === 0;
  return (
    <div className="space-y-1.5">
      {label && (
        <div>
          <span className="text-xs font-medium text-gray-600">{label}</span>
          {sub && <span className="text-[10px] text-gray-400 ml-1">{sub}</span>}
        </div>
      )}
      {showBigEmptyZone ? (
        <label className="w-full h-32 flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-gray-200 hover:border-violet-300 hover:bg-violet-50/30 cursor-pointer transition-colors">
          {busy ? <Loader2 className="h-5 w-5 text-gray-300 animate-spin" /> : <ImagePlus className="h-5 w-5 text-gray-300" />}
          <span className="text-xs text-gray-400">點擊或拖曳上傳</span>
          <span className="text-[10px] text-gray-300">{urls.length}/{max}</span>
          <input type="file" accept="image/*" multiple className="hidden"
            onChange={(e) => e.target.files && handle(e.target.files)} />
        </label>
      ) : (
        <div className="flex gap-1.5 flex-wrap">
          {urls.map((url, i) => (
            <div key={i} className="relative w-14 h-14 shrink-0">
              <img src={url} alt="" onClick={() => setPreview(url)}
                className="w-14 h-14 object-cover rounded-lg border border-gray-200 cursor-zoom-in" />
              <button type="button" onClick={(e) => { e.stopPropagation(); onRemove(i); }}
                className="absolute -top-1 -right-1 bg-white rounded-full border shadow-sm p-0.5 hover:bg-red-50">
                <X className="h-2.5 w-2.5 text-gray-500" />
              </button>
            </div>
          ))}
          {urls.length < max && (
            <label className="flex flex-col items-center justify-center gap-1 w-14 h-14 rounded-lg border-2 border-dashed border-gray-200 hover:border-violet-300 cursor-pointer">
              {busy ? <Loader2 className="h-4 w-4 text-gray-300 animate-spin" /> : <ImagePlus className="h-4 w-4 text-gray-300" />}
              <span className="text-[9px] text-gray-300">{urls.length}/{max}</span>
              <input type="file" accept="image/*" multiple className="hidden"
                onChange={(e) => e.target.files && handle(e.target.files)} />
            </label>
          )}
        </div>
      )}
      {preview && (
        <div onClick={() => setPreview(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6 cursor-zoom-out">
          <img src={preview} alt="" onClick={(e) => e.stopPropagation()}
            className="max-h-[85vh] max-w-[85vw] rounded-lg shadow-2xl object-contain" />
        </div>
      )}
    </div>
  );
}
