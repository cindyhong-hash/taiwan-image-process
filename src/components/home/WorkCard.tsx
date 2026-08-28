import Link from "next/link";
import { Image as ImageIcon } from "lucide-react";
type Activity = { id: string; theme: string; status: string; createdAt: string;
  imageRatio?: string; customW?: number; customH?: number;
  generatedLayouts?: { imageUrl: string; isSelected?: boolean }[] };
const STATUS: Record<string, { label: string; cls: string }> = {
  GENERATING: { label: "生成中", cls: "bg-violet-100 text-violet-700" },
  DONE: { label: "已完成", cls: "bg-emerald-100 text-emerald-700" },
  PENDING: { label: "草稿", cls: "bg-gray-100 text-gray-600" },
  DRAFT: { label: "草稿", cls: "bg-gray-100 text-gray-600" },
  FAILED: { label: "生成失敗", cls: "bg-red-100 text-red-600" },
};
export function WorkCard({ act, clientId }: { act: Activity; clientId: string }) {
  const thumb = act.generatedLayouts?.find(l => l.isSelected)?.imageUrl ?? act.generatedLayouts?.[0]?.imageUrl;
  const s = STATUS[act.status] ?? { label: act.status, cls: "bg-gray-100 text-gray-500" };
  const count = act.generatedLayouts?.length ?? 0;
  const size = act.customW && act.customH ? `${act.customW} × ${act.customH}` : act.imageRatio ?? "";
  return (
    <Link href={`/clients/${clientId}/activities/${act.id}`} className="block overflow-hidden rounded-2xl border border-gray-200 bg-white hover:shadow-sm">
      <div className="relative aspect-square bg-gray-100">
        {thumb ? <img src={thumb} alt="" className="h-full w-full object-cover" loading="lazy" />
               : <div className="flex h-full items-center justify-center"><ImageIcon className="h-6 w-6 text-gray-300" /></div>}
        <span className={`absolute left-2 top-2 rounded-md px-2 py-0.5 text-[11px] font-medium ${s.cls}`}>{s.label}</span>
      </div>
      <div className="p-3">
        <div className="truncate text-sm font-medium text-gray-800">{act.theme}</div>
        <div className="mt-1 text-xs text-gray-400">
          {new Date(act.createdAt).toLocaleDateString("zh-TW")}{count ? ` · ${count} 張` : ""}{size ? ` · ${size}` : ""}
        </div>
      </div>
    </Link>
  );
}
