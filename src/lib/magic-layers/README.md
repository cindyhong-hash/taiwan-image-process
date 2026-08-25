# Magic Layers — semantic segmentation → editable layers

Turns a flat design image into **complete semantic objects** (one movable layer
each), cut along **real contours** (not rectangles). Fixes the fragmentation
problem where a person became head / hair / arm / shirt / leg layers.

## Pipeline

```
Original Image
   → Detector (VLM / OpenRouter): semantic regions + instanceId + bbox + text
   → SemanticObjectGrouper: fragments → complete objects (identity fixed)
   → MaskProvider.segment(bbox) per part   [SAM2 primary → BiRefNet fallback]
   → MaskUnioner: union the SAME object's part masks → one contour
   → TextOwnershipClassifier: embedded / independent / unknown
   → generateLayers: 1 object = 1 layer
   → LayerFragmentationValidator: block if it fragmented
```

## Design rules (enforced)

- Grouper/analysis depend ONLY on the `Detector` and `MaskProvider` interfaces —
  never on SAM2/BiRefNet directly, so the model can be swapped.
- **VLM decides semantics** (what it is, how many instances, which text belongs
  to what). **SAM2 only answers "where is the exact contour for this bbox".**
- Union masks ONLY after identity is fixed (same `instanceId`). Two people with
  different instanceIds are never merged, even if their masks touch.
- Same-class-only merging → a product held in a hand stays a separate layer.
- No rectangle crops as final layers; masks carry contours / alpha.

## Files

| file | role |
|---|---|
| `types.ts` | shared types (`Mask`, `Region`, `GroupedObject`, `LayerData`, `MaskResult`, `MaskProvider`, `Detector`) |
| `geometry.ts` | bbox/IoU/containment/clearance/union helpers |
| `semantic-grouper.ts` | `groupObjects()` — fragments → complete objects |
| `mask-unioner.ts` | `unionMasks()` — union part masks of one object |
| `text-ownership.ts` | embedded / independent / unknown classifier |
| `generate-layers.ts` | grouped objects + text → unified `LayerData[]` |
| `layer-fragmentation.ts` | `validateFragmentation()` — blocks fragmented output |
| `analysis.ts` | `analyze()` — orchestrates everything (DI: detector + maskProvider) |
| `mask-providers/mock.ts` | `MockSam` / `MockBiRefNet` / `FallbackMaskProvider` (phase 1, no API) |
| `tests/` | zero-dep runner + 15 tests (5 mandated cases + fragmentation + seam) |

## Run tests (no deps, no API)

```bash
node src/lib/magic-layers/tests/run.ts     # Node 23+ (native TS)
```

## Phase 2 — swap in real FAL (do AFTER phase 1 is accepted)

Replace the mock providers with real ones implementing the SAME `MaskProvider`
interface; nothing upstream changes:

- `MockSamMaskProvider` → `SamMaskProvider` — `fal.run("fal-ai/sam2/...", { image_url, box_prompts })`
- `MockBiRefNetMaskProvider` → `BiRefNetMaskProvider` — reuse `src/lib/fal.ts › removeBackground` on the bbox crop
- Detector → `OpenRouterDetector` — `describeImageOpenRouter(image, jsonPrompt)` returning `{objects[], textObjects[]}`

Requires: `npm install`, and `.env.local` with `OPENROUTER_API_KEY` + `FAL_KEY`.
Confirm exact fal model ids on the fal dashboard (ids rotate).
