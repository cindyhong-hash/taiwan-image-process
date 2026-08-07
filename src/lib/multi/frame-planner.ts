import { anthropic } from "@/lib/anthropic";

export type FramePlan = {
  frame: number;
  camera: string;
  composition: string;
  action: string;
  emotion: string;
  productRole: "hero" | "support" | "background";
  textZone: "top" | "bottom" | "left" | "right";
  copy: { headline: string; caption?: string };
};

type PlanInput = { theme: string; n: number; productDesc?: string; variant?: "A" | "B"; userHeadline?: string };

const ROLE_BY_INDEX = (i: number, n: number): FramePlan["productRole"] =>
  i === 0 ? "hero" : i === n - 1 ? "support" : "support";

/** deterministic fallback：n 格各給合理的鏡頭/構圖/情緒 + 佔位文案。 */
export function fallbackFramePlans(input: PlanInput): FramePlan[] {
  const beats = ["Hook 痛點/情境", "Product 產品特寫", "Experience 使用感受", "Proof/Detail 細節佐證", "CTA 收尾"];
  return Array.from({ length: input.n }, (_, i) => ({
    frame: i,
    camera: i === 0 ? "medium shot, eye-level, subject slightly off-center" : "close-up or 3/4 angle, varied from previous",
    composition: i === 0 ? "clear focal subject, room reserved for headline" : "clean scene, single focal point",
    action: i === 0 ? "subject engaging with the theme" : "detail or lifestyle moment",
    emotion: input.variant === "B" ? "calm, aspirational" : "confident, appealing",
    productRole: ROLE_BY_INDEX(i, input.n),
    textZone: i === 0 ? "top" : "bottom",
    copy: { headline: i === 0 && input.userHeadline ? input.userHeadline : (beats[i] ?? `Frame ${i + 1}`) },
  }));
}

function buildPlanPrompt(input: PlanInput): string {
  const variantHint = input.variant === "B"
    ? "Variant B (editorial/narrative): softer beats, lifestyle storytelling, no hard selling."
    : input.variant === "A"
    ? "Variant A (high-conversion): punchy hook, clear product beat, strong CTA."
    : "Single balanced set.";
  return `You are a top social-marketing art director + copywriter. Plan ${input.n} frames for a social carousel as STRICT JSON only.

THEME: ${input.theme}
PRODUCT: ${input.productDesc || "unspecified"}
${variantHint}
${input.userHeadline ? `Frame 0 headline MUST be: "${input.userHeadline}"` : ""}

For EACH frame describe ONLY: camera, composition, action, emotion, productRole ("hero"|"support"|"background"), textZone ("top"|"bottom"|"left"|"right"), and copy (headline + optional caption).
Do NOT describe the person's appearance, color grading, or brand style — those are fixed globally elsewhere.
Copy MUST be in the theme's language (繁體中文 if the theme is Chinese), punchy and platform-native.

Return JSON: {"frames":[{"frame":0,"camera":"","composition":"","action":"","emotion":"","productRole":"hero","textZone":"top","copy":{"headline":"","caption":""}}]}
Exactly ${input.n} frames. JSON only.`;
}

export async function generateFramePlans(input: PlanInput): Promise<FramePlan[]> {
  try {
    const res = await anthropic.messages.create({
      model: "claude-opus-4-5", max_tokens: 2000,
      messages: [{ role: "user", content: buildPlanPrompt(input) }],
    });
    const raw = (res.content[0] as { text: string }).text;
    const obj = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}");
    const frames = Array.isArray(obj.frames) ? obj.frames : [];
    if (!frames.length) return fallbackFramePlans(input);
    const fb = fallbackFramePlans(input);
    return Array.from({ length: input.n }, (_, i) => {
      const f = frames[i] ?? {};
      return {
        frame: i,
        camera: f.camera || fb[i].camera,
        composition: f.composition || fb[i].composition,
        action: f.action || fb[i].action,
        emotion: f.emotion || fb[i].emotion,
        productRole: (["hero", "support", "background"].includes(f.productRole) ? f.productRole : fb[i].productRole) as FramePlan["productRole"],
        textZone: (["top", "bottom", "left", "right"].includes(f.textZone) ? f.textZone : fb[i].textZone) as FramePlan["textZone"],
        copy: { headline: (i === 0 && input.userHeadline) ? input.userHeadline : (f.copy?.headline || fb[i].copy.headline), caption: f.copy?.caption },
      };
    });
  } catch (e) {
    console.warn("[multi][frame-planner] fallback used:", e);
    return fallbackFramePlans(input);
  }
}

/** 注入 image prompt 的 FRAME-SPECIFIC 區塊。 */
export function framePlanCellBlock(fp: FramePlan, i: number, n: number): string {
  return `FRAME-SPECIFIC INSTRUCTION — CELL ${i + 1} OF ${n} (productRole: ${fp.productRole}):
- CAMERA: ${fp.camera}
- COMPOSITION: ${fp.composition}
- ACTION: ${fp.action}
- EMOTION: ${fp.emotion}
- TEXT ZONE: reserve the ${fp.textZone} area as clean space for text.`;
}
