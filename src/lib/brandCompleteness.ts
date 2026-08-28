export type CompletenessInput = {
  primaryColor?: string | null;
  toneLabels?: string[] | null;
  taboos?: string[] | null;
  logoUrls?: unknown[] | null;
  pastPostUrls?: unknown[] | null;
  assetCount: number;
};
export function brandCompleteness(i: CompletenessInput): { percent: number; assetCount: number } {
  const checks = [
    !!i.primaryColor,
    (i.toneLabels?.length ?? 0) > 0,
    (i.taboos?.length ?? 0) > 0,
    (i.logoUrls?.length ?? 0) > 0,
    (i.pastPostUrls?.length ?? 0) > 0,
    i.assetCount > 0,
  ];
  const percent = Math.round((checks.filter(Boolean).length / checks.length) * 100);
  return { percent, assetCount: i.assetCount };
}
