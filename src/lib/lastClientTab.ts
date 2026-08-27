// 記住每個品牌最後開過邊個頁（活動圖／素材庫），俾側欄撳品牌名果陣可以帶返用戶去返
// 佢啱啱嗰頁——而唔係一律撞去活動圖列表。原因：素材庫生成緊嗰陣（角落有「生成中」佔位卡
// 會自動 poll 更新），如果撳品牌名跳咗去活動圖列表，用戶會誤以為生成中斷咗／唔見咗（其實
// 後端用 next/server 嘅 after() 背景繼續行，未離開過，返去素材庫照樣見到最新進度）。
const PREFIX = "lastClientTab:";

export type ClientTab = "activities" | "components";

export function setLastClientTab(clientId: string, tab: ClientTab) {
  try { localStorage.setItem(`${PREFIX}${clientId}`, tab); } catch { /* ignore */ }
}

export function getLastClientTab(clientId: string): ClientTab {
  try {
    const v = localStorage.getItem(`${PREFIX}${clientId}`);
    return v === "components" ? "components" : "activities";
  } catch {
    return "activities";
  }
}
