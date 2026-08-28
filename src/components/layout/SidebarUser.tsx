export function SidebarUser({ collapsed }: { collapsed?: boolean } = {}) {
  if (collapsed) {
    return (
      <div className="flex items-center justify-center rounded-lg px-2 py-2">
        <div className="h-9 w-9 shrink-0 rounded-full bg-gray-200" />
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-lg px-2 py-2">
      <div className="h-9 w-9 shrink-0 rounded-full bg-gray-200" />
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-gray-800">Cindy</div>
        <div className="text-xs text-gray-400">管理員</div>
      </div>
    </div>
  );
}
