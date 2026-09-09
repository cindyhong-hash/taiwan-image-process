# AI Layout P2-A — Vision Asset Safety and Composition Suitability

## Goal

Improve the reliability of the existing editable ad-design pipeline without letting a model rebuild the design from raw coordinates. Before a candidate design is composed, assess the selected Product Visual Kit with vision and remove assets that would make the result look like a collage: duplicate products in a scene, a detail image that is actually another product shot, or a decoration that contains text or a complete scene.

The vision response may advise which existing text-safe *category* and product-grounding treatment are suitable. It cannot generate pixels, provide x/y values, edit the identity-critical product, or bypass P0/P1’s templates and validators.

## Scope

### Included

- One bounded OpenRouter vision request per "AI 幫我設計" generation request, with at most the existing hero plus one selected asset for each non-identity role: background, detail, benefit, decoration.
- A strict, versioned JSON assessment of the selected kit:
  - whether each non-identity asset is safe for its declared role;
  - whether it visibly contains a product, packaging, logo/text, or a complete scene;
  - whether the background has a usable text-safe category and a plausible product-placement surface.
- Deterministic sanitation of the inventory before `CreativeBrief`, `DesignRecipe`, `AssetPlan`, gap analysis, background preparation, and renderer input.
- A validator that accepts only known roles, known text-safe categories, and known placement-surface values. Invalid, malformed, timed-out, or unavailable vision results fall back to the P1 deterministic kit.
- Provenance exposed in the returned design option/spec as `vision` or `fallback`, with concise warnings/rationale for omitted assets.
- Tests for parsing, rejection rules, safe-inventory construction, template/grounding advice validation, and route fallback behavior.

### Explicitly excluded

- No database/schema/cache migration. This avoids making a paid vision result authoritative or permanently stale.
- No generation, transformation, or editing of product images; `hero` and `logo` remain identity-critical and are never omitted by vision.
- No raw coordinates, free-form layout JSON, arbitrary template IDs, or arbitrary effects from the model.
- No past-post analysis in this slice: the current product layout route does not yet have a stable, scoped source of approved historical creatives. It can be added later as a separate, privacy-aware input source.
- No gradient/blur/effect primitive expansion and no icon/benefit graphic system. Those require explicit Editor contracts and belong after this safe-selection slice.

## Data Flow

```
Product + client + DONE assets
  -> P1 createAdLayoutContext (one selected candidate per canonical role)
  -> P2 prepare small private data-URI thumbnails
  -> OpenRouter vision assessment (or deterministic fallback)
  -> validated/sanitized inventory + composition advice
  -> P1 CreativeBrief -> Recipe -> direction-aware AssetPlan -> GapPlan
  -> background preparation -> DesignSpec -> quality validation -> editable LayerData[]
```

The route must assess the kit *before* it prepares the background. If a legacy background shows a full product, it is excluded and the existing neutral background fallback is used instead.

## Contracts

### Vision request

The new `src/lib/magic-layers/ad-layout-vision.ts` will load private storage objects through `loadBuffer`, downscale them to a bounded edge, and send data URIs to OpenRouter. The model sees the identity hero only as a reference for detecting duplicate depictions; the hero is never a candidate for rejection.

The prompt is observational: report only visible facts, never infer efficacy, audience, product claims, or a new design. It requests JSON only and labels every image with its canonical role.

### Restricted response

```ts
type AssetSafety = {
  safeForDeclaredRole: boolean;
  productVisible: boolean;
  textOrLogoVisible: boolean;
  completeSceneVisible: boolean;
  confidence: number; // clamped 0..1
  reason?: string;
};

type LayoutVisionAdvice = {
  version: 1;
  assets: Partial<Record<"background" | "detail" | "benefit" | "decoration", AssetSafety>>;
  background?: {
    textSafeArea: "left-top" | "right-top" | "left-center" | "bottom" | "unknown";
    placementSurface: "counter" | "shelf" | "platform" | "table" | "none" | "unknown";
  };
};
```

The parser strips markdown fences, validates every enum, clamps confidence, and discards unsupported properties. There is no model-controlled asset URL, template ID, color, effect, or geometry.

### Deterministic asset rules

- `hero` and logo: always retain; never ask vision to decide their identity.
- `background`: omit if a product, package, readable branding/text, or an obvious duplicate product is visible. It must be a pure supporting environment.
- `detail`: omit when it is a full product/packaging shot or a complete scene. A photographic texture/macro may remain.
- `benefit`: omit when it is a physical product, package, or full scene. It may remain abstract/conceptual.
- `decoration`: omit when it contains a product, readable text/logo, or a complete scene. It must remain a small independent overlay.
- In uncertain low-confidence results, retain the asset. This makes the model advisory rather than silently destructive; P1’s asset budgets still prevent collage.

### Applying advice

- `safe inventory` is a shallow transformed copy of the P1 inventory. P1 brief/recipe/asset planning remain unaware of the vision implementation.
- The assessment’s `textSafeArea` can only select a same-direction existing template whose declared text-safe category matches. If there is no matching template, use current `templateFor(direction, purpose, ratio)`.
- `placementSurface` may only choose between existing `soft-ellipse` grounding and `none`; unknown/no surface never creates a new shadow. No contact-shadow geometry is introduced in P2-A.
- The original pixel-based contrast check still controls whether a safe text panel is rendered. Vision advice may choose a template category but may not claim that text is readable.

## Failure, Cost, and Safety

- The vision call has a short server-side timeout that leaves enough room for existing background work and stays inside the route’s 120-second max duration.
- Missing API key, storage read failure, provider error, timeout, empty output, or invalid JSON produces a named `fallback` assessment. The request still returns the P1 deterministic three options.
- Never return private data URIs, raw model output, or stack traces to the client. Only safe provenance and user-facing omission reason appear in `DesignSpec` rationale/warnings.
- No persistent cache in P2-A. That avoids a new migration and prevents stale safety decisions when an asset URL changes. A later slice can introduce a content-hash cache once product asset lifecycle ownership is agreed.

## Integration Points

- New: `ad-layout-vision.ts` and focused unit tests.
- Extend `AdLayoutDesignInput` / `AdLayoutDesignSpec` with a small validated `compositionAdvice` / assessment provenance field; renderer receives only deterministic template and shadow decisions.
- `ad-layout-templates.ts` gets a deterministic helper to select a same-direction template by allowed text-safe area, with the current `templateFor` as fallback.
- `route.ts` invokes the assessor before `prepareAdBackground`, builds the safe context/brief, and passes advice down. It continues to require `hero`.
- No changes under `src/lib/products/*`, `src/proxy.ts`, activity creation, inspiration, or database schema.

## Quality and Acceptance Criteria

1. A legacy background with a visible bottle is never used as the final background; a neutral fallback is used instead.
2. A product Hero design continues to contain exactly the original `hero` asset; no vision response can replace or remove it.
3. A malformed/unavailable/slow vision response still returns three deterministic, editable candidates.
4. Vision cannot inject coordinates, external URLs, arbitrary templates, or unsupported effect values.
5. If a trusted background offers a supported empty text-safe category, the selected template belongs to the same direction and uses that category; otherwise the default template remains.
6. Existing contrast computation and P1 quality checks remain active after the vision pass.
7. Unit tests, scoped lint, `prisma generate && tsc --noEmit`, and production build pass before handoff.
