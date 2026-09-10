import assert from "node:assert/strict";
import test from "node:test";
import { resolveAdLayoutDesignSpecs } from "./ad-layout-design-spec.ts";
import { renderAdLayoutSpec } from "./ad-layout-renderer.ts";
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
