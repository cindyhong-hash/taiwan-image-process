# 廣告圖文入口頁 Phase 2a Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `/clients/[clientId]/activities` 重建成 `ad-creation-page` 設計(開始創作標題 + 橫向品牌記憶列 + 3 張創作卡 + 最近圖文),只接「全新生成 → 生成類型 popup」。

**Architecture:** 沿用現有 client/activities 資料與既有列表邏輯(ActivityRow/搜尋/狀態篩選/刪除),新增 3 個展示型元件(Header/BrandMemoryBar/CreationCards),重寫入口頁 JSX 組合它們;移除與側欄重複的 BrandWorkspaceHeader。全新生成卡開啟既有 `NewActivityModal`。

**Tech Stack:** Next.js 16 App Router、React 19、Tailwind、lucide-react。

**Spec:** `docs/superpowers/specs/2026-08-28-adcreation-phase2a-design.md`
**Figma:** file `eJWa63TxE9W5Kphk7e2jig`,frame `ad-creation-page`(用 get_screenshot 對照)。

## Global Constraints
- 不改 Prisma schema / API 行為 / 生成流程 / 既有 popup 元件。維持 Turso。
- 只做入口頁;「套用素材底圖」「自由排版」兩卡**只做視覺、onClick 留白**(不接 library picker / blank 畫布)。
- 沿用既有列表邏輯與資料:`GET /api/clients/[id]`(client + activities + generatedLayouts + primaryColor/secondaryColor/paletteColors/toneLabels/taboos)。
- 主色 violet;風格禁忌用紅色 chips;paletteColors 是 JSON 字串(沿用 Phase 1 parseColors 解法)。
- 每 task 驗收:`npx tsc --noEmit` 乾淨 + `npx eslint <改動檔>` 無新 error + 瀏覽器對照 Figma(controller 驗)。無單元測試框架。
- 每 task commit;branch `feat/home-redesign-v2`。不要 `git add -A`(prisma db/dump 檔須維持 untracked)。

---

## File Structure
新建:
- `src/components/adcreation/AdCreationHeader.tsx` — 標題 + 副標
- `src/components/adcreation/BrandMemoryBar.tsx` — 橫向品牌記憶列
- `src/components/adcreation/CreationCards.tsx` — 3 張創作卡
改:
- `src/app/clients/[clientId]/activities/page.tsx` — 重建版面(保留既有列表邏輯)
重用不改:`NewActivityModal`、既有 `ActivityRow`(在 activities/page.tsx 內)。

---

## Task 1: AdCreationHeader + BrandMemoryBar

**Files:**
- Create: `src/components/adcreation/AdCreationHeader.tsx`、`src/components/adcreation/BrandMemoryBar.tsx`

**Interfaces:**
- Produces: `<AdCreationHeader />`;`<BrandMemoryBar clientId primaryColor secondaryColor paletteColors toneLabels taboos />`

- [ ] **Step 1: AdCreationHeader**

```tsx
export function AdCreationHeader() {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-bold text-gray-900">開始創作廣告圖</h1>
      <p className="mt-1 text-sm text-gray-400">選擇創作方式，快速生成你的專屬素材</p>
    </div>
  );
}
```

- [ ] **Step 2: BrandMemoryBar**(橫向;色票 + 風格 chips + 禁忌紅 chips + 編輯;paletteColors JSON 字串安全解析)

```tsx
import Link from "next/link";
import { ShieldCheck, Settings } from "lucide-react";

function parseColors(data: unknown): string[] {
  if (Array.isArray(data)) return data.filter((x): x is string => typeof x === "string");
  if (typeof data === "string") { try { const v = JSON.parse(data); return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []; } catch { return []; } }
  return [];
}

export function BrandMemoryBar({ clientId, primaryColor, secondaryColor, paletteColors, toneLabels = [], taboos = [] }: {
  clientId: string; primaryColor?: string; secondaryColor?: string | null; paletteColors?: unknown; toneLabels?: string[]; taboos?: string[];
}) {
  const swatches = [primaryColor, secondaryColor, ...parseColors(paletteColors)].filter((c): c is string => !!c).filter((c, i, a) => a.indexOf(c) === i).slice(0, 4);
  return (
    <div className="mb-6 flex flex-wrap items-center gap-x-8 gap-y-3 rounded-2xl border border-gray-200 bg-white px-5 py-4">
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-100"><ShieldCheck className="h-4 w-4 text-violet-600" /></span>
        <div className="leading-tight">
          <div className="text-sm font-semibold text-gray-900">AI 品牌記憶</div>
          <div className="text-[11px] text-gray-400">已套用你的品牌設定</div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500">視覺基調</span>
        <div className="flex gap-1.5">{swatches.map((c, i) => <span key={i} className="h-7 w-7 rounded-md border border-gray-100" style={{ background: c }} />)}</div>
      </div>
      {toneLabels.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">視覺風格</span>
          <div className="flex flex-wrap gap-1.5">{toneLabels.map((t) => <span key={t} className="rounded-md bg-violet-50 px-2 py-0.5 text-xs text-violet-600">{t}</span>)}</div>
        </div>
      )}
      {taboos.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-red-500">風格禁忌</span>
          <div className="flex flex-wrap gap-1.5">{taboos.map((t) => <span key={t} className="rounded-md bg-red-50 px-2 py-0.5 text-xs text-red-500">{t}</span>)}</div>
        </div>
      )}
      <Link href={`/clients/${clientId}/settings`} className="ml-auto flex items-center gap-1.5 rounded-lg border border-violet-200 px-3 py-1.5 text-xs font-medium text-violet-600 hover:bg-violet-50">
        <Settings className="h-3.5 w-3.5" /> 編輯品牌設定
      </Link>
    </div>
  );
}
```

- [ ] **Step 3: tsc** — `npx tsc --noEmit`(0 errors)
- [ ] **Step 4: commit** — `git add src/components/adcreation/AdCreationHeader.tsx src/components/adcreation/BrandMemoryBar.tsx && git commit -m "feat(adcreation): 標題 + 橫向品牌記憶列"`

---

## Task 2: CreationCards（3 張創作卡）

**Files:**
- Create: `src/components/adcreation/CreationCards.tsx`

**Interfaces:**
- Consumes: `onNewGenerate: () => void`（卡1 開啟生成類型 popup 的回呼，由入口頁提供）
- Produces: `<CreationCards onNewGenerate={fn} />`。卡2/卡3 onClick 留白（不接）。

- [ ] **Step 1: CreationCards**（卡1「全新生成」按鈕 → onNewGenerate;卡2/3 按鈕先 no-op）

```tsx
import { Sparkles, Image as ImageIcon, LayoutTemplate, ArrowRight } from "lucide-react";

export function CreationCards({ onNewGenerate }: { onNewGenerate: () => void }) {
  return (
    <div className="mb-8 grid grid-cols-3 gap-4">
      {/* 卡1 全新生成（推薦，violet 虛線框）— 本 Phase 接 popup */}
      <div className="relative rounded-2xl border-2 border-dashed border-violet-300 bg-white p-5">
        <span className="absolute right-4 top-4 rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-600">推薦</span>
        <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-violet-600 text-sm font-bold text-white">AI</span>
        <div className="text-lg font-semibold text-gray-900">全新生成</div>
        <p className="mt-1 mb-5 text-sm text-gray-400">描述需求、貼上參考，AI 會為你全新生成專屬素材</p>
        <button type="button" onClick={onNewGenerate} className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700">
          開始創作 <ArrowRight className="h-4 w-4" />
        </button>
      </div>
      {/* 卡2 套用素材底圖 — 本 Phase 視覺卡，onClick 留白 */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-blue-100 text-blue-500"><ImageIcon className="h-5 w-5" /></span>
        <div className="text-lg font-semibold text-gray-900">套用素材底圖</div>
        <p className="mt-1 mb-5 text-sm text-gray-400">選擇專業的造型與素材，快速套用內容</p>
        <button type="button" className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
          選擇底圖 <ArrowRight className="h-4 w-4" />
        </button>
      </div>
      {/* 卡3 自由排版（NEW）— 本 Phase 視覺卡，onClick 留白 */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <span className="absolute-none" />
        <div className="mb-4 flex items-start justify-between">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-100 text-violet-500"><LayoutTemplate className="h-5 w-5" /></span>
          <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-600">NEW</span>
        </div>
        <div className="text-lg font-semibold text-gray-900">自由排版</div>
        <p className="mt-1 mb-5 text-sm text-gray-400">選擇專業的底圖與素材，自由移動，打造專屬設計</p>
        <button type="button" className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
          開始創作 <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
```

（`absolute-none` 佔位 span 可移除；保持結構乾淨。實作時對照 Figma `ad-creation-page` 微調色/間距。）

- [ ] **Step 2: tsc** — 0 errors
- [ ] **Step 3: commit** — `git add src/components/adcreation/CreationCards.tsx && git commit -m "feat(adcreation): 3 張創作卡（全新生成接 popup;另兩卡視覺留白）"`

---

## Task 3: 重建入口頁 `/clients/[clientId]/activities`

把入口頁重組為:Header + BrandMemoryBar + CreationCards + 最近圖文。**保留**現有列表邏輯(client 抓取、`ActivityRow`、`actSearch`、`actStatus`、狀態篩選、`handleDelete`、多選/批次 若有)。移除 `BrandWorkspaceHeader` 與 `BrandMemoryCards`。全新生成卡開啟 `NewActivityModal`。

**Files:**
- Modify: `src/app/clients/[clientId]/activities/page.tsx`（先完整 Read 現況，保留列表相關 state/handler/ActivityRow，只重排 JSX + 換掉頂部）

**Interfaces:**
- Consumes: `AdCreationHeader`、`BrandMemoryBar`、`CreationCards`（Task 1-2）;`NewActivityModal`（現有,props 見其檔案:至少 `clientId` + `onClose`）
- 新增 state:`const [showTypeModal, setShowTypeModal] = useState(false)`;卡1 `onNewGenerate={() => setShowTypeModal(true)}`;render `{showTypeModal && <NewActivityModal clientId={clientId} onClose={() => setShowTypeModal(false)} />}`（實作時對照 NewActivityModal 實際 props）

- [ ] **Step 1: Read 現況**：完整讀 `src/app/clients/[clientId]/activities/page.tsx`，記下要保留的:client fetch、`ActivityRow` 元件、`actSearch`/`actStatus` state、狀態篩選陣列、`handleDelete`、列表渲染。確認 `NewActivityModal` 的 props（讀 `src/components/activities/NewActivityModal.tsx`）。

- [ ] **Step 2: 重排 JSX**：
  - 移除 `import { BrandWorkspaceHeader }` 與 `import { BrandMemoryCards }` 及其使用。
  - import `AdCreationHeader`/`BrandMemoryBar`/`CreationCards` + `NewActivityModal`。
  - 頁面外層容器（可用 `max-w-6xl` 之類，對齊 Figma 內容寬）。
  - 依序:`<AdCreationHeader />`、`<BrandMemoryBar clientId={clientId} primaryColor={client.primaryColor} secondaryColor={client.secondaryColor} paletteColors={client.paletteColors} toneLabels={client.toneLabels} taboos={client.taboos} />`、`<CreationCards onNewGenerate={() => setShowTypeModal(true)} />`。
  - 「最近圖文」區塊:標題「最近圖文」+ 現有搜尋框 + 狀態篩選 chips + 現有 `ActivityRow` 列表(沿用篩選後的 activities)。保留刪除。
  - 末尾:`{showTypeModal && <NewActivityModal clientId={clientId} onClose={() => setShowTypeModal(false)} />}`。
  - 保留 client 載入中/空狀態。

- [ ] **Step 3: tsc + eslint** — `npx tsc --noEmit`(0);`npx eslint "src/app/clients/[clientId]/activities/page.tsx"`(no new error;既有 no-img-element warning 可接受)

- [ ] **Step 4: commit** — `git add "src/app/clients/[clientId]/activities/page.tsx" && git commit -m "feat(adcreation): 重建廣告圖文入口頁（標題+品牌記憶列+3卡+最近圖文，移除重複 tab）"`

---

## Task 4: 視覺對齊 + 接線驗證（controller）

- [ ] **Step 1: 對照 Figma**：`get_screenshot` frame `ad-creation-page`(file `eJWa63TxE9W5Kphk7e2jig`),與實際頁面比對(標題/品牌記憶列/3 卡/最近圖文),微調色/間距/圓角。
- [ ] **Step 2: 接線驗證(dev server 瀏覽器)**：
  - 全新生成 → 出 `NewActivityModal`(單圖/多圖選擇);選單圖→`/activities/new`;選多圖版型→`/activities/new/multi`。
  - 套用素材底圖 / 自由排版 → 按鈕在但不觸發流程(留白,正常)。
  - 最近圖文:真實活動、搜尋、狀態篩選、刪除、點入 `/activities/[id]`。
  - 側欄 nav「廣告圖文」active;頁內無重複 tab。
- [ ] **Step 3: tsc/eslint 全綠**
- [ ] **Step 4: push** — `git push mine feat/home-redesign-v2`(Vercel 預覽)
- [ ] **Step 5: commit(若有微調)** — `git commit -m "polish(adcreation): 對齊 Figma ad-creation-page"`

---

## Self-Review 註記
- Spec 各項對應:入口頁(T3)、標題+品牌記憶列(T1)、3 卡(T2,卡1接 popup、另兩卡留白)、最近圖文(T3 沿用現有)、移除重複 tab(T3)、接線驗證(T4)。
- 型別一致:BrandMemoryBar props(clientId/primaryColor/secondaryColor/paletteColors/toneLabels/taboos)、CreationCards(onNewGenerate)跨 T1/T2/T3 一致。
- 待實作確認(非 placeholder,對照現有 code):NewActivityModal 實際 props(T3 Step1 讀檔確認);現有 activities/page.tsx 的列表 state/handler 名稱(T3 Step1 讀檔保留)。
- 兩卡行為留白為 spec 明確要求(非缺漏)。
