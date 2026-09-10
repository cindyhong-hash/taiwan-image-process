import { applyArtDirectionPolicy } from "./ad-layout-art-direction-policy.ts";
import type { ArtDirectionResult } from "./ad-layout-art-direction.ts";
import { buildAdLayoutCandidates, type AdLayoutCandidate, type AdLayoutInput } from "./ad-layout-recipes.ts";

type AssetAvailability = { hero: boolean; detail: boolean; benefit: boolean; decoration: boolean };

export function buildDirectedCandidates(
  input: AdLayoutInput,
  result: ArtDirectionResult,
  assets: AssetAvailability,
  hasSecondaryAccent: boolean,
  benefits: NonNullable<AdLayoutInput["benefits"]>,
): AdLayoutCandidate[] {
  if (result.source !== "vision" || !result.decision) return buildAdLayoutCandidates(input);
  const directionDecisions = applyArtDirectionPolicy({ decision: result.decision, assets, hasSecondaryAccent, benefits });
  const candidates = buildAdLayoutCandidates({ ...input, directionDecisions });
  return candidates.map((candidate) => ({
    ...candidate,
    designDecision: directionDecisions[candidate.id] ? { version: 1, source: "vision" } : undefined,
  }));
}
