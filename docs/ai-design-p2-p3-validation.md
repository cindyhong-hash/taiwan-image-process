# AI Design P2 / P3 validation

Branch: `codex/ai-layout-design-polish-p3`.

## Completed checks

- `node --test --experimental-strip-types src/lib/magic-layers/*.test.ts src/app/api/paid-image-set-routes.test.ts` — 89 passed; includes every Magic Layers test, including composition candidates, conservative asset filtering, deterministic transport, and provider fallback diagnostics.
- `node --test --experimental-strip-types src/lib/**/*.test.ts src/app/api/*.test.ts` — 236 of 237 passed. The only failure is the pre-existing planner `content-brief` fixture expecting no `subtitleText` while production returns `subtitleText: null`; it is outside this change.
- Focused ESLint for the P3 route, modal, provider, policy, orchestration, references and transport — passed.
- `npx tsc --noEmit` — passed.
- `npm run build` — passed; 44 static pages generated.

## Runtime behaviour

- The P3 provider is opt-in with `AD_LAYOUT_ART_DIRECTION_ENABLED=true`; disabled, missing-key, timeout and invalid-output paths retain the deterministic P2 three-candidate result.
- Candidate selection shows whether a trusted P3 decision was actually used. If no decision is accepted, the response reports a safe `disabled`, `unavailable`, `timeout`, `invalid`, or `low-confidence` reason without exposing provider output.
- The provider receives resized existing visual-kit assets and bounded product/brand/brief data. It may only return allowed design enum values; its output cannot supply coordinates, image URLs, copy, colours or new assets.
- The vision prompt uses one legal value in its JSON example and lists enum options separately. Rejected provider output writes a field-level parser reason to server logs without logging the raw response.
- A clean environmental `background` remains valid even when vision identifies it as a complete scene. The policy only removes an asset when a role-specific visible conflict is explicit and confidence is at least `0.95`; conflicts between `0.7` and `0.95` retain the asset with a warning, and `safeForDeclaredRole: false` alone is advisory.
- Both OpenRouter completion paths use `temperature: 0`. The assessment prompt also isolates each role image from the hero reference so visible content is not attributed across images.
- Optional historical-post references remain unavailable in the modal. Adding an endpoint to expose those private URLs was rejected because the application has no verified session boundary. The API still rejects any reference URL not owned by the product's brand.
- No post-fix live OpenRouter smoke test was run in this checkout: the flag is not configured locally, so no product or brand image was transmitted during validation. Release validation should repeat the same product at least three times and confirm `layer_bg` remains present, no false background generation gap appears, and the art-direction reason explains any fallback.
- P4 only offers a user-triggered image-set job for a missing non-identity scene background, detail or benefit visual. The isolated checkout has no initialized SQLite product data, so browser verification could not enter a real product flow; no image-generation request was made during validation.
