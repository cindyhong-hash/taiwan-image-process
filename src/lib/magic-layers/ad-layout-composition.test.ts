import assert from "node:assert/strict";
import test from "node:test";
import { resolveAdLayoutDesignSpecs } from "./ad-layout-design-spec.ts";
import { renderAdLayoutSpec } from "./ad-layout-renderer.ts";
import { resolveAdComposition } from "./ad-layout-composition.ts";
for (const [ratio, width, height] of [["1:1",1024,1024],["4:5",1024,1280],["9:16",720,1280],["16:9",1280,720]] as const) {
  test(`finite, contained, non-overlapping compositions for every purpose on ${ratio}`, () => {
    for (const aspect of [0.28,1,2.4]) for (const purpose of ["product","benefit","scene","promo"] as const) {
      for (const spec of resolveAdLayoutDesignSpecs({ canvas: {width,height,ratio}, productAspectRatio: aspect, purpose, assets: {hero:"hero"}, typography: {headline:"每天細緻保養",subtitle:"Daily care 好心情",dark:"#123456",light:"#fff",accent:"#68bbee"} })) {
        const layers = renderAdLayoutSpec(spec), p = layers.find(l=>l.id==="product_1")!;
        assert.ok(Math.abs(p.width/p.height-aspect)<0.02);
        for (const t of layers.filter(l=>l.type==="independent_text")) {
          assert.ok(t.x>=0 && t.y>=0 && t.x+t.width<=width && t.y+t.height<=height);
          assert.ok(t.x+t.width<=p.x || t.x>=p.x+p.width || t.y+t.height<=p.y || t.y>=p.y+p.height);
        }
      }
    }
  });
}

test("maps a trusted composition decision to a bounded template before resolving geometry", () => {
  const layout = resolveAdComposition({
    canvas: { width: 1024, height: 1280, ratio: "4:5" },
    assets: { hero: "hero" }, purpose: "product", productAspectRatio: 1,
    typography: { headline: "標題", dark: "#123456", light: "#fff", accent: "#68bbee" },
  }, "product-focus", {
    direction: "product-focus", composition: "stacked", typography: "balanced", density: "minimal",
    support: "none", decoration: "none", accent: "primary", graphics: "none", backdrop: "none", confidence: 0.9,
  });

  assert.equal(layout.templateId, "center-product-bottom-copy");
  assert.deepEqual(layout.product, { x: 246, y: 541, w: 532, h: 532 });
  assert.deepEqual(layout.safePanel, { x: 56, y: 64, w: 819, h: 371 });
  assert.deepEqual(layout.support, { x: 51, y: 794, w: 164, h: 141 });
  assert.deepEqual(layout.decoration, { x: 819, y: 218, w: 102, h: 115 });
  assert.deepEqual(layout.logo, { x: 768, y: 1165, w: 164, h: 64 });
});

test("anchors the product to a trusted surface rectangle and caps it to the usable surface", () => {
  const input = {
    canvas: { width: 1000, height: 1000, ratio: "1:1" },
    assets: { hero: "hero", background: "background" },
    purpose: "scene" as const,
    productAspectRatio: 0.25,
    compositionAdvice: {
      source: "vision" as const,
      sceneGrounding: "surface" as const,
      surfaceRect: { x: 0.08, y: 0.62, w: 0.55, h: 0.1 },
      warnings: [],
    },
    typography: { headline: "溫和保養", subtitle: "每天安心使用", dark: "#123456", light: "#fff", accent: "#68bbee" },
  };

  for (const direction of ["product-focus", "editorial", "scene-led"] as const) {
    const layout = resolveAdComposition(input, direction);
    assert.equal(layout.product.y + layout.product.h, 620);
    assert.ok(layout.product.x >= 80);
    assert.ok(layout.product.x + layout.product.w <= 630);
    assert.ok(layout.product.w <= 341);
    assert.ok(layout.product.h <= 540);
    assert.ok(Math.abs(layout.product.w / layout.product.h - 0.25) < 0.01);
  }
});

test("keeps template geometry when surface placement has no trusted rectangle", () => {
  const base = {
    canvas: { width: 1000, height: 1000, ratio: "1:1" },
    assets: { hero: "hero", background: "background" },
    purpose: "scene" as const,
    productAspectRatio: 0.4,
    typography: { headline: "溫和保養", subtitle: "每天安心使用", dark: "#123456", light: "#fff", accent: "#68bbee" },
  };

  assert.deepEqual(
    resolveAdComposition({ ...base, compositionAdvice: { source: "vision", sceneGrounding: "surface", warnings: [] } }, "scene-led"),
    resolveAdComposition(base, "scene-led"),
  );
});
