// One-off: re-analyze the brand's reference images with gpt-5.4-nano and dump JSON,
// to compare against the in-use (gpt-4o-mini) StyleComponents. Reads key from .env.local.
import { readFile } from "fs/promises";
import path from "path";

const env = await readFile(".env.local", "utf8");
const KEY = (env.match(/^OPENROUTER_API_KEY=(.*)$/m)?.[1] ?? "").replace(/^"|"$/g, "").trim();
const MODEL = "openai/gpt-5.4-nano";

const IMAGES = (process.argv.slice(2).length ? process.argv.slice(2) : [
  "63655a81-ae74-4dae-90bd-174ab59da740.jpg",
  "557e63f0-8848-4c0b-ba1e-bb25ee3f4fa7.jpg",
  "7e4020be-e426-4a66-a2ea-81bb01ad3429.jpg",
  "2f18be13-d5e8-4a25-ac6c-979e3067f60d.jpg",
  "62eb2a67-966f-4611-86d7-ce421f47c2ad.jpg",
]);

const PROMPT = `你是一位專業視覺設計師與品牌策略師。請**據實**分析這張圖片（不要套用通用答案），以 JSON 格式回傳四個面向。

【據實判讀】
- 構圖要描述「畫面實際版面」（主體位置、人物/產品/文字區的相對位置），不要一律寫「產品居中特寫」。若畫面沒有產品，就不要提產品。
- 配色 primaryColor 必須是「畫面實際最主導的顏色」，包含搶眼的品牌色/標題色（如大面積的紅、綠、金），不要慣性回灰白或米色。

【語言規定】所有欄位（name、description、toneLabels、aiPromptText）一律「繁體中文（台灣用語）」，不可簡體或英文。

【字數硬性上限｜超過視為錯誤】
- name ≤ 12 字；description ≤ 20 字。
- 每個 aiPromptText 只能「一句、不換行、不分段、不條列」：構圖 ≤ 30 字，配色/語氣/背景 ≤ 20 字。
- 嚴禁寫成段落或多句說明文。

只回傳 JSON，不要任何額外文字。
（colorScheme.extraColors：除主色、輔色外的重要點綴/中性色，0–3 個 hex；無則回 []）

{
  "composition": { "name": "構圖風格名稱(≤12字)", "description": "構圖特色(≤20字)", "aiPromptText": "一句構圖描述(≤30字)" },
  "colorScheme": { "name": "配色名稱(≤12字)", "primaryColor": "#XXXXXX", "secondaryColor": "#XXXXXX", "extraColors": ["#XXXXXX"], "aiPromptText": "一句配色描述(≤20字)" },
  "copyTone": { "name": "語氣名稱(≤12字)", "toneLabels": ["標籤1", "標籤2", "標籤3"], "aiPromptText": "一句語氣描述(≤20字)" },
  "background": { "name": "背景名稱(≤12字)", "description": "背景特色(≤20字)", "aiPromptText": "一句背景描述(≤20字)" }
}`;

async function analyze(file) {
  const buf = await readFile(path.join("public/uploads", file));
  const b64 = buf.toString("base64");
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", "X-Title": "reanalyze-nano" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      messages: [{ role: "user", content: [
        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } },
        { type: "text", text: PROMPT },
      ]}],
    }),
  });
  if (!res.ok) return { file, error: `${res.status}: ${(await res.text()).slice(0, 200)}` };
  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content ?? "";
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return { file, error: "parse-fail", raw };
  try { return { file, result: JSON.parse(m[0]) }; }
  catch { return { file, error: "json-fail", raw }; }
}

const out = [];
for (const f of IMAGES) {
  process.stderr.write(`analyzing ${f}…\n`);
  out.push(await analyze(f));
}
console.log(JSON.stringify(out, null, 2));
