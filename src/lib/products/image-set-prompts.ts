import type { ImageSetArtDirection } from "./product-visual-analysis.ts";
import type { ProductVisualProfile } from "./product-visual-profile.ts";
import type { ImageSetRoleSpec } from "./image-set-roles.ts";

export type ImageSetPromptProduct = {
  name: string;
  category?: string | null;
};

export type CompileImageSetPromptInput = {
  product: ImageSetPromptProduct;
  profile: ProductVisualProfile;
  artDirection: ImageSetArtDirection;
  role: ImageSetRoleSpec;
};

function list(values: string[], fallback: string): string {
  return values.length ? values.join("、") : fallback;
}

// 顏色值整理成適合放進「生圖」prompt 的文字：濾掉裸 hex 色碼（如 #ffeb85），
// 否則影像模型會把色碼當文字／浮水印畫進圖裡。只保留可讀顏色名；hex 條目改用中性描述。
function paletteText(values: string[], fallback: string): string {
  const cleaned = [
    ...new Set(
      values
        .map((v) => (v ?? "").trim())
        .filter(Boolean)
        .map((v) => (/^#?[0-9a-fA-F]{3,8}$/.test(v.replace(/^#/, "")) ? "a subtle brand accent tone" : v)),
    ),
  ];
  return cleaned.length ? cleaned.join("、") : fallback;
}

export function compileImageSetPrompt({ product, profile, artDirection, role }: CompileImageSetPromptInput): string {
  const appearance = profile.appearance;
  const productFacts = [
    `Product name: ${product.name}`,
    `Product type: ${profile.productType || product.category || "unspecified"}`,
    `Shape: ${appearance.shape || "only use the supplied reference appearance"}`,
    `Materials: ${list(appearance.materials, "only visibly supported materials")}`,
    `Colors: ${list(appearance.colors, "only visibly supported colors")}`,
    `Visible details: ${list(appearance.distinctiveDetails, "no extra details")}`,
    `Visible text or logos: ${list(appearance.visibleTextOrLogos, "none supplied")}`,
    `Use cases: ${list(profile.useCases, "none supplied")}`,
    `Suitable scenes: ${list(profile.suitableScenes, "none supplied")}`,
  ].join("\n");
  const identityLocks = [
    `不得改變／100% unchanged: ${list([appearance.shape, ...appearance.distinctiveDetails].filter(Boolean), "supplied product identity")}`,
    `Keep visible materials, colors, proportions, structures, text, and logos exactly as supplied.`,
    ...profile.prohibitedChanges,
    ...artDirection.consistencyRules,
  ].join("\n");
  const palette = [
    `dominant palette: ${paletteText(artDirection.palette.dominant, "product-visible colors only")}`,
    `accent palette: ${paletteText(artDirection.palette.accent, "none")}; accent only, never dominant.`,
  ].join("\n");
  const exclusions = [
    ...role.mustNotShow,
    ...profile.prohibitedChanges,
    "未提供的成分、功效、認證、安全或醫療宣稱",
    "不得加入任何額外文字、色碼（hex）、數字、標籤或浮水印（產品本身既有的品牌字樣除外）",
  ];

  return [
    "[ROLE OBJECTIVE]",
    role.objective,
    "[PRODUCT FACTS]",
    productFacts,
    "[MUST PRESERVE]",
    identityLocks,
    "[SHARED ART DIRECTION]",
    `Concept: ${artDirection.concept}`,
    palette,
    `Lighting: ${artDirection.lighting}`,
    `Materials language: ${list(artDirection.materials, "visible product materials only")}`,
    `Background language: ${artDirection.backgroundLanguage}`,
    "[COMPOSITION AND CAMERA]",
    role.composition,
    `Camera: ${artDirection.cameraLanguage}`,
    `Role scene: ${role.sceneCn}`,
    "[MUST NOT SHOW]",
    exclusions.join("\n"),
  ].join("\n");
}
