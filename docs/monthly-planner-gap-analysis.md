# Monthly Planner — 現況落差清單（可 Reuse API 盤點 + 待補缺口）

> 用途：對照 Flow A 完整設計，盤點「已可直接 reuse 的現有 API」與「Monthly Planner 還缺什麼」。
> 狀態：2026-09-01。此文件**不含任何程式碼改動**，僅供接手（claude code）繼續開發的對照依據。
> 對應文件：`monthly-planner-flow-A-spec.md`（完整 UX 流程）、`monthly-planner-trend-signals-spec.md`（訊號架構）。

---

## 0. 目前已完成（P0 + P1 + P3 數據流）

| 項目 | 檔案位置 | 狀態 |
|---|---|---|
| 側欄入口「✨ AI 月度企劃」 | `src/components/layout/SidebarNav.tsx:11` | ✅ 已接 |
| Planner Home 清單頁 | `src/app/clients/[clientId]/marketing-plans/page.tsx` | ✅ |
| 建立企劃（導向 Brief） | `src/app/clients/[clientId]/marketing-plans/new/page.tsx` | ✅ |
| ① 單頁 Brief（Goal/Campaign/CampaignProduct/ImportantDate/篇數/平台/CTA） | `src/app/clients/[clientId]/marketing-plans/[planId]/page.tsx` + `src/components/marketing-planner/PlannerBriefEditor.tsx` | ✅ |
| ② AI 內容企劃單頁（策略摘要 + Content Mix + Topics + 🔥理由/來源 chip） | `src/app/clients/[clientId]/marketing-plans/[planId]/plan/page.tsx` + `src/components/marketing-planner/PlannerStrategyView.tsx` | ✅ |
| API：plans CRUD / strategy / topics / campaigns / topic item(edit/delete/regenerate) | `src/app/api/marketing-plans/**`、`src/app/api/marketing-campaigns/**`、`src/app/api/content-plan-items/**` | ✅ |
| 資料層 5 表 + trend-signals 3 欄 | `prisma/schema.prisma:110-200` | ✅ |
| Trend-signals 可插拔架構（providers + 防幻覺 filterCitedSignals + signalsJson 快照） | `src/lib/planner/trend-signals.ts` | ✅ |

---

## 1. 可直接 Reuse 的現有 API

### 1.1 文本 / LLM（AI 文案與企劃）
| 資源 | 位置 | 用途 |
|---|---|---|
| `chatTextOpenRouter` | `src/lib/openrouter.ts` | 文字 LLM（planner 已在用） |
| `anthropic` | `src/lib/anthropic.ts` | Claude（storyboard 用） |
| `api/ai/inspire` | `POST /api/ai/inspire` | 💡 給我靈感（改寫，④ 保留） |
| `api/ai/optimize-prompt` | `POST /api/ai/optimize-prompt` | ✨ 優化 Prompt（④ 保留） |
| `api/ai/analyze-image` | `POST /api/ai/analyze-image` | 參考圖反推 Prompt（④ 保留） |
| `api/ai/storyboard` | `POST /api/ai/storyboard` | 多圖分鏡拆分（Carousel 用） |
| `src/lib/marketing-planner.ts` | — | topics 生成 / normalize / fallback 核心 |

### 1.2 圖片生成
| 資源 | 位置 | 用途 |
|---|---|---|
| `generateImageFal` / `generateImageFluxSchnell` / `editImageFal` | `src/lib/fal.ts` | 生圖 / 編輯 |
| `removeBackground` / `describeStyle` / `describeProduct` | `src/lib/fal.ts` | 去背 / 風格分析 |
| `api/generate` | `POST /api/generate` | 單圖主流程 |
| `src/lib/generate-multi.ts` + `api/generate-multi` | — | 多圖/Carousel 拼版 |
| `api/ai/storyboard` | — | Carousel 拆格 |
| `api/inpaint`、`api/magic-layers/*` (cutout/background/arttext/compose/outpaint/magic-fill) | — | 後製編輯 |
| `api/library/generate`、`api/library/describe`、`api/library/polish` | — | 素材庫 + 參考過往貼文風格 |
| `api/composite`、`api/logo/place` | — | 拼合 / 置 logo |
| `api/export` | `POST /api/export` | 尺寸調整（目前只有下載，非發布） |

### 1.3 Brand / Product
| 資源 | 位置 | 說明 |
|---|---|---|
| Client（品牌）CRUD | `api/clients` + `api/clients/[clientId]` | `logoUrls`、`fonts`、`primaryColor`、`toneLabels`、`pastPostImageUrls`、`paletteColors` = **完整品牌記憶** |
| CampaignProduct | schema `CampaignProduct` | `sourceKind: "library" \| "upload"`；`sourceId` 對應 `LibraryImage.id` |
| LibraryImage | schema / `api/library/images` | 素材庫，產品圖來源 |

### 1.4 生圖流程既有入口（④ 的接收端）
| 流程 | 入口 URL | 對應 |
|---|---|---|
| 單圖 | `/clients/[clientId]/activities/new` | SINGLE |
| 多圖/Carousel | `/clients/[clientId]/activities/new/multi` | CAROUSEL（multiLayout / cells） |
| 接回後續 | Activity model `layoutId`（single=單圖，否則多圖）、`generatedActivityId`（ContentPlanItem→Activity 反向關聯） | ④ 轉接點 |

---

## 2. Monthly Planner 還缺什麼（落差）

| # | 缺口 | Flow A 步驟 | 說明 / 接點 | 需不需要新 API |
|---|---|---|---|---|
| 1 | **③ 內容日曆 + Drag & Drop** | Step ③ | `ContentPlanItem.scheduledDate` 已在 schema（`schema.prisma:189`）；`② PlannerStrategyView.tsx:156-159` 的 CTA 目前是 disabled「即將接上」，正是開往日曆的接點 | 需新日曆頁 + 更新 date 的 API（可沿用 `content-plan-items/[itemId]` PATCH） |
| 2 | **④ 做一篇的 Drawer（Content Brief 轉接）** | Step ④ | 點 Calendar 已排 topic → 開 Drawer（Campaign/產品/平台/形式 + ✨AI 建議）→「調整內容 / 開始製作」→ 把企劃資訊轉成 Content Brief → 接單圖 `activities/new` 或多圖 `activities/new/multi` | 需新 Drawer 元件（UI）；**不需新生圖 API**（reuse 既有兩條流程） |
| 3 | **ContentPlanItem → Activity 自動轉接** | Step ④ | schema 已留 `generatedActivityId`（`schema.prisma:192-193`）；spec 明言「不做獨立批次器，走既有 Activity 管線」。目前**尚未接**：點「開始製作」要建一筆 Activity 並寫回 `generatedActivityId` | 需一個建立 Activity 的 API（或擴充既有 `api/activities`） |
| 4 | **⑤ Review + Approve** | Step ⑤ | 日曆顯示 🟢已完成 / 🟡製作中 / ⚪尚未製作 狀態；`ContentPlanItem.status`（PLANNING→DRAFT→GENERATING→NEEDS_REVIEW→APPROVED）已在 schema | 需日曆 UI + status 更新 |
| 5 | **⑥ 批次生成（Shortcut）** | Step ⑥ | 勾選多篇 → 一次「產生已選 N 篇」；背後**仍走既有單圖/多圖流程**（非獨立批次器） | 需批次觸發邏輯（呼叫既有多圖/多圖 agent） |
| 6 | **排程 / 發布（Schedule / Publish）** | 最終步 | **完全沒有社群發布 API**。現有 `api/export` 只是尺寸調整的下載。無 Meta/FB/IG 連線、無排程 | 需新社群發布模組（第三方，未來） |
| 7 | **獨立 Product 主檔** | ④（內容簡介帶產品名） | 目前無獨立 `Product` 表。`CampaignProduct` 只有 `label` + `imageUrl`，產品實際是「從素材庫選 / 上傳圖片」。若 Content Brief 要帶「產品名稱/描述」進生圖 prompt 需補 | 視需求 |

> 補充：**趨勢訊號（你最初的訴求）已達標** — `trend-signals.ts` 可插拔，重要日期已作為 ground truth，未來接 Google Trends/RapidAPI 只需加一個新 provider。

---

## 3. 建議的下一步順序（接手方向）

1. **先 commit 現有進度**（P0 入口 / P1 資料層 / P3 ② 頁 — 都還沒 commit，`git status` 可見全部 untracked + `schema.prisma`/`SidebarNav.tsx` modified）。
2. **③ 內容日曆**（最大單塊缺口，接 `scheduledDate` + 解開 disabled CTA）。
3. **④ 做一篇 Drawer + Content Brief 轉接**（把企劃接到現有單圖/多圖流程 — 價值最高的轉接點）。
4. **⑤ Review/Approve + ⑥ 批次生成**（立基於日曆 + 轉接完成）。
5. **排程/發布** — 需第三方，proposal 階段，非當務之急。

---

## 4. 關鍵檔案索引（接手時快速定位）
- 資料模型：`prisma/schema.prisma:105-200`
- Trend-signals：`src/lib/planner/trend-signals.ts`
- Planner lib：`src/lib/marketing-planner.ts`
- ① Brief：`src/components/marketing-planner/PlannerBriefEditor.tsx`
- ② 策略頁：`src/components/marketing-planner/PlannerStrategyView.tsx`（disabled CTA = ③ 接點，`:156-159`）
- 生圖入口：單圖 `/clients/[clientId]/activities/new`、多圖 `.../activities/new/multi`
- 發布：目前無
