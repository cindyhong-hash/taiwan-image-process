# AI Layout Design Foundation P1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade AI Layout from static candidate placement to a deterministic, explainable design-planning pipeline while preserving editable canvas layers.

**Architecture:** The route gathers product and brand data through an adapter, then sends a normalized candidate pool through pure creative-brief, recipe, gap-analysis, validation, and rendering functions. Template zones remain the source of spatial truth; the preview model reads the renderer’s resulting layers rather than maintaining a second coordinate system.

**Tech Stack:** Next.js route handlers, TypeScript, Prisma read queries, Sharp metadata, existing Magic Layers `LayerData`, Node built-in test runner.

**Spec:** `docs/superpowers/specs/2026-09-09-ai-layout-design-foundation-p1.md`

## Global Constraints

- Work only in `magic-layers` / `adcreation` code and its tests/docs.
- Do not add schema migrations, paid model calls, image regeneration, or `public/uploads` files.
- Keep product asset keys and `ML_WIZARD_SEED_KEY` compatible.
- Do not change `src/proxy.ts`, product generation, inspiration, or activity creation.
- Every behavior change begins with a failing Node test and finishes with focused tests, lint, Prisma generate, TypeScript, and production build verification.

---

### Task 1: Normalize design context and product visual-kit inventory

**Files:**
- Create: `src/lib/magic-layers/ad-layout-context.ts`
- Create: `src/lib/magic-layers/ad-layout-context.test.ts`
- Modify: `src/app/api/magic-layers/ad-layout/route.ts`

**Interfaces:**
- Produces `createAdLayoutContext(input): AdLayoutContext` and `inventoryFromAssets(input): AdAssetInventory`.
- Consumed by the route and the creative-brief planner.

- [ ] Write failing tests proving `texture` normalizes to `detail`, `lifestyle`/`ingredient` normalize to `benefit`, and hero/logo are identity-critical.
- [ ] Run `node --experimental-strip-types --test src/lib/magic-layers/ad-layout-context.test.ts`; confirm it fails because the module is absent.
- [ ] Implement pure role normalization, brand palette parsing, profile-safe parsing, asset availability, and identity flags.
- [ ] Change the route’s Prisma-to-planner mapping to use this adapter, without changing API response shape.
- [ ] Run the focused test; expect all assertions to pass.
- [ ] Commit context and route adapter changes.

### Task 2: Add Creative Brief, recipe, and deterministic gap analysis

**Files:**
- Create: `src/lib/magic-layers/ad-layout-creative-brief.ts`
- Create: `src/lib/magic-layers/ad-layout-gap-analysis.ts`
- Create: `src/lib/magic-layers/ad-layout-creative-brief.test.ts`
- Create: `src/lib/magic-layers/ad-layout-gap-analysis.test.ts`
- Modify: `src/lib/magic-layers/ad-layout-design-spec.ts`

**Interfaces:**
- `createCreativeBrief(context, request): CreativeBrief`
- `selectDesignRecipe(brief): DesignRecipe`
- `analyzeDesignGaps(brief, inventory, recipe): GapPlanEntry[]`
- `AdLayoutDesignSpec` gains `creativeBrief`, `recipe`, `assetPlan`, `gapPlan`, and named quality checks.

- [ ] Write failing tests: product purpose selects `product-hero`, scene purpose selects `lifestyle`, no hero produces an explicit `missing-identity-asset` gap, and a noisy benefit is omitted for product hero.
- [ ] Run the two focused tests; confirm failures name missing exports/fields.
- [ ] Implement recipe constraints and gap entries only for existing editor-native primitives: product shadow, text-safe panel, and omitted support assets.
- [ ] Extend `resolveAdLayoutDesignSpecs` to retain reasons for selected and omitted assets instead of only raw selections.
- [ ] Run the focused tests; expect pass.
- [ ] Commit pure planning changes.

### Task 3: Preserve product aspect ratio and validate layer readiness

**Files:**
- Modify: `src/lib/magic-layers/ad-layout-renderer.ts`
- Create: `src/lib/magic-layers/ad-layout-quality.ts`
- Create: `src/lib/magic-layers/ad-layout-quality.test.ts`
- Modify: `src/lib/magic-layers/ad-layout-renderer.test.ts`
- Modify: `src/lib/magic-layers/ad-layout-recipes.ts`
- Modify: `src/app/api/magic-layers/ad-layout/route.ts`

**Interfaces:**
- `fitAspectWithin(zone, aspectRatio): NormalizedRect`
- `validateAdLayoutSpec(spec): AdLayoutQualityCheck[]`
- `heroAspectRatio?: number` flows route → recipe → renderer.

- [ ] Write failing renderer tests for a tall product fitted inside a wide zone and a wide product fitted inside a tall zone; assert bounds stay inside the zone and preserve aspect ratio.
- [ ] Write failing quality tests for missing hero, two support assets, excessive decorations, and a hero outside canvas bounds.
- [ ] Run focused tests; confirm each failure is due to absent aspect fitting or validation.
- [ ] Implement contain fitting and make the route read hero dimensions via Sharp metadata with a safe undefined fallback.
- [ ] Implement pure quality checks and have the design-spec repair/validation surface warnings rather than silently passing invalid plans.
- [ ] Run focused tests; expect pass.
- [ ] Commit renderer safety and quality checks.

### Task 4: Make previews use rendered layer geometry and update accurate UX copy

**Files:**
- Modify: `src/lib/magic-layers/ad-layout-options.ts`
- Modify: `src/lib/magic-layers/ad-layout-options.test.ts`
- Modify: `src/components/adcreation/AdLayoutModal.tsx`

**Interfaces:**
- `previewModelForOption(option, canvas): AdLayoutPreviewModel` derives image/text/panel rectangles from `LayerData`.
- `LayoutOptionPreview` maps this model to percentages and never owns direction-specific x/y classes.

- [ ] Write a failing test with intentionally non-default layer positions and assert the preview model returns the same normalized rectangles.
- [ ] Run the focused test; confirm it fails because no geometry model exists.
- [ ] Implement the preview model from layers, preserving actual selected asset URLs and layering order.
- [ ] Replace `PREVIEW_POSITIONS` in the modal with the shared preview model.
- [ ] Change only user-facing terms to “AI 幫我設計” / “建立 3 個設計稿”; retain truthful busy state and “使用這份設計稿進入編輯” after candidates exist.
- [ ] Run the focused preview test; expect pass.
- [ ] Commit preview consistency and copy changes.

### Task 5: Integrate planner in route and document the P1 boundary

**Files:**
- Modify: `src/app/api/magic-layers/ad-layout/route.ts`
- Modify: `docs/AI-LAYOUT-HANDOFF.md`
- Modify: `docs/superpowers/specs/2026-09-09-ai-layout-design-foundation-p1.md`

**Interfaces:**
- Route input/output remains `{ clientId, productId, purpose?, ratio?, title?, subtitle? } → { options, canvasWidth, canvasHeight }`.
- Each internal candidate must originate from a validated `AdLayoutDesignSpec`.

- [ ] Write a route-adjacent pure integration test covering product, benefit, scene, and promo briefs without network or database mocks.
- [ ] Run it to confirm the planner output does not yet expose all required recipe/gap data.
- [ ] Wire context → brief → recipe → gap → validated spec into candidate construction; use client primary/secondary/palette/tone/profile as deterministic context only.
- [ ] Update the handoff with P1 capabilities and explicitly defer LLM/vision, past-post analysis, semantic icons, and generic image effects to later phases.
- [ ] Run the full magic-layers Node test suite; expect all tests to pass.
- [ ] Commit route integration and docs.

### Task 6: Verify and hand off

**Files:**
- Modify only files changed by Tasks 1–5 if verification exposes a scoped defect.

- [ ] Run `node --experimental-strip-types --test src/lib/magic-layers/*.test.ts src/lib/magic-layers/tests/*.test.ts`.
- [ ] Run ESLint only on changed source files.
- [ ] Run `npx prisma generate && npx tsc --noEmit --pretty false`.
- [ ] Run `npx next build`.
- [ ] Run `git diff --check` and inspect `git status --short`; confirm no uploads or unrelated files are included.
- [ ] Commit verification-only scoped fixes, if any, then report the branch and commit range without pushing or merging.
