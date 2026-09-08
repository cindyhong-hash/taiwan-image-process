# AI Layout Composition Design

**Status:** Proposed P0 implementation; P1 is deliberately deferred.

## Goal

Turn a product asset pack into a 70–80% complete, editable social creative. The system must compose a deliberate product advertisement, not position every available asset on a canvas.

The output remains the existing `LayerData[]` seed consumed by `ComposeView` and `MagicLayersEditor`; it is never flattened into one final JPG.

## Boundaries

- Work only in `magic-layers` and `adcreation` plus the existing product-page entry point if copy needs updating.
- Preserve `src/proxy.ts`'s HTTP 303 login redirect.
- Do not alter product asset generation, inspiration, activity creation, or the free-editor architecture.
- Do not restore the removed “開啟空白畫布” product CTA.
- Preserve `AdLayoutModal.generate()`'s `finally { setBusy(false) }` behavior.
- No database schema migration is required: DesignSpec is ephemeral and only its rendered layers enter the existing session seed.

## Existing Contract to Preserve

`POST /api/magic-layers/ad-layout` receives:

```ts
{ clientId, productId, purpose?: "product" | "benefit" | "scene" | "promo", ratio?, title?, subtitle? }
```

The response returns three selectable `AdLayoutOption`s and canvas dimensions. When the user selects one, `AdLayoutModal` writes exactly this existing contract:

```ts
{ layers: LayerData[], docW: number, docH: number, clientId: string }
```

to `ML_WIZARD_SEED_KEY`, then navigates to `?seed=1`.

Product role keys are read-only input candidates:

`hero | detail | background | benefit | decoration`

`hero` is the transparent product asset. Existing/legacy assets can be visually imperfect; composition must not assume an asset is safe merely because it exists.

## P0 Architecture

```text
product + asset candidates + brand context + user purpose/copy
                         ↓
                  DesignSpec resolver
         (template choice, asset budget, safe area, treatments)
                         ↓
                    Quality validation
              (repair or conservative fallback)
                         ↓
                 LayerData renderer (editable)
                         ↓
        three selectable options → existing editor seed
```

### 1. DesignSpec

`src/lib/magic-layers/ad-layout-design-spec.ts` owns a typed, testable intermediate decision. It contains no React or database code.

```ts
type AssetRole = "hero" | "detail" | "background" | "benefit" | "decoration";
type TextSafeTreatment = "none" | "light-panel" | "dark-panel";

interface AdLayoutDesignSpec {
  direction: "product-focus" | "editorial" | "scene-led";
  templateId: string;
  artDirection: string;
  rationale: string[];
  canvas: { width: number; height: number; ratio: string };
  assets: {
    background?: AssetSelection;
    product?: AssetSelection;
    support?: AssetSelection;
    decorations: AssetSelection[];
  };
  textSafeArea: {
    zone: "left-top" | "left-center" | "right-top" | "bottom";
    treatment: TextSafeTreatment;
  };
  typography: {
    headline?: string;
    subtitle?: string;
    headlineColor: string;
    subtitleColor: string;
    accentColor: string;
    headlineWeight: 700 | 800;
    subtitleWeight: 500 | 600;
  };
  productTreatment?: { shadow: "none" | "soft-ellipse" };
  quality: { score: number; warnings: string[] };
}
```

An `AssetSelection` holds a role and image URL. It cannot name a role unavailable in the incoming candidate pool. A spec chooses 2–4 visual assets including the background and never has more than two decorations.

### 2. Asset Budget and Direction Rules

Asset packs are a candidate pool, never a must-use list.

- **Product focus:** background + hero + at most one decoration. `detail` and `benefit` are excluded by default.
- **Editorial:** hero + background (or neutral fallback) + optional one decoration. The typography safe area is the leading visual element.
- **Scene-led:** background + hero + exactly zero or one supporting visual (`detail` *or* `benefit`, never both) + optional one decoration.
- **Benefit purpose:** may choose `benefit` as the one support visual; it still must not compete with the hero.
- **Promo purpose:** uses the same asset budget as product focus and adds a brand-colour text panel; it does not add another bitmap just because the purpose is promotional.

The hero is always the only product-shaped foreground asset. If a selected background or support asset visibly contains a competing product, P0 cannot reliably detect it from role metadata alone; it must use the conservative template that excludes the support asset. P1 can use vision analysis to classify this condition.

### 3. Templates and Safe Areas

`src/lib/magic-layers/ad-layout-templates.ts` defines normalized zones, not arbitrary coordinates. P0 has six templates:

| Direction | Template | Text zone | Hero zone |
| --- | --- | --- | --- |
| product-focus | `copy-left-product-right` | left-top | right / lower-right |
| product-focus | `center-product-bottom-copy` | left-top | center-bottom |
| editorial | `editorial-product-left` | right-center | left / lower-left |
| editorial | `editorial-product-bottom` | left-top | bottom-center |
| scene-led | `scene-copy-overlay` | left-top | lower-right |
| scene-led | `scene-product-corner` | left-center | lower-right |

Each template defines text, hero, support, decoration, logo, and safe-panel zones. The renderer scales zones to the requested canvas. It may resize within the zone, but cannot move text into the hero zone or put a foreground decoration over the safe area.

### 4. Background and Typography Treatments

The background still becomes one editable background image layer. The server may use Sharp for cover crop and modest brightness adjustment. It does not flatten the whole design.

Text readability is evaluated for the selected text zone, not just by image-wide average colour. P0 samples that crop and chooses either dark blue-grey or white. If contrast is weak, the renderer inserts an editable low-opacity rectangular panel behind the text:

- light panel for bright copy over complex/dark content;
- dark panel for light copy over complex/light content;
- no panel when contrast is already safe.

The panel is an existing editable shape layer. Product shadow is likewise an existing low-opacity ellipse shape behind the transparent hero, not a new editor effect.

Typography uses the existing `meta.style` contract. Headline and subtitle receive distinct size, weight, and colour; `accentColor` appears only on a small detail or panel, not as forced body-copy colour.

### 5. Quality Validation

Before rendering, a pure validator rejects or repairs a spec when any of these is true:

- no hero asset despite an available hero;
- more than four visual assets or more than two decorations;
- both `detail` and `benefit` selected;
- a decoration intersects the text safe area;
- a support asset is larger than the hero in product/editorial directions;
- text has insufficient contrast and no safe-panel treatment;
- hero box leaves the canvas or is smaller than the template's minimum hierarchy threshold.

Repair means remove low-priority support/decorations, add the appropriate safe panel, and fall back to the direction's conservative template. It never silently adds a bitmap asset.

### 6. Modal and Progress

The modal keeps its three-direction choice. Its final CTA reads `✨ 產生可編輯設計稿` only when there is a real renderer action after selection; otherwise it must accurately say `使用這個設計稿進入編輯`.

P0 should show actual request lifecycle states only: sending design request, receiving alternatives, and opening the editor. Detailed server stages such as “分析素材” require a streamed endpoint and are therefore P1; P0 must not use timed or fake checklist progress.

## P1: Structured Vision Art Direction

After P0 templates and validator produce consistently clean work, add an optional structured vision decision layer.

- Supply product description, category, visual profile, brand description, tone labels, palette, selected role URLs, and optional past-post references.
- A vision-capable OpenRouter model returns constrained JSON: direction/template id, selected role ids, art direction, text-safe preference, and optional copy.
- The existing deterministic resolver validates all model output and provides the full fallback when the model times out, returns invalid JSON, or selects unavailable assets.
- The LLM never sets raw x/y coordinates and never writes editor layers directly.

This keeps visual intelligence useful without making canvas quality dependent on an unbounded model response.

## Testing and Acceptance Criteria

P0 unit tests must prove:

1. Product focus excludes `detail` and `benefit` when hero/background/decoration are available.
2. Scene-led chooses no more than one support image.
3. A validator removes excessive assets and protects the text safe area.
4. Light and dark text-zone samples choose readable text/panel treatments.
5. Renderer emits only existing `LayerData` types and preserves the existing seed shape.
6. Each direction yields a distinct hierarchy, not a shared asset set with shifted coordinates.

Manual acceptance using the provided shaving-emulsion case:

- Product focus has one foreground blue product, no grey second bottle, no miniature scene thumbnail, and at most two subtle decorative elements.
- Copy remains legible over the bathroom background through a left-side treatment when required.
- All output parts remain individually selectable/editable in Magic Layers.

## Non-goals

- Persisting DesignSpecs.
- New Prisma models or migrations.
- A second canvas/editor.
- Flattened image generation.
- Random coordinate generation.
- Changing product asset generation prompts or roles.
