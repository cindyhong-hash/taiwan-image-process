# 廣告圖文入口頁 Redesign — Phase 2a 設計 spec

- 日期：2026-08-28
- 分支：`feat/home-redesign-v2`（沿用同一 redesign 分支）
- Figma：檔案 `eJWa63TxE9W5Kphk7e2jig`，frame `ad-creation-page`（廣告圖文入口）
- 上游：[[marketing-tool-redesign-plan]]；Phase 1 首頁 dashboard 已完成
- 完整流程 spec（使用者提供）：入口 → 生成類型 popup → 單/多圖表單 → 生成 → 結果頁 → 微調

## 目標
把 `/clients/[clientId]/activities`（目前是舊品牌工作區列表：BrandWorkspaceHeader tab + BrandMemoryCards + 活動列表）**重建成 `ad-creation-page` 設計**：開始創作標題 + 橫向品牌記憶列 + 3 張創作卡 + 最近圖文列表。這是「廣告圖文」流程的入口頁（entry-first）。

## 關鍵前提：整條流程 code 已存在（本 Phase 只做入口頁）
對照確認（見 redesign 討論）：生成類型 popup（`NewActivityModal`+`MultiLayoutPicker`）、單圖表單（`ActivityForm` @ `/activities/new`）、多圖表單（`/activities/new/multi`，genMode `unified`=統一主題 / `perCell`=各圖獨立）、結果頁（`/activities/[id]` LayoutPicker，單/多圖共用）、編輯器（`EditorCanvas`/`MultiEditorCanvas` @ `/editor`）**皆已存在且流程分層正確**。Phase 2a 只重建入口頁 + 接線；各頁視覺對齊留 Phase 2b。

## 範圍

### 做（Phase 2a）
1. **重建入口頁** `/clients/[clientId]/activities`：
   - 標題「開始創作廣告圖」+ 副標「選擇創作方式，快速生成你的專屬素材」
   - **橫向品牌記憶列**：視覺基調色票 + 視覺風格 chips + 風格禁忌(紅) chips + 「編輯品牌設定」→ `/clients/[id]/settings`。資料沿用現有 client（primaryColor/secondaryColor/paletteColors/toneLabels/taboos）。
   - **3 張創作卡（都畫出來對齊 Figma；本 Phase 只接第 1 張）**：
     - 「全新生成」[推薦]（AI/violet）→ **開啟生成類型 Popup**（重用 `NewActivityModal`）→ 單圖 `/activities/new`、多圖 `/activities/new/multi?layout=…`。**← 本 Phase 接這個**
     - 「套用素材底圖」（image）→ ⏸ **行為留白**（使用者之後詳細說明再接）。本 Phase 只做視覺卡；onClick 先不接（不做 library picker / 底圖 handoff）。
     - 「自由排版」[NEW]（layout）→ ⏸ **行為留白**（使用者之後詳細說明再接）。本 Phase 只做視覺卡；先不接 blank 畫布連結（雖 Phase 1 已有,但使用者要重新定義,避免白做）。
   - **最近圖文列表**：沿用現有 `ActivityRow` + 搜尋(actSearch) + 狀態篩選(全部/已完成/生成中/生成失敗/草稿) + 刪除；重新排版對齊 Figma。
   - **移除** `BrandWorkspaceHeader`（廣告活動圖/素材庫 內部 tab，已與側欄 nav 重複）。

### 不做（留 Phase 2b）
- 單圖表單 / 多圖表單(兩模式) / 結果頁 / 編輯器 本身的視覺對齊 Figma（邏輯已在，之後對齊）。
- 生成類型 popup 的視覺不重畫（沿用現有 `NewActivityModal`/`MultiLayoutPicker`）。

## 元件拆解（檔案）
新建：
- `src/components/adcreation/AdCreationHeader.tsx` — 標題 + 副標
- `src/components/adcreation/BrandMemoryBar.tsx` — 橫向品牌記憶列（色票/風格/禁忌/編輯）
- `src/components/adcreation/CreationCards.tsx` — 3 張創作卡（含各自 onClick 行為）
- （最近圖文可沿用現有 `ActivityRow`，若需獨立可抽 `RecentAdList.tsx`；實作時決定）

改：
- `src/app/clients/[clientId]/activities/page.tsx` — 重建版面：Header + BrandMemoryBar + CreationCards + 最近圖文（保留現有 search/filter/row/delete 邏輯與 state）；移除 BrandWorkspaceHeader。

重用（不改）：`NewActivityModal`、`MultiLayoutPicker`、`LibraryImagePickerModal`、`ACTIVITY_BASE_KEY`、現有 `/api/clients/[id]` 資料。

## 資料流
- client + activities：現有 `GET /api/clients/[id]`（已含 activities+generatedLayouts + 品牌記憶欄位）。
- 品牌記憶列：client.primaryColor/secondaryColor/paletteColors（色票）、toneLabels（風格）、taboos（禁忌，紅 chips）。
- 最近圖文：client.activities，前端 search + status 篩選（沿用現有）。

## 互動接線（驗收關鍵）
- 全新生成 → 出 `NewActivityModal` popup（不直接跳表單）→ 選單圖→`/activities/new`、選多圖版型→`/activities/new/multi?layout=…`
- 套用素材底圖 → ⏸ 行為留白（本 Phase 不接，等使用者詳述）
- 自由排版 → ⏸ 行為留白（本 Phase 不接，等使用者詳述）
- 最近圖文卡/列 → `/activities/[activityId]`（結果/詳情）
- 重用元件 `LibraryImagePickerModal` / `ACTIVITY_BASE_KEY` / blank 畫布連結 → 本 Phase 不使用（留待兩卡後續 spec）。

## 邊界 / 錯誤
- 0 活動 → 最近圖文空狀態。
- 品牌記憶欄位空 → 各區塊 fallback（未設定）。
- paletteColors 為 JSON 字串（沿用 Phase 1 的 parseColors 處理方式）。

## 驗證
- tsc / eslint 乾淨。
- 瀏覽器對照 Figma `ad-creation-page`（標題/品牌記憶列/3 卡/最近圖文）。
- 三卡接線實測：全新生成→popup→單/多圖；套用素材底圖→挑圖→底圖模式表單；自由排版→空白畫布。
- 最近圖文：真實活動、搜尋、狀態篩選、刪除、點入詳情。
- 側欄 nav 無重複 tab。

## 後續（Phase 2b，非本 spec）
單圖表單(step3-creation-form)/多圖表單(multi-edit-unified-theme + individual-mode)/結果頁(step4-generation-results，單多共用)/編輯器(ad-editor-ai-finetune*) 視覺對齊 Figma。
