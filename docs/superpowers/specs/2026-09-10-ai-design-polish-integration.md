# AI Design Polish and Product Integration

Date: 2026-09-10. Status: approved for implementation on `codex/ai-layout-design-polish-p3`.

## Goal

Make the three editable ad-layout candidates look intentionally composed after the newest Product Visual Kit assets are selected. Every improvement must remain an editable layer or bounded layout decision, and no step may trigger image generation automatically.

## Delivery order

1. Guarantee an opaque editable base and correct P4 semantic gaps.
2. Run a deterministic polish pass after the first layout decision.
3. Add bounded product-integration layers around the unchanged hero PNG.
4. Expand benefit graphics and semantic icons.

Each stage is independently testable and committed before the next stage.

## Background and P4 gaps

Every candidate must contain a full-canvas background layer. A retained background asset renders as the existing image layer. When no background asset survives inventory and vision policy, the renderer creates an opaque `#f8f9fc` shape layer named `background_base`; this is editable and costs nothing.

Gap analysis records the base as a `missing-background-base` shape decision. Scene purpose may still expose the paid `missing-background` option because a solid base is not an environmental scene. Product and promo purpose use the base without suggesting paid background generation.

Layout compatibility does not imply semantic completeness. A legacy `lifestyle` asset may satisfy scene support. Benefit purpose is complete only when the retained canonical benefit candidate originated from `sourceRole: "benefit"`; detail, lifestyle and ingredient fallbacks may be used by a layout but do not suppress `missing-benefit`. Because gap analysis receives the post-policy inventory, only an asset actually removed by the `>= 0.95` destructive vision rule can become absent through assessment; retained lower-confidence warnings do not create paid gaps.

## Deterministic design polish

`polishAdLayoutSpec` receives one resolved `AdLayoutDesignSpec` and returns a cloned spec. It may adjust existing geometry, typography emphasis, background wash, and decoration selection. It cannot add image assets, change URLs, change user copy, or replace the hero.

- Grow a genuinely undersized product by at most 8%, centered on its existing bounds, only when the result stays in the canvas and does not intersect headline, subtitle, or support bounds.
- Strengthen a short weak headline with a bounded size increase and weight 800 only when its existing box can contain the new line height.
- Remove a decoration whose planned bounds collide with product or copy.
- Add a low-opacity editable light wash over an image background for product-focus/editorial candidates when a safety panel was needed; scene-led keeps the scene unobscured.
- Record applied decisions in rationale and quality warnings. Do not solve polish problems by adding another bitmap.

## Product integration

The hero image URL and aspect ratio remain unchanged. Integration consists of editable vector shapes calculated from the final product bounds:

- Surface mode: compact contact shadow, directional soft cast shadow, subtle highlight/glow, and a small surface reflection highlight when there is room below the product.
- Floating mode: broad soft grounding ellipse and subtle brand-color halo; no contact shadow or reflection claim.
- Light direction is deterministic from product placement relative to canvas center. All opacities, offsets and softness values are bounded constants.

The renderer must maintain this order: background, wash, support, product integration shapes, hero, decoration, copy, logo. Product integration cannot alter product pixels, Logo, label, color, or proportions.

## Graphic and icon expansion

Benefit semantics live in a data registry rather than an inline ordered regular-expression list. Supported categories include hydration, cushioning, blade, protection, radiance, botanical, sun/day, cleansing, repair and texture/smoothness. Negated claims still return no icon, and unknown claims remain text-only.

When an icon is matched, the renderer creates an editable translucent glass badge behind the icon. Multiple benefit cells receive editable divider lines. A confirmed numeric phrase may expose its number as a separate editable callout without inventing or rewriting the supplied benefit. Every element shares the existing `groupId` and survives preview, save/reopen and export through the current shape/text contracts.

## Non-goals

- No automatic or test image generation.
- No hero regeneration or automatic `Product.heroImageUrl` replacement.
- No arbitrary model coordinates, SVG, shaders, blend modes, or free-form effects.
- No pixel relighting, product recoloring, or physically accurate mirrored product reflection.
- No database migration.

## Acceptance

- A backgroundless product, benefit, scene, or promo fixture always renders an opaque editable base layer.
- Scene and benefit paid gaps follow the semantic rules above; product/promo do not request a paid background.
- Polish tests prove bounded growth, collision refusal, headline emphasis, decoration removal and no new bitmap assets.
- Integration tests prove surface and floating treatments differ, all generated effects are editable shapes, and hero pixels/aspect remain unchanged.
- Icon tests cover every registry category, negation and unknown text; renderer tests cover glass badges, dividers and numeric callouts.
- Magic Layers tests, API contract tests, TypeScript, focused ESLint and production build pass. Existing unrelated planner fixture failure is reported separately.
