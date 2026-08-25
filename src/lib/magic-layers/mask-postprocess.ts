/* ============================================================
   Magic Layers — mask post-processing (server, sharp)
   Cleans a raw cut-out RGBA PNG so edges look production-grade:
     - shrink the semi-transparent fringe (kills the white halo)
     - feather the alpha edge (amount depends on object type)
   Defensive: any failure returns the input buffer unchanged so the pipeline
   never breaks on an odd image.
   ============================================================ */
import type { LayerType } from "./types.ts";

// Step 6 — feather (px) per object type.
export const FEATHER_BY_TYPE: Record<LayerType, number> = {
  person: 6, product: 3, object: 2, decoration: 4, background: 0, independent_text: 0,
};

export function featherFor(type: LayerType): number {
  return FEATHER_BY_TYPE[type] ?? 2;
}

/**
 * cleanMask — currently a PASSTHROUGH.
 *
 * The earlier de-fringe/feather implementation (extractChannel(3) → linear →
 * joinChannel) silently dropped the alpha and produced 100%-opaque rectangles,
 * so it is disabled. BiRefNet's native cut-out already has usable, feathered
 * edges. A correct de-halo/feather pass must operate on RAW single-channel alpha
 * (verified against real cut-outs) before being re-enabled — do NOT re-add the
 * PNG-buffer joinChannel version.
 *
 * @param buf   RGBA PNG cut-out
 * @param _feather reserved (see FEATHER_BY_TYPE); not applied yet
 */
export async function cleanMask(buf: Buffer, _feather: number): Promise<Buffer> {
  return buf;
}
