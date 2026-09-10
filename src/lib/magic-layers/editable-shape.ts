import type { ShapeSpec } from "./saved-layer.ts";
export function drawEditableShape(ctx: CanvasRenderingContext2D, w: number, h: number, sh: ShapeSpec) {
  const x = -w / 2, y = -h / 2;
  if (sh.gradient && (sh.kind === "rect" || sh.kind === "ellipse")) {
    const g = sh.gradient.axis === "horizontal" ? ctx.createLinearGradient(x, 0, -x, 0) : ctx.createLinearGradient(0, y, 0, -y);
    g.addColorStop(0, sh.gradient.from); g.addColorStop(1, sh.gradient.to);
    ctx.fillStyle = g;
    if (sh.kind === "rect") ctx.fillRect(x,y,w,h);
    else { ctx.beginPath(); ctx.ellipse(0,0,w/2,h/2,0,0,Math.PI*2); ctx.fill(); }
    return;
  }
  if (sh.kind === "ellipse" && sh.softness) {
    ctx.save(); ctx.scale(w/2,h/2);
    const g = ctx.createRadialGradient(0,0,0,0,0,1);
    g.addColorStop(0,sh.fill); g.addColorStop(Math.max(0.05,1-sh.softness),sh.fill); g.addColorStop(1,"transparent");
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(0,0,1,0,Math.PI*2); ctx.fill(); ctx.restore(); return;
  }
  const doFill = sh.fill && sh.fill !== "none";
  const doStroke = sh.stroke && sh.stroke !== "none" && sh.strokeWidth > 0;
  if (sh.kind === "rect") {
    ctx.beginPath();
    const r = Math.min(sh.radius ?? 0, w / 2, h / 2);
    if (r > 0 && typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
    if (doFill) { ctx.fillStyle = sh.fill; ctx.fill(); }
    if (doStroke) { ctx.lineWidth = sh.strokeWidth; ctx.strokeStyle = sh.stroke; ctx.stroke(); }
  } else if (sh.kind === "ellipse") {
    ctx.beginPath(); ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
    if (doFill) { ctx.fillStyle = sh.fill; ctx.fill(); }
    if (doStroke) { ctx.lineWidth = sh.strokeWidth; ctx.strokeStyle = sh.stroke; ctx.stroke(); }
  } else if (sh.kind === "line") {
    ctx.beginPath(); ctx.moveTo(-w / 2, 0); ctx.lineTo(w / 2, 0);
    ctx.lineWidth = Math.max(1, sh.strokeWidth); ctx.strokeStyle = sh.stroke || "#111"; ctx.lineCap = "round"; ctx.stroke();
  } else if (sh.kind === "icon") {
    drawIcon(ctx, Math.min(w, h), sh.icon || "star", sh.fill || "#111");
  } else {
    // 多邊形類：triangle/diamond/polygon/star — 頂點落在 w×h 外接橢圓上
    const rx = w / 2, ry = h / 2;
    const poly = (n: number, rot: number) => { ctx.beginPath(); for (let i = 0; i < n; i++) { const a = rot + i * (2 * Math.PI / n); const px = rx * Math.cos(a), py = ry * Math.sin(a); if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); } ctx.closePath(); };
    if (sh.kind === "triangle") poly(3, -Math.PI / 2);
    else if (sh.kind === "diamond") poly(4, -Math.PI / 2);
    else if (sh.kind === "star") {
      const n = Math.max(3, sh.sides ?? 5), inner = 0.42;
      ctx.beginPath();
      for (let i = 0; i < n * 2; i++) { const a = -Math.PI / 2 + i * (Math.PI / n); const rr = i % 2 === 0 ? 1 : inner; const px = rx * rr * Math.cos(a), py = ry * rr * Math.sin(a); if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
      ctx.closePath();
    } else poly(Math.max(3, sh.sides ?? 6), -Math.PI / 2);   // polygon（預設六邊）
    if (doFill) { ctx.fillStyle = sh.fill; ctx.fill(); }
    if (doStroke) { ctx.lineWidth = sh.strokeWidth; ctx.strokeStyle = sh.stroke; ctx.lineJoin = "round"; ctx.stroke(); }
  }
}

/** Draw a text layer (with optional 文字特效). ctx already translated to layer centre + rotated.
 *  Per-layer save/restore in the caller resets shadow/letterSpacing state. */
export function drawIcon(ctx: CanvasRenderingContext2D, size: number, name: string, color: string) {
  const s = size / 24;
  ctx.save();
  ctx.scale(s, s); ctx.translate(-12, -12);
  ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.beginPath();
  switch (name) {
    case "water-drop": ctx.moveTo(12,2);ctx.bezierCurveTo(10,7,4,11,4,15);ctx.bezierCurveTo(4,25,20,25,20,15);ctx.bezierCurveTo(20,11,14,7,12,2);ctx.closePath();ctx.stroke();break;
    case "spring": ctx.moveTo(5,3);ctx.lineTo(19,3);for(let y=5;y<21;y+=4){ctx.lineTo(5,y);ctx.lineTo(19,y+2);}ctx.stroke();break;
    case "blade": ctx.rect(3,4,18,16);ctx.moveTo(6,9);ctx.lineTo(18,9);ctx.moveTo(6,15);ctx.lineTo(18,15);ctx.stroke();break;
    case "shield":ctx.moveTo(12,2);ctx.lineTo(21,6);ctx.bezierCurveTo(21,15,18,19,12,22);ctx.bezierCurveTo(6,19,3,15,3,6);ctx.closePath();ctx.stroke();break;
    case "sparkle":ctx.moveTo(12,2);ctx.lineTo(15,9);ctx.lineTo(22,12);ctx.lineTo(15,15);ctx.lineTo(12,22);ctx.lineTo(9,15);ctx.lineTo(2,12);ctx.lineTo(9,9);ctx.closePath();ctx.stroke();break;
    case "leaf":ctx.moveTo(4,20);ctx.bezierCurveTo(0,6,13,3,21,3);ctx.bezierCurveTo(22,16,15,23,4,20);ctx.moveTo(4,20);ctx.lineTo(16,8);ctx.stroke();break;
    case "heart": ctx.moveTo(12, 21); ctx.bezierCurveTo(12, 21, 3, 14.5, 3, 8.5); ctx.bezierCurveTo(3, 5.5, 5.5, 3, 8.5, 3); ctx.bezierCurveTo(10.5, 3, 12, 4.5, 12, 6); ctx.bezierCurveTo(12, 4.5, 13.5, 3, 15.5, 3); ctx.bezierCurveTo(18.5, 3, 21, 5.5, 21, 8.5); ctx.bezierCurveTo(21, 14.5, 12, 21, 12, 21); ctx.fill(); break;
    case "circle": ctx.arc(12, 12, 9, 0, Math.PI * 2); ctx.fill(); break;
    case "triangle": ctx.moveTo(12, 3); ctx.lineTo(21, 20); ctx.lineTo(3, 20); ctx.closePath(); ctx.fill(); break;
    case "check": ctx.moveTo(5, 12.5); ctx.lineTo(10, 17.5); ctx.lineTo(19, 6.5); ctx.stroke(); break;
    case "arrow": ctx.moveTo(4, 12); ctx.lineTo(20, 12); ctx.moveTo(14, 6); ctx.lineTo(20, 12); ctx.lineTo(14, 18); ctx.stroke(); break;
    case "plus": ctx.moveTo(12, 4); ctx.lineTo(12, 20); ctx.moveTo(4, 12); ctx.lineTo(20, 12); ctx.stroke(); break;
    case "bolt": ctx.moveTo(13, 2); ctx.lineTo(3, 14); ctx.lineTo(12, 14); ctx.lineTo(11, 22); ctx.lineTo(21, 10); ctx.lineTo(12, 10); ctx.closePath(); ctx.fill(); break;
    default: { for (let i = 0; i < 10; i++) { const r = i % 2 === 0 ? 10 : 4.2; const a = -Math.PI / 2 + i * Math.PI / 5; const px = 12 + r * Math.cos(a), py = 12 + r * Math.sin(a); if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); } ctx.closePath(); ctx.fill(); }
  }
  ctx.restore();
}
export function normalizeShape(value: unknown): ShapeSpec | null {
  if (!value || typeof value !== "object") return null;
  const v = value as ShapeSpec;
  if (!["rect","ellipse","line","icon","triangle","polygon","star","diamond"].includes(v.kind) || typeof v.fill !== "string" || typeof v.stroke !== "string" || !Number.isFinite(v.strokeWidth) || v.strokeWidth < 0) return null;
  if (v.softness !== undefined && (!Number.isFinite(v.softness) || v.softness < 0 || v.softness > 1)) return null;
  if (v.gradient && (!["horizontal","vertical"].includes(v.gradient.axis) || !/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(v.gradient.from) || !/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(v.gradient.to))) return null;
  return { ...v, ...(v.gradient ? { gradient: { ...v.gradient } } : {}) };
}
