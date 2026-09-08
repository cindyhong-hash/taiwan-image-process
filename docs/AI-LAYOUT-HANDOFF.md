# AI 幫我排版（AI Ad Layout）— 交接文檔

> V1 已完成並上線（base），這份給接手者（Codex）繼續把它做深。
> 核心價值：把「商品素材包」自動排成一張 **~80% 完成、可編輯的 Canvas 設計稿**（真圖層，不是扁平圖），使用者再自由微調。這是「商品素材」與「自由排版」真正串成一條龍的關鍵差異化功能。

> **V2 已完成（branch `feat/ai-layout-v2`，待 review / 部署）**：同一次設定會產生三個可選方向：`product-focus`（商品主視覺）、`editorial`（編輯留白感）、`scene-led`（情境氛圍感）。使用者先預覽、選一張，才把該選項的 `layers` 寫入既有 seed；seed 契約沒有改。V2 也會把背景以 full-bleed cover 輸出、帶入 `benefit` 圖層、依背景亮度選深／淺可讀文字色，並只把 `client.primaryColor` 用於促銷底板等 accent。

整條產品流程：
`產品 → AI 建立商品素材 → AI 幫我排版 → 可編輯設計稿 → 自由畫布微調 → 完成`

---

## 一、V1 已經做了什麼（base，別重做）

**進入點（產品詳情頁）** `src/app/clients/[clientId]/products/[productId]/page.tsx`
- 兩顆 CTA：`✨ AI 幫我排版`（主，開 `AdLayoutModal`）、`開啟空白畫布`（次，`/magic-layers/compose?blank=1`）。
- （另有「使用這組素材建立圖文」Road A 目前用 `SHOW_USE_FOR_CONTENT=false` 隱藏、程式碼保留，跟本功能無關。）

**Intake 彈窗** `src/components/adcreation/AdLayoutModal.tsx`
- 問極少：用途（`product`/`benefit`/`scene`/`promo`）、尺寸（`1:1`/`4:5`/`9:16`）、主要文字＋副標（選填）。
- 送 `POST /api/magic-layers/ad-layout` → 拿到 `{ options, canvasWidth, canvasHeight }`。每個 option 是不同擺位的真 `LayerData[]`，預覽後才選一張寫入 `sessionStorage[ML_WIZARD_SEED_KEY]` → 導去 `/clients/{clientId}/magic-layers/compose?seed=1`（既有編輯器會讀 seed 載入圖層）。

**組版 API** `src/app/api/magic-layers/ad-layout/route.ts`（`maxDuration=120`）
- 輸入：`{ clientId, productId, purpose?, ratio?, title?, subtitle? }`
- 讀商品素材包：`db.product` + `assets(status=DONE)`，依 `assetRole` 取：`background`→情境背景、`hero`(或 `product.heroImageUrl`)→商品主體、`decoration`→裝飾、`detail`→質地；Logo 取 `client.logoUrls` 第一張。
- 背景由 `ad-layout-data.ts` 用 `sharp` full-bleed cover 到畫布尺寸（無背景素材→淺底），避免白邊；讀 `client.primaryColor`，以背景平均亮度選可讀的深／淺文字色。
- 呼叫 `buildAdLayoutCandidates(...)` 回三個 `LayerData[]` 選項；`benefit` 會以獨立可編輯圖層加入。舊的 `buildAdLayoutLayers(...)` 保留為相容包裝，回第一個候選版，不可拿它當 V2 route 的主入口。

**組版引擎** `src/lib/magic-layers/ad-layout-recipes.ts` → `buildAdLayoutCandidates(input: AdLayoutInput)`
- 產出三套真 `LayerData[]`；素材次序為 `background`（滿版）→ `benefit`（獨立氛圍／賣點圖層）→ `texture`（保持攝影質地，不去背）→ `product` → `decoration` → 文字 → Logo。
- `purpose` 會實際改變主從層級：`benefit` 放大賣點、`scene` 讓背景主導、`promo` 加入 `promo_panel` 品牌色底板與白字。三個候選版型再各有不同的文字／商品／素材位置。

**資料契約（沿用、別破壞）**
- 素材角色 key：`hero｜detail｜background｜benefit｜decoration`（+ legacy `lifestyle｜texture｜ingredient`，見 `src/lib/products/image-set-roles.ts`、`src/lib/productMeta.ts`）。`hero` 是去背透明 PNG。
- Seed：`ML_WIZARD_SEED_KEY = "mlWizardSeed"`（定義於 `src/components/activities/RolePickerModal.tsx`）；形狀 `{ layers: LayerData[], docW, docH, clientId }`。
- `LayerData` / `Bbox` / `TextRole` 型別在 `src/lib/magic-layers/types.ts`；layer `type` 用 `"background" | "product" | "object" | "independent_text"`；文字樣式放 `meta.style`（text/fontSizePx/fontWeight/color/align/fontFamily）。
- 既有 `POST /api/magic-layers/compose`（`buildCompositionLayers`）是另一條較簡單的組版，別跟本功能混用，但可參考它的 helper。

---

## 二、V1 的限界（＝你可以接續優化的地方）

1. **模板太單一**：目前四種用途只差商品大小/字級，不是真的不同版型。應為 `產品介紹 / 賣點介紹 / 情境貼文 / 促銷活動` 做**明顯不同的 layout**（重心、留白、文字區位置都不同）。
2. **沒用到 `benefit`（賣點視覺）圖層**：目前組版沒放它。應把它當氛圍/底層點綴用進去。
3. **文字沒用品牌色 + 沒做可讀性**：V1 用安全深色，沒吃 `client.primaryColor`。要用品牌色的話**必須做對比檢查**（淺色品牌色放在淺背景會看不見）——建議偵測文字所在背景區域亮度再決定深/淺字。
4. **擺位是固定啟發式、會重疊**：文字（左上）可能壓到商品或裝飾；沒有真的「避讓」與「用背景留白區放文案」。情境背景通常右側牆面是留白區，值得偵測利用。
5. **只給一張**：使用者要的是「一次 3 個版型（A 產品主視覺 / B 雜誌感 / C 情境感）→ 選一個進編輯器」。V1 先做一張，這是明確的下一步。
6. **無自動文案**：若使用者沒填標題，可用商品 context 自動建議（可複用 `POST /api/activities/creative-direction`，它回 `{direction, emphases}`）。
7. **排版智能**：可選擇加入「LLM 決定版型/座標/文案」，但**務必保留 deterministic fallback**（LLM 失敗或回傳異常時走模板），避免壞掉。

**建議的接續順序**：先 (1)(4) 把單張版型做像樣（不同用途明顯不同、文字不壓圖、用背景留白），再 (5) 三版型，最後 (2)(3)(6)(7) 加料。

---

## 三、守備範圍與別踩雷（重要）

- **這功能屬於 `magic-layers` / `adcreation` 範圍**（`src/lib/magic-layers/*`、`src/app/api/magic-layers/*`、`src/components/adcreation/*`、產品頁 CTA）。它**只「讀」商品素材包**（穩定契約），**不要改** `src/lib/products/*` 的生成核心（那是另一手在顧的產品生成品質）。
- **別碰**：`src/proxy.ts` 的 303、靈感中心、建立圖文流程（`activities/*`、`ActivityForm`）、首頁——這些是另一手維護，要改先協調。
- **從 `main` 開分支**做；正式站 `main` 是 production（Vercel 自動部署）。部署流程見 `docs/PRODUCT-IMAGE-SET-HANDOFF.md` 與 `docs/vercel-migration-checklist.md`。
- **別 commit `public/uploads`**（dev symlink，會讓 Vercel build 失敗）。
- 若要動 schema（本功能理論上不用）：照 Turso 手動遷移流程（見產品 handoff 文件），別對遠端 Turso 跑 `prisma migrate deploy`。
- **驗證**：`node --test --experimental-strip-types src/lib/magic-layers/*.test.ts`（若新增）、`npx eslint <改動檔>`、`npx tsc --noEmit`（先 `prisma generate`，否則會看到假的 Prisma 型別錯）。本功能不觸發付費以外的東西；`ad-layout` 會呼叫去背（FAL_KEY），本機/正式站都有設。

---

## 四、快速驗證（做完自測）
1. 產品頁點 `✨ AI 幫我排版` → 選用途/尺寸/填標題 → `產生設計稿`。
2. 應導去 `/magic-layers/compose?seed=1`，編輯器出現多個**可個別拖拉/縮放/刪除/換素材**的圖層（背景/商品主體/裝飾/質地/文字/Logo）。
3. 換不同用途，版型應**明顯不同**（這是 V1 還沒做到、要你補的核心）。
4. 用**新版素材包**（去背裝飾、真實質地）測，效果才準；舊素材（例如裝飾是整瓶）擺出來會怪，非程式問題。

（完成後把分支＋結果給發起這次需求的人 review。）
