# AI Design P2 Foundation Completion Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task, inline in the current session. Steps use checkbox syntax. Do not dispatch subagents.

**Goal:** 補齊可編輯文字、可信預覽、比例構圖與設計精修元件，讓無 LLM 的三套設計本身可用。

**Architecture:** DesignSpec 保存唯一 resolved layout；文字與圖形在 preview/editor/export 共用繪製 helper，SavedLayer 保留新增可選欄位。先完成 P2.1，再做 P2.2；每個交付點都可獨立驗收。

**Tech Stack:** TypeScript、Next.js、React、Canvas 2D、sharp、Node test、Prisma 現有 JSON 儲存。

**Spec:** `docs/superpowers/specs/2026-09-09-ai-design-p2-p3-continuation.md`

## Global Constraints

- 不改商品生圖核心、登入 proxy、靈感與 activities 建立圖文主流程。
- 沿用 ML_WIZARD_SEED_KEY 的 `{ layers, docW, docH, clientId }`。
- 舊 SavedLayer、舊 draft 與既有 text fx 向後相容；只為新設計啟用多行模式。
- 所有設計元件保持可編輯；允許既有成品縮圖/下載壓平，不以壓平圖取代圖層資料。
- 於目前 session inline 執行；不使用 subagent。
- 不自動 push、merge、部署。每項測試通過後，只提交該項檔案。

## 已知起點

目前基準 `c49ca17`。35 項既有 ad-layout 測試已通過。未追蹤 `ad-layout-polish.test.ts` 是先前方向的測試草稿，不能先提交成紅燈 main；其每行一文字層假設須改成單一文字物件多行，並擴充用途矩陣。

## Task 1 — 可保存的多行文字契約（P2.1）

**Files:** 新增 `src/lib/magic-layers/editable-text.ts`、`editable-text.test.ts`、`saved-layer.ts`、`saved-layer.test.ts`；修改 `src/components/magic-layers/MagicLayersEditor.tsx`、`ComposeView.tsx`。

**Interfaces:**
```ts
export type TextLayout = { version: 1; wrap: "word"; lineHeight: number; letterSpacing: number };
export type TextLine = { text: string; width: number };
export function layoutText(text: string, maxWidth: number, measure: (text: string) => number): TextLine[];
```
`TextLayout` 保存於 `meta.style.layout`／`SavedLayer.textLayout`。SavedLayer 既有欄位完整搬到 shared module；沿用 `savedToLayerData(sl: SavedLayer): LayerData` 名稱並移出 ComposeView，加入對應可選 layout 映射。EL 增加相同 textLayout；serializeLayers 與 cloneEl 複製新欄位。

- [ ] 寫單元測試：CJK、中英混合、超長無空格字串、明確換行、空行、emoji、單字超寬、零寬度保護。至少包含：
```ts
assert.deepEqual(layoutText("溫和保養", 20, s => [...s].length * 10).map(l => l.text), ["溫和", "保養"]);
assert.deepEqual(layoutText("A\n\nB", 100, s => s.length * 10).map(l => l.text), ["A", "", "B"]);
```
- [ ] 跑 `node --test --experimental-strip-types src/lib/magic-layers/editable-text.test.ts`，確認失敗原因是缺少能力。
- [ ] 實作 grapheme-aware 換行：優先詞邊界、中文逐字、太長單字按 grapheme 拆，保留原始文案；measure 由 Canvas measureText 注入。新增共用 `drawEditableText(ctx, input)`，輸入 text、width、height、font、align、color、layout；行距依 fontSize 計算，框內從頂部排列。
- [ ] 在 drawTextEl 只對宣告 textLayout 的新層使用共用繪製；未宣告時維持現有 fillText、warp、fx 行為。新版多行與 warp 不混用：套用 warp 時明確切回原單行模式，UI 說明並可 undo。
- [ ] 測試 SavedLayer → LayerData → editor serialization 的內容、字級、行距、字距保留；舊 fixture 不增加新的行為旗標。瀏覽器測文字修改、縮放與 undo/redo。
- [ ] 執行文字／保存測試與兩個改動 component 的 eslint；提交 `feat(editor): preserve editable multiline text`。

## Task 2 — 共用文字安全區與比例構圖（P2.1）

**Files:** 新增 `src/lib/magic-layers/ad-layout-composition.ts`、`ad-layout-composition.test.ts`；修改 `ad-layout-design-spec.ts`、`ad-layout-templates.ts`、`ad-layout-renderer.ts`、`ad-layout-quality.ts`、`ad-layout-recipes.ts`、`src/app/api/magic-layers/ad-layout/route.ts`；整理 `ad-layout-polish.test.ts`。

**Interfaces:**
```ts
export type LayoutRect = { x: number; y: number; w: number; h: number };
export type ResolvedAdLayout = {
  templateId: string;
  product: LayoutRect; headline: LayoutRect; subtitle: LayoutRect;
  safePanel: LayoutRect; support: LayoutRect; decoration: LayoutRect; logo: LayoutRect;
};
```
`resolveAdComposition(input)` 接 canvas、direction、purpose、productAspectRatio、headline、subtitle、既有 compositionAdvice，回 ResolvedAdLayout；全部 rect 為畫布像素。DesignSpec 新增 `layout?: ResolvedAdLayout`，舊 spec 缺欄位走原模板；新 pipeline 都傳 layout。

- [ ] 寫矩陣測試：1:1／4:5／9:16／16:9 × 0.28／1／2.4 商品比 × 四用途 × 三方向。檢查 contain、框內安全邊界、商品與文字不重疊、短文案不留下空標題槽。基於可用 zone 驗證商品長軸，不強求所有形狀一樣的面積。
- [ ] 跑 composition、polish 測試確認 red；把草稿中獨立行 layer 斷言改成原始文案完整與 layout 文字測量結果。
- [ ] 在既有六模板內有限調整：寬商品用上下構圖、窄商品優先雙欄或高主體；所有 zone 保留至少 5% 畫布邊距。文字可用空間先確定，再用 measure callback 選字級／行數；headline 以短邊 4–8%、subtitle 2–3.5% 為搜尋範圍，保留層級。達最小字級仍超界，回可辨識的 `copy-too-long` 錯誤，route 回 422 與縮短文案提示，不截字。
- [ ] route 先產生 resolved layout，再將 safePanel 正規化供 resolveTextSafeTreatment 抽樣；將相同 layout 傳入 spec/renderer。修正深色背景選白字的結果傳遞，不能只傳 panelTreatment 而遺失 textColor。
- [ ] 寫測試確認 renderer 商品 bounds、取樣 safePanel、preview 所得 bounds 一致；補上長文案、非有限商品比例的保守 fallback。
- [ ] 跑全部 ad-layout 測試及相關 eslint；提交 `feat(design): resolve aspect-aware composition before rendering`。

## Task 3 — 真實預覽、字型量測與 P2.1 驗收

**Files:** 新增 `src/components/adcreation/AdLayoutPreviewCanvas.tsx`、`src/lib/magic-layers/ad-layout-preview-draw.ts`、`ad-layout-preview-draw.test.ts`；修改 `AdLayoutModal.tsx`、`ad-layout-options.ts`；視 Task 1 helper 邊界更新 MagicLayersEditor。

**Interfaces:** `drawAdLayoutPreview(ctx, layers, images)` 接 CanvasRenderingContext2D、LayerData[]、以 URL 為 key 的已載入圖片 map；按 zIndex、opacity、visibility、rotation 繪製。文字用 Task 1 helper。只有容器縮放，不改文字／投影樣式。

- [ ] 寫測試確認排序、隱藏層、透明度與 text layout 由實際層取得；render 產生的 subtitle/logo/兩個 panel 都保留，不只取第一個。
- [ ] 跑 preview 測試確認 red。移除 Modal 的人工 CSS 漸層、drop-shadow、固定 11px 標題。繪製商品、文字、shape 和 logo 的真實資料。
- [ ] preview 等 document.fonts.ready 後用實際字型量測新文字層；若比伺服器估計更寬，只有限縮字／換行並更新同一份候選 LayerData，選入 seed 必須是修正後版本。效果字沿用舊行為，不混用新多行調整。
- [ ] 瀏覽器以 fixture 檢查預覽、editor、PNG；若圖片載入失敗顯示該候選錯誤與重試，不把缺商品的 preview 當作完成。取消或切換候選時清理過期載入結果。
- [ ] 跑 ad-layout／editable-text／saved-layer 測試、eslint、`npx prisma generate`、`npx tsc --noEmit`、`npm run build`。截圖檢查三尺寸和三商品比，記錄實測環境與未測項。
- [ ] 更新 `docs/AI-LAYOUT-HANDOFF.md`，提交 `fix(design): preview the actual editable composition`。P2.1 可獨立交付。

## Task 4 — 可保存的漸層與柔和投影（P2.2）

**Files:** 新增 `src/lib/magic-layers/editable-shape.ts`、`editable-shape.test.ts`；修改 `saved-layer.ts`、MagicLayersEditor、preview-draw、ad-layout-renderer、ad-layout-design-spec、ad-layout-data。

**Interfaces:** 保留現有 ShapeSpec，增加 `gradient?: { axis: "horizontal" | "vertical"; from: string; to: string }`、`softness?: number`（0..1）。不增加任意 SVG 或 shader 欄位；新增參數有界且預設 undefined。shared `drawEditableShape(ctx, width, height, shape)` 用同一種座標原點。

- [ ] 寫 gradient／softness 序列化 round-trip、舊 shape fallback、無效參數拒絕測試；在 canvas 渲染 fixture 上比較透明邊緣與實色中心。
- [ ] 跑測試確認 red。移出既有 drawShapeEl，保留所有舊 shape/icon 行為。linear gradient 用 CanvasGradient；soft ellipse 用有界 alpha falloff，避免依賴不一致的 canvas filter。
- [ ] 在 shape 面板提供開關與有限調整，serialize／restore／clone／thumbnail／export 全部用新 shape。文字安全區用與 gradient 同方向的策略並檢查最不利區域對比，不只看全區平均色。
- [ ] 商品投影根據實際 contain 後 bounds 建立。現有 surface 分類沒有接觸位置，不將投影標為物理接觸陰影；無可靠依據使用懸浮預設。
- [ ] 跑新測試、既有 shape 行為與瀏覽器 save/reopen/export；提交 `feat(editor): add editable gradient and soft-shadow shapes`。

## Task 5 — 語意圖示與賣點設計（P2.2）

**Files:** 新增 `src/lib/magic-layers/ad-layout-graphics.ts`、`ad-layout-graphics.test.ts`；修改 editable-shape、ad-layout-creative-brief、gap-analysis、design-spec、renderer、quality、recipes、AdLayoutModal、ad-layout route。

**Interfaces:**
```ts
export type BenefitInput = { id: string; text: string };
export type BenefitGraphic = { benefitId: string; icon: "water-drop" | "spring" | "blade" | "shield" | "sparkle" | "leaf" | null };
export function matchBenefitGraphic(benefit: BenefitInput): BenefitGraphic;
```
Modal 在賣點用途提供最多三條選填賣點；API 每條最多 40 grapheme，超出回 400，可見且不靜默截字。來源是本次使用者輸入，不自動創造產品功效。

- [ ] 寫明確語詞（保濕／吸震／刀片）匹配、未知詞 null、空內容拒絕與三條上限測試。加入「不保濕」等否定句測試，避免誤配肯定功能 icon。
- [ ] 跑測試確認 red。建立有限線條 icon paths，沿用已有八種 icon；只允許 registry ID。brand token 控制顏色、線寬、badge，保持同组一致。
- [ ] gap plan 新增 benefit-group，選擇 group 時省略 competing support 縮圖。商品、文字、最多三個賣點區整體解 layout，空間不足退文字列表，不縮成不可讀小圖。
- [ ] 每個圖示、badge、文字保持独立圖層，共用 groupId；不假設現有編輯器提供 group drag。測試未知 icon 仍保存完整文字。
- [ ] 瀏覽器測 icon 改色、文字編輯、移動、undo、save/reopen/export。跑全部範圍測試、lint、Prisma/tsc、build；更新 handoff，提交 `feat(design): compose grounded benefit graphics`。

## P2 完成門檻

P2.1 與 P2.2 都完成驗收才進 P3。保留固定 fixture 截圖與測試紀錄，明確區分規則通過與人工視覺評估。未要求部屬；結果供使用者確認後整合。
