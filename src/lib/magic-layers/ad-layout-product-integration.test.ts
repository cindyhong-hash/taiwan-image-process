import assert from "node:assert/strict";
import test from "node:test";
import { resolveAdLayoutDesignSpecs } from "./ad-layout-design-spec.ts";
import { planProductIntegration, resolveProductIntegrationGeometry } from "./ad-layout-product-integration.ts";

const input = {
  canvas: { width: 1000, height: 1000, ratio: "1:1" },
  assets: { background: "background", hero: "hero" },
  purpose: "scene" as const,
  typography: { headline: "舒適日常", subtitle: "穩穩融入生活場景", dark: "#223344", light: "#ffffff", accent: "#66aee0" },
};

test("surface integration enables contact, cast, highlight and a reflection when space permits", () => {
  const base = resolveAdLayoutDesignSpecs(input)[0];
  const spec = {
    ...base,
    compositionAdvice: { source: "vision" as const, sceneGrounding: "surface" as const, warnings: [] },
    layout: { ...base.layout!, product: { x: 600, y: 260, w: 220, h: 400 } },
  };

  const plan = planProductIntegration(spec);
  const geometry = resolveProductIntegrationGeometry(spec, plan);

  assert.deepEqual(plan, {
    mode: "surface",
    lightSide: "left",
    contactShadow: true,
    castShadow: true,
    highlight: true,
    halo: false,
    reflectionHighlight: true,
  });
  assert.ok(geometry.contactShadow && geometry.castShadow && geometry.highlight && geometry.reflectionHighlight);
  assert.equal(geometry.halo, undefined);
  for (const rect of Object.values(geometry)) {
    if (!rect) continue;
    assert.ok(rect.x >= 0 && rect.y >= 0);
    assert.ok(rect.x + rect.w <= spec.canvas.width && rect.y + rect.h <= spec.canvas.height);
  }
  assert.ok(geometry.castShadow.x > spec.layout.product.x);
});

test("floating integration uses grounding, highlight and halo without claiming contact or reflection", () => {
  const base = resolveAdLayoutDesignSpecs(input)[0];
  const spec = {
    ...base,
    compositionAdvice: { source: "fallback" as const, sceneGrounding: "floating" as const, warnings: [] },
    layout: { ...base.layout!, product: { x: 100, y: 260, w: 220, h: 400 } },
  };

  const plan = planProductIntegration(spec);
  const geometry = resolveProductIntegrationGeometry(spec, plan);

  assert.deepEqual(plan, {
    mode: "floating",
    lightSide: "right",
    contactShadow: false,
    castShadow: false,
    highlight: true,
    halo: true,
    reflectionHighlight: false,
  });
  assert.ok(geometry.groundingShadow && geometry.highlight && geometry.halo);
  assert.equal(geometry.contactShadow, undefined);
  assert.equal(geometry.castShadow, undefined);
  assert.equal(geometry.reflectionHighlight, undefined);
});

test("surface integration omits reflection when the product reaches the lower canvas edge", () => {
  const base = resolveAdLayoutDesignSpecs(input)[0];
  const spec = {
    ...base,
    compositionAdvice: { source: "vision" as const, sceneGrounding: "surface" as const, warnings: [] },
    layout: { ...base.layout!, product: { x: 600, y: 570, w: 220, h: 400 } },
  };

  assert.equal(planProductIntegration(spec).reflectionHighlight, false);
});
