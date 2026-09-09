# AI Layout Vision Safety P2-A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a bounded OpenRouter vision pass that filters unsafe Product Visual Kit assets and supplies validated composition advice while retaining P1’s deterministic editable-layout fallback.

**Architecture:** `ad-layout-vision.ts` owns private thumbnail preparation, provider transport, strict JSON parsing, and non-throwing fallback results. `ad-layout-vision-policy.ts` turns that result into a sanitized P1 context and constrained renderer advice. The existing route calls those modules before background preparation; P1 remains the owner of brief, recipe, asset plan, template, validation, and rendering.

**Tech Stack:** Next.js route handlers, TypeScript, OpenRouter chat completions, Sharp, Node test runner, Prisma-generated types.

**Spec:** `docs/superpowers/specs/2026-09-09-ai-layout-vision-safety-p2.md`

## Global Constraints

- Inspect only the existing hero plus the selected `background`, `detail`, `benefit`, and `decoration`; never generate or edit pixels.
- Hero and logo are identity-critical and can never be removed or replaced by vision.
- The model cannot provide coordinates, URLs, template IDs, colors, effects, or arbitrary layer settings.
- Missing key, provider/storage error, timeout, or invalid JSON returns three normal P1 candidates; it is never an API error.
- Do not modify `src/lib/products/*`, `src/proxy.ts`, activity creation, inspiration, database schema, or `public/uploads`.
- No database cache/migration, historical-post analysis, new effect primitive, or icon library in this slice.
- Commit each completed task. Do not push, merge, or deploy.

---

### Task 1: Add a strict, bounded vision assessment module

**Files:**
- Create: `src/lib/magic-layers/ad-layout-vision.ts`
- Create: `src/lib/magic-layers/ad-layout-vision.test.ts`

**Interfaces:**
- Consumes: `AdLayoutContext`, `loadBuffer`, Sharp, `OPENROUTER_API_KEY`, and `OPENROUTER_VISION_MODEL`.
- Produces: `assessAdLayoutVisualKit(context, deps?, signal?)` and `parseAdLayoutVisionAssessment(text)`.

```ts
export type AdLayoutVisionSource = "vision" | "fallback";
export type AdLayoutTextSafeAreaAdvice = "left-top" | "right-top" | "left-center" | "bottom" | "unknown";
export type AdLayoutPlacementSurface = "counter" | "shelf" | "platform" | "table" | "none" | "unknown";
export type AssessedVisualRole = "background" | "detail" | "benefit" | "decoration";
export type AssetSafety = { safeForDeclaredRole: boolean; productVisible: boolean; textOrLogoVisible: boolean; completeSceneVisible: boolean; confidence: number; reason?: string };
export type ParsedVisionAssessment = { version: 1; assets: Partial<Record<AssessedVisualRole, AssetSafety>>; background?: { textSafeArea: AdLayoutTextSafeAreaAdvice; placementSurface: AdLayoutPlacementSurface; confidence: number } };
export type AdLayoutVisionAssessment = ParsedVisionAssessment & { source: AdLayoutVisionSource; warnings: string[] };
```

- [ ] **Step 1: Write failing parser and fallback tests**

```ts
test("parses only supported fields and clamps confidence", () => {
  const value = parseAdLayoutVisionAssessment("```json\\n{...}\\n```");
  assert.equal(value?.assets.background?.confidence, 1);
  assert.equal(value?.background?.textSafeArea, "left-top");
  assert.equal("templateId" in (value ?? {}), false);
});
test("returns fallback for malformed vision output", async () => {
  const value = await assessAdLayoutVisualKit(context, { completeVision: async () => "not-json" });
  assert.equal(value.source, "fallback");
  assert.deepEqual(value.assets, {});
});
```

- [ ] **Step 2: Run the red test**

Run: `node --experimental-strip-types --test src/lib/magic-layers/ad-layout-vision.test.ts`

Expected: FAIL because the vision module does not exist.

- [ ] **Step 3: Implement parser, fallback, and injectable dependencies**

Use literal role/enum allowlists. Strip JSON fences, require `version === 1`, coerce only booleans, clamp every confidence to `0..1`, and discard unknown keys. Malformed roots, asset values, and background values must return `null`; the public assessor converts that to:

```ts
function fallback(message: string): AdLayoutVisionAssessment {
  return { version: 1, assets: {}, source: "fallback", warnings: [message] };
}
```

- [ ] **Step 4: Add a failing bounded-input test**

```ts
test("sends hero as reference plus only selected non-identity roles", async () => {
  const seen: string[] = [];
  await assessAdLayoutVisualKit(context, {
    loadAsDataUrl: async (url) => `data:image/png;base64,${url}`,
    completeVision: async ({ imageDataUrls }) => { seen.push(...imageDataUrls); return validJson; },
  });
  assert.equal(seen.length, 5);
});
```

- [ ] **Step 5: Implement private thumbnail loading and provider call**

Use `loadBuffer` then `sharp(buffer).resize(768, 768, { fit: "inside", withoutEnlargement: true }).png()` to create data URIs. Label hero as an identity reference and every candidate with its canonical role. The system prompt requests only visible facts in `ParsedVisionAssessment` and rejects layout instructions, coordinates, URLs, colors, or edits. Call OpenRouter with `OPENROUTER_VISION_MODEL ?? "google/gemini-2.5-flash"`, `max_tokens: 900`, standard project headers, and a 20-second abort. Missing key, read/provider errors, aborts, empty output, and invalid JSON all return fallback without throwing.

- [ ] **Step 6: Verify and commit Task 1**

Run: `node --experimental-strip-types --test src/lib/magic-layers/ad-layout-vision.test.ts`

Expected: PASS for parser sanitation, role cap, successful result, and every fallback path.

```bash
git add src/lib/magic-layers/ad-layout-vision.ts src/lib/magic-layers/ad-layout-vision.test.ts
git commit -m "feat(ad-layout): assess visual kit safety"
```

### Task 2: Apply conservative role-specific safety policy

**Files:**
- Create: `src/lib/magic-layers/ad-layout-vision-policy.ts`
- Create: `src/lib/magic-layers/ad-layout-vision-policy.test.ts`

**Interfaces:**
- Consumes: `AdLayoutContext`, `AdLayoutVisionAssessment`, and Task 1 enum types.
- Produces:

```ts
export type AdLayoutCompositionAdvice = {
  source: "vision" | "fallback";
  preferredTextSafeArea?: Exclude<AdLayoutTextSafeAreaAdvice, "unknown">;
  sceneGrounding: "surface" | "floating";
  warnings: string[];
};
export type AssessedAdLayoutContext = {
  context: AdLayoutContext;
  advice: AdLayoutCompositionAdvice;
  omitted: Array<{ role: AssessedVisualRole; reason: string }>;
};
export function applyAdLayoutVisionPolicy(context: AdLayoutContext, assessment: AdLayoutVisionAssessment): AssessedAdLayoutContext;
```

- [ ] **Step 1: Write failing policy tests**

```ts
test("omits a trusted legacy background containing a product", () => {
  const result = applyAdLayoutVisionPolicy(context, vision({ background: unsafeBackground }));
  assert.equal(result.context.inventory.byRole.background, undefined);
});
test("keeps low-confidence assets and always keeps hero and logo", () => {
  const result = applyAdLayoutVisionPolicy(context, vision({ detail: { ...unsafeDetail, confidence: 0.4 } }));
  assert.ok(result.context.inventory.byRole.detail);
  assert.ok(result.context.inventory.byRole.hero);
  assert.ok(result.context.inventory.logo);
});
test("accepts only trusted valid background advice", () => {
  const result = applyAdLayoutVisionPolicy(context, trustedAssessment);
  assert.equal(result.advice.preferredTextSafeArea, "right-top");
  assert.equal(result.advice.sceneGrounding, "surface");
});
```

- [ ] **Step 2: Run the red test**

Run: `node --experimental-strip-types --test src/lib/magic-layers/ad-layout-vision-policy.test.ts`

Expected: FAIL because the policy module does not exist.

- [ ] **Step 3: Implement `MIN_TRUSTED_CONFIDENCE = 0.7` and omission rules**

Only omit for a `vision` source with confidence at least `0.7`. Never omit hero or logo. Use these exact rules:

```ts
function mustOmit(role: AssessedVisualRole, asset: AssetSafety): boolean {
  if (role === "background") return asset.productVisible || asset.textOrLogoVisible || asset.completeSceneVisible;
  if (role === "detail") return asset.productVisible || asset.completeSceneVisible;
  if (role === "benefit") return asset.productVisible || asset.completeSceneVisible;
  return asset.productVisible || asset.textOrLogoVisible || asset.completeSceneVisible;
}
```

Copy the P1 inventory, delete only a failed non-identity candidate, and add the same role-specific human reason to `omitted` and `advice.warnings`.

- [ ] **Step 4: Implement constrained advice**

Only trust `background.textSafeArea !== "unknown"` and `background.confidence >= 0.7` when the background was retained. Set `sceneGrounding` to `surface` only for trusted `counter`, `shelf`, `platform`, or `table`; all other/fallback cases are `floating`.

- [ ] **Step 5: Verify and commit Task 2**

Run: `node --experimental-strip-types --test src/lib/magic-layers/ad-layout-vision-policy.test.ts`

Expected: PASS for each role, low confidence, fallback, hero/logo, and advice invariants.

```bash
git add src/lib/magic-layers/ad-layout-vision-policy.ts src/lib/magic-layers/ad-layout-vision-policy.test.ts
git commit -m "feat(ad-layout): apply safe visual kit policy"
```

### Task 3: Constrain template and grounding behavior to validated advice

**Files:**
- Modify: `src/lib/magic-layers/ad-layout-templates.ts`
- Modify: `src/lib/magic-layers/ad-layout-design-spec.ts`
- Modify: `src/lib/magic-layers/ad-layout-design-spec.test.ts`
- Modify: `src/lib/magic-layers/ad-layout-quality.ts`
- Modify: `src/lib/magic-layers/ad-layout-quality.test.ts`

**Interfaces:**
- Consumes: `AdLayoutCompositionAdvice` from Task 2.
- Produces: `templateForAdvice(direction, purpose, ratio, preferredTextSafeArea?)`; `compositionAdvice?: AdLayoutCompositionAdvice` on DesignSpec input/output.

- [ ] **Step 1: Write failing template/spec tests**

```ts
test("uses a same-direction template matching trusted text-safe advice", () => {
  assert.equal(templateForAdvice("editorial", "product", "4:5", "left-top").id, "editorial-product-bottom");
});
test("falls back to current template when no compatible advice exists", () => {
  assert.deepEqual(templateForAdvice("product-focus", "product", "4:5", "bottom"), templateFor("product-focus", "product", "4:5"));
});
test("adds scene grounding only for trusted surface advice", () => {
  const scene = resolveAdLayoutDesignSpecs({ ...input, compositionAdvice: { source: "vision", sceneGrounding: "surface", warnings: [] } })
    .find((spec) => spec.direction === "scene-led");
  assert.equal(scene?.productTreatment?.shadow, "soft-ellipse");
});
```

- [ ] **Step 2: Run the red test**

Run: `node --experimental-strip-types --test src/lib/magic-layers/ad-layout-design-spec.test.ts src/lib/magic-layers/ad-layout-quality.test.ts`

Expected: FAIL because advice-aware template selection does not exist.

- [ ] **Step 3: Implement deterministic template selection**

```ts
export function templateForAdvice(direction: AdLayoutDirection, purpose: AdLayoutPurpose, ratio: string, preferred?: TextSafeZone): AdLayoutTemplate {
  const advised = preferred ? AD_LAYOUT_TEMPLATES.find((item) => item.direction === direction && item.textSafeArea === preferred) : undefined;
  return advised ?? templateFor(direction, purpose, ratio);
}
```

No advice can select direction, direct template ID, zone coordinates, or an effect.

- [ ] **Step 4: Implement DesignSpec propagation**

Use `templateForAdvice` inside `resolveAdLayoutDesignSpecs`. Keep P1 ellipse shadows for product-focus/editorial. Scene-led uses `soft-ellipse` only when `compositionAdvice.sceneGrounding === "surface"`; otherwise it remains `none`. Seed quality warnings from `compositionAdvice.warnings` then run unchanged P1 repair/quality checks. Add a test that those warnings survive repair while hero/support/decoration checks remain active.

- [ ] **Step 5: Verify and commit Task 3**

Run: `node --experimental-strip-types --test src/lib/magic-layers/ad-layout-design-spec.test.ts src/lib/magic-layers/ad-layout-quality.test.ts src/lib/magic-layers/ad-layout-renderer.test.ts src/lib/magic-layers/compose-layers.test.ts`

Expected: PASS, including every P1 behavior when advice is omitted.

```bash
git add src/lib/magic-layers/ad-layout-templates.ts src/lib/magic-layers/ad-layout-design-spec.ts src/lib/magic-layers/ad-layout-design-spec.test.ts src/lib/magic-layers/ad-layout-quality.ts src/lib/magic-layers/ad-layout-quality.test.ts
git commit -m "feat(ad-layout): constrain vision composition advice"
```

### Task 4: Run vision safety before background preparation and expose only safe provenance

**Files:**
- Modify: `src/app/api/magic-layers/ad-layout/route.ts`
- Modify: `src/lib/magic-layers/ad-layout-recipes.ts`
- Modify: `src/lib/magic-layers/ad-layout-options.ts`
- Modify: `src/lib/magic-layers/ad-layout-options.test.ts`
- Modify: `src/lib/magic-layers/compose-layers.test.ts`

**Interfaces:**
- Consumes: Task 1 assessor, Task 2 policy, Task 3 advice input.
- Produces: `assessment?: { source: "vision" | "fallback"; warnings: string[] }` on `AdLayoutOption`.

- [ ] **Step 1: Write failing candidate boundary tests**

```ts
test("keeps three deterministic candidates when advice is fallback", async () => {
  const candidates = await buildAdLayoutCandidates({ ...input, compositionAdvice: { source: "fallback", sceneGrounding: "floating", warnings: ["fallback"] } });
  assert.equal(candidates.length, 3);
  assert.ok(candidates.every((candidate) => candidate.layers.some((layer) => layer.id === "product_1")));
});
test("exposes only source and warnings, never raw provider output", () => {
  assert.deepEqual(option.assessment, { source: "fallback", warnings: ["fallback"] });
});
```

- [ ] **Step 2: Run the red tests**

Run: `node --experimental-strip-types --test src/lib/magic-layers/ad-layout-options.test.ts src/lib/magic-layers/compose-layers.test.ts`

Expected: FAIL because advice and assessment are not in candidate contracts.

- [ ] **Step 3: Implement route ordering and safe propagation**

Immediately after P1 context creation and hero check:

```ts
const assessment = await assessAdLayoutVisualKit(context);
const assessed = applyAdLayoutVisionPolicy(context, assessment);
const safeContext = assessed.context;
const rawBg = safeContext.inventory.byRole.background?.imageUrl;
```

Use `safeContext` for URLs, brief, recipe, asset plan, gap plan, and art direction. If `rawBg` was removed, use the existing neutral Sharp background path and do not load the rejected file. Pass `assessed.advice` to `buildAdLayoutCandidates`. Recipe/options copy only `{ source, warnings }`; never expose model output, data URIs, buffers, or private product details.

- [ ] **Step 4: Verify and commit Task 4**

Run: `node --experimental-strip-types --test src/lib/magic-layers/ad-layout-vision.test.ts src/lib/magic-layers/ad-layout-vision-policy.test.ts src/lib/magic-layers/ad-layout-options.test.ts src/lib/magic-layers/compose-layers.test.ts`

Expected: PASS; fallback still produces three editable candidates and option metadata is safe.

```bash
git add src/app/api/magic-layers/ad-layout/route.ts src/lib/magic-layers/ad-layout-recipes.ts src/lib/magic-layers/ad-layout-options.ts src/lib/magic-layers/ad-layout-options.test.ts src/lib/magic-layers/compose-layers.test.ts
git commit -m "feat(ad-layout): apply vision safety before composition"
```

### Task 5: Record the contract and run final verification

**Files:**
- Modify: `docs/AI-LAYOUT-HANDOFF.md`

**Interfaces:**
- Consumes: Task 1–4 contracts.
- Produces: current operating guidance for safe vision fallback and future extension boundaries.

- [ ] **Step 1: Update the handoff**

Record the one bounded assessment before background/brief construction; unsafe legacy assets are omitted; identity assets are retained; failure keeps P1 deterministic behavior. State the non-goals: no persistence/cache, past-post input, image generation, blur/gradient/icon primitives, or arbitrary AI placement.

- [ ] **Step 2: Run all relevant tests**

Run: `node --experimental-strip-types --test src/lib/magic-layers/*.test.ts src/lib/magic-layers/tests/*.test.ts`

Expected: PASS.

- [ ] **Step 3: Run scoped lint and TypeScript**

Run:

```bash
npx eslint src/lib/magic-layers/ad-layout-vision.ts src/lib/magic-layers/ad-layout-vision.test.ts src/lib/magic-layers/ad-layout-vision-policy.ts src/lib/magic-layers/ad-layout-vision-policy.test.ts src/lib/magic-layers/ad-layout-templates.ts src/lib/magic-layers/ad-layout-design-spec.ts src/lib/magic-layers/ad-layout-design-spec.test.ts src/lib/magic-layers/ad-layout-quality.ts src/lib/magic-layers/ad-layout-quality.test.ts src/lib/magic-layers/ad-layout-recipes.ts src/lib/magic-layers/ad-layout-options.ts src/lib/magic-layers/ad-layout-options.test.ts src/app/api/magic-layers/ad-layout/route.ts
npx prisma generate && npx tsc --noEmit --pretty false
```

Expected: both commands exit 0. Do not fix unrelated whole-repo lint findings.

- [ ] **Step 4: Run production build and inspect tree**

Run:

```bash
npm run build
git diff --check
git status --short
```

Expected: build exits 0, no whitespace errors, and no `public/uploads` change.

- [ ] **Step 5: Commit Task 5**

```bash
git add docs/AI-LAYOUT-HANDOFF.md
git commit -m "docs(ad-layout): hand off vision safety pipeline"
```

## Plan Self-Review

- **Spec coverage:** Task 1 covers private bounded input, strict parsing, timeout and fallback. Task 2 covers role safety and identity invariants. Task 3 restricts advice to existing template/grounding choices. Task 4 evaluates before background processing and prevents private/provider data from reaching the browser. Task 5 documents non-goals and verifies the completed feature.
- **Scope:** The plan does not change product generation, schema, historical creative access, image generation, arbitrary layout coordinates, new editor effects, or icons.
- **Type consistency:** `AdLayoutVisionAssessment` flows from Task 1 into Task 2. Task 2 returns `AdLayoutCompositionAdvice`; Task 3 adds it to DesignSpec input/output; Task 4 passes it through recipes/options.
