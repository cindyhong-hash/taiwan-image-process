/* ============================================================
   Magic Layers — analysis orchestrator (pure, dependency-injected)

     Original Image
        -> Detector (VLM): WHOLE semantic objects + instanceId + bbox + text roles
        -> SemanticObjectGrouper: merge any stray fragments (identity fixed)
        -> MaskProvider.segment(object.bbox) ONCE per object  [SAM2 → BiRefNet]
             => ONE merged alpha cut-out per object (never per body-part)
        -> TextOwnershipClassifier: role-based embedded / independent / unknown
        -> generateLayers: 1 object = 1 layer (layer.image = mask.alphaUrl)
        -> LayerFragmentationValidator + quality metrics

   Depends ONLY on the Detector + MaskProvider interfaces.
   ============================================================ */
import type { Detector, MaskProvider, AnalysisResult, GroupedObject, SegmentationQuality, ClassifiedText } from "./types.ts";
import { groupObjects } from "./semantic-grouper.ts";
import { classifyAllText } from "./text-ownership.ts";
import { generateLayers } from "./generate-layers.ts";
import { validateFragmentation } from "./layer-fragmentation.ts";

export interface AnalyzeDeps {
  detector: Detector;
  maskProvider?: MaskProvider;   // omit -> keep grouper's union-polygon masks (no API)
  onProgress?: (p: { key: string; label: string }) => void;
}

export async function analyze(
  image: { url: string; width: number; height: number; src?: string },
  deps: AnalyzeDeps,
): Promise<AnalysisResult> {
  const emit = deps.onProgress ?? (() => {});
  const size = { width: image.width, height: image.height };

  emit({ key: "detecting", label: "Detecting objects..." });
  const det = await deps.detector.detect(image);

  emit({ key: "grouping", label: "Understanding layer relationships..." });
  let objects = groupObjects(det.regions, size);

  // Step 1: ONE segmentation per WHOLE object (object.bbox), never per part.
  if (deps.maskProvider) {
    emit({ key: "masking", label: "Cutting layers along contours..." });
    objects = await Promise.all(objects.map(o => segmentObject(o, image, deps.maskProvider!)));
  }

  emit({ key: "ocr", label: "Reading text..." });
  const textObjects = classifyAllText(det.textObjects, objects, size);

  emit({ key: "generating", label: "Creating editable layers..." });
  const layers = generateLayers(objects, textObjects, size);
  const fragmentation = validateFragmentation(det.regions.length, objects.length, layers);
  const quality = computeQuality(objects, textObjects, fragmentation.blocked);

  return {
    original: { width: image.width, height: image.height, src: image.src },
    regions: det.regions,
    objects,
    textObjects,
    layers,
    fragmentation,
    quality,
    meta: { maskProvider: deps.maskProvider?.name ?? "none(union-polygons)" },
  };
}

/** Segment the WHOLE object once. On failure keep the provisional contour + flag. */
async function segmentObject(o: GroupedObject, image: { url: string; width: number; height: number }, mp: MaskProvider): Promise<GroupedObject> {
  try {
    const r = await mp.segment(image, { bbox: o.bbox, instanceId: o.instanceId, label: o.label, type: o.type });
    return { ...o, mask: r.mask, bbox: r.mask.bbox ?? o.bbox, maskSource: r.source, confidence: Math.min(o.confidence, r.confidence || o.confidence) };
  } catch {
    return { ...o, maskFailed: true }; // keep grouper's provisional union-polygon mask
  }
}

function computeQuality(objects: GroupedObject[], texts: ClassifiedText[], blocked: boolean): SegmentationQuality {
  const n = objects.length || 1;
  const covered = objects.filter(o => o.mask.alphaUrl || (o.mask.polygons && o.mask.polygons.length)).length;
  const realEdges = objects.filter(o => o.maskSource === "sam2" || o.maskSource === "birefnet").length;
  const resolvedText = texts.length ? texts.filter(t => t.ownership !== "unknown").length / texts.length : 1;
  return {
    objectCoverage: Math.round((covered / n) * 100),
    edgeQuality: objects.length ? Math.round((realEdges / n) * 100) : 70,
    textOwnershipAccuracy: Math.round(resolvedText * 100),
    fragmentationScore: blocked ? 0 : 100,
  };
}
