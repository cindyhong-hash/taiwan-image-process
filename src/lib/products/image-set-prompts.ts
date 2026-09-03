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
    `dominant palette: ${list(artDirection.palette.dominant, "product-visible colors only")}`,
    `accent palette: ${list(artDirection.palette.accent, "none")}; accent only, never dominant.`,
  ].join("\n");
  const exclusions = [...role.mustNotShow, ...profile.prohibitedChanges, "未提供的成分、功效、認證、安全或醫療宣稱"];

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
