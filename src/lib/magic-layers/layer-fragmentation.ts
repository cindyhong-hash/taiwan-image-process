/* ============================================================
   Magic Layers — LayerFragmentationValidator
   Guards against "segmentation succeeded but produced dozens of fragment
   layers". Compares regions -> semantic objects -> final layers. If grouping
   barely reduced the count, it flags fragmentation and BLOCKS submission.

     30 regions -> 5 objects -> 7 layers   => ok
     30 regions -> 5 objects -> 28 layers  => fragmentation detected (blocked)
   ============================================================ */
import type { FragmentationReport, LayerData } from "./types.ts";

export interface FragmentationOptions {
  maxLayers: number;              // sanity ceiling on operable layers
}
export const FRAGMENTATION_DEFAULTS: FragmentationOptions = { maxLayers: 24 };

export function validateFragmentation(
  regionCount: number,
  objectCount: number,
  layers: LayerData[],
  opts: Partial<FragmentationOptions> = {},
): FragmentationReport {
  const cfg = { ...FRAGMENTATION_DEFAULTS, ...opts };
  const layerCount = layers.length;
  const warnings: string[] = [];

  // With a whole-object detector (VLM), each detected object legitimately maps
  // to one layer, so regionCount == objectCount is NORMAL, not fragmentation.
  // Real fragmentation = the invariant "one object => one layer" breaking
  // (grouping produced MORE object-layers than semantic objects), or a runaway
  // total layer count. We do NOT flag "many objects" — a busy poster can have
  // a dozen real products.
  const objLayers = layers.filter(l => l.type !== "background" && l.type !== "independent_text");
  const objectLayers = objLayers.length;

  if (objectLayers > objectCount) {
    warnings.push(`物件圖層(${objectLayers}) 多過語意物件數(${objectCount})：有物件被拆成多層`);
  }
  // same instanceId must not produce more than one object layer
  const byInstance: Record<string, number> = {};
  for (const l of objLayers) if (l.instanceId) byInstance[l.instanceId] = (byInstance[l.instanceId] ?? 0) + 1;
  const dups = Object.entries(byInstance).filter(([, c]) => c > 1);
  if (dups.length) warnings.push(`同一 instanceId 產生多個圖層：${dups.map(([k, c]) => `${k}×${c}`).join(", ")}`);
  // every object layer must carry a cut-out (alpha) or at least a contour mask
  const noMask = objLayers.filter(l => !l.image && !(l.mask && l.mask.polygons && l.mask.polygons.length));
  if (noMask.length) warnings.push(`${noMask.length} 個物件圖層缺少 alpha/輪廓遮罩`);
  if (layerCount > cfg.maxLayers) {
    warnings.push(`圖層過多：${layerCount}（上限 ${cfg.maxLayers}），疑似把單一物件拆成碎片`);
  }

  const blocked = warnings.length > 0;
  return { regionCount, objectCount, layerCount, ok: !blocked, blocked, warnings };
}
