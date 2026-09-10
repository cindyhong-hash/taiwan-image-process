import assert from "node:assert/strict";
import test from "node:test";
import { resolveAdLayoutDesignSpecs } from "./ad-layout-design-spec.ts";
import { applyAdLayoutVisionPolicy } from "./ad-layout-vision-policy.ts";
import type { AdLayoutVisionAssessment } from "./ad-layout-vision.ts";

const CANVAS = { width: 1024, height: 1024, ratio: "1:1" as const };

function specFor(surfaceY: number | null) {
  return resolveAdLayoutDesignSpecs({
    canvas: CANVAS,
    productAspectRatio: 0.6,
    purpose: "product",
    assets: { hero: "hero" },
    typography: { headline: "每天細緻保養", subtitle: "Daily care", dark: "#123", light: "#fff", accent: "#68bbee" },
    ...(surfaceY === null ? {} : {
      compositionAdvice: {
        source: "vision" as const,
        sceneGrounding: "surface" as const,
        surfaceRect: { x: 0.08, y: surfaceY, w: 0.55, h: 0.1 },
        warnings: [],
      },
    }),
  } as never)[0];
}

const areaOf = (s: ReturnType<typeof specFor>) =>
  (s.layout!.product.w * s.layout!.product.h) / (CANVAS.width * CANVAS.height);

// ① 檯面偏高時，貼齊檯面會把商品壓到幾乎看不見。
//    寧可放棄貼齊（退回原本的浮空排版），也不要輸出一張看不到商品的圖。
test("檯面偏高時不會把商品壓縮到不可用的尺寸", () => {
  const baseline = areaOf(specFor(null));
  for (const y of [0.05, 0.2, 0.35, 0.45]) {
    const area = areaOf(specFor(y));
    assert.ok(
      area >= baseline * 0.5,
      `surfaceRect.y=${y} 時商品只剩畫布的 ${(area * 100).toFixed(2)}%（對照組 ${(baseline * 100).toFixed(2)}%）`,
    );
  }
});

// 合理高度的檯面仍然要真的貼齊（不能因為上面的保護就整個不貼了）。
test("檯面高度合理時商品底部仍貼齊檯面", () => {
  const spec = specFor(0.62);
  const p = spec.layout!.product;
  assert.equal(p.y + p.h, Math.round(0.62 * CANVAS.height), "商品底部應貼齊檯面上緣");
});

// ② 檯面可信但模型沒回傳（或回傳了不合法的）surfaceRect 時，
//    不該連 sceneGrounding 都掉成 floating —— 陰影與商品整合模式都吃這個欄位。
test("檯面可信但缺少 surfaceRect 時仍維持 surface grounding", () => {
  for (const bad of [undefined, { x: 0.5, y: 0.6, w: 0.51, h: 0.1 }]) {
    const assessment = {
      version: 1 as const,
      source: "vision" as const,
      assets: { background: { safeForDeclaredRole: true, productVisible: false, textOrLogoVisible: false, completeSceneVisible: true, confidence: 0.9 } },
      background: { textSafeArea: "left-top" as const, placementSurface: "counter" as const, confidence: 0.9,
        ...(bad ? { surfaceRect: bad } : {}) },
      warnings: [],
    } as unknown as AdLayoutVisionAssessment;
    const { advice } = applyAdLayoutVisionPolicy(
      { inventory: { byRole: { background: [{ imageUrl: "bg", role: "background" }] } } } as never,
      assessment,
    );
    assert.equal(advice.sceneGrounding, "surface", `bad=${JSON.stringify(bad)}`);
  }
});
