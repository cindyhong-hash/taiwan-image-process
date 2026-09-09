# AI Layout Design Foundation P1

## Goal

Make the existing AI Layout composition pipeline make explainable, brand-aware design decisions before it renders editable canvas layers. This phase improves reliability and design quality without introducing an LLM, generating new product imagery, persisting new database records, or changing the editor into a second design tool.

## Scope

- Treat the product visual kit as a typed candidate pool, including legacy asset-role aliases.
- Explicitly mark the product hero and client logo as identity-critical; they may be selected or omitted only according to recipe rules and are never regenerated.
- Build a `CreativeBrief`, `DesignRecipe`, `AssetInventory`, deterministic `GapPlan`, and richer `DesignSpec` before rendering.
- Preserve the three user-facing directions: product focus, editorial whitespace, and scene-led.
- Use the existing template system for visual hierarchy; fit a product within its zone without stretching or cropping it.
- Derive modal previews from the actual rendered `LayerData` bounds rather than duplicated CSS positions.
- Validate deterministic quality rules before rendering: one product hero, no unsupported visual pile-up, readable copy treatment, valid product bounds, and no support asset in directions that prohibit it.
- Rename the intake language to “AI 幫我設計” while keeping the selected candidate’s editable layer seed contract unchanged.

## Non-goals

- No LLM/Vision art direction, past-post visual analysis, or paid background generation.
- No database migration or persistence of a DesignSpec.
- No generic editor blur, brightness, gradient-overlay, reflection, or dynamic image-shadow effect.
- No semantic icon library or benefit-icon groups; those need their own editor primitives in P2.
- No changes to product image generation, `src/proxy.ts`, inspiration, or activity creation.

## Architecture

```text
Product + Client + ProductAsset
  -> AdLayoutContext / AssetInventory
  -> CreativeBrief + DesignRecipe
  -> AssetPlan + GapPlan
  -> validated DesignSpec
  -> Canvas Renderer (LayerData[])
  -> preview model derived from the same layers
  -> existing ML_WIZARD_SEED_KEY handoff
```

The route remains the I/O boundary. New helpers are pure TypeScript so they can be exercised with zero-dependency Node tests. The editor receives the same `LayerData[]` contract it already understands.

## Invariants

- Asset keys remain `hero | detail | background | benefit | decoration`; legacy aliases are normalized at the adapter boundary.
- A hero product is always fitted with `contain`, preserves aspect ratio, and never becomes a second visual competing with another hero.
- A scene-led recipe can use at most one support image. Product-focus and editorial recipes use none unless an explicit recipe later allows it.
- Decoration count stays at two or fewer and decorations never substitute for a missing product hero.
- The design decision model never returns free-form x/y coordinates; templates own layout zones.
- `ML_WIZARD_SEED_KEY` remains `{ layers, docW, docH, clientId }`.
- The existing 303 login redirect, product-generation core, and `public/uploads` stay untouched.

## Acceptance criteria

1. A design decision records a brief, recipe, selected/omitted assets, gap plan, and quality checks.
2. The same product asset is not stretched when a template zone has a different aspect ratio.
3. Modal previews reflect the chosen candidate’s real layer positions and asset selection.
4. Product-focus / editorial remain restrained; scene-led uses no more than one support visual.
5. The route continues to return three editable candidates and requires no migration.
