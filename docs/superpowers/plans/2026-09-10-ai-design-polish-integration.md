# AI Design Polish and Product Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opaque editable background fallback, correct semantic P4 gaps, run a bounded polish pass, integrate the unchanged hero into the composition, and expand benefit graphics.

**Architecture:** Gap analysis records missing semantic roles while the renderer guarantees a zero-cost base. A pure spec polish module makes bounded adjustments before validation. Product integration and graphic decoration render as existing editable shape/text layers, so preview, editor, persistence and export reuse current contracts.

**Tech Stack:** TypeScript, Next.js App Router, Node test, Canvas 2D editable shapes, existing Magic Layers `LayerData`.

**Spec:** `docs/superpowers/specs/2026-09-10-ai-design-polish-integration.md`

## Global Constraints

- Work only on `codex/ai-layout-design-polish-p3`; do not push, merge or deploy.
- Do not call image-generation providers or create test products.
- Keep `Product.heroImageUrl` identity-critical and unchanged.
- Preserve the existing editor seed and saved-layer schema; use existing optional `meta.shape`, `meta.style`, opacity and groupId fields.
- Apply changes sequentially and commit each task independently.

---

### Task 1: Opaque base and semantic P4 gaps

**Files:**
- Modify: `src/lib/magic-layers/ad-layout-gap-analysis.ts`
- Modify: `src/lib/magic-layers/ad-layout-gap-analysis.test.ts`
- Modify: `src/lib/magic-layers/ad-layout-renderer.ts`
- Modify: `src/lib/magic-layers/ad-layout-renderer.test.ts`
- Modify: `docs/AI-LAYOUT-HANDOFF.md`

**Interfaces:**
- Extend `GapPlanEntry` with `{ kind: "missing-background-base"; provider: "shape"; message: string }`.
- `renderAdLayoutSpec(spec)` emits `background_base` when `spec.assets.background` is absent.
- `hasNativeBenefitVisual(inventory)` returns true only for a retained `byRole.benefit` whose `sourceRole` is `benefit`.

- [x] Add failing gap tests for product with no background, scene with background but legacy lifestyle support, benefit with detail, benefit with legacy lifestyle, and benefit with native benefit.
- [x] Run `node --test --experimental-strip-types src/lib/magic-layers/ad-layout-gap-analysis.test.ts` and confirm the semantic benefit cases fail.
- [x] Implement the shape gap and native benefit rule while keeping the paid scene-background branch and one paid suggestion per request.
- [x] Add a failing renderer test asserting that no image background produces one full-canvas `background_base` layer with `type: "background"`, no image, opaque `#f8f9fc` rect shape, and z-index below the product.
- [x] Extend the renderer shape helper to accept background type/semantic metadata and implement the base.
- [x] Run gap, renderer, preview, saved-layer and compose tests; run TypeScript and focused ESLint.
- [x] Update the handoff and commit `fix(design): add editable background fallback`.

### Task 2: Bounded post-layout polish

**Files:**
- Create: `src/lib/magic-layers/ad-layout-polish.ts`
- Modify: `src/lib/magic-layers/ad-layout-polish.test.ts`
- Modify: `src/lib/magic-layers/ad-layout-design-spec.ts`
- Modify: `src/lib/magic-layers/ad-layout-renderer.ts`

**Interfaces:**
- Add `AdLayoutPolishTreatment = { backgroundWash: "none" | "soft-light"; reasons: string[] }` to the design spec.
- Add `polishAdLayoutSpec(spec: AdLayoutDesignSpec): AdLayoutDesignSpec`.

- [x] Add failing unit cases for safe 8% product growth, refusing growth on collision/out-of-bounds, strengthening a short weak headline, removing a colliding decoration, and preserving all image URLs.
- [x] Run `node --test --experimental-strip-types src/lib/magic-layers/ad-layout-polish.test.ts` and confirm the new API is absent.
- [x] Implement immutable rectangle helpers and `polishAdLayoutSpec`; cap scale at 1.08, keep copy unchanged, and append reasons only for actions actually applied.
- [x] Call polish after initial spec construction and before `validateAndRepairDesignSpec`.
- [x] Add renderer coverage for `background_wash`, an editable full-canvas vertical gradient below product/copy and above the image background.
- [x] Run polish, composition, design-spec, renderer, preview and quality tests; run TypeScript and focused ESLint.
- [x] Commit `feat(design): polish resolved ad layouts`.

### Task 3: Editable product integration

**Files:**
- Create: `src/lib/magic-layers/ad-layout-product-integration.ts`
- Create: `src/lib/magic-layers/ad-layout-product-integration.test.ts`
- Modify: `src/lib/magic-layers/ad-layout-design-spec.ts`
- Modify: `src/lib/magic-layers/ad-layout-renderer.ts`
- Modify: `src/lib/magic-layers/ad-layout-renderer.test.ts`
- Modify: `src/lib/magic-layers/ad-layout-quality.ts`
- Modify: `src/lib/magic-layers/ad-layout-quality.test.ts`

**Interfaces:**
- Add `ProductIntegrationPlan` with `mode`, `lightSide`, `contactShadow`, `castShadow`, `highlight`, `halo`, and `reflectionHighlight` booleans.
- Add `planProductIntegration(spec): ProductIntegrationPlan` and bounded geometry helpers returning `Bbox` values.

- [x] Add failing planner tests proving surface mode enables contact/cast/highlight/reflection when space permits, while floating mode enables only grounding/highlight/halo.
- [x] Implement deterministic mode and light-side selection from trusted surface advice and resolved product placement.
- [x] Add failing renderer tests for editable `product_cast_shadow`, `product_contact_shadow`, `product_highlight`, `product_color_halo`, and conditional `product_reflection_highlight`, with the hero URL and ratio unchanged.
- [x] Render each effect as a bounded rect/ellipse/gradient/softness shape; do not create or modify product bitmaps.
- [x] Extend quality checks with product bounds, visible integration, and text/product overlap checks using resolved geometry.
- [x] Run integration, renderer, quality, composition, saved-layer and preview tests; run TypeScript and focused ESLint.
- [x] Commit `feat(design): integrate products with editable lighting`.

### Task 4: Semantic benefit graphic system

**Files:**
- Modify: `src/lib/magic-layers/ad-layout-graphics.ts`
- Modify: `src/lib/magic-layers/ad-layout-graphics.test.ts`
- Modify: `src/lib/magic-layers/editable-shape.ts`
- Modify: `src/lib/magic-layers/ad-layout-renderer.ts`
- Modify: `src/lib/magic-layers/ad-layout-renderer.test.ts`
- Modify: `src/components/magic-layers/MagicLayersEditor.tsx`

**Interfaces:**
- Export `BENEFIT_ICON_REGISTRY` and extend `BenefitIcon` with `sun`, `clean`, `repair`, and `texture`.
- Extend `BenefitGraphic` with `number: string | null`; number extraction accepts only text already present in the confirmed benefit.

- [x] Add failing registry tests for hydration, cushioning, blade, protection, radiance, botanical, sun/day, cleansing, repair, texture/smoothness, negation, unknown text, and supplied numeric phrases.
- [x] Implement ordered semantic registry matching and bounded numeric extraction without adding claims.
- [x] Add Canvas paths for the four new icon IDs and expose them in the editor icon picker.
- [x] Add failing renderer tests for editable glass badge ellipses behind matched icons, divider lines between multiple benefit cells, a separate numeric callout when present, shared group IDs, and text-only fallback.
- [x] Implement badge, divider, callout and group-highlight shapes with existing gradient/softness fields; keep benefit copy editable and unchanged.
- [x] Run graphics, editable-shape, renderer, preview, saved-layer and editor lint checks; run all Magic Layers/API tests, TypeScript and production build.
- [x] Update validation/handoff docs and commit `feat(design): expand semantic benefit graphics`.

### Final verification

- [x] Run `node --test --experimental-strip-types src/lib/magic-layers/*.test.ts src/app/api/*.test.ts` and verify zero failures.
- [x] Run `node --test --experimental-strip-types src/lib/**/*.test.ts src/app/api/*.test.ts`; report the existing planner fixture separately if it remains the only failure.
- [x] Run focused ESLint for every changed TypeScript/TSX file, `npx tsc --noEmit`, `git diff --check`, and `npm run build`.
- [x] Confirm the worktree is clean and report all four commit hashes. Do not run P4 image generation; hand live button validation to release after the trigger matrix is visible.
