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

/** 防守：AI 個別 frame 漏跟「繁中」指示、漂到英文時，寧用 fallback 中文佔位都好過畫面出英文。 */
const hasCJK = (s: string | undefined | null): boolean => !!s && /[一-鿿]/.test(s);

/** deterministic fallback：n 格各給合理的鏡頭/構圖/情緒 + 佔位文案。 */
export function fallbackFramePlans(input: PlanInput): FramePlan[] {
  const beats = ["痛點／情境", "產品特寫", "使用感受", "細節佐證", "收尾號召"];
  return Array.from({ length: input.n }, (_, i) => ({
    frame: i,
    camera: i === 0 ? "medium shot, eye-level, subject slightly off-center" : "close-up or 3/4 angle, varied from previous",
    composition: i === 0 ? "clear focal subject, room reserved for headline" : "clean scene, single focal point",
    action: i === 0 ? "subject engaging with the theme" : "detail or lifestyle moment",
    emotion: input.variant === "B" ? "calm, aspirational" : "confident, appealing",
    productRole: ROLE_BY_INDEX(i, input.n),
    textZone: i === 0 ? "top" : "bottom",
    copy: { headline: i === 0 && input.userHeadline ? input.userHeadline : (beats[i] ?? `第 ${i + 1} 格`) },
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

🔒 LANGUAGE RULE — applies to copy.headline and copy.caption ONLY, for EVERY frame without exception (frame 0, 1, 2, 3... all of them):
Write ALL copy fields in Traditional Chinese (繁體中文台灣用語), never English, regardless of what language camera/composition/action/emotion are described in. This is non-negotiable — a single frame slipping into English is a failure.

Return JSON: {"frames":[{"frame":0,"camera":"","composition":"","action":"","emotion":"","productRole":"hero","textZone":"top","copy":{"headline":"","caption":""}}]}
Exactly ${input.n} frames. JSON only. Remember: every copy.headline and copy.caption value must be Traditional Chinese.`;
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
        copy: {
          headline: (i === 0 && input.userHeadline)
            ? input.userHeadline
            : (hasCJK(f.copy?.headline) ? f.copy.headline : fb[i].copy.headline),
          caption: hasCJK(f.copy?.caption) ? f.copy.caption : undefined,
        },
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
