# AI Design P4 — Gap Generation Plan

**Goal:** 當可編輯設計真正缺少背景或輔助素材時，讓使用者明確選擇補齊一項既有素材角色；完成後再以既有的 P1–P3 排版流程建立候選設計。

**Boundary:** P4 不自動生圖、不重新生成 hero／商品包裝／Logo，也不改寫既有設計稿。缺少 identity-critical 商品主體時只引導使用者上傳或完成去背。

## Proposed flow

1. `analyzeDesignGaps` 根據本次 purpose、recipe 與已通過安全判讀的 inventory，回傳可補齊的背景、detail、benefit 或 decoration 缺口；每項都要附上用途、風險與候選生成路徑。
2. 排版 modal 顯示缺口，但仍先給現有素材可完成的三個設計。只有使用者按下「補這個素材」才開始付費生成。
3. 建立工作只透過既有的 product image-set orchestrator：background 走無商品的文字生圖；需要保留商品身份的場景只能使用 hero 作 edit input，且不得輸出為新的 hero。
4. 工作完成後，將結果存為既有 `LibraryImage`／product asset，重新跑安全判讀與 P1–P3 排版；不直接把未驗證生成圖塞進現有 seed。
5. 失敗、取消、逾時或安全判讀拒絕時保留既有設計與素材，不重試或偷偷改用另一個角色。

## Required contracts

- `GapPlanEntry` 擴充為可操作的 `missing-background`、`missing-detail`、`missing-benefit`、`missing-decoration`，但僅在 selected recipe 必須該角色時出現。
- 每個可生成缺口固定對應一個 `ImageSetRole` 和受限 prompt profile；禁止自由 prompt、URL、座標、商品替換或新產品功效。
- 生成請求必須包含本次使用者確認的 role 與 product ID，使用既有 paid-route guard、lease、batch deadline 和清理流程。
- API 回應只提供工作狀態與已存資產 ID，不回傳供應商錯誤或原始 prompt。

## Validation

- 缺 hero／logo 時永遠不能產生 image-generation job。
- 已有同角色、安全素材時不顯示補齊操作；不為了變化而重生成。
- 每次使用者操作至多建立一個角色、一個 batch；重複點擊與逾時可安全恢復。
- 生成完成後的素材必須先通過既有 safety policy，才可參與新的 layout。
- 以背景缺口、detail 缺口、benefit 缺口、缺 hero、provider 失敗與 safety reject 做單元／整合測試；再用真實瀏覽器驗證選擇、進度、重跑排版與 editor 保存。

## Authorization needed before implementation

P4 會觸發既有影像生成供應商並產生費用，且會傳送該次所需的商品／品牌素材與受限 brief。因此本計畫只定義流程；實作生成按鈕與供應商呼叫前，需取得這項明確授權。
