# 商品套圖品質優先改造設計

日期：2026-09-03

## 背景

目前「AI 建立商品套圖」以產品 `category` 查固定規則表，產生主視覺、質地、背景、成分／功效與裝飾元素。除主視覺和質地外，其餘角色使用純文字生圖；實拍類也只使用一張去背主圖。五張圖片平行且獨立生成，沒有共用的產品視覺分析或整組美術方向。

實測「美體除毛刀」被分類成「居家生活」，因此背景被規劃成客廳；硬體產品仍使用「質地」與「成分」角色。生成結果雖可完成，但產品關聯性、視覺一致性與後續排版價值不足。

## 目標

- 以全部商品圖片及產品資料建立可重用的產品視覺檔案。
- 依產品實際類型動態規劃五種素材角色，不依賴單一手動分類。
- 五張素材共用同一組 Art Direction，形成一致的套圖。
- 實拍類圖片優先維持商品形狀、比例、顏色、按鍵、Logo 與關鍵細節。
- 採品質優先模型路由，允許增加生成時間與成本。
- 讓使用者看見分析及每張素材的生成進度，單張失敗可重試。

## 非目標

- 不改造一般素材庫生圖、廣告圖或月度企劃流程。
- 不提供完整的人工美術編輯器。
- 不承諾生成模型能百分之百像素級重現商品；系統以多圖參考、提示限制及 fallback 降低偏差。
- 第一版不讓使用者自訂模型或逐項調整推理參數。

## 核心設計

### 1. ProductVisualProfile

在 `Product` 新增：

- `visualProfileJson String @default("{}")`
- `visualProfileSourceHash String?`
- `visualProfileUpdatedAt DateTime?`

`visualProfileJson` 使用下列結構：

```ts
type ProductVisualProfile = {
  version: 1;
  productType: string;
  productArchetype: "beauty_device" | "skincare" | "cosmetics" | "food_beverage" | "fashion" | "electronics" | "home" | "other";
  confidence: number;
  appearance: {
    shape: string;
    materials: string[];
    colors: string[];
    distinctiveDetails: string[];
    visibleTextOrLogos: string[];
  };
  useCases: string[];
  suitableScenes: string[];
  visualMotifs: string[];
  prohibitedChanges: string[];
  sourceImageCount: number;
};
```

分析輸入包含 `rawImageUrls` 全部圖片、`heroImageUrl`、產品名稱、描述、手動分類與品牌資料。視覺模型只根據可見資訊與已提供文字回傳結構化 JSON，不可自行創造功效、認證或使用方式。

`visualProfileSourceHash` 由產品名稱、描述、分類、原圖 URL 清單與 hero URL 計算。來源變更即視為分析過期；下次開啟套圖 Modal 時重新分析。AI 判斷的 `productArchetype` 不覆蓋使用者填寫的 `category`。

### 2. 動態素材角色規劃

保留五張套圖規模，但角色由 `productArchetype` 決定。所有產品至少具有：

- `hero`：完整商品主視覺。
- `detail`：最具辨識度的功能或材質細節。
- `lifestyle`：真實且合理的使用情境。
- `background`：無產品、保留文案與商品排版空間的情境空景。
- `decoration`：可去背、能呼應商品外觀的裝飾元素。

部分品類可使用更精確的可見標籤，例如保養品的 `texture`、食品的 `ingredient`；資料庫 `assetRole` 使用穩定角色值，UI label 可依品類變化。

`beauty_device` 的除毛刀範例：

1. 商品主視覺：白色／冰藍棚拍，完整產品與自然落影。
2. 功能細節：圓形金屬刀頭與冰藍按鍵微距。
3. 使用情境：明亮浴室中的腿部日常護理，不呈現醫療效果。
4. 情境空景：浴室或梳妝台，中央或左側留白，不出現商品。
5. 品牌裝飾：銀藍半透明曲線、柔和光點或金屬弧線，透明背景。

### 3. Shared Art Direction

產品分析後建立一次性的 `ImageSetArtDirection`：

```ts
type ImageSetArtDirection = {
  concept: string;
  palette: { dominant: string[]; accent: string[] };
  lighting: string;
  materials: string[];
  backgroundLanguage: string;
  cameraLanguage: string;
  consistencyRules: string[];
};
```

Art Direction 以產品自身色彩和材質為主，品牌色只作可選 accent，不得直接取代商品的視覺識別。每一角色 prompt 都包含同一份 Art Direction、產品身份鎖定規則和角色專屬要求。

所有 prompt 必須區分：

- `mustPreserve`：商品外型、比例、顏色、結構、可見 Logo／文字。
- `mustShow`：該角色的主體、構圖、鏡位、光線與留白。
- `mustNotShow`：額外商品、額外文字、水印、錯誤功能或不合理使用情境。

### 4. 品質優先模型路由

新增統一的 reference-aware 生圖介面，角色不再直接綁定單一 `path: edit | text`。

| 角色 | 主要輸入 | 首選 | Fallback |
|---|---|---|---|
| hero | hero＋全部原始商品照 | GPT Image edit | Seedream 4.5 edit → FLUX.2 edit |
| detail | 最適合的原圖＋其他商品照 | GPT Image edit | Seedream 4.5 edit → FLUX.2 edit |
| lifestyle | 商品照＋產品視覺檔案 | GPT Image edit | Seedream 4.5 edit → FLUX.2 edit |
| background | ProductVisualProfile＋Art Direction | 高品質文字生圖 | FLUX.2 text fallback |
| decoration | ProductVisualProfile＋Art Direction | 高品質文字生圖 | Recraft／FLUX fallback，完成後去背 |

實拍類至少帶 hero 與一張最相關原圖。模型 prompt 明確要求參考多張圖片中的同一商品，不得合併、複製或重新設計商品。

若 GPT Image 超時或供應商失敗，系統自動改用既有 Seedream／FLUX 路徑。每一次模型嘗試寫入伺服器紀錄，但 API 不回傳金鑰或內部供應商錯誤全文。

### 5. 批次協調流程

目前每張圖片各自使用 `after()` 平行生成。新版改為一個批次協調工作：

1. 驗證或建立 ProductVisualProfile。
2. 建立五個 `LibraryImage`，狀態為 `PENDING`。
3. 生成 Shared Art Direction，將角色改為 `GENERATING`。
4. 先生成 hero；成功後保存成批次視覺錨點。
5. detail 與 lifestyle 並行；background 與 decoration 並行。
6. 每張獨立更新 `DONE` 或 `FAILED`。
7. decoration 成功後執行去背，再標記 `DONE`。

hero 失敗不取消整批：其他角色仍可使用 ProductVisualProfile 與原始商品照生成。某張失敗只影響該張，使用者可單獨重試並沿用同一份 Art Direction。

`paramsJson` 保存 profile version、Art Direction、角色規格、使用模型與批次資訊，使結果可追查及重生。

## API

### `POST /api/products/[productId]/image-set/analyze`

- 載入商品與品牌資料。
- 比對 source hash。
- 回傳快取或重新建立 ProductVisualProfile、Art Direction 與五個角色建議。
- 支援 `{ force: true }` 強制重新分析。

### `GET /api/products/[productId]/image-set`

- 僅回傳既有 profile 狀態與角色建議，不在 GET 執行昂貴或有副作用的分析。
- 若資料不存在或過期，回傳 `needsAnalysis: true`。

### `POST /api/products/[productId]/image-set`

- 接收已確認的角色規格與分析版本。
- 建立 batch 並啟動協調流程。
- 回傳每張素材的資料庫 ID，沿用現有輪詢。

### `POST /api/library/images/[id]/regenerate`

- 若該圖片屬於 image-set，沿用保存的 profile、Art Direction 與角色規格單獨重生。
- 不重新分析產品，除非 profile 已過期。

## UI 流程

Modal 分為三個清楚狀態：

1. **分析中**：「正在讀取 3 張商品照，整理產品外觀與套圖方向…」
2. **確認建議**：顯示產品類型、主色、不可改動重點與五張套圖角色；可取消單一角色或「重新分析產品」。
3. **生成中**：顯示目前階段及 `完成 N/5`，每張素材各自顯示等待、生成、完成或失敗。

沿用現有網站的白底、灰色邊框與紫色 action，不新增另一套視覺語言。錯誤訊息需指出可採取的行動，例如「主視覺生成失敗，可單獨重試；其餘素材仍在生成」。

## 錯誤與降級

- 分析 JSON 無法解析：使用手動分類與現有規則產生 fallback profile，並在 UI 標示「使用基本產品資料」。
- 部分原圖無法下載：使用剩餘圖片；全部失敗才中止需要商品參考的角色。
- GPT Image 超時：自動切換 Seedream，再切換 FLUX.2。
- background 或 decoration 生圖失敗：不影響實拍角色。
- 去背失敗：保存原圖但將該角色標記為失敗，避免把非透明圖誤當裝飾素材。
- 輪詢逾時：前端停止等待但不覆寫後端狀態；重新開啟 Modal 可恢復查看。

## 測試策略

- ProductVisualProfile schema parsing、無效 JSON 與 fallback。
- source hash 在圖片、描述或分類改變時失效。
- `beauty_device`、保養、食品與未知品類的動態角色規劃。
- Prompt 必須包含所有 identity locks；background 必須禁止商品；decoration 必須要求可去背構圖。
- 品牌色只能作 accent，不能覆蓋產品主色。
- 模型路由依 GPT → Seedream → FLUX 順序 fallback。
- 批次協調必須先啟動 hero，再啟動依賴角色；hero 失敗仍繼續其他角色。
- 單張失敗與重試不改動同批其他已完成圖片。
- API 驗證過期 profile、未知角色和缺少商品參考圖。

## 驗收條件

- 美體除毛刀不再產生一般客廳場景，AI 視覺類型應判斷為美容個護裝置或相近類型。
- 五張建議包含商品主視覺、刀頭／按鍵細節、腿部護理情境、浴室／梳妝台空景與銀藍裝飾元素。
- 商品實拍角色使用多張商品參考圖，prompt 明確鎖定商品外觀。
- 同組五張使用一致的產品色盤、光線與材質語言。
- UI 可見分析、生成及逐張完成進度。
- 任一張失敗不使整批失敗，且可以單張重試。
- 新增單元測試、Lint、TypeScript 與 production build 全部通過。

## 風險與取捨

- 品質優先模型會增加成本及延遲；UI 必須明確顯示生成階段。
- 序列化 hero 會增加整批總時間，但能建立更穩定的視覺錨點。
- 圖片模型仍可能重畫小字或細節；多圖參考與 identity locks 是降低風險，不是絕對保證。
- 新欄位需要 Prisma migration；部署時必須先完成 migration，再啟用新版分析 API。
