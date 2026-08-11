import { join } from "path";

// Vercel serverless runtime 冇裝任何中文字型。sharp 用 SVG 燒字（composite.ts/
// composite-multi.ts 副圖卡/文字疊圖）靠 fontconfig 揾字型，冇裝就會變 tofu box（囗囗囗）。
// 呢個 side-effect import 令 fontconfig 轉去用 assets/fonts/ 打包埋部署嗰個 Noto Sans TC。
// 一定要喺任何 sharp SVG-text 合成之前 import 到（module 頂層執行一次即可）。
if (!process.env.FONTCONFIG_FILE) {
  process.env.FONTCONFIG_FILE = join(process.cwd(), "assets/fonts/fonts.conf");
}
