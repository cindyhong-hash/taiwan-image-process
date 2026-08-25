/* ============================================================
   Magic Layers — OpenRouterDetector  (server, real VLM)
   Uses the vision model to DECIDE semantics only: what each object is, how many
   instances, and which text belongs where. It returns WHOLE objects (a whole
   person = one entry, never body parts) with normalized bboxes. SAM2/BiRefNet
   later turn each bbox into a precise contour. Never asks the VLM for masks.
   ============================================================ */
import type { Detector, DetectResult, Region, RawText, LayerType, TextRole } from "./types.ts";
import { describeImageOpenRouter } from "@/lib/openrouter";

const TEXT_ROLES: TextRole[] = ["package_logo", "package_text", "headline", "price", "badge", "body_copy", "cta"];
function normRole(r: unknown): TextRole { const s = String(r ?? "").toLowerCase().replace(/[\s-]/g, "_"); return (TEXT_ROLES as string[]).includes(s) ? (s as TextRole) : "unknown"; }

const PROMPT = `You are a segmentation planner for a graphic-design layer editor.
List the image's COMPLETE semantic objects and text.

OBJECT rules:
- One entry per WHOLE object. A whole person = ONE entry (NEVER head/hair/arm/torso separately).
- Each distinct physical product = its own entry (product_1, product_2, ...). List every product.
- Two different people = two entries (person_1, person_2). Never merge different people.
- "type" one of: person, product, object, decoration. Do NOT list the background.
- "bbox" = [x,y,w,h] as fractions 0..1 (top-left); include the WHOLE object (with hair / cap / pump).
- "mask_hint": short phrase of what the single cut-out must contain, e.g.
  "entire bottle including cap, pump, reflection and shadow" or "whole woman including all hair".
- "instanceId" like "person_1","product_1"; "confidence" 0..1.

TEXT rules — list every text block with a "role":
  package_logo | package_text | headline | price | badge | body_copy | cta
  (text printed ON a product = package_logo/package_text; free-floating design text = the others)

Return STRICT JSON only, no prose, no markdown fences:
{"objects":[{"type":"product","label":"Kerastase bottle","instanceId":"product_1","bbox":[0.6,0.55,0.2,0.35],"mask_hint":"entire bottle incl cap, pump, reflection, shadow","confidence":0.9}],
 "texts":[{"text":"KÉRASTASE","bbox":[0.62,0.7,0.15,0.03],"role":"package_logo","confidence":0.9},
          {"text":"夏日保養新品","bbox":[0.05,0.02,0.4,0.05],"role":"headline","confidence":0.95}]}`;

let seq = 0;

export function OpenRouterDetector(): Detector {
  return {
    async detect(image): Promise<DetectResult> {
      const W = image.width, H = image.height;
      const raw = await describeImageOpenRouter(image.url, PROMPT, 3000);
      if (!raw) throw new Error("OpenRouter returned empty response (check OPENROUTER_API_KEY / model / region)");

      const parsed = parseJson(raw);
      seq = 0;
      const regions: Region[] = (parsed.objects ?? [])
        .filter((o: any) => o && Array.isArray(o.bbox))
        .map((o: any) => {
          const b = scale(o.bbox, W, H);
          return {
            id: `r${++seq}`,
            type: normType(o.type),
            label: String(o.label ?? o.type ?? "object"),
            instanceId: o.instanceId ? String(o.instanceId) : null,
            bbox: b,
            confidence: clamp01(Number(o.confidence ?? 0.8)),
          } as Region;
        })
        .filter((r: Region) => r.bbox.w > 2 && r.bbox.h > 2);

      const textObjects: RawText[] = (parsed.texts ?? [])
        .filter((t: any) => t && Array.isArray(t.bbox) && t.text)
        .map((t: any) => ({ id: `t${++seq}`, text: String(t.text), bbox: scale(t.bbox, W, H), confidence: clamp01(Number(t.confidence ?? 0.8)), role: normRole(t.role) }));

      return { width: W, height: H, regions, textObjects };
    },
  };
}

function scale(b: number[], W: number, H: number) {
  // accept normalized (0..1) or already-pixel boxes
  const norm = b.every((v) => v >= 0 && v <= 1.5);
  return norm
    ? { x: Math.round(b[0] * W), y: Math.round(b[1] * H), w: Math.round(b[2] * W), h: Math.round(b[3] * H) }
    : { x: Math.round(b[0]), y: Math.round(b[1]), w: Math.round(b[2]), h: Math.round(b[3]) };
}
function normType(t: string): LayerType {
  const s = String(t || "").toLowerCase();
  if (s.includes("person") || s.includes("people") || s.includes("human") || s.includes("model")) return "person";
  if (s.includes("product") || s.includes("bottle") || s.includes("package")) return "product";
  if (s.includes("decor") || s.includes("flower") || s.includes("ornament")) return "decoration";
  if (s.includes("background")) return "background";
  return "object";
}
function clamp01(v: number) { return isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.8; }

function parseJson(raw: string): { objects?: any[]; texts?: any[] } {
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const first = s.indexOf("{"), last = s.lastIndexOf("}");
  if (first >= 0 && last > first) s = s.slice(first, last + 1);
  try { return JSON.parse(s); } catch { throw new Error("Could not parse VLM JSON: " + raw.slice(0, 200)); }
}
