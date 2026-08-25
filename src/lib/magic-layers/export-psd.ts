/* ============================================================
   Magic Layers — export manifest (PSD / Figma compatible assets)
   Every object layer is already a transparent PNG at `layer.image`. This builds
   a `layers.json` manifest (geometry + z-order + image URLs + embedded text +
   parent/child) that maps 1:1 onto Photoshop/Figma layers. Pure & client-safe.
   (A true .psd/.zip bundle would need a zip/psd lib — not currently installed.)
   ============================================================ */
import type { LayerData } from "./types.ts";

export interface LayerManifest {
  version: string;
  canvas: { width: number; height: number };
  layers: {
    id: string; name: string; type: string; semanticId: string;
    instanceId: string | null; parentId: string | null;
    x: number; y: number; width: number; height: number; rotation: number; zIndex: number;
    image: string | null;                 // transparent PNG url (null for text)
    text?: string;                         // for independent_text layers
    embeddedText?: { text: string }[];     // rides with the object
  }[];
}

export function buildLayerManifest(layers: LayerData[], canvas: { width: number; height: number }): LayerManifest {
  return {
    version: "magic-layers/1.0",
    canvas,
    layers: layers.map(l => ({
      id: l.id, name: l.name, type: l.type, semanticId: l.semanticId,
      instanceId: l.instanceId, parentId: l.parentId,
      x: l.x, y: l.y, width: l.width, height: l.height, rotation: l.rotation, zIndex: l.zIndex,
      image: l.image,
      text: l.type === "independent_text" ? String((l.meta?.textObject as { text?: string } | undefined)?.text ?? l.name) : undefined,
      embeddedText: l.embeddedText.length ? l.embeddedText.map(t => ({ text: t.text })) : undefined,
    })),
  };
}
