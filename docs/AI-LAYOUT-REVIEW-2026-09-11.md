# AI 幫我排版 — Review 結果與後續方向（2026-09-11）

給接手繼續優化的人（Codex）。這份記錄三件事：
**① 我改了你哪些程式碼、為什麼 ② 現在的實測數據 ③ 建議的下一步。**

分支：`release/product-image-set`（未推，領先 `main` 48 個 commit）
你的分支 `codex/ai-layout-surface-placement-fixes` 已 merge（`98c747c`，零衝突）。

---

## 0. 先知道：這個功能在正式站是關著的

`SHOW_AD_LAYOUT`（`src/lib/feature-flags.ts`）預設關閉，使用者點「AI 幫我排版」
會看到「新功能還在籌備中」。原因是版面品質還沒到可以交付的程度。

**要測試：網址加 `?adlayout=1`**（記在 sessionStorage，同分頁換頁仍有效）；
`?adlayout=0` 關掉。整個環境打開則設 `NEXT_PUBLIC_SHOW_AD_LAYOUT=1`。

連帶：`AD_LAYOUT_ART_DIRECTION_ENABLED` 只影響這個功能的後端，
旗標關著時它在正式站沒有作用。

---

## 1. 我改了你的哪些程式碼

### 1-1 `alignProductToSurface`：貼齊檯面不得讓商品消失
`src/lib/magic-layers/ad-layout-composition.ts`

你用「檯面上方的空間」當商品高度上限：
```ts
const maxHeight = Math.max(1, surfaceTop - Math.round(canvasHeight * 0.08));
```
檯面偵測得越高，商品越小。實測（1:1、產品比例 0.6，走完整 pipeline）：

| `surfaceRect.y` | 商品面積 |
|---|---|
| 0.05 | **1×1 px**（`Math.max(1, 負數)` 退化） |
| 0.20 | 0.87% |
| 0.35 | 4.37% |
| 0.45 | 8.20% |
| 無 surfaceRect（對照） | 25.16% |

**我的修法**：貼齊後若不足原尺寸一半（`MIN_GROUNDED_AREA_RATIO = 0.5`）就整個
放棄貼齊，退回原本排版。貼齊是加分項，不值得為它輸出一張看不到商品的圖。

### 1-2 `isProductUndersized`：保護要看「有沒有真的貼齊」
`src/lib/magic-layers/ad-layout-polish.ts`

你在有 `surfaceRect` 時直接停用這個保護。但它的門檻是 22%，而上表每個案例
都低於 22% —— 唯一能擋下過小商品的東西，剛好在會出事的情況下被關掉。

**我的修法**：改成只在商品**底部真的貼齊檯面上緣**（誤差 ≤1px）時才停用；
被 1-1 放棄貼齊的情況照常修補。

### 1-3 `sceneGrounding` 與 `surfaceRect` 脫鉤（⚠️ 我改了你一個刻意寫的測試）
`src/lib/magic-layers/ad-layout-vision-policy.ts`

你改成 `sceneGrounding = surfaceRect ? "surface" : "floating"`，並寫了測試
`does not claim surface grounding without a trusted normalized surface rectangle` 主張這個行為。

我認為這個耦合有害：`parseSurfaceRect` 只要邊界差一點（例如 `x=0.5, w=0.51`
讓 `x+w>1`）就回 `undefined`，於是**檯面判定明明可信，卻整個降級成 floating**，
連帶失去 `soft-ellipse` 陰影（`ad-layout-design-spec.ts:169`）與商品整合模式
（`ad-layout-product-integration.ts:36`）。

而且這不減少資訊 —— 需要精確座標的 `composition` 與 `polish` 本來就各自檢查
`surfaceRect`。兩者語意應該分開：
- `sceneGrounding` → 「這是不是可信的檯面場景」（陰影、整合模式吃它）
- `surfaceRect` → 「要貼齊到哪個座標」（composition、polish 吃它）

**我把該測試改寫成** `keeps surface grounding without a rect, but exposes no rect to align to`，
並在測試上方寫明分工。**這是設計分歧不是你的疏忽，你有不同意見可以提出來討論。**

### 1-4 有賣點時商品被壓扁（這個不是你這次的，是更早的 composition 行為）
`src/lib/magic-layers/ad-layout-composition.ts`

```ts
// 修改前
if (input.benefits?.length) { heroZone.h = Math.min(heroZone.h, Math.round(H * 0.72) - heroZone.y); ... }
```
賣點列實際畫在 `y = 0.77`（`ad-layout-renderer.ts:207`），所以限制是
「商品底部要在賣點列之上」—— 這用**上移**就能滿足，不必犧牲尺寸。
但原本只會「壓扁」，而 scene-led 兩個版型的 hero 起點本來就低
（`scene-copy-overlay` y=0.53、`scene-product-corner` y=0.59），夾完只剩
0.13–0.19 個畫布高。

**我的修法**：先把 hero 區塊上移（保留 8% 上邊界），真的還不夠才縮。

### 1-5 `decision.graphics` 現在沒有消費端（沒有移除，只加註解）
你把 `benefits` 改成無條件保留（正確，使用者輸入的內容不該被 AI 決定要不要顯示），
但這讓 `decision.graphics` 變成沒有任何地方讀取的欄位，prompt 卻還在要模型決定它。

**沒有移除的理由**：`parseArtDirection`（`ad-layout-art-direction.ts:11`）用
**嚴格的 key 集合比對**，少一個 key 而模型仍回傳它，整份 art direction 會被判
無效並靜默退回 fallback。要移除得**先讓 parser 容忍未知欄位**。

---

## 2. 你做對的地方（不要回退）

- 否定詞判斷從「整句出現否定就不給 icon」改成「只看緊鄰前綴」：
  `無油保濕`、`不黏膩超保濕` 以前會被誤殺，現在正確。
- vision 先用**最終畫布比例**裁背景再送模型（`prepareAdBackground`），
  座標才對得上輸出。這個修得漂亮，是 surfaceRect 能用的前提。
- `parseSurfaceRect` 的邊界驗證嚴謹（0–1、`x+w<=1`、`w>0`）。

---

## 3. 實測數據（修完之後）

矩陣：2 個產品 × 3 種比例（1:1 / 4:5 / 9:16）× 4 種用途 = **72 個版型**

| 指標 | 我修之前 | 現在 |
|---|---|---|
| 商品面積中位數 | 9.2% | **14.1%** |
| 小於畫布 5% 的版型 | **24 / 72** | **4 / 72** |
| 「情境氛圍感」中位數 | 1.7–3.6% | **6.9%**（4.7–10.1%） |
| 文字出界 | 0 | 0 |
| 文字互相重疊 | 0 | 0 |
| 文字壓到商品 | 0 | 0 |
| 賣點不是 3 條 | 0 | 0 |
| 商品底部越過賣點列 | — | 0 |

真實 vision 回傳範例：`surfaceRect {x:0, y:0.62, w:0.55~0.99, h:0.1}`
（同一請求兩次 `w` 不同，注意這支是非決定性的）。

重現方式：
```bash
curl -s -X POST http://localhost:3012/api/magic-layers/ad-layout \
  -H "Content-Type: application/json" \
  -d '{"clientId":"cmpqp7qff0000dhvzidc6v08z","productId":"cmts4wc2e00005hvz8i72uyw8",
       "purpose":"benefit","ratio":"4:5","benefits":["溫和不刺激","48 小時保濕","柔嫩觸感"]}'
```
（`benefits` 是**字串陣列**，不是物件陣列。這支不生圖，只呼叫一次 vision 判讀。）

---

## 4. 建議的下一步（依優先序）

### P1 — scene-led 版型商品仍偏小（中位 6.9%，仍是三個選項裡最小）
已從 1.7% 改善到 6.9%，但對「可以交出去的圖」還是偏小。
根因是 `scene-copy-overlay` / `scene-product-corner` 的 hero zone 本來就窄
（`w:0.29 h:0.35` 與 `w:0.251 h:0.29`，見 `ad-layout-templates.ts:53,61`）。
**建議**：直接調大這兩個版型的 hero zone，而不是靠 polish 補救 ——
`MAX_PRODUCT_SCALE` 只放大 8%，對一個 5% 的商品杯水車薪。

### P2 — `isProductUndersized` 的修補幅度應該跟著缺口走
目前是固定放大 8%。門檻是 22%，但一個 6% 的商品放大 8% 之後還是 6.5%。
**建議**：改成「算出要多大才達標，在不碰到保護區的前提下一次補足」。

### P3 — 讓 `parseArtDirection` 容忍未知欄位，然後移除 `graphics`
順序不能反（見 1-5）。

### P4 — `[套圖·情境背景版]` 生出完整場景照，而不是空的、可放商品的背景
使用者早先回報過，還沒處理。

### P5 — 真實文案驗證賣點語意詞
`f7584a0` 加的「溫和/不刺激/親膚/低刺激/柔嫩/觸感/舒緩/修護」目前只有單元測試，
沒有用真實品牌文案跑過一輪看 icon 配得對不對。

---

## 5. 開發與驗收規範

- dev server：`preview_start` 的 `marketing-release`（port 3012）。
  **不要用 Bash 跑 `next dev`**，也不要在別的目錄再開一個（Next 16 會拒絕）。
- **不要點「AI 建立商品套圖」的生成按鈕** —— 那會消耗付費影像生成。
  「AI 幫我排版」不生圖，可以放心測。
- 驗收：
  - `npx tsc --noEmit` 乾淨
  - `npx next build` EXIT=0
  - `npx tsx --test "src/lib/**/*.test.ts" "src/app/**/*.test.ts"` → **285/286**
    （唯一允許失敗：既有的 `planner/content-brief` `subtitleText` fixture）
  - 改動的檔案 `npx eslint <files>` 要 0 error。
    全 repo 目前有 54 個既有 error，不要增加（也不要順手清，那是另一個任務）
- **改了版面行為就要重跑 §3 的 72 版型矩陣**，貼出前後對照。
  只跑單元測試不夠 —— 我這次抓到的兩個問題，你的單元測試全都是綠的。
