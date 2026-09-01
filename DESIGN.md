# 設計準則 DESIGN.md — 台灣圖文 2.0（白卡片 v2）

> 這份是這個 App 的視覺／互動設計系統。改 UI 前先看這份;要沿用時直接說「照 DESIGN.md」。
> 對應 Figma 檔：`台灣圖文2.0`（fileKey `eJWa63TxE9W5Kphk7e2jig`）。
> **標竿實作（source of truth）**：單圖表單 [`src/components/activities/ActivityForm.tsx`](src/components/activities/ActivityForm.tsx)。
> 共用元件都在 [`src/components/activities/formParts.tsx`](src/components/activities/formParts.tsx)（`FormSection` / `Field` / `AssetUploadCards`）。

技術：Next.js 16（App Router）+ Tailwind + lucide-react。顏色一律用 **Tailwind 的 `violet` 系列**（不要用 Figma 的 `#722ed1`,改用 `violet-600`,全站才一致）。

---

## 1. 顏色 / Tokens

| 用途 | 值 | 備註 |
|---|---|---|
| 主色 violet | `violet-600` (#7c3aed) | 按鈕、徽章、選中態、focus ring |
| 主色 hover | `violet-700` | |
| 主色淺底 | `violet-50` | 選中卡片背景、淺色按鈕 hover |
| AI 卡淺紫底 | `bg-[#f9f6ff]` + border `#ebe4f9` | AI 反推卡、AI 改寫按鈕底 |
| 卡片/輸入框邊框 | `#ebeff5` | 一律用這個,不要用 gray-200 |
| 標題文字 | `text-gray-900` | 區塊標題、欄位標題 |
| 次要文字 | `text-gray-500` | |
| 輔助/說明文字 | `text-gray-400` | helper、計數、（選填） |
| 必填星號 | `text-red-500` | `*` |
| 禁用按鈕 | border `#E5E7EB` / text `#868D99` / bg `#F8F9FB` | |
| 頁面底色 | `#f8f9fc` | 由 layout 提供 |
| focus ring | `focus:ring-2 focus:ring-ring` | `--ring` 已設成紫色,全站 focus 是紫框 |

---

## 2. 版面

- **表單寬度**：`max-w-3xl`（單圖、多圖、素材生成一律這個,不要各自不同寬）。
- **表單容器**：`space-y-8`,每個區塊是一張白卡片。
- **區塊 = 白卡片**：用 `FormSection`。
  ```tsx
  <FormSection step="01" title="想做什麼？" required> ... </FormSection>
  // required → 紅 *；optional → 灰（選填）
  ```
  卡片樣式：`rounded-2xl border border-[#ebeff5] bg-white p-6 sm:p-8 space-y-6`,
  標題 = 紫色圓形數字徽章（`h-6 w-6 rounded-full bg-violet-600 text-white text-xs font-bold`）+ `text-base font-bold text-gray-900`。
  ⚠️ 白卡片版面**不要**用底線分隔（那是舊 `SectionLabel divider` 樣式,只留給還沒改版的頁）。

---

## 3. 欄位 / 輸入

- **欄位標題列**：標題在左、動作按鈕在右（`flex items-center justify-between gap-3 flex-wrap`）。
  - 標題：`text-sm font-bold text-gray-900`；旁邊接短 helper `text-xs text-gray-400 font-normal`。
- **輸入框 / textarea / select**：白底 + `border-[1.5px] border-[#ebeff5] rounded-lg` + `focus:ring-2 focus:ring-ring`。輸入框高 `h-11`。
- **字數計數**：右下角浮層,`pointer-events-none absolute bottom-2.5 right-3 text-[11px] text-gray-400`,textarea 記得留 `pb-7`;搭配 `maxLength`（主描述 500、必放文字 200）。
- **下拉 select**：`appearance-none` + 右側放 lucide `ChevronDown`（`absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none`）。

---

## 4. 按鈕

| 類型 | 樣式 |
|---|---|
| 主要 AI 鈕（優化 Prompt / AI 優化提示詞） | 實心紫：`bg-violet-600 text-white border-violet-600 hover:bg-violet-700`,`px-3 py-1.5 rounded-md text-xs` |
| 次要 AI 鈕（AI 改寫） | 淺紫：`bg-[#f9f6ff] border-[#ebe4f9] text-violet-600 hover:bg-violet-100` |
| 靈感（給我靈感） | 琥珀色（`InspireButton` 元件,已內建） |
| 禁用態 | `cursor-not-allowed border-[#E5E7EB] text-[#868D99] bg-[#F8F9FB]`（灰色但不要太淡） |
| 選擇 pill / 卡片（比例、模式、款式） | `border-[1.5px]`;選中 = `border-violet-600 bg-violet-50`（文字 violet-700/600）;未選 = `border-[#ebeff5] bg-white text-gray-500` + `hover:border-violet-300` |

### 主要 CTA（送出/生成）— 一律置中大圓角
```tsx
<div className="flex flex-col items-center pt-2">
  <Button className="inline-flex h-auto items-center justify-center gap-2 rounded-full
    bg-violet-600 hover:bg-violet-700 text-white px-16 py-4 text-base font-bold
    shadow-[0_8px_8px_rgba(124,58,237,0.15)] disabled:opacity-50">
    <Sparkles className="h-[18px] w-[18px]" /> AI 開始生成
  </Button>
</div>
```
不要用靠左小按鈕、也不要用會造成斷層的 fixed footer border-t。

---

## 5. 慣用元件 / 樣式

- **素材上傳卡**（`AssetUploadCards`）：3 張卡（產品圖片 / 參考風格圖 / AI 反推）。
  卡 = `rounded-xl border-[1.5px] border-[#ebeff5] bg-white`;標題列（標題 + 已選數）;縮圖;底部動作列 `border-t` 的「上傳圖片 ｜ 從素材庫選擇」;AI 反推是**填色卡**（`bg-[#f9f6ff]` + 全寬紫色按鈕）。
- **收合區（進階/選填）**：置於卡片底部,`border-t border-[#ebeff5] pt-2`,header 是一個 button（標題 +（選填）+ 短 hint + `ChevronDown`,關閉時 `-rotate-90`）,內容包在 `{open && (...)}`。
  - 例：「參考過往貼文風格」放在描述卡底部。
- **「?」說明 popover**：長說明**不要**inline 佔版面,收進 `HelpCircle`（`h-3.5 w-3.5 text-gray-400`）小圖示,點開顯示 `absolute z-20 w-64 rounded-lg border border-[#ebeff5] bg-white p-3 text-xs text-gray-500 shadow-md`（記得加一層 fixed 透明背景可點關）。
  - 連「為什麼還不能生成」這種提示也收進 ? 裡,不要用行內琥珀色警告。

---

## 6. 文案 / 用字規則

- **一律繁體中文,不要出現廣東話**。
- **精簡**:只留必要文字;冗長說明收進「?」popover。
- 區塊用 **01/02/03 圓形數字徽章**;選填標「（選填）」灰字,必填紅 `*`。
- 固定用語：
  - 風格積木區塊對使用者顯示為「**參考過往貼文風格**」（不要叫「風格積木」）。
  - 自由排版（layoutId = magic-layers）的檔叫「**設計稿**」;待生成（PENDING）併入「**草稿**」。
- 表單順序原則：**先給素材/上傳 → 再寫描述 → 最後輸出設定**;進階/選填功能收合、放後面。

---

## 7. 互動偏好

- 入口卡片**整張可點** + hover 有反應（陰影/邊框變色）。
- focus ring 全站紫色。
- 同一功能在單圖 / 多圖 / 素材生成之間**樣式要一致**（以單圖為準）。

---

## 8. 改版鐵則

- **只改視覺,不動功能**：restyle 時不改 state / handler / props / fetch / 條件邏輯,只動 JSX 結構與 className。每個 `value` / `onChange` / `onClick` / `disabled` 原封不動。
- 改完跑 `npx tsc --noEmit`（排除未追蹤的 `marketing-plans`）確認乾淨,並在 preview 驗證。
- 新樣式優先沿用共用元件（`FormSection` / `AssetUploadCards`）,不要各頁各寫一套。

---

## 9. 目前已套用 v2 的頁面

| 頁面 | 檔案 |
|---|---|
| 單圖表單（標竿） | `src/components/activities/ActivityForm.tsx` |
| 多圖表單（統一/各圖獨立） | `src/app/clients/[clientId]/activities/new/multi/page.tsx` |
| 素材生成 · 產品圖 | `src/components/library/PromptComposer.tsx` |
| 素材生成 · 背景/人像/插圖 | `src/components/library/GenerateAssetForm.tsx` |
| 共用元件 | `src/components/activities/formParts.tsx` |

Figma 對照節點：單圖 `263-974`、多圖統一 `265-1253`、多圖各圖獨立 `265-1044`。
