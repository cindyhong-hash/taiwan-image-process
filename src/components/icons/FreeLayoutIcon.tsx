// 自由排版專用 icon：選取框 + 四角控制點 + 中央文字「I」，呼應畫布上自由移動元件。
// 用法同 lucide：<FreeLayoutIcon className="h-5 w-5" />
export function FreeLayoutIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {/* 選取框 */}
      <rect x="5" y="5" width="14" height="14" rx="1.5" />
      {/* 四角控制點（實心） */}
      <rect x="3" y="3" width="4" height="4" rx="1" fill="currentColor" stroke="none" />
      <rect x="17" y="3" width="4" height="4" rx="1" fill="currentColor" stroke="none" />
      <rect x="3" y="17" width="4" height="4" rx="1" fill="currentColor" stroke="none" />
      <rect x="17" y="17" width="4" height="4" rx="1" fill="currentColor" stroke="none" />
      {/* 中央文字 I */}
      <path d="M10 9h4M10 15h4M12 9v6" />
    </svg>
  );
}
