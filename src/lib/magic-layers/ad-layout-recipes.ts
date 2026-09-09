import {
  resolveAdLayoutDesignSpecs,
  type AdLayoutDirection,
  type AdLayoutPurpose,
} from "./ad-layout-design-spec.ts";
import { renderAdLayoutSpec } from "./ad-layout-renderer.ts";
import type { LayerData } from "./types.ts";

export type { AdLayoutPurpose } from "./ad-layout-design-spec.ts";
export type AdLayoutCandidateId = "product-focus" | "editorial" | "scene-led";

export interface AdLayoutInput {
  backgroundUrl: string;
  heroUrl?: string;
  decorationUrl?: string;
  textureUrl?: string;
  benefitUrl?: string;
  logoUrl?: string;
  title?: string;
  subtitle?: string;
  brandColor?: string;
  textColor?: string;
  textSafeTreatment?: "none" | "light-panel" | "dark-panel" | Partial<Record<AdLayoutDirection, "none" | "light-panel" | "dark-panel">>;
  purpose?: AdLayoutPurpose;
  artDirection?: string;
  heroAspectRatio?: number;
  canvasWidth: number;
  canvasHeight: number;
}

export interface AdLayoutCandidate {
  id: AdLayoutCandidateId;
  label: string;
  description: string;
  layers: LayerData[];
}

const LABELS: Record<AdLayoutCandidateId, Pick<AdLayoutCandidate, "label" | "description">> = {
  "product-focus": { label: "商品主視覺", description: "單一商品主角，資訊集中在乾淨文字區。" },
  editorial: { label: "編輯留白感", description: "以留白與文字節奏，完成更有質感的品牌貼文。" },
  "scene-led": { label: "情境氛圍感", description: "讓情境先說話，再以商品收束視覺焦點。" },
};

export function buildAdLayoutCandidates(input: AdLayoutInput): AdLayoutCandidate[] {
  const specs = resolveAdLayoutDesignSpecs({
    canvas: { width: input.canvasWidth, height: input.canvasHeight, ratio: `${input.canvasWidth}:${input.canvasHeight}` },
    assets: {
      background: input.backgroundUrl,
      hero: input.heroUrl,
      detail: input.textureUrl,
      benefit: input.benefitUrl,
      decoration: input.decorationUrl,
    },
    purpose: input.purpose ?? "product",
    artDirection: input.artDirection,
    productAspectRatio: input.heroAspectRatio,
    typography: {
      headline: input.title,
      subtitle: input.subtitle,
      dark: input.textColor ?? "#241f47",
      light: "#ffffff",
      accent: input.brandColor ?? "#6d4aff",
      treatment: input.textSafeTreatment,
    },
  });

  return specs.map((spec) => ({
    id: spec.direction,
    ...LABELS[spec.direction],
    layers: renderAdLayoutSpec(spec, { logoUrl: input.logoUrl }),
  }));
}
