/** Shared wrapping for editable ads; original text always stays in the layer. */
export type TextLayout = { version: 1; wrap: "word"; lineHeight: number; letterSpacing: number };
export type TextLine = { text: string; width: number };
export const DEFAULT_TEXT_LAYOUT: TextLayout = { version: 1, wrap: "word", lineHeight: 1.25, letterSpacing: 0 };
export function readTextLayout(value: unknown): TextLayout | undefined {
  if (!value || typeof value !== "object") return undefined;
  const v = value as Partial<TextLayout>;
  return v.version === 1 && v.wrap === "word" && typeof v.lineHeight === "number" && v.lineHeight >= 1 && v.lineHeight <= 2 && typeof v.letterSpacing === "number" && Number.isFinite(v.letterSpacing) && Math.abs(v.letterSpacing) <= 20
    ? { version: 1, wrap: "word", lineHeight: v.lineHeight, letterSpacing: v.letterSpacing } : undefined;
}
export function graphemes(text: string): string[] {
  return [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)].map(s => s.segment);
}
export function layoutText(text: string, maxWidth: number, measure: (text: string) => number): TextLine[] {
  if (!(maxWidth > 0) || !Number.isFinite(maxWidth)) throw new Error("Text width must be positive");
  if (!text) return [];
  return text.replace(/\r\n?/g, "\n").split("\n").flatMap(paragraph => {
    const lines: TextLine[] = [];
    let line = "";
    // Keep whitespace in the source; split only words that cannot fit a whole line.
    const words = [...new Intl.Segmenter(undefined, { granularity: "word" }).segment(paragraph)].map(s => s.segment);
    for (const word of words) {
      if (line && measure(line + word) > maxWidth) { lines.push({ text: line, width: measure(line) }); line = ""; }
      for (const char of graphemes(word)) {
        if (line && measure(line + char) > maxWidth) { lines.push({ text: line, width: measure(line) }); line = ""; }
        line += char;
      }
    }
    if (line || !lines.length) lines.push({ text: line, width: measure(line) });
    return lines;
  });
}
/** Conservative font-independent estimate; browser rechecks with actual font metrics. */
export function estimatedTextWidth(text: string, size: number): number {
  return graphemes(text).reduce((sum, ch) => sum + (/^[\x20-\x7e]$/.test(ch) ? (/[MW@#%]/.test(ch) ? 1 : 0.72) : 1.05) * size, 0);
}
export function fitText(text: string, width: number, height: number, min: number, max: number, measure = estimatedTextWidth, layout = DEFAULT_TEXT_LAYOUT) {
  let result = { fontSize: min, lines: [] as TextLine[], fits: false };
  for (let size = Math.floor(max); size >= Math.ceil(min); size--) {
    const lines = layoutText(text, width, s => measure(s, size) + Math.max(0, graphemes(s).length - 1) * layout.letterSpacing);
    result = { fontSize: size, lines, fits: lines.every(l => l.width <= width) && lines.length * size * layout.lineHeight <= height };
    if (result.fits) return result;
  }
  return result;
}
/** Context is at layer centre, like the existing editor. */
export function drawEditableText(ctx: CanvasRenderingContext2D, input: { text: string; width: number; height: number; fontSize: number; align: "left" | "center" | "right"; layout: TextLayout; stroke?: boolean }) {
  const { text, width, height, fontSize, align, layout } = input;
  const lines = layoutText(text, width, s => ctx.measureText(s).width);
  ctx.textAlign = align; ctx.textBaseline = "middle";
  const x = align === "left" ? -width / 2 : align === "right" ? width / 2 : 0;
  lines.forEach((line, i) => {
    const y = -height / 2 + fontSize * layout.lineHeight * (i + 0.5);
    if (input.stroke) ctx.strokeText(line.text, x, y);
    ctx.fillText(line.text, x, y);
  });
}
