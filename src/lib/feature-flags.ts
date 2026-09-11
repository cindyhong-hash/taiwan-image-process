/**
 * 功能開關（單一來源）。
 *
 * 用途：某個功能包「這一版先不出」時，把入口統一收在一個旗標後面，
 * 而不是四散在各檔案的 early return 或註解裡 —— 後者很容易漏掉一兩個，
 * 使用者就會點到死路（例如點「指派到企劃」開出一個沒有企劃可選的空對話框）。
 */

/**
 * AI 月度企劃 + 內容日曆。
 *
 * 這一版不出，所以所有使用者可見入口都收起來：
 *   - SidebarNav 的「AI 月度企劃」「內容日曆」（該檔以註解方式移除）
 *   - 活動結果頁的「指派到企劃」「核准並回日曆」、以及「返回內容日曆」
 *
 * 程式碼與路由都保留（`/clients/[clientId]/marketing-plans/*` 仍可由 URL 直達），
 * 要放回主流程時把這個改成 true，並把 SidebarNav 的兩行註解解開即可。
 */
export const SHOW_MONTHLY_PLANNER = false;

/**
 * AI 幫我排版（產品頁 → 用商品素材自動排成可編輯設計稿）。
 *
 * 這一版品質還不到可以交給使用者的程度（尤其 scene-led 版型的商品偏小），
 * 所以正式站先關掉：按鈕保留，點下去顯示「新功能還在籌備中」。
 *
 * 用環境變數而不是寫死 false，是為了讓本機／預覽環境還能繼續開發驗證：
 *   - 不設 → 關（正式站預設就是安全的，不用記得去關）
 *   - .env.local 設 NEXT_PUBLIC_SHOW_AD_LAYOUT=1 → 開
 *
 * 要正式放出時，在 Vercel 加上這個變數即可，不用改程式。
 * 註：AD_LAYOUT_ART_DIRECTION_ENABLED 只影響這個功能的後端，
 * 這個旗標關著的時候那個變數在正式站沒有作用。
 */
export const SHOW_AD_LAYOUT = process.env.NEXT_PUBLIC_SHOW_AD_LAYOUT === "1";
