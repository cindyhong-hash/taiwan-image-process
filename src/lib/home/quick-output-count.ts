export type QuickOutputCount = 1 | 2 | 3;

export function normalizeQuickOutputCount(value: unknown): QuickOutputCount {
  const count = Number(value);
  return count === 1 || count === 2 || count === 3 ? count : 3;
}

export function selectQuickVariants<T>(variants: readonly T[], value: unknown): T[] {
  return variants.slice(0, normalizeQuickOutputCount(value));
}
