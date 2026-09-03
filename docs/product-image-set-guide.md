# 實作指南：AI 產品套圖（第一階段）— 交接給 Codex

> 這份指南給實作代理（Codex）。目標是把「產品套圖」這條流程做進 marketing-tool。
> 範圍**只含第一階段**。畫布 / 當底重繪(img2img) / planner 掛產品 / 多圖整合 **不在這份裡**，見文末「明確不做」。

---

## 0. 動手前先做這件事（必讀）

這份指南裡引用的檔案路徑來自一次程式庫探勘，**動手前請先實際打開下列檔案確認現況**（分支、命名、欄位可能有出入，以實際程式碼為準）：

- `prisma/schema.prisma` — 確認 `Client`、`LibraryImage`、`StyleComponent`、`Activity`、`CampaignProduct` 的實際欄位。
- `src/components/library/LibraryWorkspace.tsx`、`AddAssetModal.tsx`、`ComponentGrid` — 素材庫現況。
- `src/lib/generate.ts` 與 `src/app/api/library/generate/route.ts` — 現有的素材生成引擎與非同步流程。
- `src/app/api/magic-layers/cutout/route.ts` 與 `src/lib/fal.ts` 的 `removeBackground` — 現有去背能力。
- `src/lib/storage.ts` — 圖檔儲存（Blob / 本機）。
- 根目錄 `DESIGN.md` — **做任何 UI 前先讀，一律照「白卡片 v2」設計系統。**

先讀，再照下面實作。遇到與本指南不符的地方，以程式碼現況為準，並在 PR 描述裡註明差異。

---

## 1. 這是什麼、為什麼

把「產品」變成平台的一等公民資料骨幹。使用者為每支產品**一次性**建立資產（去背主圖 + 一組可疊素材積木），之後所有內容製作都能「選產品、資產自動帶入」，不必每次重傳重挑。

第一階段只做「養出產品資產」這一段：

```
素材庫 → 新增產品 → 上傳 2–3 張原始商品照 → 自動去背
   → ✨ AI 建立商品套圖（AI 依產品建議一組積木，可勾選）
   → 批次生成「可疊積木」→ 存回素材庫，歸在此產品名下
   → 產品詳情頁看到整組資產 + 完整度
```

### 關鍵設計決策（請務必遵守）

1. **資料歸屬 = 品牌 > 產品 > 資產。** 資產必須真正「屬於產品」（帶 `productId`），不是只貼標籤。這是之後「選產品自動帶入」能成立的根。
2. **套圖產出的是「可疊積木」，不是「現成貼文」。** 產出應是可再排版 / 可當底的圖層零件（去背產品、去背質地、留白背景版、裝飾元素…），不是拼好文字的成品。理由：成品下游會被重畫、不會直接複用；積木才可複用。
3. **產品住在素材庫裡**（新增一個「產品」分頁 + 每支產品的詳情頁），**不要另開頂層 nav，也不要塞進品牌設定頁。**
4. **兩條生成路徑**：實拍類（主視覺、質地、情境）以「去背主圖」為錨點做合成/換背景，確保同一支產品外觀一致；概念類（成分、功效）走品牌風格 text-to-image，可不含產品實拍。
5. **能複用就不要重寫。** 去背、生成引擎、儲存、輪詢、素材庫元件都已存在（見第 3 節），一律沿用。

---

## 2. 資料模型變更（Prisma）

Stack：Next.js App Router + Prisma + SQLite/**Turso**。圖檔在 Blob/本機，圖的紀錄在 DB。

### 2.1 新增 `Product`

```prisma
model Product {
  id          String   @id @default(cuid())
  clientId    String                       // 屬於哪個品牌(Client)
  client      Client   @relation(fields: [clientId], references: [id], onDelete: Cascade)
  name        String                       // 例：水光精華
  description String?                      // 賣點/定位（餵給生成當 context）
  category    String?                      // 產品類型：保養/彩妝/3C/食品…（驅動套圖建議）
  // 品牌覆寫（可選；null 表示沿用 Client 的設定）
  primaryColorOverride   String?
  // 原始照與去背主圖
  rawImageUrls    String?                  // JSON array，使用者上傳的原始照
  heroImageUrl    String?                  // 自動去背後的乾淨主圖（積木的錨點）
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  assets      LibraryImage[]               // 這支產品擁有的資產（見 2.2）
}
```

在 `Client` 加上反向關聯：`products Product[]`。

### 2.2 讓資產歸屬產品

在既有 `LibraryImage` 加欄位（**沿用現有 model，不要另開新表**，才能直接吃現有素材庫 UI 與生成流程）：

```prisma
model LibraryImage {
  // ...既有欄位...
  productId String?                        // 新增：屬於哪支產品（null = 一般素材）
  product   Product? @relation(fields: [productId], references: [id], onDelete: SetNull)
  assetRole String?                        // 新增：積木角色 hero/texture/ingredient/background/decoration/finished
}
```

`assetRole` 用來在產品詳情頁分區、以及做「完整度」判斷。

### 2.3 Migration 注意（Turso）

- 依專案現有做法產生 migration（確認是 `prisma migrate` 還是手動 SQL 套到 Turso）。
- Turso 是遠端 SQLite，**新欄位要記得套到 production 的 Turso 實例**，不是只有本機 `dev.db`。照專案既有的遷移流程走，別自創。

---

## 3. 直接複用這些現成能力（不要重寫）

| 需求 | 用現成的 | 位置 |
|---|---|---|
| 去背 | `removeBackground` / cutout 端點 | `src/lib/fal.ts`、`src/app/api/magic-layers/cutout/route.ts` |
| 產品合成 / 換背景 | `falFlux2Edit`（fal-ai/flux-2-pro/edit）等 | `src/lib/generate.ts` |
| 概念類 text→image | `falAiImage` / `falRecraft` 等 | `src/lib/generate.ts` |
| 非同步生成 + 狀態回填 | `after()` + `LibraryImage.status` + `batchId` + 輪詢 | `src/app/api/library/generate/route.ts`、`src/lib/pollLibraryImage.ts` |
| 圖檔儲存 | `saveBuffer` / `loadBuffer`（Blob 或本機） | `src/lib/storage.ts` |
| 素材庫 gallery / 型別 | `ComponentGrid`、`GalleryItem` | `src/components/library/`、`src/types/library.ts` |
| 品牌 context（顏色/語氣/logo/過往風格） | `Client` 欄位 | `prisma/schema.prisma` |
| 上傳 | `/api/upload` | `src/app/api/upload/route.ts` |

**套圖批次生成 = 把上面的積木組起來的一層新編排**，不是新引擎。用現有 `batchId` 把一次套圖的 N 張標成一組，逐張走 `after()` 非同步生成、`status` 回填、前端輪詢。

---

## 4. 要實作的單元

拆成可獨立完成、可獨立測的單元，依序做。

### 單元 A — Schema + Migration
- 依第 2 節新增 `Product`、`LibraryImage.productId` / `assetRole`，產生並套用 migration（含 Turso）。
- 加 seed 或手動建一筆測試產品，確認關聯可讀寫。

### 單元 B — Product API + 建立產品（含去背）
- CRUD：`POST/GET/PATCH/DELETE /api/products`（照現有 `api/clients`、`api/library` 的寫法與錯誤處理慣例）。
- 建立產品時：接收 name / description / category / 原始照（走 `/api/upload`）。
- 建立後**自動對主要一張做去背**，把結果存成 `heroImageUrl`（呼叫現有 cutout）。
- 產品自動繼承品牌設定；`*Override` 欄位有值才覆寫。

### 單元 C — 素材庫「產品」分頁 + 產品詳情頁（UI，先讀 DESIGN.md）
- 素材庫新增「產品」分頁，列出該品牌所有產品（產品卡：主圖 + 名稱 + 完整度）。
- 產品詳情頁：原始照 / 去背主圖、`✨ 建立商品套圖` 入口、依 `assetRole` 分區的資產、完整度儀表、品牌覆寫設定。
- 一律照白卡片 v2；沿用 `ComponentGrid` 呈現資產。
- **注意**：若用到 `useSearchParams`，記得包在 `<Suspense>` 裡（此專案 production build 會因此失敗過）。

### 單元 D — AI 套圖建議 + 批次生成（核心）
- **建議清單依產品動態產生**，不要寫死 6 格。依 `category` + `description` + 品牌，回一組建議積木（每項含 `assetRole`、標題、預設 prompt、生成路徑=實拍/概念）。可用現有生成 provider 的 LLM 能力產生建議，或先用規則表 + 品類模板起步（在 PR 註明用哪種）。
- 使用者勾選後 `✨ 生成`：
  - 建一個 `batchId`。
  - 每張建一筆 `LibraryImage`（`productId` = 此產品、`assetRole` = 對應角色、`status = GENERATING`）。
  - **實拍類**：以 `heroImageUrl` 為輸入走 `falFlux2Edit` 類（換背景/情境/質地），確保產品一致。
  - **概念類**：走 text→image，帶品牌風格。
  - 全程 `after()` 非同步、`status` 回填、前端輪詢（沿用 `pollLibraryImage`）。
- **去背處理**：需要可疊的積木（去背產品、去背質地）在生成後過一次去背，存成透明 PNG。

### 單元 E — 存回 & 呈現
- 生成完成的資產已帶 `productId`，直接出現在該產品詳情頁與素材庫（依產品篩選）。
- 完整度：依該產品已有哪些 `assetRole` 計算（例：有 hero/texture/background 就算基本完成，缺的提示「補生成」）。

### 單元 F — 橋按鈕（stub 即可）
- 產品詳情頁 / 套圖結果放一顆「使用這組素材建立圖文」。
- 第一階段**只需**把使用者帶到現有建立圖文流程，並把該產品的資產 URL 先帶過去（沿用現有 `productImageUrls` 輸入即可）。**完整的「選產品自動帶入」整合是後續階段**，這裡只做能通的最小串接。

---

## 5. 驗收標準

1. 能在素材庫新增一支產品、上傳原始照，系統自動產生去背主圖。
2. 產品詳情頁按「AI 建立商品套圖」，會依產品類型給出**動態**建議清單（非寫死）。
3. 勾選後批次生成，逐張非同步回填，實拍類產品外觀彼此一致（同一支產品）。
4. 可疊積木存成透明 PNG，全部歸在該產品名下，於詳情頁與素材庫可見。
5. 單張可重生、不需整組重跑。
6. 「使用這組素材建立圖文」能把該產品資產帶進現有建立圖文流程。
7. Migration 已套到 Turso；production build 通過（含 Suspense 檢查）。

---

## 6. 明確不做（後續階段，別做進來）

- ❌ 統一畫布 / 自由排版整合（free-layout 匯流）。
- ❌ 「以此為底 AI 生成完整圖」img2img 當底重繪。
- ❌ planner 月曆掛產品、從月曆進畫布帶 context。
- ❌ 多圖/輪播與套圖整合、跨張一致性機制重寫。
- ❌ 建立圖文全面改成「選產品自動帶入」（單元 F 只做最小串接）。

這些是整體「一條龍」藍圖的後段。第一階段只把「產品 + 套圖 + 存回素材庫」走通，先驗證「複用」的價值。

---

## 7. 工作方式建議（給 Codex）

- 先讀第 0 節列的檔案，跟著現有 pattern 寫（命名、錯誤處理、API 形狀、非同步流程）。
- UI 一律照 `DESIGN.md`（白卡片 v2）。
- 依單元 A→F 順序，一個單元一個可測的 commit；每個單元附上如何驗證。
- 不確定的設計選擇（例：建議清單用 LLM 還是規則表）在 PR 描述提出，不要自行擴大範圍。
- 保持與正在進行的素材庫重構相容——若動到 `LibraryWorkspace` / `AddAssetModal`，用「新增」而非「打掉重寫」。
