import assert from "node:assert/strict";
import test from "node:test";
import { resolveAdLayoutDesignSpecs } from "./ad-layout-design-spec.ts";
import { renderAdLayoutSpec } from "./ad-layout-renderer.ts";
import type { LayerData } from "./types.ts";

const base = {
  assets: { hero: "hero", background: "background" }, purpose: "product" as const,
  typography: { headline: "每天輕鬆呵護肌膚", subtitle: "細緻設計，陪你享受日常保養時光", dark: "#23344a", light: "#ffffff", accent: "#66aee0" },
};
const overlap = (a: LayerData, b: LayerData) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

for (const [ratio, height] of [["1:1", 1080], ["4:5", 1350], ["9:16", 1920]] as const) {
  for (const aspect of [0.28, 1, 2.4]) {
    test(`keeps ${aspect} product prominent and copy separate on ${ratio}`, () => {
      const canvas = { width: 1080, height, ratio };
      for (const spec of resolveAdLayoutDesignSpecs({ ...base, canvas, productAspectRatio: aspect })) {
        const layers = renderAdLayoutSpec(spec);
        const hero = layers.find(l => l.id === "product_1")!;
        assert.ok(Math.abs(hero.width / hero.height - aspect) < 0.01);
        if (spec.direction !== "scene-led") {
          assert.ok(aspect < 0.5 ? hero.height >= height * 0.51 : hero.width >= 1080 * 0.50, `${spec.direction}: product too small`);
        }
        for (const layer of layers) {
          assert.ok(layer.x >= 0 && layer.y >= 0 && layer.x + layer.width <= 1081 && layer.y + layer.height <= height + 1);
          if (layer.type === "independent_text") assert.equal(overlap(hero, layer), false);
        }
      }
    });
  }
}

test("long Chinese headlines wrap into editable lines without losing copy or colliding with subtitle", () => {
  const headline = "為每一天的肌膚保養帶來更輕盈舒適的細緻體驗";
  const spec = resolveAdLayoutDesignSpecs({ ...base, canvas: { width: 1080, height: 1350, ratio: "4:5" }, productAspectRatio: 0.28, typography: { ...base.typography, headline } })[0];
  const layers = renderAdLayoutSpec(spec);
  const titles = layers.filter(l => l.id.startsWith("text_title"));
  assert.equal(titles.length, 1);
  assert.equal(titles.map(l => (l.meta.style as { text: string }).text).join(""), headline);
  for (const title of titles) {
    const style = title.meta.style as { text: string; fontSizePx: number };
    assert.ok((title.meta.style as { layout?: unknown }).layout);
    assert.ok(style.fontSizePx >= 20);
    assert.equal(title.editable, true);
    for (const subtitle of layers.filter(l => l.id.startsWith("text_sub"))) assert.equal(overlap(title, subtitle), false);
  }
});

test("subtitle-only layout uses the top of the copy block", () => {
  const canvas = { width: 1080, height: 1350, ratio: "4:5" };
  const withTitle = renderAdLayoutSpec(resolveAdLayoutDesignSpecs({ ...base, canvas })[0]);
  const withoutTitle = renderAdLayoutSpec(resolveAdLayoutDesignSpecs({ ...base, canvas, typography: { ...base.typography, headline: undefined } })[0]);
  assert.equal(withoutTitle.find(l => l.id === "text_sub")!.y, withTitle.find(l => l.id === "text_title")!.y);
});
