import type { ArtDirectionResult } from "./ad-layout-art-direction.ts";

type CandidateDecision = { designDecision?: { version: 1; source: "vision" } };

export type ArtDirectionStatus = {
  source: "vision" | "fallback";
  message: string;
  reason?: ArtDirectionResult["reason"] | "low-confidence";
};

export function artDirectionStatus(result: ArtDirectionResult, candidates: CandidateDecision[]): ArtDirectionStatus {
  if (candidates.some((candidate) => candidate.designDecision?.source === "vision")) {
    return { source: "vision", message: "已依商品素材調整視覺方向。" };
  }
  if (result.source === "fallback" && result.reason !== "disabled") {
    return { source: "fallback", message: "視覺方向暫時不可用，已使用穩定排版規則。", reason: result.reason };
  }
  return result.source === "vision"
    ? { source: "fallback", message: "已使用穩定排版規則。", reason: "low-confidence" }
    : { source: "fallback", message: "已使用穩定排版規則。", reason: result.reason };
}
