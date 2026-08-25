/* ============================================================
   Magic Layers — shared types
   Pure type-only module (no runtime imports) so it can be consumed by both
   the server pipeline and the zero-dep node tests.

   Coordinates are always ORIGINAL-image pixels (traceable to the source).
   ============================================================ */

export type LayerType =
  | "background"
  | "product"
  | "person"
  | "object"
  | "decoration"
  | "independent_text";

export type Source = "original" | "segmented" | "generated" | "ocr";
export type Ownership = "independent" | "embedded" | "unknown";

export interface Point { x: number; y: number; }
export interface Bbox { x: number; y: number; w: number; h: number; }

/** A mask stays resolution-independent: polygons in source px, or an alpha PNG
 *  URL produced by SAM2/BiRefNet. `polygons` supports a UNION of many parts so a
 *  Person assembled from head/hair/arms is one contour, not many rectangles. */
export interface Mask {
  kind: "polygons" | "rect" | "alpha";
  polygons?: Point[][];
  bbox: Bbox;
  alphaUrl?: string;       // THE single merged cutout PNG (one per object)
  feather?: number;
}

/** One raw region from the detector. May be a *part* (head, hair, cap…) or an
 *  already-whole object. `instanceId` is the authoritative grouping key when the
 *  detector provides it (a VLM does); geometry is only a fallback. */
export interface Region {
  id: string;
  type: LayerType;
  label: string;
  instanceId: string | null;   // parts of the same object share this
  bbox: Bbox;
  confidence: number;
  polygons?: Point[][];        // optional part contour
}

/** Text role from the vision model — drives ownership (package_* => embedded). */
export type TextRole = "package_logo" | "package_text" | "headline" | "price" | "badge" | "body_copy" | "cta" | "unknown";

export interface RawText {
  id: string;
  text: string;
  bbox: Bbox;
  confidence: number;
  role?: TextRole;
}

export interface ClassifiedText extends RawText {
  ownership: Ownership;
  ownerObjectId: string | null;
  editable: boolean;
  reasons?: string[];
}

/** A complete semantic object after grouping: one movable thing. */
export interface GroupedObject {
  id: string;
  type: LayerType;
  label: string;
  instanceId: string | null;
  bbox: Bbox;                  // union bbox of all parts
  parts: Region[];             // the fragments that were merged in
  mask: Mask;                  // union mask (polygons) or alpha (filled later)
  confidence: number;
  maskSource?: MaskSource;     // which engine produced the final mask (sam2/birefnet/mock)
  maskFailed?: boolean;        // true => segmentation failed; kept provisional contour
}

export interface LayerData {
  id: string;
  type: LayerType;
  name: string;
  semanticId: SemanticId;      // person | product | object | decoration | background | text
  instanceId: string | null;   // person_1, person_2, product_1 … distinguishes instances
  parentId: string | null;     // set for embedded/child items (LayerGroup)
  bbox: Bbox;
  mask: Mask | null;
  image: string | null;        // extracted RGBA cutout URL (filled at extraction time)
  x: number; y: number; width: number; height: number; rotation: number;
  zIndex: number;
  confidence: number;
  source: Source;
  editable: boolean;
  embeddedText: RawText[];     // rides with this layer, never split out
  children: string[];          // ids of child regions/objects (LayerGroup)
  meta: Record<string, unknown>;
}

export type SemanticId = "person" | "product" | "object" | "decoration" | "background" | "text";

export interface DetectResult {
  width: number;
  height: number;
  regions: Region[];
  textObjects: RawText[];
}

export interface AnalysisResult {
  original: { width: number; height: number; src?: string };
  regions: Region[];
  objects: GroupedObject[];
  textObjects: ClassifiedText[];
  layers: LayerData[];
  fragmentation: FragmentationReport;
  quality: SegmentationQuality;
  meta: Record<string, unknown>;
}

export interface SegmentationQuality {
  objectCoverage: number;          // 0-100: objects that got a real alpha mask
  edgeQuality: number;             // 0-100: heuristic (feather/postprocess applied)
  textOwnershipAccuracy: number;   // 0-100: texts resolved (not unknown)
  fragmentationScore: number;      // 0-100: 100 = no fragmentation
}

export interface FragmentationReport {
  regionCount: number;
  objectCount: number;
  layerCount: number;
  ok: boolean;
  blocked: boolean;    // true => do not auto-submit; fragmentation detected
  warnings: string[];
}

/** Detector seam — MockDetector for tests, OpenRouterDetector in production. */
export interface Detector {
  detect(image: { url: string; width: number; height: number }): Promise<DetectResult>;
}

export type MaskSource = "sam2" | "birefnet" | "mock";

/** One prompt to the segmentation engine. The VLM supplies the semantics
 *  (bbox / instance / label); SAM2 only answers "where is the exact contour". */
export interface SegmentPrompt {
  bbox: Bbox;
  instanceId?: string | null;
  label?: string;
  type?: LayerType;
}

export interface MaskResult {
  mask: Mask;
  bbox: Bbox;
  confidence: number;
  source: MaskSource;
  width: number;   // original image dimensions (resolution preserved)
  height: number;
}

/** Mask seam. Upper layers (Grouper/analysis) depend ONLY on this — never on
 *  SAM2 or BiRefNet directly, so the segmentation model can be swapped freely. */
export interface MaskProvider {
  readonly name: string;
  segment(image: { url: string; width: number; height: number }, prompt: SegmentPrompt): Promise<MaskResult>;
}
