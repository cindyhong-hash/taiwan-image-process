import type { BenefitInput } from "./ad-layout-graphics.ts";
import type { ArtDirectionDecision, DirectionDecision } from "./ad-layout-art-direction.ts";
import type { AdLayoutDirection } from "./ad-layout-design-spec.ts";

type AvailableAssets = { hero: boolean; detail: boolean; benefit: boolean; decoration: boolean };

export function applyArtDirectionPolicy(input: {
  decision: ArtDirectionDecision;
  hasSecondaryAccent: boolean;
  assets: AvailableAssets;
  benefits: BenefitInput[];
}): Partial<Record<AdLayoutDirection, DirectionDecision>> {
  const accepted: Partial<Record<AdLayoutDirection, DirectionDecision>> = {};

  for (const decision of input.decision.directions) {
    if (decision.confidence < 0.7 || !input.assets.hero) continue;
    accepted[decision.direction] = {
      ...decision,
      support: decision.support === "detail" && input.assets.detail
        ? "detail"
        : decision.support === "benefit" && input.assets.benefit
          ? "benefit"
          : "none",
      decoration: decision.decoration === "one" && input.assets.decoration ? "one" : "none",
      accent: decision.accent === "secondary" && input.hasSecondaryAccent ? "secondary" : "primary",
      // ⚠️ graphics 目前沒有任何消費端：賣點改成一律渲染（見 ad-layout-design-spec）。
      // 之所以不從 DECISION_OPTIONS 移除，是因為 parseArtDirection 用嚴格的 key 集合
      // 比對，少一個 key 而模型仍回傳它，整份 art direction 會被判無效並靜默退回
      // fallback。要真的拿掉，得先讓 parser 容忍未知欄位。
      graphics: decision.graphics === "benefit-group" && input.benefits.length > 0 ? "benefit-group" : "none",
    };
  }

  return accepted;
}
