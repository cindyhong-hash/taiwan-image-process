"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { WorkCard } from "./WorkCard";
type Activity = Parameters<typeof WorkCard>[0]["act"];
const TABS = [
  { key: "ALL", label: "全部" },
  { key: "GENERATING", label: "生成中" },
  { key: "DONE", label: "已完成" },
] as const;
export function RecentWorks({ clientId, activities }: { clientId: string; activities: Activity[] }) {
  const [tab, setTab] = useState<string>("ALL");
  const count = (k: string) => k === "ALL" ? activities.length : activities.filter(a => a.status === k).length;
  const shown = (tab === "ALL" ? activities : activities.filter(a => a.status === tab)).slice(0, 10);
  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">最近作品</h2>
        <div className="flex items-center gap-2 text-sm">
          {TABS.map(t => (
            <button key={t.key} type="button" onClick={() => setTab(t.key)}
              className={`rounded-full px-3 py-1 ${tab === t.key ? "bg-violet-600 text-white" : "text-gray-500 hover:bg-gray-100"}`}>
              {t.label} {count(t.key)}
            </button>
          ))}
          <Link href={`/clients/${clientId}/activities`} className="ml-2 flex items-center gap-1 text-gray-500 hover:text-violet-600">
            查看全部 <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
      {shown.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 p-10 text-center text-sm text-gray-400">還沒有作品，點「開始創作」試試</div>
      ) : (
        <div className="grid grid-cols-5 gap-3">
          {shown.map(a => <WorkCard key={a.id} act={a} clientId={clientId} />)}
        </div>
      )}
    </section>
  );
}
