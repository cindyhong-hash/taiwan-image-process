# HK Dev 交接文檔 — marketing-tool

> 對象：香港開發團隊（HK development team）。
> 呢份係 **dev 專用**交接（整合環境設定 + 專案架構 + 已知事項）。
> 老闆／操作用戶請睇 [`GUIDE-新手使用.md`](GUIDE-新手使用.md)。

---

## 0. 一分鐘概覽

**marketing-tool** 係一個社群行銷素材工具。核心係素材庫 `/library`（2 個分頁）：
- **生成圖片**：積木組合（構圖／配色／語氣／背景）+ 主體或上傳產品圖 → AI 生成圖片 + 文案，或去背產品圖合成到背景。
- **風格組件**：品牌圖庫（上傳分析圖 + 生成圖）→ 點圖睇 popup、帶入生成、編輯、行業範本一鍵套用。

技術棧：**Next.js 16 (App Router) + React 19 + TypeScript + Prisma 7 / SQLite（libsql adapter）+ Tailwind + shadcn/ui**。
所有 AI 輸出（分析／文案）一律**繁體中文（台灣）**；設計描述以繁中為主，生成時自動翻英餵圖片模型。

---

## 1. 環境需求

- **Node.js 20+**（附 npm）
- macOS / Linux / Windows（開發用；圖片生成 call 外部 API，見第 5 節地區注意）

---

## 2. 起步（5 步）

```bash
# 1) 裝套件
npm install

# 2) 環境變數：由範本建立，填入真實 key（見下表）
cp .env.example .env.local

# 3) 資料庫（二選一，見 2.1）
#    (A) 用交付嘅 dev.db：直接複製 → 只需 generate
#    (B) 全新空 DB：
DATABASE_URL="file:./prisma/dev.db" npx prisma migrate deploy
npx prisma generate

# 4) 圖片素材：將交付嘅 public/uploads/ 複製返入（否則舊圖連結會 404）

# 5) 起動
npm run dev   # → http://localhost:3000（自動轉去 /library）
```

### 2.1 資料庫兩條路
本專案用 **SQLite**（`prisma/dev.db`，gitignore，唔會經 git 帶走）。

- **(A) 用交付嘅 dev.db**（想保留示範資料）：將素材包內嘅 `dev.db` 放入 `prisma/`，再 `npx prisma generate`。
- **(B) 全新空 DB**：`DATABASE_URL="file:./prisma/dev.db" npx prisma migrate deploy` → `npx prisma generate`。

⚠️ **切勿** `prisma migrate reset` 或手動刪 `dev.db`（會清資料）。
改 schema 時：
```bash
DATABASE_URL="file:./prisma/dev.db" npx prisma migrate dev --name xxx --create-only  # 先檢查 SQL 只有 ADD/CREATE
DATABASE_URL="file:./prisma/dev.db" npx prisma migrate dev                            # 套用
```

---

## 3. API Keys（`.env.local`，唔 commit）

> 交付嘅素材包用 `.env.example` 範本，**唔含真實 key**。請自行申請以下 key 填入 `.env.local`。

| 變數 | 用途 | 取得位置 |
|---|---|---|
| `OPENROUTER_API_KEY` | 圖片分析(vision) + 生成文案 | https://openrouter.ai/keys |
| `FAL_KEY` | 圖片生成 / 產品合成（**主力**）| https://fal.ai/dashboard/keys |
| `HF_TOKEN` | 圖片生成（**備用**，Read token）| https://huggingface.co/settings/tokens |

其他（選填）：`OPENROUTER_VISION_MODEL` / `OPENROUTER_TEXT_MODEL`（預設 `openai/gpt-4o-mini`）、各 `FAL_*_MODEL` override（唔填用 code 內預設）、`GEN_PROVIDER`（`inapp` 預設）。詳見 `.env.example` 內註解。

⚠️ **OpenRouter / fal model id 會輪換或下架**。若 analyze/generate 回 `404` / `No endpoints found`，去 https://openrouter.ai/api/v1/models （或對應 fal model 頁）揾現存平價且支援 vision 嘅 model 換上即可，唔使改 code。

---

## 4. 專案架構

### 4.1 目錄
```
src/
  app/
    library/            # 核心頁：素材庫（生成圖片 / 風格組件 2 tabs）
    clients/            # 品牌 / 客戶管理
    unassigned/         # 未分派素材
    api/                # 所有後端 route（見 4.3）
  components/
    library/            # 素材庫 UI
    clients/  activities/  layout/
    ui/                 # shadcn/ui primitives
  lib/                  # 核心邏輯（見 4.2）
  hooks/  types/
prisma/
  schema.prisma         # 5 個 model（見 4.4）
  migrations/           # 5 個 migration
public/uploads/         # 上傳 + 生成圖片（gitignore，需素材包）
scripts/                # 工具 script（見第 7 節）
docs/                   # 文檔
```

### 4.2 核心 lib 模組
| 檔案 | 職責 |
|---|---|
| `lib/db.ts` | Prisma client（libsql adapter）|
| `lib/fal.ts` | fal.ai：圖片生成、產品合成、去背、nano-banana / FLUX.2 / Seedream |
| `lib/openrouter.ts` | OpenRouter：vision 讀圖 + 文字生成 |
| `lib/generate.ts` | 生成流程編排（compile prompt → 出圖 → 出文案 → 存 DB）|
| `lib/composite.ts` | 合成模式：去背 PNG 用 `sharp` 疊背景 |
| `lib/prompts.ts` | prompt 模板（含繁中→英翻譯）|
| `lib/extract-components.ts` | 由參考圖抽構圖／配色／語氣 |
| `lib/openai.ts` / `lib/anthropic.ts` | 活動 AI route（部分實際走 OpenRouter）|

### 4.3 主要 API route（`src/app/api/`）
- **library**：`generate`（生成/合成）、`gallery`（列圖）、`describe`（讀圖填主體）、`polish`（潤色描述）、`save-image`、`images/[id]`、`template-paste`
- **ai**：`analyze-image`（vision 分析）、`optimize-prompt`
- **其他**：`clients`、`components`（風格組件）、`activities`（廣告活動）、`layouts`、`assets`、`upload`、`export`、`generate`、`inpaint`、`transform-copy`

### 4.4 資料模型（`prisma/schema.prisma`）
`Client`（品牌）、`Activity`（廣告活動）、`GeneratedLayout`、`StyleComponent`（風格組件）、`LibraryImage`（素材庫圖片）。

---

## 5. 供應商 & 地區注意（重要）

| 用途 | 主力 | 備用 |
|---|---|---|
| text→image（純文字生圖）| fal.ai FLUX.1-schnell | HF FLUX（`router.huggingface.co`）|
| 產品合成 | fal.ai（FLUX.2 edit / nano-banana / Seedream）| `sharp` 疊圖（需透明去背 PNG）|
| 文字 / 分析（vision + text）| OpenRouter `openai/gpt-4o-mini` | — |

⚠️ **地區設定**：預設係台灣設定（供應商帳號）。**喺香港本機直接出圖可能 geo-block 失敗，屬預期**。詳見 [`API-REGION-NOTES.md`](API-REGION-NOTES.md)。

---

## 6. 交付內容（素材包）

git repo **只帶 code + 文檔**。以下係 gitignore、**唔會**喺 clone 入面，由**素材包**另外交付：

| 內容 | 路徑 | 說明 |
|---|---|---|
| 本機資料庫（示範資料）| `prisma/dev.db` | 放入 `prisma/`（~1 MB）|
| 上傳 / 生成圖片 | `public/uploads/` | 放入 `public/`（~445 MB，否則舊圖 404）|
| 環境變數範本 | `.env.example` | 複製成 `.env.local` 填真 key（**唔含真 key**）|

> 素材包用 `scripts/pack-materials.sh` 產生（見第 7 節）。**唔含任何真實 API key**。

---

## 7. 常用 script

| 指令 | 作用 |
|---|---|
| `npm run dev` | 起 dev server（`dotenv -e .env.local`）|
| `npm run build` / `npm run start` | production build / 起動 |
| `npm run lint` | ESLint |
| `npm run unused-assets` | 只讀列出未被引用嘅素材（清理參考用，唔會刪）|
| `bash scripts/pack-materials.sh` | 打包交付素材（dev.db + uploads + .env.example）成 zip |

---

## 8. 已知事項 / 注意

1. **Next.js 16 有 breaking changes**：API／慣例可能同舊版唔同。寫 code 前參考 `node_modules/next/dist/docs/`，留意 deprecation。（見 `AGENTS.md`）
2. **AI 生成要錢／時間**：每次 call 付費 API，開發測試唔好亂 loop。
3. **產品上中文字保真**：FLUX.2 edit 單圖最好；多過一張產品時細字會微糊；nano-banana 有字會走樣（適合無產品文字嘅合成）。
4. **本機部署限制**：本 app 寫圖去本機 `public/uploads/` + 用 SQLite，**Vercel serverless 部署唔到**（檔案系統唯讀/即棄）。要 URL 可行路：本機 + Cloudflare Tunnel（最快）、Render / Railway（持久 disk）、或改雲端 storage + Postgres（工程量中～大）。

---

## 9. 聯絡 / 交接後跟進
- 完整功能／變更紀錄、關鍵設計決定、backlog：內部文檔（`FEATURE_LOG.md` / `DECISIONS.md` / `CHECKLIST.md`）——如需，另行提供。
- 有問題請聯絡交接人。
</content>
</invoke>
