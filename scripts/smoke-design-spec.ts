import { fallbackDesignSpec, designSpecPromptBlock } from "../src/lib/multi/design-spec";
const s = fallbackDesignSpec({ theme: "敏感肌女刀", primaryColor: "#C9A98F", toneLabels: ["清新"] });
if (s.colorSystem.temperature !== "warm" || !s.character.hair) throw new Error("fallback 形狀錯");
const blk = designSpecPromptBlock(s);
if (!blk.includes("GLOBAL VISUAL SYSTEM") || !blk.includes("CHARACTER CONSISTENCY")) throw new Error("prompt 區塊缺段");
console.log("OK design-spec fallback + block\n" + blk);
