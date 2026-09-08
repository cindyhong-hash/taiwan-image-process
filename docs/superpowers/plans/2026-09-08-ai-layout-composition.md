# AI Layout Composition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn product asset candidates into three polished, editable ad-layout compositions rather than canvases containing every supplied asset.

**Architecture:** A pure DesignSpec resolver chooses a bounded asset plan, a safe template, text treatment, and quality repairs. A renderer converts that specification into the existing `LayerData[]` seed; the route remains responsible only for database/storage I/O and the modal remains responsible only for choosing an already-rendered option.

**Tech Stack:** Next.js route handlers, TypeScript, Sharp, Prisma reads, existing Magic Layers `LayerData`, node built-in tests, ESLint, TypeScript compiler.

**Spec:** `docs/superpowers/specs/2026-09-08-ai-layout-composition-design.md`

## Global Constraints

- Base branch is `mine/main` at `fbd6ca1`; preserve `AdLayoutModal.generate()`'s `finally { setBusy(false) }`.
- Do not restore the removed product-page blank-canvas CTA.
- Touch only `src/lib/magic-layers/*`, `src/app/api/magic-layers/ad-layout/*`, `src/components/adcreation/*`, their tests, and the AI-layout handoff document.
- Do not modify product generation, `src/proxy.ts`, inspiration, or activity creation.
- Do not add a Prisma migration or persist DesignSpec.
- Do not commit `public/uploads`.
- Output must remain editable `LayerData[]` and the existing `ML_WIZARD_SEED_KEY` seed shape.

---

### Task 1: Define templates and the pure DesignSpec resolver

**Files:**
- Create: `src/lib/magic-layers/ad-layout-templates.ts`
- Create: `src/lib/magic-layers/ad-layout-design-spec.ts`
- Create: `src/lib/magic-layers/ad-layout-design-spec.test.ts`

**Interfaces:**
- Consumes: normalized asset candidate URLs, canvas dimensions, requested purpose, optional copy, and brand colours.
- Produces: `resolveAdLayoutDesignSpecs(input): AdLayoutDesignSpec[]`, exactly one spec for each direction: `product-focus`, `editorial`, and `scene-led`.
- Produces: `validateAndRepairDesignSpec(spec, available): AdLayoutDesignSpec`, used by the renderer in Task 2.

- [ ] **Step 1: Write failing resolver tests**

```ts
const specs = resolveAdLayoutDesignSpecs({
  canvas: { width: 1024, height: 1280, ratio: "4:5" },
  assets: { background: "bg", hero: "hero", detail: "detail", benefit: "benefit", decoration: "drop" },
  purpose: "product",
  typography: { headline: "溫和去角質", subtitle: "還你柔嫩光滑肌", dark: "#23344a", light: "#ffffff", accent: "#66aee0" },
});
assert.equal(specs.length, 3);
assert.deepEqual(specs.find((s) => s.direction === "product-focus")?.assets, {
  background: { role: "background", imageUrl: "bg" },
  product: { role: "hero", imageUrl: "hero" },
  support: undefined,
  decorations: [{ role: "decoration", imageUrl: "drop" }],
});
assert.equal(specs.find((s) => s.direction === "scene-led")?.assets.support?.role, "detail");
```

Add a second test that passes both `detail` and `benefit` to a scene spec and asserts the validator retains no more than one support asset, no more than two decorations, and a product hero.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --experimental-strip-types --test src/lib/magic-layers/ad-layout-design-spec.test.ts`

Expected: failure because the module does not exist.

- [ ] **Step 3: Add the six normalized templates**

In `ad-layout-templates.ts`, export typed template records for:

```ts
"copy-left-product-right"
"center-product-bottom-copy"
"editorial-product-left"
"editorial-product-bottom"
"scene-copy-overlay"
"scene-product-corner"
```

Each record must define normalized `text`, `hero`, `support`, `decoration`, `logo`, and `safePanel` rectangles. Map the first two to product focus, middle two to editorial, and last two to scene-led. Use a stable selection from `purpose + ratio + direction`; do not use `Math.random()`.

- [ ] **Step 4: Implement the resolver and validator**

Implement the types below in `ad-layout-design-spec.ts` and use direction-specific asset budgets:

```ts
export type AdLayoutDirection = "product-focus" | "editorial" | "scene-led";
export type AdAssetRole = "hero" | "detail" | "background" | "benefit" | "decoration";
export type TextSafeTreatment = "none" | "light-panel" | "dark-panel";

export interface AssetSelection { role: AdAssetRole; imageUrl: string; }
export interface AdLayoutDesignSpec {
  direction: AdLayoutDirection;
  templateId: string;
  artDirection: string;
  rationale: string[];
  canvas: { width: number; height: number; ratio: string };
  assets: { background?: AssetSelection; product?: AssetSelection; support?: AssetSelection; decorations: AssetSelection[] };
  textSafeArea: { zone: "left-top" | "left-center" | "right-top" | "bottom"; treatment: TextSafeTreatment };
  typography: { headline?: string; subtitle?: string; headlineColor: string; subtitleColor: string; accentColor: string; headlineWeight: 700 | 800; subtitleWeight: 500 | 600; };
  productTreatment?: { shadow: "none" | "soft-ellipse" };
  quality: { score: number; warnings: string[] };
}
```

Rules: product/editorial exclude `detail` and `benefit` by default; scene uses at most one of them; decoration count is at most two; title/subtitle are absent rather than fabricated when no copy is supplied. Validator repairs over-budget assets by removing decoration first, then support, and appends a warning.

- [ ] **Step 5: Run the resolver tests to verify they pass**

Run: `node --experimental-strip-types --test src/lib/magic-layers/ad-layout-design-spec.test.ts`

Expected: all resolver and validator tests pass.

- [ ] **Step 6: Commit the pure composition decision layer**

```bash
git add src/lib/magic-layers/ad-layout-templates.ts src/lib/magic-layers/ad-layout-design-spec.ts src/lib/magic-layers/ad-layout-design-spec.test.ts
git commit -m "feat(ad-layout): add composition design specs"
```

### Task 2: Render a DesignSpec into existing editable layers

**Files:**
- Create: `src/lib/magic-layers/ad-layout-renderer.ts`
- Create: `src/lib/magic-layers/ad-layout-renderer.test.ts`
- Modify: `src/lib/magic-layers/compose-layers.ts`
- Modify: `src/lib/magic-layers/ad-layout-recipes.ts`

**Interfaces:**
- Consumes: one validated `AdLayoutDesignSpec`, a selected template, and `logoUrl`.
- Produces: `renderAdLayoutSpec(spec, options): LayerData[]`.
- Preserves: `buildAdLayoutCandidates(input)` public export for route consumers, now delegating through specs and renderer.

- [ ] **Step 1: Write failing renderer tests**

```ts
const layers = renderAdLayoutSpec(productFocusSpec, { logoUrl: "logo" });
assert.deepEqual(layers.map((layer) => layer.id), [
  "layer_bg", "product_shadow", "product_1", "decoration_1", "text_safe_panel", "text_title", "text_sub", "logo_1",
]);
assert.equal(layers.filter((layer) => layer.id === "texture_1" || layer.id === "benefit_1").length, 0);
assert.equal(layers.find((layer) => layer.id === "text_safe_panel")?.meta.shape?.kind, "rect");
```

Add a scene-led test that allows exactly one support layer and verifies it is below the product and text layers. Add a test that every rendered layer has an existing `LayerData.type`.

- [ ] **Step 2: Run the renderer test to verify it fails**

Run: `node --experimental-strip-types --test src/lib/magic-layers/ad-layout-renderer.test.ts`

Expected: failure because `renderAdLayoutSpec` does not exist.

- [ ] **Step 3: Implement editable layer rendering**

Implement reusable `imageLayer`, `textLayer`, `shapeLayer`, and `softShadowLayer` helpers in `ad-layout-renderer.ts`.

- Background is one `background` image layer filling the document.
- The product uses `object-contain` geometry by preserving its normalized hero zone; no crop or scale distortion is introduced by renderer geometry.
- A soft shadow is a low-opacity ellipse shape under the hero, never baked into the hero image.
- A text safe panel is a low-opacity editable rect shape behind copy only when its DesignSpec treatment is not `none`.
- Use `meta.style` for distinct headline/subtitle font sizes, weights, colours, and left/center alignment from the template.
- Render only the assets declared in `spec.assets`.

- [ ] **Step 4: Route compatibility through the renderer**

Change `buildAdLayoutCandidates` so it resolves three DesignSpecs and renders each into its candidate's `layers`. Preserve existing candidate ids, labels, descriptions, and response shape to avoid changing the modal seed contract.

- [ ] **Step 5: Run renderer and existing composition tests**

Run:

```bash
node --experimental-strip-types --test \
  src/lib/magic-layers/ad-layout-design-spec.test.ts \
  src/lib/magic-layers/ad-layout-renderer.test.ts \
  src/lib/magic-layers/compose-layers.test.ts
```

Expected: all tests pass.

- [ ] **Step 6: Commit renderer integration**

```bash
git add src/lib/magic-layers/ad-layout-renderer.ts src/lib/magic-layers/ad-layout-renderer.test.ts src/lib/magic-layers/ad-layout-recipes.ts src/lib/magic-layers/compose-layers.ts
git commit -m "feat(ad-layout): render curated editable compositions"
```

### Task 3: Base text treatment on the actual safe area

**Files:**
- Modify: `src/lib/magic-layers/ad-layout-data.ts`
- Modify: `src/lib/magic-layers/ad-layout-data.test.ts`
- Modify: `src/app/api/magic-layers/ad-layout/route.ts`

**Interfaces:**
- Consumes: prepared background buffer and the chosen template's normalized text zone.
- Produces: `{ textColor, panelTreatment, accentColor }`, passed to the DesignSpec resolver.

- [ ] **Step 1: Write failing safe-area contrast tests**

```ts
const treatment = await resolveTextSafeTreatment(background, { x: 0.06, y: 0.08, w: 0.40, h: 0.22 }, "#7c3aed");
assert.equal(treatment.textColor, "#ffffff");
assert.equal(treatment.panelTreatment, "dark-panel");
```

Use generated Sharp fixtures with a complex/light text crop and a dark text crop. Assert that a high-contrast crop returns `panelTreatment: "none"`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --experimental-strip-types --test src/lib/magic-layers/ad-layout-data.test.ts`

Expected: failure because `resolveTextSafeTreatment` does not exist.

- [ ] **Step 3: Implement crop-aware contrast treatment**

Use Sharp `extract()` for the normalized safe-area crop and `stats()` to calculate brightness. Return dark blue-grey or white text based on contrast. If the crop is near the contrast threshold, return `light-panel` for dark text or `dark-panel` for white text. Keep existing full-bleed cover preprocessing unchanged.

- [ ] **Step 4: Bring full brand context into the route**

Expand the existing read-only Prisma selects to include product `name`, `description`, `category`, `visualProfileJson`, and client `description`, `industry`, `toneLabels`, `paletteColors`, `fonts`, `primaryColor`, `secondaryColor`, `logoUrls`.

Use context to construct deterministic art-direction copy only: do not call a model in P0. Use product/client fields to populate the DesignSpec's `artDirection` and choose `primaryColorOverride ?? client.primaryColor` as accent. The route must continue to return the same `options` shape and must not write database state.

- [ ] **Step 5: Run data and route type verification**

Run:

```bash
node --experimental-strip-types --test src/lib/magic-layers/ad-layout-data.test.ts
npx eslint src/lib/magic-layers/ad-layout-data.ts src/app/api/magic-layers/ad-layout/route.ts
npx prisma generate && npx tsc --noEmit --pretty false
```

Expected: test exits 0, ESLint prints no diagnostics, and TypeScript exits 0.

- [ ] **Step 6: Commit safe-area treatment**

```bash
git add src/lib/magic-layers/ad-layout-data.ts src/lib/magic-layers/ad-layout-data.test.ts src/app/api/magic-layers/ad-layout/route.ts
git commit -m "feat(ad-layout): protect copy with safe-area contrast"
```

### Task 4: Align the modal with the actual composition workflow

**Files:**
- Modify: `src/components/adcreation/AdLayoutModal.tsx`
- Create: `src/lib/magic-layers/ad-layout-options.test.ts` if it needs coverage beyond the existing selection test

**Interfaces:**
- Consumes: unchanged `{ options, canvasWidth, canvasHeight }` API response.
- Produces: unchanged `ML_WIZARD_SEED_KEY` payload selected from one completed option.

- [ ] **Step 1: Write a failing selection/copy test only if a new pure helper is needed**

```ts
assert.equal(getAdLayoutContinueLabel({ rendered: true }), "使用這個設計稿進入編輯");
```

Do not add a component test framework solely for copy. Reuse `ad-layout-options.test.ts` for a pure helper, otherwise inspect this small UI change manually.

- [ ] **Step 2: Update modal copy and option explanation**

Keep the existing three option previews. Change their explanatory copy to state that each is a complete editable draft, not a collection of all product materials. Keep the final button accurate: `使用這個設計稿進入編輯`, because all real render work already completed before selection. Do not claim a new generation occurs after selection.

Retain `finally { setBusy(false) }` and ensure both API failure and successful option display leave the modal operable.

- [ ] **Step 3: Show only actual progress**

While the one route request is pending, present one truthful state such as `正在建立三個可編輯設計稿…`. Once the response arrives, replace it with the selection UI; do not add fake timed checklist stages. Do not add SSE in P0.

- [ ] **Step 4: Manually test the modal flow**

Use a product with a completed asset pack:

1. Open `AI 幫我排版`, choose 4:5 and product focus, submit.
2. Confirm the modal becomes interactive after alternatives load.
3. Select a different direction and enter the editor.
4. Confirm the editor contains individually editable background, product, optional safe panel, text, optional decoration, and logo layers.
5. Confirm no blank-canvas product CTA is present.

- [ ] **Step 5: Commit modal alignment**

```bash
git add src/components/adcreation/AdLayoutModal.tsx src/lib/magic-layers/ad-layout-options.test.ts
git commit -m "refine(ad-layout): clarify editable composition flow"
```

### Task 5: Final verification and handoff

**Files:**
- Modify: `docs/AI-LAYOUT-HANDOFF.md`

- [ ] **Step 1: Update the handoff document**

Replace the V2 “fixed recipes” description with the DesignSpec → validator → renderer pipeline. Document that P0 uses deterministic art direction from product/brand context, never uses all assets, and has no schema migration. Keep P1 vision analysis explicitly optional with deterministic fallback.

- [ ] **Step 2: Run the complete focused test suite**

Run:

```bash
node --experimental-strip-types --test src/lib/magic-layers/*.test.ts src/lib/magic-layers/tests/*.test.ts
npx eslint src/lib/magic-layers src/app/api/magic-layers/ad-layout src/components/adcreation/AdLayoutModal.tsx
npx prisma generate && npx tsc --noEmit --pretty false
npx next build
git diff --check
git status --short
```

Expected: all tests/build/type checks exit 0; diff check has no output; status includes only intentional files and never `public/uploads`.

- [ ] **Step 3: Commit documentation and handoff**

```bash
git add docs/AI-LAYOUT-HANDOFF.md
git commit -m "docs(ad-layout): hand off composition pipeline"
```

## Plan Self-Review

- Spec coverage: Tasks 1–2 cover candidate-pool selection, templates, hierarchy, editable layers, and validation. Task 3 covers local safe-area contrast and available brand context. Task 4 covers honest UI/progress. Task 5 covers verification and handoff. Vision LLM, past-post style matching, and richer streaming remain intentionally P1.
- Placeholder scan: no unresolved markers or unspecified validation steps remain.
- Type consistency: `AdLayoutDesignSpec` is created in Task 1, rendered in Task 2, and receives text treatment in Task 3; the route and modal keep their existing option and seed contracts.
