import { VARIANT_STYLE, variantPromptBlock } from "../src/lib/multi/variant-style";
const a = variantPromptBlock(VARIANT_STYLE.A);
const b = variantPromptBlock(VARIANT_STYLE.B);
if (!a.includes("LARGE") || !b.includes("SMALL") || a === b) throw new Error("A/B 未分流");
console.log("OK: A/B 分流\n---A---\n" + a + "\n---B---\n" + b);
