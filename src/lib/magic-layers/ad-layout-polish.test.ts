import assert from "node:assert/strict";
import test from "node:test";
import { resolveAdLayoutDesignSpecs } from "./ad-layout-design-spec.ts";
import { polishAdLayoutSpec } from "./ad-layout-polish.ts";
import { renderAdLayoutSpec } from "./ad-layout-renderer.ts";
import type { AdLayoutDesignSpec } from "./ad-layout-design-spec.ts";
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

function polishFixture(overrides: Partial<AdLayoutDesignSpec> = {}): AdLayoutDesignSpec {
  return {
    direction: "product-focus",
    purpose: "product",
    templateId: "copy-left-product-right",
    layout: {
      templateId: "copy-left-product-right",
      product: { x: 300, y: 300, w: 200, h: 300 },
      headline: { x: 40, y: 40, w: 300, h: 60 },
      subtitle: { x: 40, y: 120, w: 300, h: 50 },
      safePanel: { x: 20, y: 20, w: 340, h: 180 },
      support: { x: 720, y: 720, w: 180, h: 180 },
      decoration: { x: 470, y: 320, w: 90, h: 90 },
      logo: { x: 40, y: 920, w: 100, h: 40 },
      headlineSize: 40,
      subtitleSize: 24,
    },
    artDirection: "測試方向",
    rationale: [],
    canvas: { width: 1000, height: 1000, ratio: "1:1" },
    assets: {
      background: { role: "background", imageUrl: "background-url" },
      product: { role: "hero", imageUrl: "hero-url" },
      support: { role: "detail", imageUrl: "detail-url" },
      decorations: [{ role: "decoration", imageUrl: "decoration-url" }],
    },
    textSafeArea: { zone: "left-top", treatment: "light-panel" },
    typography: {
      headline: "亮白",
      subtitle: "溫和配方",
      headlineColor: "#223344",
      subtitleColor: "#223344",
      accentColor: "#66aee0",
      headlineWeight: 700,
      subtitleWeight: 500,
    },
    productTreatment: { shadow: "soft-ellipse", aspectRatio: 2 / 3 },
    polishTreatment: { backgroundWash: "none", reasons: [] },
    quality: { score: 100, warnings: [], checks: [] },
    ...overrides,
  };
}

test("polish grows an undersized product by at most eight percent without changing its image", () => {
  const source = polishFixture();
  const polished = polishAdLayoutSpec(source);

  assert.deepEqual(source.layout?.product, { x: 300, y: 300, w: 200, h: 300 });
  assert.deepEqual(polished.layout?.product, { x: 292, y: 288, w: 216, h: 324 });
  assert.equal(polished.assets.product?.imageUrl, "hero-url");
  assert.ok(polished.rationale.some((reason) => reason.includes("8%")));
});

test("polish refuses product growth when the expanded bounds collide or leave the canvas", () => {
  const collision = polishFixture({
    layout: { ...polishFixture().layout!, headline: { x: 505, y: 300, w: 200, h: 100 } },
  });
  const outOfBounds = polishFixture({
    layout: { ...polishFixture().layout!, product: { x: 0, y: 300, w: 200, h: 300 } },
  });

  assert.deepEqual(polishAdLayoutSpec(collision).layout?.product, collision.layout?.product);
  assert.deepEqual(polishAdLayoutSpec(outOfBounds).layout?.product, outOfBounds.layout?.product);
});

test("polish strengthens short weak copy, removes a colliding decoration, and adds a soft background wash", () => {
  const source = polishFixture();
  const polished = polishAdLayoutSpec(source);

  assert.equal(polished.typography.headline, source.typography.headline);
  assert.equal(polished.typography.headlineWeight, 800);
  assert.ok((polished.layout?.headlineSize ?? 0) > (source.layout?.headlineSize ?? 0));
  assert.ok((polished.layout?.headlineSize ?? 0) <= (source.layout?.headlineSize ?? 0) * 1.08);
  assert.deepEqual(polished.assets.decorations, []);
  assert.equal(polished.polishTreatment.backgroundWash, "soft-light");
  assert.deepEqual(
    [polished.assets.background, polished.assets.product, polished.assets.support].map((asset) => asset?.imageUrl),
    ["background-url", "hero-url", "detail-url"],
  );
});

test("polish keeps weak headline settings when its existing box cannot fit a larger line", () => {
  const source = polishFixture({
    layout: { ...polishFixture().layout!, headline: { x: 40, y: 40, w: 300, h: 50 }, headlineSize: 40 },
  });
  const polished = polishAdLayoutSpec(source);

  assert.equal(polished.layout?.headlineSize, 40);
  assert.equal(polished.typography.headlineWeight, 700);
});
