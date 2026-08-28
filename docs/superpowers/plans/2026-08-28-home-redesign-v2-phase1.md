# 首頁 Redesign v2 — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把品牌工作區改成設計稿的「全域 nav + 品牌切換器 + 首頁 dashboard」(Shell + Dashboard 版面 + 真實資料區塊)。

**Architecture:** 沿用現有 `MainLayout`(flex: sidebar + main),重寫 `Sidebar` 為 logo+切換器+全域 nav+使用者;把活動列表從 `/clients/[clientId]` 搬到 `/activities`,首頁位置放新 dashboard(Hero+搜尋框殼、開始創作卡、最近作品、右欄品牌記憶/已學習/推薦)。維持 Turso,不動 API/Prisma schema。

**Tech Stack:** Next.js 16 App Router、React 19、Tailwind、lucide-react、既有 `@/api/clients`。

**Spec:** `docs/superpowers/specs/2026-08-28-home-redesign-v2-phase1-design.md`

**Figma:** file `eJWa63TxE9W5Kphk7e2jig`,dashboard node `28:3175`。子節點:sidebar `235:1466`、top-header `28:3224`、hero+search `28:3240`、開始創作 `28:3265`、最近作品 `28:3328`、右欄 `28:3388`(品牌記憶 `28:3389`/已學習 `28:3420`/推薦 `28:3436`)。實作各 UI task 時用 `get_design_context`/`get_screenshot` 取該節點精確顏色/間距。

## Global Constraints

- 不改 Prisma schema、不改既有 API 行為、不動 magic-layers 獨立編輯器。
- 維持 Turso;不引入新後端。
- 沿用既有元件與資料形狀:`GET /api/clients`(品牌清單)、`GET /api/clients/[id]`(含 activities+generatedLayouts、primaryColor/secondaryColor/paletteColors/toneLabels/taboos)。
- 主色 violet(實作時抓精確 hex);狀態徽章 已完成=綠/生成中=紫或琥珀/草稿=灰。
- 每個 task 驗收關卡:`npx tsc --noEmit` 乾淨 + `npx eslint <改動檔>` 無新 error + dev server(`marketing-dev`,localhost)瀏覽器對照 Figma 截圖。本專案無單元測試框架,不寫 pytest/jest。
- 每個 task 結束 commit;branch = `feat/home-redesign-v2`(推 `mine`)。

---

## File Structure

新建:
- `src/lib/lastClient.ts` — 記住上次品牌 id(localStorage)
- `src/components/layout/BrandSwitcher.tsx` — 品牌切換下拉
- `src/components/layout/SidebarNav.tsx` — 全域 nav 四項
- `src/components/layout/SidebarUser.tsx` — 底部使用者
- `src/components/layout/TopHeader.tsx` — 頂欄(help+通知,靜態)
- `src/components/home/HomeHero.tsx` — 標題+搜尋框殼+chips
- `src/components/home/QuickStartCards.tsx` — 開始創作 3 卡
- `src/components/home/RecentWorks.tsx` — tabs + 作品卡牆
- `src/components/home/WorkCard.tsx` — 單一作品卡
- `src/components/home/BrandMemoryPanel.tsx` — 右欄品牌記憶
- `src/components/home/AiLearnedCard.tsx` — 已學習(素材數+完成度)
- `src/components/home/ReuseRecommendCard.tsx` — 再利用推薦(視覺殼)
- `src/lib/brandCompleteness.ts` — 完成度 derived 公式
- `src/app/clients/[clientId]/activities/page.tsx` — 活動列表(搬移自現首頁)

改:
- `src/components/layout/Sidebar.tsx` — 重寫為 logo+BrandSwitcher+SidebarNav+SidebarUser
- `src/components/layout/MainLayout.tsx` — 版面微調 + TopHeader
- `src/app/clients/[clientId]/page.tsx` — 改為 dashboard
- `src/app/page.tsx` — 導向上次品牌

---

## Task 1: `lastClient` util(記住上次品牌)

**Files:**
- Create: `src/lib/lastClient.ts`

**Interfaces:**
- Produces: `setLastClientId(id: string): void`、`getLastClientId(): string | null`

- [ ] **Step 1: 建立 util**（沿用 `lastClientTab.ts` 的 try/catch localStorage 寫法）

```ts
// src/lib/lastClient.ts
const KEY = "lastClientId";
export function setLastClientId(id: string): void {
  try { localStorage.setItem(KEY, id); } catch { /* ignore */ }
}
export function getLastClientId(): string | null {
  try { return localStorage.getItem(KEY); } catch { return null; }
}
```

- [ ] **Step 2: tsc**

Run: `npx tsc --noEmit` — Expected: 0 errors

- [ ] **Step 3: commit**

```bash
git add src/lib/lastClient.ts
git commit -m "feat(home): lastClientId util（記住上次品牌）"
```

---

## Task 2: 活動列表搬到 `/activities`，首頁暫時 redirect

把現有 `/clients/[clientId]/page.tsx`（活動列表）原封搬到 `/clients/[clientId]/activities/page.tsx`，
首頁暫時 redirect 到 `/activities`（下一批 task 再換成 dashboard）。這樣 app 全程可用。

**Files:**
- Create: `src/app/clients/[clientId]/activities/page.tsx`（= 舊 page.tsx 內容原封）
- Modify: `src/app/clients/[clientId]/page.tsx`（改成 redirect）

**Interfaces:**
- Produces: 路由 `/clients/[clientId]/activities` = 活動列表

- [ ] **Step 1: 複製舊首頁內容到 activities**

```bash
git mv "src/app/clients/[clientId]/page.tsx" "src/app/clients/[clientId]/activities/page.tsx"
```

- [ ] **Step 2: 新建首頁 redirect（暫時）**

```tsx
// src/app/clients/[clientId]/page.tsx
import { redirect } from "next/navigation";
export default async function ClientHome({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  redirect(`/clients/${clientId}/activities`);
}
```

- [ ] **Step 3: 修 activities/page.tsx 內的 setLastClientTab 呼叫**（若 tab 值有寫死，維持 `"activities"`；確認 import 路徑仍正確）

- [ ] **Step 4: tsc + 瀏覽器**

Run: `npx tsc --noEmit`（0 errors）
瀏覽器:`preview_start {name:"marketing-dev"}` → 開 `/clients/<id>` 應轉到 `/activities` 且活動列表正常顯示（縮圖/狀態）。

- [ ] **Step 5: commit**

```bash
git add -A
git commit -m "refactor(home): 活動列表搬到 /activities，首頁暫時 redirect"
```

---

## Task 3: `BrandSwitcher`（品牌切換下拉）

**Files:**
- Create: `src/components/layout/BrandSwitcher.tsx`
- Test: 瀏覽器手動

**Interfaces:**
- Consumes: `GET /api/clients` → `{id,name}[]`；`getLastClientId`/`setLastClientId`（Task 1）
- Produces: `<BrandSwitcher currentClientId={string} />`；切換時 `router.push` 到新品牌的同一 nav 段（首頁預設）並 `setLastClientId`

- [ ] **Step 1: 實作**（先抓 Figma `64:5261` switcher 精確樣式）

```tsx
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Plus } from "lucide-react";
import { setLastClientId } from "@/lib/lastClient";

type Brand = { id: string; name: string };

export function BrandSwitcher({ currentClientId }: { currentClientId: string }) {
  const router = useRouter();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => { fetch("/api/clients").then(r => r.json()).then(setBrands).catch(() => {}); }, []);
  const current = brands.find(b => b.id === currentClientId);
  const pick = (id: string) => { setOpen(false); setLastClientId(id); router.push(`/clients/${id}`); };
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(v => !v)}
        className="flex w-full items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50">
        <span className="truncate font-medium text-gray-800">{current?.name ?? "選擇品牌"}</span>
        <ChevronDown className="h-3 w-3 text-gray-400" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 z-50 mt-1 rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
            {brands.map(b => (
              <button key={b.id} type="button" onClick={() => pick(b.id)}
                className={`block w-full px-3 py-2 text-left text-sm hover:bg-gray-50 ${b.id === currentClientId ? "text-violet-600 font-medium" : "text-gray-700"}`}>
                {b.name}
              </button>
            ))}
            <div className="my-1 border-t border-gray-100" />
            <button type="button" onClick={() => { setOpen(false); router.push("/clients/new"); }}
              className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-sm text-gray-600 hover:bg-gray-50">
              <Plus className="h-3.5 w-3.5" /> 新增品牌
            </button>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: tsc** — `npx tsc --noEmit`（0 errors）
- [ ] **Step 3: commit** — `git add -A && git commit -m "feat(home): BrandSwitcher 品牌切換下拉"`

（此元件在 Task 5 接進 Sidebar 後才在畫面出現;本 task 只確保編譯與獨立正確。）

---

## Task 4: `SidebarNav` + `SidebarUser`

**Files:**
- Create: `src/components/layout/SidebarNav.tsx`、`src/components/layout/SidebarUser.tsx`

**Interfaces:**
- Consumes: `usePathname`；`currentClientId`
- Produces: `<SidebarNav currentClientId={string} />`（首頁/廣告圖文/素材庫/品牌設定,active 高亮）;`<SidebarUser />`

- [ ] **Step 1: SidebarNav**（Figma `64:5265`;icon 對應 home/shopping-bag/image/settings）

```tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, ShoppingBag, Image as ImageIcon, Settings } from "lucide-react";

export function SidebarNav({ currentClientId }: { currentClientId: string }) {
  const pathname = usePathname();
  const base = `/clients/${currentClientId}`;
  const items = [
    { label: "首頁", href: base, icon: Home, match: (p: string) => p === base },
    { label: "廣告圖文", href: `${base}/activities`, icon: ShoppingBag, match: (p: string) => p.startsWith(`${base}/activities`) },
    { label: "素材庫", href: `${base}/components`, icon: ImageIcon, match: (p: string) => p.startsWith(`${base}/components`) },
    { label: "品牌設定", href: `${base}/settings`, icon: Settings, match: (p: string) => p.startsWith(`${base}/settings`) },
  ];
  return (
    <nav className="flex flex-col gap-1">
      {items.map(({ label, href, icon: Icon, match }) => {
        const active = match(pathname);
        return (
          <Link key={label} href={href}
            className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm transition-colors ${active ? "bg-violet-50 text-violet-700 font-medium" : "text-gray-600 hover:bg-gray-50"}`}>
            <Icon className={`h-5 w-5 ${active ? "text-violet-600" : "text-gray-400"}`} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 2: SidebarUser**（Figma `64:5291`;先用靜態 Cindy/管理員 + 頭像佔位,之後接真實使用者）

```tsx
export function SidebarUser() {
  return (
    <div className="flex items-center gap-2 rounded-lg px-2 py-2">
      <div className="h-9 w-9 shrink-0 rounded-full bg-gray-200" />
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-gray-800">Cindy</div>
        <div className="text-xs text-gray-400">管理員</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: tsc** — 0 errors
- [ ] **Step 4: commit** — `git commit -m "feat(home): SidebarNav 全域導覽 + SidebarUser"`

---

## Task 5: 重寫 `Sidebar`（組裝 shell）

把現有品牌清單 `Sidebar` 換成:Content logo + `BrandSwitcher` + `SidebarNav` + `SidebarUser`。
`Sidebar` 需要知道 currentClientId — 由 `usePathname` 解析 `/clients/<id>/...`。

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`（重寫）

**Interfaces:**
- Consumes: BrandSwitcher/SidebarNav/SidebarUser;`usePathname`
- 若當前路由沒有 clientId（例如 `/clients` 清單頁）→ 隱藏 switcher/nav,只顯示 logo（挑品牌頁不需要品牌 nav）

- [ ] **Step 1: 重寫 Sidebar**

```tsx
"use client";
import { usePathname } from "next/navigation";
import { PanelLeft } from "lucide-react";
import { BrandSwitcher } from "./BrandSwitcher";
import { SidebarNav } from "./SidebarNav";
import { SidebarUser } from "./SidebarUser";

export function Sidebar() {
  const pathname = usePathname();
  const m = pathname.match(/^\/clients\/([^/]+)/);
  const clientId = m && m[1] !== "new" ? m[1] : null;
  return (
    <aside className="flex w-[220px] shrink-0 flex-col border-r border-gray-200 bg-white p-4">
      <div className="mb-6 flex items-center justify-between px-1">
        <span className="text-lg font-bold text-gray-900">Content</span>
        <PanelLeft className="h-5 w-5 text-gray-400" />
      </div>
      {clientId && (
        <>
          <div className="mb-4"><BrandSwitcher currentClientId={clientId} /></div>
          <SidebarNav currentClientId={clientId} />
        </>
      )}
      <div className="mt-auto"><SidebarUser /></div>
    </aside>
  );
}
```

- [ ] **Step 2: tsc + eslint**（0 errors;移除舊 Sidebar 未用的 import/檔案內死碼）
- [ ] **Step 3: 瀏覽器驗證**：開 `/clients/<id>/activities` → 側欄顯示 Content + 切換器 + 四項 nav(廣告圖文 active) + 使用者;切換器換品牌可跳轉;`/clients` 清單頁側欄只有 logo。對照 Figma `235:1466`。
- [ ] **Step 4: commit** — `git commit -m "feat(home): 重寫 Sidebar 為全域 nav + 品牌切換器 shell"`

---

## Task 6: `TopHeader` + 接進 `MainLayout`

**Files:**
- Create: `src/components/layout/TopHeader.tsx`
- Modify: `src/components/layout/MainLayout.tsx`

**Interfaces:**
- Produces: `<TopHeader />`（help-circle + bell + 靜態 badge 3,靠右）

- [ ] **Step 1: TopHeader**（Figma `28:3224`/`106:265`）

```tsx
import { HelpCircle, Bell } from "lucide-react";
export function TopHeader() {
  return (
    <header className="flex h-16 items-center justify-end gap-4 border-b border-gray-100 bg-white px-8">
      <button type="button" className="text-gray-400 hover:text-gray-600"><HelpCircle className="h-5 w-5" /></button>
      <button type="button" className="relative text-gray-400 hover:text-gray-600">
        <Bell className="h-5 w-5" />
        <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-medium text-white">3</span>
      </button>
    </header>
  );
}
```

- [ ] **Step 2: 接進 MainLayout**（main 上方固定 TopHeader,下方內容捲動）

```tsx
import { Sidebar } from "./Sidebar";
import { TopHeader } from "./TopHeader";
export function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopHeader />
        <main className="flex-1 overflow-auto p-8">{children}</main>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: tsc + 瀏覽器**（頂欄出現在所有頁;對照 Figma）
- [ ] **Step 4: commit** — `git commit -m "feat(home): TopHeader（help/通知,靜態）+ 接入 MainLayout"`

---

## Task 7: `brandCompleteness` 公式 util

**Files:**
- Create: `src/lib/brandCompleteness.ts`

**Interfaces:**
- Produces: `brandCompleteness(input): { percent: number; assetCount: number }`

- [ ] **Step 1: 實作**（依填寫欄位加權;input 用 `/api/clients/[id]` 回傳形狀 + 素材數）

```ts
// src/lib/brandCompleteness.ts
export type CompletenessInput = {
  primaryColor?: string | null;
  toneLabels?: string[] | null;
  taboos?: string[] | null;
  logoUrls?: unknown[] | null;
  pastPostUrls?: unknown[] | null;
  assetCount: number;
};
export function brandCompleteness(i: CompletenessInput): { percent: number; assetCount: number } {
  const checks = [
    !!i.primaryColor,
    (i.toneLabels?.length ?? 0) > 0,
    (i.taboos?.length ?? 0) > 0,
    (i.logoUrls?.length ?? 0) > 0,
    (i.pastPostUrls?.length ?? 0) > 0,
    i.assetCount > 0,
  ];
  const percent = Math.round((checks.filter(Boolean).length / checks.length) * 100);
  return { percent, assetCount: i.assetCount };
}
```

- [ ] **Step 2: tsc** — 0 errors
- [ ] **Step 3: commit** — `git commit -m "feat(home): brandCompleteness 完成度公式"`

---

## Task 8: dashboard 頁骨架（`/clients/[clientId]`）

把首頁的 redirect 換成 dashboard 容器:抓 `GET /api/clients/[id]`,版面 = 內容區(flex-1) + 右欄(256)。先放各區塊的空位（後續 task 填元件),並 `setLastClientId`。

**Files:**
- Modify: `src/app/clients/[clientId]/page.tsx`（改為 dashboard client component）

**Interfaces:**
- Consumes: `GET /api/clients/[id]`;`setLastClientId`
- Produces: dashboard 版面;把 client 資料傳給子元件（Task 9-13）

- [ ] **Step 1: dashboard 骨架**（先渲染標題 + 兩欄容器,子元件下批接）

```tsx
"use client";
import { useEffect, useState } from "react";
import { setLastClientId } from "@/lib/lastClient";

type Client = {
  id: string; name: string;
  primaryColor?: string; secondaryColor?: string | null; paletteColors?: unknown;
  toneLabels?: string[]; taboos?: string[]; logoUrls?: unknown[]; pastPostUrls?: unknown[];
  activities?: { id: string; theme: string; focusPoint: string; status: string; createdAt: string;
    imageRatio?: string; customW?: number; customH?: number; layoutId?: string;
    generatedLayouts?: { imageUrl: string; isSelected?: boolean }[] }[];
};

export default function DashboardPage({ params }: { params: Promise<{ clientId: string }> }) {
  const [client, setClient] = useState<Client | null>(null);
  useEffect(() => {
    params.then(({ clientId }) => {
      setLastClientId(clientId);
      fetch(`/api/clients/${clientId}`).then(r => r.json()).then(setClient).catch(() => {});
    });
  }, [params]);
  if (!client) return <div className="text-gray-400">載入中…</div>;
  return (
    <div className="flex gap-6">
      <div className="min-w-0 flex-1 space-y-8">
        {/* Task 9 HomeHero */}
        {/* Task 10 QuickStartCards */}
        {/* Task 11 RecentWorks */}
      </div>
      <div className="w-64 shrink-0 space-y-4">
        {/* Task 12 BrandMemoryPanel / AiLearnedCard */}
        {/* Task 13 ReuseRecommendCard */}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: tsc + 瀏覽器**（`/clients/<id>` 顯示載入後兩欄空框;不再 redirect）
- [ ] **Step 3: commit** — `git commit -m "feat(home): dashboard 頁骨架 + 兩欄版面"`

---

## Task 9: `HomeHero`（標題 + 搜尋框殼 + chips）

**Files:**
- Create: `src/components/home/HomeHero.tsx`
- Modify: dashboard page（插入 `<HomeHero />`）

**Interfaces:**
- Produces: `<HomeHero />`;搜尋框 `onSubmit` Phase 1 先 no-op（或 console），Phase 2 再接

- [ ] **Step 1: HomeHero**（Figma `28:3240`;「素材」字用主色;chips 靜態）

```tsx
"use client";
import { useState } from "react";
import { Sparkles } from "lucide-react";
const CHIPS = ["貼文", "情境圖", "圖片去背", "品牌形象海報"];
export function HomeHero() {
  const [q, setQ] = useState("");
  return (
    <section className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold text-gray-900">
          今天，想做什麼 <span className="text-violet-600">素材</span>呢？
          <Sparkles className="h-6 w-6 text-violet-500" />
        </h1>
        <p className="mt-2 text-sm text-gray-400">描述需求、貼上參考，AI 會依照品牌記憶自動生成素材</p>
      </div>
      <div className="flex items-center gap-2 rounded-2xl border border-gray-200 bg-white p-2 pl-4 shadow-sm">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="想找什麼？"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400" />
        <button type="button" className="shrink-0 rounded-xl bg-violet-600 px-5 py-2 text-sm font-medium text-white hover:bg-violet-700">搜尋 ✨</button>
      </div>
      <div className="flex items-center gap-2 text-xs">
        <span className="text-gray-400">試試：</span>
        {CHIPS.map(c => (
          <span key={c} className="rounded-full border border-gray-200 px-3 py-1 text-gray-600">{c}</span>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: 插入 dashboard**（取代 `{/* Task 9 HomeHero */}`）
- [ ] **Step 3: tsc + 瀏覽器對照 Figma `28:3240`**
- [ ] **Step 4: commit** — `git commit -m "feat(home): HomeHero 標題+搜尋框殼+chips"`

---

## Task 10: `QuickStartCards`（開始創作 3 卡）

**Files:**
- Create: `src/components/home/QuickStartCards.tsx`
- Modify: dashboard page

**Interfaces:**
- Consumes: `currentClientId`（組連結）
- Produces: `<QuickStartCards clientId={string} />`;3 卡導向 → AI廣告圖=`/clients/[id]/activities/new`、產品情境=`/clients/[id]/components/new`、自由排版=`/magic-layers`

- [ ] **Step 1: QuickStartCards**（Figma `28:3265`;icon: ShoppingBag/Image/LayoutTemplate;確認 magic-layers 路由 `/magic-layers` 存在——若需 clientId 參數,實作時對照現有 magic-layers 入口）

```tsx
import Link from "next/link";
import { ShoppingBag, Image as ImageIcon, LayoutTemplate, ChevronRight } from "lucide-react";
export function QuickStartCards({ clientId }: { clientId: string }) {
  const cards = [
    { title: "AI 廣告圖", sub: "IG / FB 廣告素材", icon: ShoppingBag, href: `/clients/${clientId}/activities/new`, tint: "bg-pink-100 text-pink-500" },
    { title: "產品情境", sub: "產品情境圖", icon: ImageIcon, href: `/clients/${clientId}/components/new`, tint: "bg-blue-100 text-blue-500" },
    { title: "自由排版", sub: "探索所有模板", icon: LayoutTemplate, href: `/magic-layers`, tint: "bg-violet-100 text-violet-500" },
  ];
  return (
    <section>
      <h2 className="mb-4 text-base font-semibold text-gray-900">開始創作</h2>
      <div className="grid grid-cols-3 gap-3">
        {cards.map(c => (
          <Link key={c.title} href={c.href}
            className="group relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-5 transition-all hover:border-violet-300 hover:shadow-sm">
            <div className="mb-6 flex items-start justify-between">
              <span className={`flex h-13 w-13 items-center justify-center rounded-xl ${c.tint}`} style={{ height: 52, width: 52 }}>
                <c.icon className="h-6 w-6" />
              </span>
              <ChevronRight className="h-5 w-5 text-gray-300 group-hover:text-violet-400" />
            </div>
            <div className="text-lg font-semibold text-gray-900">{c.title}</div>
            <div className="mt-1 text-sm text-gray-400">{c.sub}</div>
          </Link>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: 插入 dashboard;確認 magic-layers 連結正確**（若 `/magic-layers` 需要帶品牌,對照 `app/magic-layers/page.tsx` 現有入口參數）
- [ ] **Step 3: tsc + 瀏覽器對照 Figma `28:3265`;點三卡各自到正確頁**
- [ ] **Step 4: commit** — `git commit -m "feat(home): QuickStartCards 開始創作 3 卡"`

---

## Task 11: `RecentWorks` + `WorkCard`（最近作品）

**Files:**
- Create: `src/components/home/WorkCard.tsx`、`src/components/home/RecentWorks.tsx`
- Modify: dashboard page

**Interfaces:**
- Consumes: `client.activities`（Task 8 已抓）;`clientId`
- Produces: `<RecentWorks clientId activities />`;tabs = 全部/生成中/已完成（不含已收藏,見 spec）;卡片點擊 → `/clients/[id]/activities/[activityId]`

- [ ] **Step 1: WorkCard**（Figma `28:3346`;縮圖=選中或最新 generatedLayout;狀態徽章顏色）

```tsx
import Link from "next/link";
import { Image as ImageIcon } from "lucide-react";
type Activity = { id: string; theme: string; status: string; createdAt: string;
  imageRatio?: string; customW?: number; customH?: number;
  generatedLayouts?: { imageUrl: string; isSelected?: boolean }[] };
const STATUS: Record<string, { label: string; cls: string }> = {
  GENERATING: { label: "生成中", cls: "bg-violet-100 text-violet-700" },
  DONE: { label: "已完成", cls: "bg-emerald-100 text-emerald-700" },
  PENDING: { label: "草稿", cls: "bg-gray-100 text-gray-600" },
  FAILED: { label: "生成失敗", cls: "bg-red-100 text-red-600" },
};
export function WorkCard({ act, clientId }: { act: Activity; clientId: string }) {
  const thumb = act.generatedLayouts?.find(l => l.isSelected)?.imageUrl ?? act.generatedLayouts?.[0]?.imageUrl;
  const s = STATUS[act.status] ?? { label: act.status, cls: "bg-gray-100 text-gray-500" };
  const count = act.generatedLayouts?.length ?? 0;
  const size = act.customW && act.customH ? `${act.customW} × ${act.customH}` : act.imageRatio ?? "";
  return (
    <Link href={`/clients/${clientId}/activities/${act.id}`} className="block overflow-hidden rounded-2xl border border-gray-200 bg-white hover:shadow-sm">
      <div className="relative aspect-square bg-gray-100">
        {thumb ? <img src={thumb} alt="" className="h-full w-full object-cover" loading="lazy" />
               : <div className="flex h-full items-center justify-center"><ImageIcon className="h-6 w-6 text-gray-300" /></div>}
        <span className={`absolute left-2 top-2 rounded-md px-2 py-0.5 text-[11px] font-medium ${s.cls}`}>{s.label}</span>
      </div>
      <div className="p-3">
        <div className="truncate text-sm font-medium text-gray-800">{act.theme}</div>
        <div className="mt-1 text-xs text-gray-400">
          {new Date(act.createdAt).toLocaleDateString("zh-TW")}{count ? ` · ${count} 張` : ""}{size ? ` · ${size}` : ""}
        </div>
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: RecentWorks**（tabs 前端篩;Figma `28:3328`）

```tsx
"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { WorkCard } from "./WorkCard";
type Activity = Parameters<typeof WorkCard>[0]["act"];
const TABS = [
  { key: "ALL", label: "全部" },
  { key: "GENERATING", label: "生成中" },
  { key: "DONE", label: "已完成" },
] as const;
export function RecentWorks({ clientId, activities }: { clientId: string; activities: Activity[] }) {
  const [tab, setTab] = useState<string>("ALL");
  const count = (k: string) => k === "ALL" ? activities.length : activities.filter(a => a.status === k).length;
  const shown = (tab === "ALL" ? activities : activities.filter(a => a.status === tab)).slice(0, 10);
  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">最近作品</h2>
        <div className="flex items-center gap-2 text-sm">
          {TABS.map(t => (
            <button key={t.key} type="button" onClick={() => setTab(t.key)}
              className={`rounded-full px-3 py-1 ${tab === t.key ? "bg-violet-600 text-white" : "text-gray-500 hover:bg-gray-100"}`}>
              {t.label} {count(t.key)}
            </button>
          ))}
          <Link href={`/clients/${clientId}/activities`} className="ml-2 flex items-center gap-1 text-gray-500 hover:text-violet-600">
            查看全部 <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
      {shown.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 p-10 text-center text-sm text-gray-400">還沒有作品，點「開始創作」試試</div>
      ) : (
        <div className="grid grid-cols-5 gap-3">
          {shown.map(a => <WorkCard key={a.id} act={a} clientId={clientId} />)}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 3: 插入 dashboard,傳 `activities={client.activities ?? []}`**
- [ ] **Step 4: tsc + 瀏覽器**：SBAR 顯示真實活動、tabs 篩選、點卡進詳情。對照 Figma `28:3328`。
- [ ] **Step 5: commit** — `git commit -m "feat(home): RecentWorks 最近作品卡牆 + tabs"`

---

## Task 12: 右欄 `BrandMemoryPanel` + `AiLearnedCard`

**Files:**
- Create: `src/components/home/BrandMemoryPanel.tsx`、`src/components/home/AiLearnedCard.tsx`
- Modify: dashboard page

**Interfaces:**
- Consumes: `client`（primaryColor/secondaryColor/paletteColors/toneLabels/taboos/logoUrls/pastPostUrls）;`brandCompleteness`（Task 7）;素材數（見下）
- Produces: 兩張右欄卡

- [ ] **Step 1: 取素材數來源**：確認 `/api/clients/[id]` 是否含該品牌 library 資產數;若無,實作時用既有 components API（對照 `app/clients/[clientId]/components/page.tsx` 抓資產的方式）取 count。把 count 傳入 `brandCompleteness` 與 AiLearnedCard。

- [ ] **Step 2: BrandMemoryPanel**（Figma `28:3389`;色票用 primaryColor/secondaryColor/paletteColors;風格=toneLabels;禁忌=taboos）

```tsx
import Link from "next/link";
import { ArrowRight, CircleSlash } from "lucide-react";
import { getColors } from "@/types/library";
export function BrandMemoryPanel({ clientId, primaryColor, secondaryColor, paletteColors, toneLabels = [], taboos = [] }: {
  clientId: string; primaryColor?: string; secondaryColor?: string | null; paletteColors?: unknown; toneLabels?: string[]; taboos?: string[];
}) {
  const swatches = [primaryColor, secondaryColor, ...getColors(paletteColors)].filter(Boolean).slice(0, 4) as string[];
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-semibold text-gray-900">AI 品牌記憶</h3>
        <Link href={`/clients/${clientId}/settings`} className="rounded-md bg-violet-50 px-2.5 py-1 text-xs text-violet-600">編輯</Link>
      </div>
      <div className="mb-4">
        <div className="mb-2 text-xs text-gray-500">視覺基調</div>
        <div className="flex gap-2">{swatches.map((c, i) => <span key={i} className="h-8 w-8 rounded-lg border border-gray-100" style={{ background: c }} />)}</div>
      </div>
      <div className="mb-4">
        <div className="mb-2 text-xs text-gray-500">視覺風格</div>
        <div className="flex flex-wrap gap-2">{toneLabels.map(t => <span key={t} className="rounded-md bg-violet-50 px-2 py-1 text-xs text-violet-600">{t}</span>)}</div>
      </div>
      <div className="my-3 border-t border-gray-100" />
      <div className="mb-4">
        <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-red-500"><CircleSlash className="h-3 w-3" /> 風格禁忌</div>
        <div className="text-xs text-gray-600">{taboos.length ? taboos.join(" · ") : "未設定"}</div>
      </div>
      <Link href={`/clients/${clientId}/settings`} className="flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 py-2 text-sm text-gray-700 hover:bg-gray-50">
        前往品牌設定 <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );
}
```

（實作時確認 `getColors` 是否接受 paletteColors 形狀;若簽名不同,對照 `@/types/library` 實際 export 調整。）

- [ ] **Step 3: AiLearnedCard**（Figma `28:3420`;完成度用 Task 7 公式）

```tsx
import { Sparkles } from "lucide-react";
export function AiLearnedCard({ assetCount, percent }: { assetCount: number; percent: number }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-100"><Sparkles className="h-3.5 w-3.5 text-violet-600" /></span>
        <h3 className="text-sm font-semibold text-gray-900">AI 已學習</h3>
      </div>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between"><span className="text-gray-500">品牌素材</span><span className="font-medium text-violet-600">{assetCount} 張</span></div>
        <div className="flex justify-between"><span className="text-gray-500">品牌設定完成度</span><span className="font-medium text-violet-600">{percent}%</span></div>
        <div className="h-1 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-violet-500" style={{ width: `${percent}%` }} /></div>
        <div className="pt-1 text-xs text-gray-400">繼續上傳素材提升 AI 生成品質</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 插入 dashboard 右欄,傳真實資料 + `brandCompleteness(...)` 結果**
- [ ] **Step 5: tsc + 瀏覽器**：SBAR 色票/風格/禁忌真實顯示;完成度合理。對照 Figma。
- [ ] **Step 6: commit** — `git commit -m "feat(home): 右欄 品牌記憶 + AI已學習(完成度)"`

---

## Task 13: `ReuseRecommendCard`（再利用推薦視覺殼）

**Files:**
- Create: `src/components/home/ReuseRecommendCard.tsx`
- Modify: dashboard page

**Interfaces:**
- Consumes: 近期 library 素材（佔位;來源同 Task 12 的素材抓法,取前 3 張）
- Produces: `<ReuseRecommendCard items={{thumb,title,hint}[]} />`;真推薦邏輯之後做

- [ ] **Step 1: ReuseRecommendCard**（Figma `28:3436`;無素材時顯示引導文案）

```tsx
import { RefreshCw } from "lucide-react";
type Item = { thumb?: string; title: string; hint: string };
export function ReuseRecommendCard({ items }: { items: Item[] }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-100"><RefreshCw className="h-4 w-4 text-violet-600" /></span>
        <h3 className="text-sm font-semibold text-gray-900">素材再利用推薦</h3>
      </div>
      {items.length === 0 ? (
        <div className="text-xs text-gray-400">上傳素材後，這裡會推薦可再利用的圖</div>
      ) : (
        <div className="space-y-3">
          {items.map((it, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-13 w-13 shrink-0 overflow-hidden rounded-lg bg-gray-100" style={{ height: 52, width: 52 }}>
                {it.thumb && <img src={it.thumb} alt="" className="h-full w-full object-cover" />}
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm text-gray-800">{it.title}</div>
                <div className="truncate text-xs text-gray-400">{it.hint}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 插入 dashboard 右欄**（items 用近期素材佔位;無素材傳 `[]`）
- [ ] **Step 3: tsc + 瀏覽器對照 Figma `28:3436`**
- [ ] **Step 4: commit** — `git commit -m "feat(home): 素材再利用推薦(視覺殼)"`

---

## Task 14: `/` 導向上次品牌

**Files:**
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `getLastClientId`（Task 1）

- [ ] **Step 1: 改 root page**（client component 讀 localStorage;有上次品牌 → 該品牌首頁,否則 `/clients`）

```tsx
"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getLastClientId } from "@/lib/lastClient";
export default function Home() {
  const router = useRouter();
  useEffect(() => {
    const id = getLastClientId();
    router.replace(id ? `/clients/${id}` : "/clients");
  }, [router]);
  return null;
}
```

- [ ] **Step 2: tsc + 瀏覽器**（`/` → 上次品牌首頁;清 localStorage → `/clients`）
- [ ] **Step 3: commit** — `git commit -m "feat(home): / 導向上次品牌首頁"`

---

## Task 15: 視覺對齊 + 收尾

用 `get_design_context`/`get_screenshot` 逐區塊比對,微調顏色/間距/圓角至貼近 Figma;整體 review。

- [ ] **Step 1: 逐區塊對照 Figma 截圖**（sidebar/hero/卡/右欄），修正明顯差距（精確 hex、間距、字級）。
- [ ] **Step 2: 響應式檢查**（右欄在窄螢幕的收合/堆疊——若 Phase 1 只保證桌面,註明 min-width;`resize_window` 測 tablet）。
- [ ] **Step 3: 全站煙霧測試**：四個 nav 分頁、品牌切換、`/` 導向、活動詳情、素材庫皆正常。
- [ ] **Step 4: tsc + eslint 全綠**
- [ ] **Step 5: push 到 mine、看 Vercel Preview 網址驗證線上**
```bash
git push mine feat/home-redesign-v2
```
- [ ] **Step 6: commit（若有微調）** — `git commit -m "polish(home): 視覺對齊 Figma + 收尾"`

---

## Self-Review 註記
- Spec 各區塊皆有對應 task(shell=T3-6、路由=T2/T14、hero=T9、開始創作=T10、最近作品=T11、品牌記憶=T12、已學習=T12、推薦=T13、完成度=T7)。
- 已收藏 tab 依 spec 決定不做(T11 只三 tab)。
- 型別一致:`lastClientId`(T1)→ T3/T8/T14;`brandCompleteness`(T7)→ T12;Activity/Client 形狀跨 T8/T11/T12 一致。
- 待實作階段確認的外部相依(非 placeholder,是「對照現有 code」):magic-layers 連結參數(T10)、素材數來源 API(T12)、`getColors` 簽名(T12)——皆已標明對照的現有檔案。
