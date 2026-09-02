# AI 月度企劃 — Flow A(定案 User Flow)× 程式碼對映 Spec

> 來源:使用者定案的 Flow A。本文件把流程對映到現有 marketing-tool(redesign / `feat/free-layout`)與「AI月度行銷企劃-獨立功能包」,標出**哪些照用、哪些改寫、哪些丟掉**。
> 狀態:設計文件,尚未實作。側邊欄入口(skeleton)已完成於 `feat/monthly-planner`(基於 `feat/free-layout`)。
> 相關:[trend-signals spec](./monthly-planner-trend-signals-spec.md)。

---

## 0. 定案流程(6 階段)

```
AI 月度企劃(Planner Home:企劃清單 + 建立)
  └─ ① 月度 Brief(單頁)Goal / Campaign(展開設定產品·說明·重要日期)/ 篇數 / 平台
        └─ ② AI 幫我規劃(單頁)短策略 + Content Mix + Topics(帶簡短理由)→ Review/改
              └─ ③ 內容日曆(把 Topics 視覺化 + 拖曳改期;AI 已排好)
                    ├─ 做一篇 ─┐
                    └─ 批次製作 ┘→ Content Brief → 單圖=現有單圖流程 / Carousel=現有多圖流程
                          └─ Generate → ⑤ Review / AI 微調 → Approve → 回日曆
                                └─ 日曆=控制中心(🟢已完成 / 🟡製作中 / ⚪尚未製作)
```

---

## 1. 與「功能包」的關鍵分歧(重要)

功能包是 **4-step 精靈 + 各自拆頁 + 獨立批次生成器**。Flow A 要的是**收合成少數頁 + 復用既有生成流程**。差異必須明確:

| 主題 | 功能包原設計 | Flow A 定案 | 動作 |
|---|---|---|---|
| 入口 | 直接進 Step 1 精靈 | **先 Planner Home:企劃清單 +「建立月度企劃」** | 新增 Home 頁 |
| Brief | Goal / Campaign / Product / Date 感覺像多段 | **全部一頁**;Campaign **展開才設**產品/說明/重要日期 | 合併成單頁 |
| AI 企劃 | Content Mix / Allocation / Topics 分區 | **一頁**:短策略 + Content Mix + Topics(直接列),每篇**一句**理由 | 合併;理由精簡 |
| 內容日曆 | 月/週檢視 + 拖曳 + 智慧排程 | **只做視覺化 + 拖曳改期**(不是另一套 planning) | 照用、砍複雜度 |
| 生成 | **BatchContentGenerator**(獨立批次器) | **不做新生成器**;轉成 Content Brief → **現有 `/api/generate`(單圖)/ 多圖流程** | 改寫 patch 0004 |
| 批次 | 批次器主流程 | **只是 Calendar 多選的 shortcut**,背後走同一條 per-item 路徑 | 降級成捷徑 |
| 控制中心 | 分散 | **Calendar 就是控制中心**(每篇狀態) | 強化 Calendar |
| Publish | — | 流程圖尾端有 Schedule/Publish | **暫不做**(見 §4) |

---

## 2. 可直接復用的現有能力(不新增第三方)

- **文字 LLM**:`chatTextOpenRouter()` @ `src/lib/openrouter.ts`(策略/Topics/理由)。
- **單圖生成**:`POST /api/generate`({ activityId }) → 現有 Activity 管線。
- **多圖/Carousel**:現有多圖流程(`generateMulti` / magic-layers 拆頁)。
- **文案**:`generateCopy()` @ `src/lib/generate.ts`。
- **創作頁既有功能全部保留**(Flow A 明確要求):
  - `💡 給我靈感`(`/api/ai/inspire`)、`AI 改寫`、`✨ 優化 Prompt`(`/api/ai/optimize-prompt`)
  - 產品圖自動帶入 + `＋ 上傳` / `＋ 從素材庫選擇`(`LibraryImage`)
  - 參考風格圖上傳 → AI 反推 Prompt → 套回
  - **「參考過往貼文風格」**(構圖/配色/背景積木)
- **品牌 grounding**:`Client`(name/colors/logo/toneLabels/taboos/commonText/pastPostImageUrls)。

> Flow A 的「④ 開始製作」本質是:把企劃資訊組成 **Content Brief**,再**灌進既有表單的預填值**,而非空白表單。前端主要是「預填 + 導向」,不是新生成邏輯。

---

## 3. 資料模型(沿用功能包 + 小調整)

沿用:`MonthlyMarketingPlan / MarketingCampaign / CampaignProduct / CampaignImportantDate / ContentPlanItem`(見功能包 migration `20260830190000`)。

Flow A 需要留意的欄位:
- `ContentPlanItem.status` 要能表達 **⚪尚未製作 / 🟡製作中 / 🟡Needs Review / 🟢已完成(Approved)**;沿用功能包狀態機(PLANNING→DRAFT→GENERATING→NEEDS_REVIEW→APPROVED),Calendar 依此上色。
- `ContentPlanItem.scheduledDate`:③ 日曆拖曳寫入。
- `format`(SINGLE/CAROUSEL)+ AI 建議理由(「3 個亮點適合分頁」)。
- 併入 [trend-signals spec](./monthly-planner-trend-signals-spec.md):`recommendationReason` + `sourceSignals`(② 每篇的「🔥 符合季節需求」就是它)。
- `generatedActivityId`:一篇 Topic ↔ 一筆 Activity,Review/Approve 綁在 Activity 產出上。

**產品來源**:`CampaignProduct.sourceKind="library"` → 接既有素材庫;第一版產品=素材庫圖片 URL(現有專案沒有獨立 Product entity)。

---

## 4. 明確排除 / 待確認

- **Schedule / Publish(自動發文)**:現有專案**沒有** Meta/IG/FB 發布 API。流程圖尾端的 Publish **第一版不做**,Approve 後止於「已完成 + 可下載」;發布維持人工。之後要做才評估第三方。
- **智慧排程演算法**:第一版「AI 已排好」可用簡單規則(重要日期優先 + 平均分佈),不需複雜最佳化。
- **「從既有 Campaign 建立」**:只當**預填捷徑**,不另開一套流程(Flow A 明示)。

---

## 5. 頁面 / 路由規劃(redesign 架構下)

全部掛在既有 `/clients/[clientId]/marketing-plans` 之下,左側全域欄入口已加:

| 階段 | 路由 | 說明 |
|---|---|---|
| Home | `/marketing-plans` | 企劃清單 + 建立(**目前是 skeleton**) |
| ① Brief | `/marketing-plans/new` | 單頁 Brief → CTA「AI 幫我規劃」 |
| ② AI 企劃 | `/marketing-plans/[planId]`(企劃頁) | 策略 + Mix + Topics;或分 tab/段落 |
| ③ 日曆 | 同 planId 頁內的「日曆」檢視 | Topics 視覺化 + 拖曳 |
| ④ 製作 | 復用 `/clients/[id]/activities/...` 既有生成頁(帶預填) | Drawer/導向 |
| ⑤ Review | 回 planId 日曆 / Content Drawer | Approve |

> 頁面頭一律用 redesign 的自帶 `<h1>` 頁首樣式(對齊素材庫/廣告圖文),不用舊 `BrandWorkspaceHeader`。

---

## 6. 建議建置階段(每階段可獨立驗收)

1. **P0(已完成)** 左側欄入口 + skeleton 頁。
2. **P1 資料層** 併入功能包 5 表 migration + Prisma model(不含 UI 邏輯);加 `recommendationReason`/`sourceSignals`。
3. **P2 Home + ① Brief** 企劃清單/建立 + 單頁 Brief(Campaign 展開)。
4. **P3 ② AI 企劃** 策略 + Mix + Topics(接 `chatTextOpenRouter`,含理由/signals)。
5. **P4 ③ 日曆** 視覺化 + 拖曳改期 + 狀態上色。
6. **P5 ④⑤ 製作/Review** Content Brief → **預填既有單圖/多圖流程** → Approve 回寫狀態。
7. **P6 ⑥ 批次** Calendar 多選 shortcut(走同一 per-item 路徑)。

---

## 7. 待你確認的決策點

1. **Publish 第一版排除**、Approve 後止於「已完成/可下載」— OK?
2. **② 用同一頁分段(策略→Mix→Topics)** 還是 3 個 tab? Flow A 傾向同頁分段。
3. **產品 = 素材庫圖片**(無獨立 Product entity)— 沿用功能包 `CampaignProduct`,OK?
4. 功能包的 **BatchContentGenerator 改寫成「Calendar 多選 shortcut」** — 確認丟掉獨立批次器?
5. 建置從 **P1 資料層**開始 — 對嗎?
