# AI 幫我排版（AI Ad Layout）— 交接文檔

> V1 已完成並上線（base），這份給接手者（Codex）繼續把它做深。
> 核心價值：把「商品素材包」自動排成一張 **~80% 完成、可編輯的 Canvas 設計稿**（真圖層，不是扁平圖），使用者再自由微調。這是「商品素材」與「自由排版」真正串成一條龍的關鍵差異化功能。

> **Composition P0 已完成（branch `feat/ai-layout-composition`，待 review / 部署）**：同一次設定會產生三個可選方向：`product-focus`（商品主視覺）、`editorial`（編輯留白感）、`scene-led`（情境氛圍感）。使用者先預覽、選一張，才把該選項的 `layers` 寫入既有 seed；seed 契約沒有改。P0 不再把素材包當必用清單：先建立 DesignSpec、限制素材數量、驗證品質，最後才 render 成可編輯圖層。

> **Design Foundation P1 已完成（branch `feat/ai-design-foundation-p1`，疊在 P0 上）**：route 先將產品、品牌與新舊 asset roles 正規化成 visual-kit context，再建立 Creative Brief、Design Recipe、direction-aware asset plan 和 deterministic gap plan。商品主體與 logo 明確標為 identity-critical；hero 按原始長寬比 contain 進 template。品質檢查會驗證 hero、素材數量、direction support、文字 treatment 與比例；Modal 預覽則直接讀 renderer 產出的 layer bounds。

> **Vision Safety P2-A 已完成（branch `feat/ai-layout-vision-safety-p2`，疊在 P1 上）**：在背景處理與 brief 前，route 會把 hero 加上至多四張既有非 identity 素材縮至 768px，以私有 data URI 交給 OpenRouter 做一次可失敗的視覺安全判讀。`background` 本來就可以是完整的乾淨情境空景；只有角色特定的可見衝突（例如背景出現商品或文字／Logo）且信心至少 `0.95` 才會省略素材。`0.7` 到 `0.95` 的衝突會保留素材並附警告，抽象的 `safeForDeclaredRole: false` 不會單獨刪除素材；hero／Logo 絕不會被移除。provider、storage、逾時或格式失敗一律保留原素材並走 P1 deterministic fallback。模型只能建議既有的 text-safe category 與是否有可用場景表面，不能提供座標、URL、template ID、顏色或 effect。

> **Design Polish P2／P3（branch `codex/ai-layout-design-polish-p3`，待 review）**：新增比例感知構圖、多行可編輯文案、依實際 LayerData 繪製的候選預覽、可儲存的漸層／柔邊投影，以及使用者確認文字驅動的賣點圖示組。商品主體不變形，長文案會以可讀性限制回覆縮短提示。P3 已接入受限的 OpenRouter art-direction 決策：只接受固定 enum JSON、以單一合法值示範 schema、使用 `temperature: 0`，且僅影響既有可編輯版型能力。20 秒 deadline 或任何 provider/格式失敗都回到 P2 三候選，API 只回傳安全的 fallback reason（含 `low-confidence`），server log 不記錄模型原文。部署時需設 `AD_LAYOUT_ART_DIRECTION_ENABLED=true` 才會啟用；目前不提供過往貼文選取，避免無登入驗證的圖片網址揭露。

> **P4 Gap Generation（branch `codex/ai-layout-design-polish-p3`，待 review）**：所有缺少背景素材的排版都先建立不透明、可編輯的 `background_base` shape，避免輸出透明畫布；只有 scene 用途仍會提示可選的付費情境背景。scene 有背景但缺輔助素材時會提示 detail，legacy lifestyle 仍可作 scene 支援。benefit 用途只有 `sourceRole: "benefit"` 的原生賣點素材能滿足語意缺口，detail／lifestyle／ingredient 只能作版型替代，不會壓掉補賣點視覺的提示。gap analysis 使用安全判讀後的 inventory，因此低信心、仍被保留的素材不會觸發付費提示。只有使用者主動按下按鈕才透過既有 paid image-set worker 建立一張 background／detail／benefit 素材；hero 與 Logo 永不由此流程重生成。完成後使用者明確重跑排版，生成素材會重新經既有 safety policy。

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
- 讀商品素材包：`db.product` + `assets(status=DONE)`，依 `assetRole` 取：`background`→情境背景、`hero`(或 `product.heroImageUrl`)→商品主體、`decoration`→裝飾、`detail`→質地、`benefit`→賣點；Logo 取 `client.logoUrls` 第一張。
- 同時讀產品名稱／描述／分類和品牌描述／產業／語氣／palette／顏色，作為 deterministic art-direction context；P0 不依賴 LLM。
- 背景由 `ad-layout-data.ts` 用 `sharp` full-bleed cover 到畫布尺寸（無背景素材→淺底）。每個 template 都在實際文字安全區抽樣對比，決定深／淺文字與是否插入可編輯的半透明安全底板。
- 呼叫 `buildAdLayoutCandidates(...)` 回三個 `LayerData[]` 選項。舊的 `buildAdLayoutLayers(...)` 保留為相容包裝，回第一個候選版，不可拿它當 route 的主入口。

**組版引擎**
- `src/lib/magic-layers/ad-layout-design-spec.ts`：建立／驗證 `AdLayoutDesignSpec`，包含方向、template、資產預算、文字安全區、字級層級、polish、商品整合與 quality warnings。
- `src/lib/magic-layers/ad-layout-templates.ts`：6 個固定視覺階層模板；template 定義 zone，不讓模型／呼叫端直接隨機設 x/y。
- `src/lib/magic-layers/ad-layout-polish.ts`：在初始幾何完成後作有上限的調整；只有安全時把過小商品放大最多 8%、加強短標題、移除碰撞裝飾，並可加入可編輯背景柔光，不增加 bitmap。
- `src/lib/magic-layers/ad-layout-product-integration.ts`：依可信表面判讀與商品位置，確定性規劃 surface／floating 的接觸影、方向投影、側光、halo 與有空間才出現的表面反光；不修改商品圖片像素。
- `src/lib/magic-layers/ad-layout-graphics.ts`：以可擴充的 semantic registry 將已確認賣點映射到 10 類向量 icon；未知或否定敘述維持純文字，數字 callout 只擷取使用者原文。renderer 會建立同 group 的 glass badge、icon、原文與數字字層，並用可編輯 divider 分隔多個賣點。
- `src/lib/magic-layers/ad-layout-renderer.ts`：將 validated spec 轉為真 `LayerData[]`。背景、柔光、商品整合光影、商品、支援素材、裝飾、文字安全底板、文字、Logo 都是可個別編輯圖層。
- `src/lib/magic-layers/ad-layout-recipes.ts` 是 route 相容入口：只負責把 input 串到 spec + renderer。
- `src/lib/magic-layers/ad-layout-context.ts`：唯一負責將資料庫資產 role（含 legacy alias）、品牌資料與 visual profile 正規化成 product visual-kit context。
- `src/lib/magic-layers/ad-layout-creative-brief.ts`、`ad-layout-gap-analysis.ts`：建立目的／品牌／文案的 Creative Brief，挑選 recipe，並將缺口映射到既有可編輯 shape，而不是重新生圖。
- `src/lib/magic-layers/ad-layout-quality.ts`：純規則檢查，render 前保護 hero、support budget、裝飾 budget、文字 treatment、商品比例、商品邊界、光影整合與商品／文案分離。
- `src/lib/magic-layers/ad-layout-vision.ts`：一次、可注入測試的 OpenRouter visual-kit assessment。只送既有 hero／background／detail／benefit／decoration 的縮圖；所有失敗回傳 named fallback，不會讓設計 API 失敗。
- `src/lib/magic-layers/ad-layout-vision-policy.ts`：唯一可將 vision 結果轉成素材省略與 composition advice 的純規則層；`0.7` 是版面建議信任門檻，`0.95` 是角色衝突的刪除門檻。完整情境本身不會讓 `background` 失效，低於刪除門檻則保留素材。它不會也不能改寫 identity assets。
- 素材規則：商品主視覺／編輯留白預設只用背景、hero、最多一個裝飾；情境版最多一個 support（`detail` 或 `benefit`）；賣點用途可選 `benefit`，但不會與 `detail` 疊用。

**資料契約（沿用、別破壞）**
- 素材角色 key：`hero｜detail｜background｜benefit｜decoration`（+ legacy `lifestyle｜texture｜ingredient`，見 `src/lib/products/image-set-roles.ts`、`src/lib/productMeta.ts`）。`hero` 是去背透明 PNG。
- Seed：`ML_WIZARD_SEED_KEY = "mlWizardSeed"`（定義於 `src/components/activities/RolePickerModal.tsx`）；形狀 `{ layers: LayerData[], docW, docH, clientId }`。
- `LayerData` / `Bbox` / `TextRole` 型別在 `src/lib/magic-layers/types.ts`；layer `type` 用 `"background" | "product" | "object" | "independent_text"`；文字樣式放 `meta.style`（text/fontSizePx/fontWeight/color/align/fontFamily）。
- 既有 `POST /api/magic-layers/compose`（`buildCompositionLayers`）是另一條較簡單的組版，別跟本功能混用，但可參考它的 helper。

---

## 二、下一階段（P2 以上，不要破壞 P0/P1）

1. **歷史設計參考**：若要讓 vision 讀過往貼文，先定義可讀的「已核准、同品牌、同用途」資料來源與隱私範圍；P2-A 不讀任何歷史貼文，也沒有 persistent cache。
2. **更細緻的背景處理**：目前是安全底板；若要漸層面板或圖片模糊，需要先擴充 Editor 的 shape/image effect 契約，再讓 renderer 使用，不能直接 flatten 全圖。
3. **Graphic / Icon system**：目前 benefit icon、glass badge、divider、數字 callout 已使用可編輯 primitives 與 semantic registry；後續擴充仍須走 registry，不可讓 vision 或文字模型傳入任意圖層座標。
4. **自動文案**：使用者未填文字時，可重用既有 `POST /api/activities/creative-direction` 的方向，但仍要保留空字層／無文案的安全 fallback。

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
1. 產品頁點 `✨ AI 幫我排版` → 選用途／尺寸／填標題 → `建立 3 個設計方向`。
2. 三張預覽必須各自只顯示實際 candidate 的 layer 素材；商品主視覺不可出現 detail 小縮圖或未選的 benefit。
3. 選一張後應導去 `/magic-layers/compose?seed=1`，編輯器出現多個**可個別拖拉/縮放/刪除/換素材**的圖層（背景、商品主體、可選支援素材、可選裝飾、投影、安全底板、文字、Logo）。
4. 對複雜文字區，檢查安全底板存在且可刪除；對乾淨留白區，不應無故加底板。
5. 商品主視覺案例只能有一個前景商品主體，且裝飾最多兩個。

（完成後把分支＋結果給發起這次需求的人 review。）
