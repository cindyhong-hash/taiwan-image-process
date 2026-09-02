# Monthly Planner — Trend Signals 架構 Spec

> 目的:讓 Topic 生成**不再只依賴 LLM**,改成可注入外部趨勢訊號(external trend signals)的架構。
> 第一版 `trendSignals` 可為空或 mock,未來可無痛接 Google Trends / RapidAPI。
> 每個 Topic 必須保存 `recommendationReason`(為何推這題)與 `sourceSignals`(引用了哪些訊號)。
>
> **狀態:設計文件,尚未動 code。** 對齊對象為功能包 `AI月度行銷企劃-獨立功能包`。

---

## 0. 設計原則

1. **Provider 可插拔**:訊號來源抽象成 Port,新增來源 = 加一個 adapter,呼叫端零改動。
2. **永不阻斷**:任何 provider 失敗 → 降級成空陣列,生成照常(延續功能包既有 fallback 哲學)。
3. **LLM 是其中一個輸入,不是唯一**:訊號與重要日期可直接產生候選 topic,LLM 只負責綜合補齊與潤飾。
4. **可追溯 / 防幻覺**:LLM 宣稱引用的訊號,必須真的在本次提供集合內,否則丟棄。
5. **不新增第三方**:第一版只用 Mock + 既有 `CampaignImportantDate`,不接任何外部服務。

---

## 1. 型別與 Port(新增檔案:`src/lib/planner/trend-signals.ts`)

```ts
export type TrendSignalKind = "event" | "keyword" | "hashtag" | "season";

export type TrendSignal = {
  id: string;                 // 穩定 id,供 sourceSignals 引用與去重
  source: string;             // "important-date" | "mock" | "google-trends" | "rapidapi-xxx"
  kind: TrendSignalKind;
  label: string;              // 人看得懂的訊號,例:"換季保養"、"9/20 會員日"
  score?: number;             // 正規化 0–1(聲量 / 相關度),缺省視為 0.5
  meta?: Record<string, unknown>;
  fetchedAt: string;          // ISO
};

export type TrendSignalContext = {
  clientId: string;
  clientName: string;
  year: number;
  month: number;
  goals: string[];
  campaigns: { id: string; name: string; goals: string[] }[];
  importantDates: { date: Date; label: string }[];
};

export interface TrendSignalProvider {
  name: string;
  fetch(ctx: TrendSignalContext): Promise<TrendSignal[]>;
}
```

---

## 2. 首批 Providers

### 2.1 `ImportantDateSignalProvider`(第一個「真實」provider,非 mock)
把 plan 既有的 `CampaignImportantDate` 直接轉成 signal。**這是讓抽象層第一版就有真實資料的關鍵**,不需任何第三方。

- `source: "important-date"`,`kind: "event"`
- `label`: `\`${MM/DD} ${date.label}\``
- `score`: 距離發文月越近給越高(可先固定 0.7)
- `id`: `\`important-date:${importantDate.id}\``

### 2.2 `MockTrendSignalProvider`(佔位,之後換真的)
- 讀環境變數 `TREND_SIGNALS_MOCK`(JSON)或回傳 `[]`。
- 用途:讓前端/後端在沒有第三方時也能跑完整流程、驗證欄位落庫。

### 2.3 未來 adapter(**本版不實作,只留位置**)
- `GoogleTrendsSignalProvider`、`RapidApiSignalProvider` — 之後各自實作 `fetch()` 即可,呼叫端不動。

---

## 3. Registry + Aggregator(同檔)

```ts
export function getTrendProviders(): TrendSignalProvider[] {
  // 本版:重要日期 + mock。未來依 env / client 設定加掛。
  return [importantDateProvider, mockProvider];
}

export async function collectTrendSignals(ctx: TrendSignalContext): Promise<TrendSignal[]> {
  const providers = getTrendProviders();
  const results = await Promise.all(
    providers.map(p => p.fetch(ctx).catch(() => [] as TrendSignal[])) // 單一 provider 失敗 → 空,不炸
  );
  const merged = results.flat();
  return dedupeAndRank(merged); // 依 label 正規化去重、依 score 由高到低排序
}
```

**去重規則**:先用 `id`,再用 `label` 正規化(去空白/大小寫)第二層去重。**排序**:`score` 降冪,同分維持 provider 順序。

---

## 4. Schema 變更(Prisma)

### 4.1 `ContentPlanItem` 增兩欄
```prisma
recommendationReason String @default("")     // 為何本月推這個 topic
sourceSignals        String @default("[]")   // JSON: [{ id, source, label, score }]
```

### 4.2 訊號快照(建議,供稽核 / 重現)
在「一次生成」保存當時看到的訊號集合。二選一:

- **輕量版**(建議先做):在 `MonthlyMarketingPlan` 加 `signalsJson String @default("[]")`,每次跑 topics 覆寫。
- **完整版**(未來):新增 `TopicGenerationRun` 表,一次 run 一列,存 `signalsJson` + 時間戳,可回溯多次生成。

> 即使 v1 訊號是空的,`signalsJson` 也要寫入 `[]` → 保證欄位永遠有值。

### 4.3 Migration
- 新增 migration(例:`20260901xxxxxx_add_trend_signals_fields`)。
- **兩欄都有 default,對既有資料安全**;正式庫**禁用** `migrate reset`。

---

## 5. 生成流程改造(核心整合點:`api/marketing-plans/[planId]/topics/route.ts`)

現況:`plan + campaigns + strategy` → prompt → `chatTextOpenRouter` → normalize → `ContentPlanItem[]`。

改成三段:

### A. 收集訊號
在建 prompt 前:
```ts
const signals = await collectTrendSignals({ clientId, clientName, year, month, goals, campaigns, importantDates });
```
把 `signals` 快照寫進 `plan.signalsJson`(或 run)。

### B. 產生候選(訊號 + 日曆 + LLM 三來源並存)
- **確定性候選**:重要日期 / 高分 keyword signal → 可直接對應一個 topic(帶上該 signal 當 `sourceSignals`),**不經 LLM**。
- **LLM 候選**:把 signals 當 **grounding** 塞進 prompt(見 §6),補齊剩餘篇數 + 潤飾標題。
- 合併 → 去重(同 campaign + 近似 topic) → 依 score 排序 → 截到 `totalPostCount`。

### C. 落庫(normalize 階段)
每筆 `ContentPlanItem` 多寫:
- `recommendationReason`:LLM 給的理由;缺 → 用 strategy hint / signal label 補。
- `sourceSignals`:**只保留** id/label 確實在本次 `signals` 集合內的(見 §7 防幻覺)。純 fallback → `[]`。

---

## 6. Prompt 調整(在既有 topics prompt 尾端追加)

追加區塊(signals 可能為空,空則整段省略):
```
以下為本月外部趨勢訊號(僅供參考,可選用,不得杜撰未列出的訊號):
[{ "id": "...", "label": "換季保養", "score": 0.8 }, ...]

每個 topic 額外回傳:
- "recommendationReason": 一句話,說明為何本月適合這個主題
- "sourceSignals": 字串陣列,只能填上面列出的 signal id(沒用到就給 [])
```
輸出 JSON 每項新增 `recommendationReason` 與 `sourceSignals` 兩個 key,其餘沿用現況。

---

## 7. 護欄

- **防幻覺**:LLM 回的 `sourceSignals` 逐一比對本次 `signals` 的 id 集合,不在的丟掉。
- **降級**:`chatTextOpenRouter` 回 null / 篇數不符 → 走既有 `fallbackTopics`,此時 `recommendationReason` = content-type hint、`sourceSignals` = `[]`。
- **快取**:signals 依 `(clientId, year, month)` 快取(記憶體或 plan.signalsJson),避免同月重複抓;未來第三方 provider 才不會爆 quota。
- **provider 逾時**:每個 provider `fetch()` 包 try/catch + 逾時,失敗回 `[]`。

---

## 8. UI(最小改動)

- `StrategyAndTopics` topic 卡片顯示 `recommendationReason`(小字灰色,類似現有 `contentDirection`)。
- 若 `sourceSignals` 非空 → 顯示來源 chip(例:`來源:換季保養`)。
- **呼叫端 API 不變**,前端只多讀兩個欄位。

---

## 9. 影響檔案清單

| 動作 | 檔案 |
|---|---|
| 新增 | `src/lib/planner/trend-signals.ts`(型別 + providers + registry + aggregator) |
| 改 | `prisma/schema.prisma`(ContentPlanItem +2 欄、Plan +signalsJson) |
| 新增 | `prisma/migrations/<ts>_add_trend_signals_fields/migration.sql` |
| 改 | `src/app/api/marketing-plans/[planId]/topics/route.ts`(收集訊號 → prompt → normalize 落兩欄) |
| 改 | `src/lib/marketing-planner.ts`(normalize/serialize 帶上兩欄,可選) |
| 改 | `src/components/marketing-planner/StrategyAndTopics.tsx`(顯示 reason / signal chip) |

> `regenerate/route.ts` 之後可比照追加 `recommendationReason`,非首版必要。

---

## 10. 分階段落地

1. **P1 — 骨架(可空跑)**:型別 + Port + Mock/ImportantDate provider + schema 兩欄 + topics route 落庫。訊號可全空,但欄位一定寫入。
2. **P2 — 用起來**:prompt 注入 signals + 前端顯示 reason/來源 chip + 防幻覺過濾。
3. **P3 — 接真實來源**:加 `GoogleTrendsSignalProvider` / `RapidApiSignalProvider`(此時才碰第三方 + env key),呼叫端不動。

---

## 11. 驗收

- [ ] 無訊號時:topics 照常生成,每筆 `recommendationReason` 有值、`sourceSignals=[]`、`plan.signalsJson=[]`。
- [ ] 有重要日期時:對應 topic 的 `sourceSignals` 帶到該日期 signal id。
- [ ] LLM 亂填不存在的 signal → 被過濾掉。
- [ ] provider 丟錯 → 整體不炸,降級成空。
- [ ] `npx prisma validate && npx prisma generate && npx tsc --noEmit && npm run build` 全過。
