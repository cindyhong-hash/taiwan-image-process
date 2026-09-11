import { useSyncExternalStore } from "react";

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
 * 所以預設關掉：按鈕保留，點下去顯示「新功能還在籌備中」。
 *
 * 兩種打開方式：
 *   1. 環境變數 NEXT_PUBLIC_SHOW_AD_LAYOUT=1 —— 給整個環境開（要正式放出時在
 *      Vercel 加這個變數即可，不用改程式）。不設 = 關，所以正式站預設就是安全的。
 *   2. 網址加 ?adlayout=1 —— 只給自己這個瀏覽器分頁開，記在 sessionStorage，
 *      同一個分頁內換頁還在，關掉分頁就沒了。
 *
 * 為什麼要有第 2 種：這是「功能還沒做好」的產品開關，不是權限控制（整站本來就在
 * SITE_PASSWORD 後面）。做 (1) 的話每次想試都要改 .env.local 再重啟 dev server，
 * 而且沒辦法在正式站上先自己看過再決定要不要對所有人打開。
 *
 * 註：AD_LAYOUT_ART_DIRECTION_ENABLED 只影響這個功能的後端，
 * 這個旗標關著的時候那個變數在正式站沒有作用。
 */
const AD_LAYOUT_PREVIEW_KEY = "showAdLayoutPreview";

export const AD_LAYOUT_ENV_ENABLED = process.env.NEXT_PUBLIC_SHOW_AD_LAYOUT === "1";

/** 讀取目前狀態。回傳 boolean（primitive），可安全當作 getSnapshot。 */
export function isAdLayoutEnabled(): boolean {
  if (AD_LAYOUT_ENV_ENABLED) return true;
  if (typeof window === "undefined") return false;
  try {
    if (new URLSearchParams(window.location.search).get("adlayout") === "1") {
      // 只在還沒記錄時才寫，讓這個函式可以被重複呼叫而不產生額外副作用
      // （useSyncExternalStore 的 getSnapshot 一次 render 可能呼叫多次）。
      if (sessionStorage.getItem(AD_LAYOUT_PREVIEW_KEY) !== "1") {
        sessionStorage.setItem(AD_LAYOUT_PREVIEW_KEY, "1");
      }
      return true;
    }
    return sessionStorage.getItem(AD_LAYOUT_PREVIEW_KEY) === "1";
  } catch {
    // 隱私模式等存取 sessionStorage 會丟例外：當作沒開，不要讓整頁壞掉。
    return false;
  }
}

/** useSyncExternalStore 需要穩定的 subscribe；這個值在一次 session 內不會變。 */
const subscribeNever = () => () => {};

/**
 * 在 client component 裡取得旗標狀態。
 *
 * 用 useSyncExternalStore 而不是 useEffect + setState：後者會被
 * react-hooks/set-state-in-effect 擋下（effect 裡同步 setState 會多跑一輪 render），
 * 而且這正是這個 hook 存在的用途 —— 讀一個 server 上不存在的外部值，
 * 由它負責給 server snapshot（false），不會 hydration mismatch。
 */
export function useAdLayoutEnabled(): boolean {
  return useSyncExternalStore(subscribeNever, isAdLayoutEnabled, () => false);
}
