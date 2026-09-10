# AI Design P2 / P3 validation

Branch: `codex/ai-layout-design-polish-p3`.

## Completed checks

- `node --test --experimental-strip-types src/lib/magic-layers/ad-layout*.test.ts src/lib/magic-layers/editable-*.test.ts src/lib/magic-layers/saved-layer.test.ts src/app/api/paid-image-set-routes.test.ts` — 76 passed.
- Focused ESLint for the P3 route, modal, provider, policy, orchestration, references and transport — passed.
- `npx tsc --noEmit` — passed.
- `npm run build` — passed; 44 static pages generated.

## Runtime behaviour

- The P3 provider is opt-in with `AD_LAYOUT_ART_DIRECTION_ENABLED=true`; disabled, missing-key, timeout and invalid-output paths retain the deterministic P2 three-candidate result.
- Candidate selection shows whether a trusted P3 decision was actually used. If no decision is accepted, the UI reports the deterministic fallback without exposing provider details.
- The provider receives resized existing visual-kit assets and bounded product/brand/brief data. It may only return allowed design enum values; its output cannot supply coordinates, image URLs, copy, colours or new assets.
- Optional historical-post references remain unavailable in the modal. Adding an endpoint to expose those private URLs was rejected because the application has no verified session boundary. The API still rejects any reference URL not owned by the product's brand.
- No live OpenRouter smoke test was run in this checkout: the flag is not configured locally, so no product or brand image was transmitted during validation.
- P4 only offers a user-triggered image-set job for a missing non-identity scene background, detail or benefit visual. The isolated checkout has no initialized SQLite product data, so browser verification could not enter a real product flow; no image-generation request was made during validation.
