# Vercel 專案搬遷清單（搬到另一個 Pro／公司帳號）

> 用途：把 taiwan-image-process 從現有 Vercel 專案搬到另一個（Pro/公司）Vercel 帳號時，照這份逐項打勾。
> 「Secret」值在 Vercel dashboard 設定後看不到 —— 先用 `vercel env pull` 從舊專案拉出所有值再貼到新專案。

---

## 步驟順序（建議照這個順序做）

- [ ] 1. 舊專案拉出所有環境變數值：`vercel env pull .env.old.local`（在舊專案連結的目錄跑）
- [ ] 2. 新帳號建立 Vercel 專案、連結 GitHub repo（production 分支設 `main`）
- [ ] 3. 決定資料庫策略（沿用同一個 Turso ／ 建新 Turso）— 見下方 🟡
- [ ] 4. 決定 Blob 策略（沿用舊 Blob store ／ 建新 + 搬圖）— 見下方 🔴
- [ ] 5. 把環境變數逐一加到新專案（照原本的 scope）— 見下方三張表
- [ ] 6. 確認 `vercel.json`（region hnd1）、Framework（Next.js）自動套用
- [ ] 7. 綁自訂網域（如果有）
- [ ] 8. 部署一次，驗證：登入、素材庫圖片顯示、產品套圖生成、靈感中心
- [ ] 9.（Pro）把函式時長調回較高值（見最後一節）

---

## 環境變數（14 個）

### 🟢 直接複製舊值即可（外部服務金鑰／設定，與哪個 Vercel 無關）
- [ ] `OPENROUTER_API_KEY` — 靈感中心／文案／產品視覺分析主力 LLM
- [ ] `OPENROUTER_VISION_MODEL` — 視覺分析模型名（Production-only）
- [ ] `OPENROUTER_TEXT_MODEL` — 文字模型名（Production-only）
- [ ] `ANTHROPIC_API_KEY` — Claude
- [ ] `OPENAI_API_KEY` — OpenAI（部分功能）
- [ ] `FAL_KEY` — 去背／產品合成／生圖（fal.ai）
- [ ] `HF_TOKEN` — HuggingFace 後備生圖
- [ ] `HF_IMAGE_MODEL` — HF 模型名
- [ ] `POLLINATIONS_TOKEN` — Pollinations 後備
- [ ] `RAPIDAPI_KEY` — 靈感中心 Threads 趨勢來源（Production-only；沒設會自動跳過，不影響）
- [ ] `GEN_PROVIDER` — 生成 provider 切換（inapp / n8n）

### 🟡 資料庫（Turso）— 看要不要換
- [ ] `DATABASE_URL`
- [ ] `DATABASE_AUTH_TOKEN`（Production-only）

  - **沿用同一個 Turso DB**（最簡單）→ 直接把這兩個值複製到新專案即可。
  - **要獨立的新 DB** → ①Turso 建新 database ②`DATABASE_URL="<新>" npx prisma db push`（或用 libsql 套 schema，含 Product / visualProfile / LibraryImage.productId,assetRole 等新欄位）③用 `npm run migrate-to-cloud` 把舊資料搬過去 ④換成新的 URL/Token。

### 🔴 儲存（Vercel Blob）— 一定要處理，別只複製
- [ ] `BLOB_READ_WRITE_TOKEN`

  - Vercel Blob 綁專案。新專案預設會有**自己的新 Blob store**。
  - ⚠️ **現有圖片都在「舊 Blob」**；若直接用新 store，舊圖網址會失效（圖全破）。
  - **建議①（最省事）**：新專案沿用「舊 Blob store 的 token」→ 圖不用搬、網址不變。
  - 選項②：新專案建新 store + 把舊 store 的檔案搬過去（較麻煩，通常不需要）。

---

## 值怎麼拿（Secret 看不到）
```bash
# 在「舊」專案連結的目錄
vercel env pull .env.old.local        # 一次拉出所有值
# 逐一加到「新」專案（或用 dashboard 貼）
vercel env add OPENROUTER_API_KEY production
# ...其餘照做，注意 scope（Production / Preview）
```
外部金鑰（OpenRouter / FAL / RapidAPI / Anthropic / OpenAI / HF / Pollinations）也可從各服務後台重新複製。

---

## Vercel 專案設定（不只環境變數）
- [ ] Git：連結 GitHub repo，production 分支＝`main`
- [ ] Region：`hnd1`（東京）— 已寫在 `vercel.json`，自動套
- [ ] Framework：Next.js（自動偵測）
- [ ] 環境變數 scope 照舊：多數 Production+Preview；`RAPIDAPI_KEY` / `BLOB_READ_WRITE_TOKEN` / `DATABASE_AUTH_TOKEN` / 兩個 `OPENROUTER_*_MODEL` 為 Production-only（或全設 Production+Preview 省事）
- [ ] 自訂網域（如有）重新綁定

---

## Pro 版可放寬的設定（搬到 Pro 後）
- **函式時長**：Hobby 上限 300s，本專案目前把產品套圖批次與 regenerate 路由設 `maxDuration = 290`、orchestrator 內部 deadline 270s（為了 Hobby 不被砍）。
  - 搬到 **Pro（開 Fluid Compute）** 後可調回 **800s**，一次生 5 張套圖不會被中途砍。
  - 要改的檔：`src/app/api/products/[productId]/image-set/route.ts`、`src/app/api/library/images/[id]/regenerate/route.ts`（`maxDuration`）、`src/lib/products/image-set-orchestrator.ts`（`IMAGE_SET_BATCH_DEADLINE_MS`）。

---

## 驗證清單（部署後）
- [ ] 能登入 / 品牌切換
- [ ] 素材庫圖片、過往貼文圖顯示正常（Blob 沿用的話應正常）
- [ ] 建立圖文（單圖／多圖）能生成
- [ ] 產品套圖：建立產品 → 去背 → AI 建立商品套圖能跑（需 FAL_KEY / OPENROUTER）
- [ ] 靈感中心：能載入推薦（需 OPENROUTER_API_KEY；Threads 需 RAPIDAPI_KEY）
