# 首頁 Redesign v2 — Phase 1（Shell + Dashboard）設計 spec

- 日期：2026-08-28
- 分支：`feat/home-redesign-v2`（在 `taiwan-image-process` repo）
- 設計稿：Figma「台灣圖文2.0」node `28:3175`（`sbar-dashboard`）
- 相關記憶：[[marketing-tool-redesign-plan]]、[[marketing-tool-production-deploy]]

## 目標
把現有「品牌清單側欄 + 品牌工作區(廣告活動圖/素材庫 tab)」的 IA，改成設計稿的
「**全域 nav + 品牌切換器 + 首頁 dashboard**」。本階段只做 **Shell + Dashboard 版面 + 能用真實資料的區塊**，
智慧功能（搜尋行為 / 推薦邏輯 / 完成度公式）留待後續階段，本階段只做視覺殼。

## 範圍

### 做（Phase 1）
1. **Shell 重構**：側欄改為 Content logo + 品牌切換器 + 全域 nav（首頁/廣告圖文/素材庫/品牌設定）+ 底部使用者。
2. **頂欄**：help + 通知鈴鐺（靜態，不接真實通知）。
3. **首頁 dashboard**（`/clients/[clientId]`）：
   - Hero + 搜尋框 UI（可打字，送出行為 Phase 2 再接）
   - 開始創作 3 卡（導去現有流程）
   - 最近作品（真實資料 + tabs 篩選）
   - 右欄：AI 品牌記憶（真實資料）
4. **路由重構**：活動列表從 `/clients/[clientId]` 搬到 `/clients/[clientId]/activities`。

### 先做視覺殼、行為之後
- 搜尋框「搜尋」實際行為 → Phase 2（intent router / 搜尋）
- AI 已學習「完成度 %」→ Phase 1 用簡單 derived 公式（見下），非假數字
- 素材再利用推薦 → Phase 1 放視覺殼 + 接「近期素材」當佔位；真推薦邏輯之後做
- 頂欄通知鈴鐺 → 靜態 badge，不接資料

### 不做
- 對話匡 intent router（Phase 2）、靈感頁（Phase 3）、Supabase 遷移（維持 Turso）

## 架構：路由 / IA

每個品牌底下（`/clients/[clientId]/…`）：

| Nav | 路由 | 內容 | 狀態 |
|---|---|---|---|
| 首頁 | `/clients/[clientId]` | 新 dashboard | 新建 |
| 廣告圖文 | `/clients/[clientId]/activities` | 現活動列表（搬移） | 搬移現有 |
| 素材庫 | `/clients/[clientId]/components` | 現素材庫 | 已存在 |
| 品牌設定 | `/clients/[clientId]/settings` | 現設定 | 已存在 |

- **進站 `/`**：導去「上次品牌」的首頁（用既有 `lastClientTab` 概念延伸出 `lastClientId`；沒有就到 `/clients` 挑選頁）。
- **品牌切換器**：下拉列出所有品牌（`GET /api/clients`）、切換 → 停在同一 nav 分頁換品牌、底部「＋ 新增品牌」（`/clients/new`）。
- **`/clients`（品牌清單頁）**：保留為「未選品牌時的挑選/管理」入口。
- **側欄 active 態**：依 `usePathname` 判斷高亮哪個 nav。

### 現有 shell 的沿用
- 現有 `MainLayout` + `Sidebar`（`components/layout/`）就是要改的目標。`Sidebar` 由「品牌清單」重寫成「Content logo + 切換器 + 全域 nav + 使用者」。
- `MainLayout` 版面（flex：sidebar + main）沿用，微調寬度/樣式對齊設計稿。

## 元件拆解（檔案）

新建：
- `components/layout/Sidebar.tsx`（重寫）：logo、`BrandSwitcher`、`SidebarNav`、`SidebarUser`
- `components/layout/BrandSwitcher.tsx`：下拉切品牌 + 新增品牌
- `components/layout/TopHeader.tsx`：help + 通知（靜態）
- `components/home/HomeHero.tsx`：標題 + 搜尋框 UI + 試試 chips
- `components/home/QuickStartCards.tsx`：3 張開始創作卡
- `components/home/RecentWorks.tsx`：tabs + 作品卡牆（`WorkCard`）
- `components/home/BrandMemoryPanel.tsx`：右欄品牌記憶（沿用現有 `BrandMemoryCards` 資料，重排成設計稿樣式）
- `components/home/AiLearnedCard.tsx`：素材數 + 完成度（derived）
- `components/home/ReuseRecommendCard.tsx`：視覺殼 + 近期素材佔位
- `app/clients/[clientId]/page.tsx`：改成 dashboard（組合上述）
- `app/clients/[clientId]/activities/page.tsx`：活動列表（從舊 `page.tsx` 搬過來）

改：
- `components/layout/MainLayout.tsx`：微調
- 側欄相關的 `lastClientTab.ts`：擴充記住 `lastClientId`

## 資料流

| 區塊 | 資料來源 | 備註 |
|---|---|---|
| 品牌切換器 | `GET /api/clients` | 現有 |
| 最近作品 | `GET /api/clients/[id]`（activities + generatedLayouts） | 現有；tabs 前端篩 status |
| 已收藏 tab | 需活動層 favorite 欄（目前無） | **Phase 1 決定：只顯示 全部 / 生成中 / 已完成 三個 tab**；「已收藏」待日後加 favorite flag（+migration）再補，本階段不顯示 |
| AI 品牌記憶 | `GET /api/clients/[id]`（primaryColor/secondaryColor/paletteColors/toneLabels/taboos） | 現有 |
| AI 已學習 | 素材數 = 該品牌 library 資產數；完成度 = derived 公式 | 見下 |
| 素材再利用推薦 | 近期 library 素材（佔位） | 真推薦 Phase later |

### 完成度公式（Phase 1 簡版）
以「品牌設定關鍵欄位是否填寫」加權：主色、語氣標籤、禁忌、logo、過往貼文圖、素材數>0 等，各佔比例加總成 %。實作時定最終權重；目標是「合理反映填寫程度」而非精算。

## 設計 tokens（實作時用 get_design_context 逐元件取精確值）
- 主色：violet（約 violet-600 系）；hero「素材」與 active nav、搜尋鈕、tab 用主色。
- 中性：白底卡片 + 淺灰底頁面 + gray-400/500 說明文字 + gray-200 邊框。
- 狀態徽章：已完成=綠、生成中=紫/琥珀、草稿=灰。
- 圓角：卡片大圓角（~16px）、chip/按鈕中圓角。
- 版面：sidebar 164、main padding 32、內容區 + 右欄 256、gap 24；作品卡 ~176 寬、縮圖 180 高、5 欄。
- Figma 無定義變數（raw values），實作階段逐元件抓 hex。

## 錯誤處理 / 邊界
- 空狀態：新品牌 0 活動 → 最近作品顯示空狀態卡；0 素材 → 已學習/推薦顯示引導文案。
- 品牌切換載入中 → 骨架/loading。
- `lastClientId` 讀不到（首次/清快取）→ 導 `/clients`。

## 驗證
- 逐區塊對照 Figma 截圖（視覺）。
- 真實資料：品牌記憶、最近作品要顯示 SBAR/舒適牌女刀 的實際內容。
- 路由：nav 四項切換、品牌切換器換品牌、`/` 導向、舊 `/activities` 可達。
- Vercel Preview（push branch 自動生預覽網址）驗證線上。
- tsc / eslint 乾淨。

## 分階段後續（非本 spec）
- Phase 2：搜尋框 intent router / 搜尋行為
- Phase 3：靈感頁
- Later：真推薦邏輯、完成度精算、通知系統
