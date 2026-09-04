// 內容項目狀態的顯示對映（日曆與製作清單共用）。
// 內部值維持既有：PLANNING / DRAFT / GENERATING / NEEDS_REVIEW / APPROVED，新增 PUBLISHED。
// DRAFT（生成失敗回退）併入「尚未製作」桶顯示。

export type ItemStatusMeta = { label: string; dot: string };

export const ITEM_STATUS_META: Record<string, ItemStatusMeta> = {
  PLANNING: { label: "尚未製作", dot: "bg-gray-300" },
  DRAFT: { label: "尚未製作", dot: "bg-gray-300" },
  GENERATING: { label: "製作中", dot: "bg-amber-400" },
  NEEDS_REVIEW: { label: "待審核", dot: "bg-orange-500" },
  APPROVED: { label: "已完成", dot: "bg-emerald-500" },
  PUBLISHED: { label: "已發布", dot: "bg-violet-500" },
};

export function statusMeta(status: string): ItemStatusMeta {
  return ITEM_STATUS_META[status] ?? ITEM_STATUS_META.PLANNING;
}

// 製作清單上方的狀態摘要桶（依製作流程排序），可點擊篩選
export const STATUS_BUCKETS: { key: string; label: string; dot: string; match: (s: string) => boolean }[] = [
  { key: "PLANNING", label: "尚未製作", dot: "bg-gray-300", match: (s) => s === "PLANNING" || s === "DRAFT" },
  { key: "GENERATING", label: "製作中", dot: "bg-amber-400", match: (s) => s === "GENERATING" },
  { key: "NEEDS_REVIEW", label: "待審核", dot: "bg-orange-500", match: (s) => s === "NEEDS_REVIEW" },
  { key: "APPROVED", label: "已完成", dot: "bg-emerald-500", match: (s) => s === "APPROVED" },
  { key: "PUBLISHED", label: "已發布", dot: "bg-violet-500", match: (s) => s === "PUBLISHED" },
];
