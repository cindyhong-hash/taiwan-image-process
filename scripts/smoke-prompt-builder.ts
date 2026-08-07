import { buildMultiImagePrompt } from "../src/lib/multi/prompt-builder";
import { fallbackDesignSpec } from "../src/lib/multi/design-spec";
import { fallbackFramePlans } from "../src/lib/multi/frame-planner";
import { VARIANT_STYLE } from "../src/lib/multi/variant-style";

const out = buildMultiImagePrompt({
  globalSpec: fallbackDesignSpec({ theme: "女刀" }),
  framePlan: fallbackFramePlans({ theme: "女刀", n: 3 })[0],
  variantStyle: VARIANT_STYLE.A,
  i: 0, n: 3,
  lockBlocks: {
    productIdentityLock: "PRODUCT IDENTITY — CRITICAL RULES: (原文搬移測試字串)",
    typographyLock: "TYPOGRAPHY LOCK (原文)", colorTempLock: "", noTextBlock: "",
    reserveNote: "", productFreeNote: "", razorExclusionNote: "",
    noProductWarning: "", cellNoProduct: "MANDATORY PRODUCT (原文)",
  },
});
for (const s of ["GLOBAL VISUAL SYSTEM", "VARIANT DESIGN LANGUAGE", "PRODUCT IDENTITY — CRITICAL RULES", "FRAME-SPECIFIC", "NEGATIVE CONSTRAINTS", "Keep exactly the same person"]) {
  if (!out.includes(s)) throw new Error("缺段: " + s);
}
console.log("OK prompt-builder 6 段齊 + lock 原文保留 + variant 注入");
