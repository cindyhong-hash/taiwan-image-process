# Product Image Set Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace generic, category-only product image sets with a quality-first pipeline that analyzes all product references, creates dynamic roles and a shared art direction, preserves product identity, and reports per-item progress and retry state.

**Architecture:** Persist a versioned `ProductVisualProfile` on each product and derive a shared `ImageSetArtDirection` plus five role specifications from it. A single batch orchestrator generates the hero first, then runs the remaining roles with role-aware model routing and independent failure handling; the existing modal becomes an analyze-confirm-generate flow while keeping the current polling contract.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Prisma 7 + libSQL/SQLite, OpenRouter vision/image APIs, fal.ai Seedream/FLUX/Recraft/rembg providers, Node `node:test`, ESLint.

**Spec:** `docs/superpowers/specs/2026-09-03-product-image-set-quality-design.md`

## Global Constraints

- Quality takes precedence over generation latency and provider cost.
- Product facts may come only from uploaded images, product text, and brand data; do not invent features, efficacy, certification, or usage.
- AI visual classification must not overwrite the user-entered `Product.category`.
- Product photography must preserve shape, proportions, colors, controls, visible logos, and label text.
- Brand colors are optional accents and must not replace the product's own palette.
- One failed role must not fail or delete the rest of the batch.
- Keep changes inside the product image-set subsystem; do not alter monthly planner, general library generation, or ad creation behavior.
- Follow `DESIGN.md`: white surfaces, neutral borders, violet actions, compact Traditional Chinese copy.
- No new runtime dependency is required.

## File Map

- `prisma/schema.prisma`: persisted profile cache fields.
- `prisma/migrations/20260903_add_product_visual_profile/migration.sql`: additive profile migration.
- `src/lib/products/product-visual-profile.ts`: profile types, validation, fallback, and source hashing.
- `src/lib/products/product-visual-analysis.ts`: multi-image vision analysis and shared art direction generation.
- `src/lib/products/image-set-roles.ts`: archetype-specific five-role planner.
- `src/lib/products/image-set-prompts.ts`: identity-lock and role prompt compiler.
- `src/lib/products/image-set-model-router.ts`: quality-first provider selection and fallback.
- `src/lib/products/image-set-orchestrator.ts`: hero-first batch lifecycle and isolated role failures.
- `src/lib/imageSet.ts`: compatibility exports and one-item regeneration entry point.
- `src/lib/generate.ts`: generic multi-reference GPT Image request used by the router.
- `src/app/api/products/[productId]/image-set/analyze/route.ts`: cached/forced analysis endpoint.
- `src/app/api/products/[productId]/image-set/route.ts`: read-only suggestions and batch creation.
- `src/app/api/library/images/[id]/regenerate/route.ts`: one-role retry endpoint.
- `src/components/products/ImageSetModal.tsx`: analyze-confirm-generate UI and progress.
- `src/lib/products/image-set-ui.ts`: pure UI phase/progress helpers.

---

### Task 1: Persist and validate ProductVisualProfile

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260903_add_product_visual_profile/migration.sql`
- Create: `src/lib/products/product-visual-profile.ts`
- Test: `src/lib/products/product-visual-profile.test.ts`

**Interfaces:**
- Produces: `ProductVisualProfile`, `ProductArchetype`, `parseProductVisualProfile(raw)`, `fallbackProductVisualProfile(input)`, and `computeProductVisualSourceHash(input)`.
- Consumes: Node `crypto`; no model or database access.

- [ ] **Step 1: Write failing profile and hash tests**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { computeProductVisualSourceHash, parseProductVisualProfile } from "./product-visual-profile.ts";

test("accepts a complete version 1 beauty-device profile", () => {
  const profile = parseProductVisualProfile({
    version: 1,
    productType: "女性電動除毛刀",
    productArchetype: "beauty_device",
    confidence: 0.96,
    appearance: { shape: "纖長筆型", materials: ["霧面塑膠", "金屬刀網"], colors: ["白", "冰藍", "銀"], distinctiveDetails: ["圓形刀頭", "冰藍按鍵"], visibleTextOrLogos: ["Schick"] },
    useCases: ["腿部日常修整"], suitableScenes: ["明亮浴室"], visualMotifs: ["銀藍曲線"], prohibitedChanges: ["不得改變刀頭結構"], sourceImageCount: 3,
  });
  assert.equal(profile?.productArchetype, "beauty_device");
});

test("rejects an unknown archetype", () => {
  assert.equal(parseProductVisualProfile({ version: 1, productArchetype: "medical_device" }), null);
});

test("source hash changes when product images or description change", () => {
  const base = { name: "美體除毛刀", description: "纖巧筆型", category: "居家生活", rawImageUrls: ["a.jpg"], heroImageUrl: "hero.png" };
  assert.notEqual(computeProductVisualSourceHash(base), computeProductVisualSourceHash({ ...base, rawImageUrls: ["a.jpg", "b.jpg"] }));
  assert.notEqual(computeProductVisualSourceHash(base), computeProductVisualSourceHash({ ...base, description: "圓形刀頭" }));
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test src/lib/products/product-visual-profile.test.ts`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `product-visual-profile.ts`.

- [ ] **Step 3: Implement the profile boundary**

Create a strict parser that checks `version === 1`, one of the eight documented archetypes, all nested arrays as strings, finite confidence clamped to `0..1`, and non-negative `sourceImageCount`. Implement a deterministic SHA-256 hash over a JSON tuple with trimmed name, description, category, sorted raw URLs, and hero URL. Implement a conservative fallback profile whose facts come only from the input fields and whose archetype mapping includes `美容個護` and `美容儀器` as `beauty_device`.

Add these Prisma fields:

```prisma
visualProfileJson       String    @default("{}")
visualProfileSourceHash String?
visualProfileUpdatedAt  DateTime?
```

Migration SQL:

```sql
ALTER TABLE "Product" ADD COLUMN "visualProfileJson" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "Product" ADD COLUMN "visualProfileSourceHash" TEXT;
ALTER TABLE "Product" ADD COLUMN "visualProfileUpdatedAt" DATETIME;
```

- [ ] **Step 4: Generate Prisma client and verify GREEN**

Run: `npx prisma generate && node --test src/lib/products/product-visual-profile.test.ts`

Expected: all profile tests PASS.

- [ ] **Step 5: Commit the profile boundary**

```bash
git add prisma/schema.prisma prisma/migrations/20260903_add_product_visual_profile/migration.sql src/lib/products/product-visual-profile.ts src/lib/products/product-visual-profile.test.ts
git commit -m "feat(product): persist visual profile cache"
```

---

### Task 2: Analyze all product references and create shared Art Direction

**Files:**
- Create: `src/lib/products/product-visual-analysis.ts`
- Test: `src/lib/products/product-visual-analysis.test.ts`

**Interfaces:**
- Consumes: `ProductVisualProfile`, `parseProductVisualProfile`, `fallbackProductVisualProfile`, product and client facts, and an injected `completeVision(request)` function.
- Produces: `ImageSetArtDirection`, `analyzeProductVisualProfile(input, deps)`, `buildImageSetArtDirection(profile, brand)`, and `parseVisionJson(text)`.

- [ ] **Step 1: Write failing multi-image analysis tests**

```ts
test("sends every raw image and the hero image to vision analysis", async () => {
  const seen: string[] = [];
  const result = await analyzeProductVisualProfile(productWithThreeReferences, {
    loadAsDataUrl: async (url) => `data:image/png;base64,${url}`,
    completeVision: async ({ imageDataUrls }) => {
      seen.push(...imageDataUrls);
      return validBeautyDeviceProfileJson;
    },
  });
  assert.equal(seen.length, 3);
  assert.equal(result.productArchetype, "beauty_device");
});

test("falls back without inventing facts when model JSON is invalid", async () => {
  const result = await analyzeProductVisualProfile(productWithThreeReferences, {
    loadAsDataUrl: async (url) => url,
    completeVision: async () => "not json",
  });
  assert.equal(result.confidence, 0);
  assert.equal(result.appearance.distinctiveDetails.length, 0);
});

test("uses product colors as dominant and brand color as accent", () => {
  const art = buildImageSetArtDirection(beautyDeviceProfile, { primaryColor: "#ffeb85", toneLabels: ["清新"] });
  assert.deepEqual(art.palette.dominant, ["白", "冰藍", "銀"]);
  assert.deepEqual(art.palette.accent, ["#ffeb85"]);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test src/lib/products/product-visual-analysis.test.ts`

Expected: FAIL because the analysis module does not exist.

- [ ] **Step 3: Implement multi-image analysis**

Use the same OpenRouter request pattern as `src/app/api/ai/analyze-image/route.ts`, but send all deduplicated image data URLs in one user message and request the exact `ProductVisualProfile` JSON contract. The system prompt must state:

```text
Only report visible image facts and supplied product text. Do not infer efficacy, certification, ingredients, safety, target demographics, or usage that is not shown or stated. Treat every image as another view of the same product. Return JSON only.
```

Cap input references at five, resize each longest edge to 1600 px before base64 encoding, and fall back to `fallbackProductVisualProfile` on provider error or invalid JSON. Build Art Direction deterministically from the parsed profile plus brand accents so it remains consistent across retries.

- [ ] **Step 4: Verify analysis tests GREEN**

Run: `node --test src/lib/products/product-visual-analysis.test.ts`

Expected: all analysis tests PASS without network calls.

- [ ] **Step 5: Commit analysis**

```bash
git add src/lib/products/product-visual-analysis.ts src/lib/products/product-visual-analysis.test.ts
git commit -m "feat(product): analyze visual identity from all references"
```

---

### Task 3: Plan dynamic roles and compile grounded prompts

**Files:**
- Create: `src/lib/products/image-set-roles.ts`
- Create: `src/lib/products/image-set-prompts.ts`
- Test: `src/lib/products/image-set-roles.test.ts`
- Test: `src/lib/products/image-set-prompts.test.ts`
- Modify: `src/lib/imageSet.ts`

**Interfaces:**
- Consumes: `ProductVisualProfile` and `ImageSetArtDirection` from Tasks 1–2.
- Produces: `ImageSetRole = "hero" | "detail" | "lifestyle" | "background" | "decoration"`, `ImageSetRoleSpec`, `planImageSetRoles(profile)`, and `compileImageSetPrompt({ product, profile, artDirection, role })`.

- [ ] **Step 1: Write failing role tests**

```ts
test("beauty devices receive detail and usage roles instead of texture and ingredient", () => {
  const roles = planImageSetRoles(beautyDeviceProfile);
  assert.deepEqual(roles.map((role) => role.role), ["hero", "detail", "lifestyle", "background", "decoration"]);
  assert.match(roles[1].label, /刀頭|功能細節/);
  assert.match(roles[2].sceneCn, /護理|使用情境/);
});

test("unknown products still receive five safe generic roles", () => {
  const roles = planImageSetRoles(unknownProfile);
  assert.equal(roles.length, 5);
  assert.equal(roles[3].role, "background");
});
```

- [ ] **Step 2: Write failing prompt-contract tests**

```ts
test("product roles contain identity locks", () => {
  const prompt = compileImageSetPrompt({ product, profile: beautyDeviceProfile, artDirection, role: heroRole });
  for (const detail of beautyDeviceProfile.appearance.distinctiveDetails) assert.match(prompt, new RegExp(detail));
  assert.match(prompt, /不得改變|100% unchanged/);
});

test("background forbids the product and reserves layout space", () => {
  const prompt = compileImageSetPrompt({ product, profile: beautyDeviceProfile, artDirection, role: backgroundRole });
  assert.match(prompt, /不出現任何產品/);
  assert.match(prompt, /留白/);
});

test("brand yellow remains an accent rather than the dominant palette", () => {
  const prompt = compileImageSetPrompt({ product, profile: beautyDeviceProfile, artDirection, role: heroRole });
  assert.match(prompt, /dominant.*白.*冰藍.*銀/i);
  assert.match(prompt, /accent.*#ffeb85/i);
});
```

- [ ] **Step 3: Run role and prompt tests and verify RED**

Run: `node --test src/lib/products/image-set-roles.test.ts src/lib/products/image-set-prompts.test.ts`

Expected: FAIL because both modules are missing.

- [ ] **Step 4: Implement archetype role maps and prompt sections**

Create explicit role maps for `beauty_device`, `skincare`, `cosmetics`, `food_beverage`, `fashion`, `electronics`, `home`, and `other`. Stable database role values remain the five `ImageSetRole` values; labels and scene descriptions vary by archetype.

Compile prompts in this fixed order:

```text
[ROLE OBJECTIVE]
[PRODUCT FACTS]
[MUST PRESERVE]
[SHARED ART DIRECTION]
[COMPOSITION AND CAMERA]
[MUST NOT SHOW]
```

Update `src/lib/imageSet.ts` to re-export the new types and have `buildImageSetSuggestions` delegate to `planImageSetRoles`. Remove the old category hint table only after new tests pass.

- [ ] **Step 5: Verify role and prompt tests GREEN**

Run: `node --test src/lib/products/image-set-roles.test.ts src/lib/products/image-set-prompts.test.ts`

Expected: all role and prompt tests PASS.

- [ ] **Step 6: Commit role planning**

```bash
git add src/lib/products/image-set-roles.ts src/lib/products/image-set-prompts.ts src/lib/products/image-set-roles.test.ts src/lib/products/image-set-prompts.test.ts src/lib/imageSet.ts
git commit -m "feat(product): plan grounded image set roles"
```

---

### Task 4: Add reference-aware quality model routing

**Files:**
- Modify: `src/lib/generate.ts`
- Create: `src/lib/products/image-set-model-router.ts`
- Test: `src/lib/products/image-set-model-router.test.ts`

**Interfaces:**
- Consumes: compiled prompt, role spec, `heroImageUrl`, `rawImageUrls`, and optional batch hero URL.
- Produces: `generateImageSetRole(input, providers) -> Promise<{ buffer; contentType; provider }>` and `gptImageGenerateWithReferences(input)`.

- [ ] **Step 1: Write failing routing tests**

```ts
test("hero tries GPT then Seedream then FLUX", async () => {
  const attempts: string[] = [];
  const output = await generateImageSetRole(heroInput, fakeProviders({
    gpt: async () => { attempts.push("gpt"); throw new Error("timeout"); },
    seedream: async () => { attempts.push("seedream"); throw new Error("provider error"); },
    fluxEdit: async () => { attempts.push("flux"); return image("flux"); },
  }));
  assert.deepEqual(attempts, ["gpt", "seedream", "flux"]);
  assert.equal(output.provider, "flux");
});

test("a product-free background never calls a product compositor", async () => {
  const attempts: string[] = [];
  await generateImageSetRole(backgroundInput, fakeProviders({
    textImage: async () => { attempts.push("text"); return image("text"); },
  }));
  assert.deepEqual(attempts, ["text"]);
});

test("decoration removal failure is surfaced instead of saving an opaque asset", async () => {
  await assert.rejects(() => generateImageSetRole(decorationInput, fakeProviders({ removeBgError: true })), /去背/);
});
```

- [ ] **Step 2: Run the routing tests and verify RED**

Run: `node --test src/lib/products/image-set-model-router.test.ts`

Expected: FAIL because the router does not exist.

- [ ] **Step 3: Implement generic GPT multi-reference generation**

Add `gptImageGenerateWithReferences({ prompt, imageDataUris, aspectRatio })` beside `gptImageComposite`. It must send one text instruction followed by all image references to `OPENROUTER_IMAGE_MODEL`, accept data URI or URL responses, enforce a 90-second timeout, and never expose the API key or full provider body in thrown errors.

- [ ] **Step 4: Implement injected fallback routing**

For `hero`, `detail`, and `lifestyle`, call GPT, Seedream, then FLUX with at most five deduplicated references. For `background`, call high-quality text generation without a product image. For `decoration`, call text generation followed by `falRemoveBg`; throw a role-scoped error if removal fails. Return the selected provider name for traceability in `paramsJson`.

- [ ] **Step 5: Verify routing tests GREEN**

Run: `node --test src/lib/products/image-set-model-router.test.ts`

Expected: all routing tests PASS without paid provider calls.

- [ ] **Step 6: Commit model routing**

```bash
git add src/lib/generate.ts src/lib/products/image-set-model-router.ts src/lib/products/image-set-model-router.test.ts
git commit -m "feat(product): route image sets through quality providers"
```

---

### Task 5: Orchestrate a hero-first resilient batch

**Files:**
- Create: `src/lib/products/image-set-orchestrator.ts`
- Test: `src/lib/products/image-set-orchestrator.test.ts`
- Modify: `src/app/api/products/[productId]/image-set/route.ts`
- Create: `src/app/api/products/[productId]/image-set/analyze/route.ts`
- Create: `src/app/api/library/images/[id]/regenerate/route.ts`
- Modify: `src/lib/imageSet.ts`

**Interfaces:**
- Consumes: cached profile, Art Direction, role specs, `generateImageSetRole`, Prisma rows, storage helpers.
- Produces: `runImageSetBatch(input, deps)`, analyze GET/POST contracts, and `regenerateImageSetItem(rowId)`.

- [ ] **Step 1: Write failing orchestration tests**

```ts
test("starts hero before dependent roles", async () => {
  const events: string[] = [];
  await runImageSetBatch(batchInput, fakeDeps({ events }));
  assert.ok(events.indexOf("hero:start") < events.indexOf("detail:start"));
  assert.ok(events.indexOf("hero:done") < events.indexOf("lifestyle:start"));
});

test("continues the remaining roles when hero fails", async () => {
  const result = await runImageSetBatch(batchInput, fakeDeps({ failRole: "hero" }));
  assert.equal(result.hero, "FAILED");
  assert.equal(result.background, "DONE");
  assert.equal(result.decoration, "DONE");
});

test("persists provider and shared art direction for retry", async () => {
  const writes = await runImageSetBatch(batchInput, fakeDeps());
  assert.equal(writes.params.hero.profileVersion, 1);
  assert.equal(writes.params.hero.artDirection.concept, artDirection.concept);
  assert.ok(writes.params.hero.provider);
});
```

- [ ] **Step 2: Run orchestration tests and verify RED**

Run: `node --test src/lib/products/image-set-orchestrator.test.ts`

Expected: FAIL because the orchestrator does not exist.

- [ ] **Step 3: Implement the analyze endpoint**

`POST analyze` computes the source hash, returns the valid cached profile unless `{ force: true }`, otherwise runs multi-image analysis and stores the profile fields. It returns:

```ts
{ profile, artDirection, suggestions, cached: boolean, sourceHash: string }
```

`GET image-set` returns cached profile data, `needsAnalysis`, `hasHero`, and suggestions; it performs no model calls or writes.

- [ ] **Step 4: Implement one batch callback and role lifecycle**

The POST route creates all selected rows as `PENDING` with one `batchId`, returns their IDs immediately, and registers exactly one `after(() => runImageSetBatch(...))`. The orchestrator marks hero `GENERATING`, saves it, then passes the saved hero URL as the optional batch style anchor when starting detail and lifestyle. Each role catches and persists its own error and never rejects the whole batch.

Store this shape in every row's `paramsJson`:

```ts
{ imageSet: true, profileVersion: 1, sourceHash, artDirection, roleSpec, provider?: string }
```

- [ ] **Step 5: Implement one-role retry**

The regenerate endpoint validates `paramsJson.imageSet`, reloads the product, rejects stale profile data with HTTP 409 and a Traditional Chinese action message, sets only that row to `GENERATING`, and invokes `regenerateImageSetItem`. Successful retry updates image URL and provider; failure keeps the row and records `errorMessage`.

- [ ] **Step 6: Verify orchestration tests GREEN**

Run: `node --test src/lib/products/image-set-orchestrator.test.ts`

Expected: all orchestration tests PASS.

- [ ] **Step 7: Commit batch orchestration**

```bash
git add src/lib/products/image-set-orchestrator.ts src/lib/products/image-set-orchestrator.test.ts src/app/api/products/[productId]/image-set/route.ts src/app/api/products/[productId]/image-set/analyze/route.ts src/app/api/library/images/[id]/regenerate/route.ts src/lib/imageSet.ts
git commit -m "feat(product): orchestrate resilient image set batches"
```

---

### Task 6: Build analyze-confirm-generate UI with progress and retry

**Files:**
- Create: `src/lib/products/image-set-ui.ts`
- Test: `src/lib/products/image-set-ui.test.ts`
- Modify: `src/components/products/ImageSetModal.tsx`

**Interfaces:**
- Consumes: analyze response, existing LibraryImage polling result, role status, and regenerate endpoint.
- Produces: `imageSetProgressLabel(state)`, modal phases `analyzing | pick | generating | done`, per-role retry actions, and `completed/total` UI.

- [ ] **Step 1: Write failing UI-state tests**

```ts
test("reports analysis and batch progress in Traditional Chinese", () => {
  assert.equal(imageSetProgressLabel({ phase: "analyzing", sourceImageCount: 3 }), "正在讀取 3 張商品照，整理產品外觀與套圖方向…");
  assert.equal(imageSetProgressLabel({ phase: "generating", completed: 2, total: 5, activeRoleLabel: "使用情境" }), "正在建立使用情境 · 完成 2/5");
});

test("finishes when every role is done or failed", () => {
  assert.equal(isImageSetBatchSettled([{ status: "DONE" }, { status: "FAILED" }]), true);
  assert.equal(isImageSetBatchSettled([{ status: "DONE" }, { status: "GENERATING" }]), false);
});
```

- [ ] **Step 2: Run UI-state tests and verify RED**

Run: `node --test src/lib/products/image-set-ui.test.ts`

Expected: FAIL because `image-set-ui.ts` does not exist.

- [ ] **Step 3: Implement pure UI helpers**

Implement exact labels from the tests and count both `DONE` and `FAILED` as settled. Keep role progress calculation independent of React so polling edge cases are testable.

- [ ] **Step 4: Refactor ImageSetModal phases**

On open, call GET. If `needsAnalysis`, enter `analyzing` and POST analyze; otherwise render cached suggestions. The confirmation state displays:

- AI product type and confidence only when confidence is above zero.
- Dominant product colors and optional brand accent separately.
- Up to three `prohibitedChanges` as 「商品識別鎖定」.
- Five selectable role cards with full, wrapping scene text instead of truncation.
- 「重新分析產品」 secondary action.

During generation, show the pure progress label, per-role status, image thumbnail, and a 「重新產生」 action on failed rows. Disable closing only while the initial POST is creating rows; after row IDs exist, closing is safe because generation continues in the background.

- [ ] **Step 5: Verify UI-state tests GREEN and lint the component**

Run: `node --test src/lib/products/image-set-ui.test.ts && npx eslint src/components/products/ImageSetModal.tsx src/lib/products/image-set-ui.ts src/lib/products/image-set-ui.test.ts`

Expected: tests PASS and ESLint reports zero errors.

- [ ] **Step 6: Commit the modal flow**

```bash
git add src/components/products/ImageSetModal.tsx src/lib/products/image-set-ui.ts src/lib/products/image-set-ui.test.ts
git commit -m "feat(product): show image set analysis and progress"
```

---

### Task 7: Integrate, migrate, and verify the quality-first slice

**Files:**
- Modify only files already listed if verification exposes an issue.

**Interfaces:**
- Consumes: all Tasks 1–6.
- Produces: a migration-ready, buildable quality-first product image-set flow.

- [ ] **Step 1: Apply the local migration**

Run: `npx prisma migrate deploy`

Expected: database applies the additive migration and Prisma Client regenerates without data loss.

- [ ] **Step 2: Run every focused unit test**

Run:

```bash
node --test \
  src/lib/products/product-visual-profile.test.ts \
  src/lib/products/product-visual-analysis.test.ts \
  src/lib/products/image-set-roles.test.ts \
  src/lib/products/image-set-prompts.test.ts \
  src/lib/products/image-set-model-router.test.ts \
  src/lib/products/image-set-orchestrator.test.ts \
  src/lib/products/image-set-ui.test.ts
```

Expected: all focused tests PASS with zero failures.

- [ ] **Step 3: Run project verification**

Run: `npm run lint && npm run build && git diff --check`

Expected: ESLint has zero errors, Next.js production build exits 0, and `git diff --check` prints nothing.

- [ ] **Step 4: Verify the existing beauty-device product without automatically spending credits**

Open product `cmtlah8gu0005a6vzkkema0qe`, click 「AI 建立商品套圖」, and verify the analysis summary says a beauty/personal-care device rather than home living. Verify the five proposed cards describe complete hero, blade/button detail, leg-care context, bathroom/vanity empty scene, and silver-blue decoration. Stop before paid generation unless the user explicitly approves a live batch.

- [ ] **Step 5: If approved, run one live five-image acceptance batch**

Verify all of the following visually:

- No generic living room image.
- Hero and detail preserve the circular blade, ice-blue control, white body, proportions, and visible logo as closely as the selected provider supports.
- Lifestyle is relevant to body grooming and makes no medical or unprovided efficacy claim.
- Background contains no product and leaves useful copy/product space.
- Decoration is transparent and echoes the white/ice-blue/silver visual language.
- The five assets read as one visual family.
- A failed item, if any, offers an isolated retry and does not remove completed images.

- [ ] **Step 6: Commit integration fixes only if Step 3 or Step 5 required changes**

```bash
git add prisma/schema.prisma prisma/migrations/20260903_add_product_visual_profile/migration.sql src/lib/products src/lib/imageSet.ts src/lib/generate.ts src/app/api/products/[productId]/image-set src/app/api/library/images/[id]/regenerate src/components/products/ImageSetModal.tsx
git commit -m "fix(product): address image set integration findings"
```

- [ ] **Step 7: Record handoff state**

Run: `git status --short --branch && git log --oneline -10`

Expected: the report identifies the current branch, every feature commit, any intentionally untracked backup files, and whether the branch is ahead of its remote. Do not push unless the user separately requests it.
