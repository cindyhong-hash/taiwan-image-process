# AI 商品設計：P2 補齊與 P3 接續設計

日期：2026-09-09。狀態：接續方案待 implementation plan 確認；本次只新增文件。

## 基準與階段校正

- 基準為 `mine/main` 的 `c49ca17`，含先前 P0、P1、Vision Safety P2-A 提交。
- 工作區 `/private/tmp/marketing-tool-ai-layout-p3`，分支 `codex/ai-layout-design-polish-p3`。
- 原始需求為 Product Visual Kit → Design Planning → Gap Analysis → Editable Design。
- 路線圖中的 P2 是 Design Polish Primitives；已部署的 P2-A 是素材安全判讀，不能視為前者完成。
- P3 維持 Vision Art Direction 的定義。P4 按缺口生圖另案處理。
- 先前的 `ad-layout-polish.test.ts` 是未完成的測試草稿，11 項中 9 項預期失敗，尚無正式程式修改；其中「每行獨立文字層」與固定占比斷言須按本規格修正。

## 程式碼核對結果

1. `ad-layout-context.ts` 已正規化 role 並保護 hero/logo；inventory 每個 role 目前只保留一張。
2. `ad-layout-creative-brief.ts` 已有 brief 與 purpose-based recipe，但 editorial 是候選方向，不是目前可選的 recipe；沒有獨立 texture/detail recipe。
3. `ad-layout-gap-analysis.ts` 只處理缺商品、投影、安全底板。
4. `ad-layout-templates.ts` 六套固定 zone；renderer contain 商品，但未依文案長度調整。
5. `MagicLayersEditor.tsx` 文字目前單次 fillText，shape 有八種基礎 icon；文字有漸層效果，不等於已有背景漸層 shape。
6. `AdLayoutModal.tsx` 預覽固定 11px 標題、漏副標/logo，另加 CSS 投影及漸層；並非完整忠實預覽。
7. `ad-layout-quality.ts` 的六项檢查以結構為主；不能宣稱已驗證實際可讀性或美術品質。
8. `ad-layout-vision.ts` 僅安全判讀；不得直接擴充其輸出去改商品身份或任意座標。
9. `Client.pastPostImageUrls` 已存在，但未標記「已核准／同用途」。`GeneratedLayout.isSelected` 不等同已核准，不自動拿來使用。
10. 自由畫布將 SavedLayer JSON 存入既有 GeneratedLayout.textLayerJson；新可選欄位可走現有儲存格式，無須資料庫 migration。

## 交付順序

### P2.1：構圖、文字與真實預覽

建立可測試、可共用的文字換行與 canvas 繪製 helper。新設計的 headline/subtitle 各為單一可編輯文字物件，不把每行切成互不相連的文字層。中文字、英文單字、手動換行、字距與行高都要處理；原始字串保留，wrap 是呈現結果。舊圖層未宣告新版文字 layout 時維持原本單行與置中基線行為。

模板依畫布比例、商品比例、文案量有限調整，輸出 resolved layout 並存入 DesignSpec；route 對這份實際文字 zone 取樣，renderer 不得再次挑不同模板。商品保持 contain，不重繪、不拉伸。商品大小以長軸占比與構圖角色判斷，不能把細長商品強制放大成占畫布面積 35–50%。1:1、4:5、9:16 為主驗收，既有 16:9 入口保持可用。

preview、editor、PNG export 共用文字／圖形繪製規則，呈現同一份 LayerData；移除預覽專用濾鏡。新增實際 bounds、重疊及字級品質檢查；空文案不強迫生字。文案過長不能靠無限縮字或截斷偷偷通過：先有限調整，仍不可讀則提示使用者縮短。

### P2.2：可編輯的設計精修元件

新增有限的 semantic icon registry（water-drop、spring、blade、shield、sparkle、leaf），與最多三個賣點的設計群組。只根據使用者確認的賣點文字匹配，不從商品名稱猜功效；未知詞只顯示文字，不配錯圖。群組是可各別編輯的 icon、badge、文字圖層並共用 groupId，不另承諾編輯器不存在的群組互動功能。

新增可編輯 linear-gradient shape 與 soft-shadow ellipse 預設；schema 只接受有限參數，不接受任意 SVG/程式碼。各元件在預覽、編輯、儲存重開與匯出一致。投影僅為可控美術處理，現有「有檯面」分類不足以宣稱精準接觸陰影；沒有可靠位置證據，使用保守懸浮構圖，避免假裝落在場景表面。反射、重新打光、產品色彩改寫不在這階段。

### P3：Vision Art Direction

另建 art-direction parser/policy/provider，重用安全判讀的縮圖、逾時與 provider 基礎能力，但保留兩者責任與 fallback。第一版按一次請求分別做安全判讀及設計建議，各 20 秒上限；共用 request abort，並在載圖工作不遵守 signal 時仍能按期限返回。完整路由維持 120 秒上限，無遞迴 vision 重試。

模型輸入：已過安全判讀的素材、brief、品牌資料、可選的最多兩張同品牌參考貼文。使用者在本次 Modal 明確選取才使用參考；預設不選。API 從品牌已保存的 pastPostImageUrls 清單驗證來源；不信任任意 URL，不把 isSelected 當成核准狀態。參考只用於風格、文字層級與視覺密度，不複製參考中的商品、Logo、文案或功效。

模型只能提出三個既有方向各自的有限建議：允許的構圖類別、文字層級預設、密度、素材角色取捨、accent token 與效果預設。不能提供座標、URL、任意色碼、HTML/SVG、商品替換或新功效。policy 將建議映射到 P2 已實作的能力；identity asset 保留；安全判讀已排除的素材不能復活。

低信心、無效欄位、未知 preset、逾時、provider 錯誤、參考載入失敗，都有明確降級路徑。無參考圖可繼續；模型不可用回完整 P2 三套方案。組版品質檢查失敗回該方向 P2 方案，不以模型自評分數作驗收。

## 全域約束

- 不改商品生圖核心、登入 proxy、靈感與 activities 建立圖文主流程。
- 不新增生圖成本；P4、歷史貼文自動搜尋、品牌學習持久快取、完整人工美術編輯器均不在此案。
- 沿用 ML_WIZARD_SEED_KEY 的 `{ layers, docW, docH, clientId }`。
- 舊 SavedLayer、舊 draft 與既有 text fx 向後相容；只為新設計啟用多行模式。
- 所有設計元件保持可編輯；允許既有成品縮圖/下載壓平，不以壓平圖取代圖層資料。
- 素材最多一個 hero、兩個 decoration、一張 support；賣點群組出現時省略 competing benefit/detail 縮圖。
- 模型與素材載入錯誤不暴露供應商詳細訊息、金鑰或圖片 data URI。
- 先完成 P2 的獨立驗收，再接 P3。各階段可單獨交付，不自動 push、merge、部署。
- 於目前 session inline 執行；不使用 subagent。

## 驗收

同一組固定 fixture 比較改造前後：细長美容刀、寬盒商品、方形罐裝；三種尺寸；短中文、長中文、中英混合、手動換行、空標題、副標單獨存在；清爽與複雜背景。確認商品完整、不變形、正文完整、無意外遮擋、沒有孤立縮圖。

確認三候選可辨識且與 editor 一致；文字修改、縮放、undo/redo、draft save/reopen、PNG export 保留新屬性。另測 P3 所有 fallback、跨品牌參考拒絕、模型越權拒絕。自動測試之外須檢視真實瀏覽器截圖，不能用通過單元測試代替美術驗收。
