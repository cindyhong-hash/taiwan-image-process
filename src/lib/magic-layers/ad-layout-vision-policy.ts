import type { AdLayoutContext } from "./ad-layout-context.ts";
import type {
  AdLayoutPlacementSurface,
  AdLayoutTextSafeAreaAdvice,
  AdLayoutSurfaceRect,
  AdLayoutVisionAssessment,
  AssetSafety,
  AssessedVisualRole,
} from "./ad-layout-vision.ts";

const MIN_TRUSTED_CONFIDENCE = 0.7;
const MIN_OMISSION_CONFIDENCE = 0.95;

export type AdLayoutCompositionAdvice = {
  source: "vision" | "fallback";
  preferredTextSafeArea?: Exclude<AdLayoutTextSafeAreaAdvice, "unknown">;
  sceneGrounding: "surface" | "floating";
  surfaceRect?: AdLayoutSurfaceRect;
  warnings: string[];
};

export type AdLayoutAssessmentMetadata = Pick<AdLayoutCompositionAdvice, "source" | "warnings">;

export type AssessedAdLayoutContext = {
  context: AdLayoutContext;
  advice: AdLayoutCompositionAdvice;
  omitted: Array<{ role: AssessedVisualRole; reason: string }>;
};

const ROLE_LABELS: Record<AssessedVisualRole, string> = {
  background: "情境背景",
  detail: "質地細節",
  benefit: "賣點視覺",
  decoration: "裝飾元素",
};

function mustOmit(role: AssessedVisualRole, asset: AssetSafety): boolean {
  if (role === "background") return asset.productVisible || asset.textOrLogoVisible;
  if (role === "detail") return asset.productVisible || asset.completeSceneVisible;
  if (role === "benefit") return asset.productVisible || asset.completeSceneVisible;
  return asset.productVisible || asset.textOrLogoVisible || asset.completeSceneVisible;
}

function reasonFor(role: AssessedVisualRole, assessment: AssetSafety): string {
  const conflict = assessment.productVisible
    ? "含有完整商品"
    : assessment.textOrLogoVisible
      ? "含有文字或 Logo"
      : assessment.completeSceneVisible
        ? "看起來像完整場景"
        : "不適合目前素材角色";
  return `${ROLE_LABELS[role]}${conflict}，已省略以避免素材拼貼${assessment.reason ? `（${assessment.reason}）` : ""}`;
}

function retainedWarningFor(role: AssessedVisualRole): string {
  return `${ROLE_LABELS[role]}的單次視覺判讀信心不足，已保留素材並交由版型限制使用`;
}

function trustedSurface(value: AdLayoutPlacementSurface): boolean {
  return value === "counter" || value === "shelf" || value === "platform" || value === "table";
}

function trustedSafeArea(value: AdLayoutTextSafeAreaAdvice): Exclude<AdLayoutTextSafeAreaAdvice, "unknown"> | undefined {
  return value === "unknown" ? undefined : value;
}

export function applyAdLayoutVisionPolicy(
  context: AdLayoutContext,
  assessment: AdLayoutVisionAssessment,
): AssessedAdLayoutContext {
  const byRole = { ...context.inventory.byRole };
  const omitted: AssessedAdLayoutContext["omitted"] = [];
  const warnings = [...assessment.warnings];

  if (assessment.source === "vision") {
    for (const role of ["background", "detail", "benefit", "decoration"] as const) {
      const asset = assessment.assets[role];
      if (!asset || !byRole[role] || !mustOmit(role, asset)) continue;
      if (asset.confidence < MIN_OMISSION_CONFIDENCE) {
        if (asset.confidence >= MIN_TRUSTED_CONFIDENCE) {
          warnings.push(retainedWarningFor(role));
        }
        continue;
      }
      const reason = reasonFor(role, asset);
      delete byRole[role];
      omitted.push({ role, reason });
      warnings.push(reason);
    }
  }

  const backgroundAssessment = assessment.source === "vision" ? assessment.assets.background : undefined;
  const trustedBackground = Boolean(
    byRole.background &&
    backgroundAssessment &&
    backgroundAssessment.confidence >= MIN_TRUSTED_CONFIDENCE &&
    !mustOmit("background", backgroundAssessment) &&
    assessment.background &&
    assessment.background.confidence >= MIN_TRUSTED_CONFIDENCE,
  );
  const preferredTextSafeArea = trustedBackground && assessment.background
    ? trustedSafeArea(assessment.background.textSafeArea)
    : undefined;
  // 檯面可不可信、跟模型有沒有給得出合法座標，是兩件事。
  // rect 只是「貼齊到哪」的加分資訊；缺了它仍然是 surface —— 陰影
  // (design-spec) 與商品整合模式 (product-integration) 都吃 sceneGrounding，
  // 綁在一起會讓座標差一點點就整個掉回 floating。
  const groundedSurface = Boolean(
    trustedBackground && assessment.background && trustedSurface(assessment.background.placementSurface),
  );
  const surfaceRect = groundedSurface ? assessment.background?.surfaceRect : undefined;
  const sceneGrounding = groundedSurface ? "surface" : "floating";

  return {
    context: { ...context, inventory: { ...context.inventory, byRole } },
    advice: { source: assessment.source, preferredTextSafeArea, sceneGrounding, ...(surfaceRect ? { surfaceRect } : {}), warnings },
    omitted,
  };
}
