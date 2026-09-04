import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { CONTENT_TYPE_META, type ContentType, parseJsonArrayAny } from "@/lib/marketing-planner";
import { ExportPrintBar } from "@/components/marketing-planner/ExportPrintBar";

export const dynamic = "force-dynamic";

// 內容類型 → 卡片左邊色條 / 標籤配色（對齊日曆與 DESIGN.md）
const BORDER: Record<string, string> = { rose: "border-l-rose-400", amber: "border-l-amber-400", blue: "border-l-blue-400", violet: "border-l-violet-400", emerald: "border-l-emerald-400" };
const BADGE: Record<string, string> = { rose: "bg-rose-50 text-rose-700", amber: "bg-amber-50 text-amber-700", blue: "bg-blue-50 text-blue-700", violet: "bg-violet-50 text-violet-700", emerald: "bg-emerald-50 text-emerald-700" };

function mmdd(value: Date | null): string {
  if (!value) return "未排期";
  const d = new Date(value);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export default async function MarketingPlanExportPage({ params }: { params: Promise<{ clientId: string; planId: string }> }) {
  const { clientId, planId } = await params;
  const plan = await db.monthlyMarketingPlan.findFirst({
    where: { id: planId, clientId },
    include: {
      client: { select: { name: true, logoUrl: true, logoUrls: true } },
      campaigns: { select: { id: true, name: true } },
      contentItems: { include: { campaign: { select: { name: true } } }, orderBy: [{ scheduledDate: "asc" }, { sortOrder: "asc" }] },
    },
  });
  if (!plan) notFound();

  const items = plan.contentItems;
  const logoFromList = parseJsonArrayAny(plan.client.logoUrls).find((l): l is { url: string } => !!l && typeof l === "object" && typeof (l as { url?: unknown }).url === "string") as { url: string } | undefined;
  const logo = plan.client.logoUrl || logoFromList?.url || "";

  return (
    <div className="fixed inset-0 z-40 overflow-auto bg-white text-gray-900">
      <style>{`@media print { .no-print { display: none !important; } @page { margin: 12mm; } }`}</style>
      <ExportPrintBar backHref={`/clients/${clientId}/marketing-plans/${planId}/calendar`} />

      <div className="mx-auto max-w-4xl px-10 py-8 print:px-0 print:py-2">
        <header className="mb-8 flex items-start justify-between gap-6 border-b-2 border-gray-900 pb-5">
          <div>
            <h1 className="text-4xl font-bold tracking-tight">{plan.month} 月貼文排程計畫</h1>
            <p className="mt-2 text-lg text-gray-500">{plan.client.name}　共 {items.length} 篇</p>
          </div>
          {logo
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={logo} alt={plan.client.name} className="h-10 max-w-[180px] shrink-0 object-contain" />
            : <span className="shrink-0 text-lg font-bold tracking-wide text-gray-300">{plan.client.name}</span>}
        </header>

        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 py-16 text-center text-sm text-gray-400">這個月還沒有內容主題，先回內容企劃產生主題。</div>
        ) : (
          <div className="grid grid-cols-1 gap-x-10 gap-y-6 md:grid-cols-2 print:grid-cols-2">
            {items.map((item) => {
              const type = (item.contentType in CONTENT_TYPE_META ? item.contentType : "BRAND") as ContentType;
              const meta = CONTENT_TYPE_META[type];
              return (
                <article key={item.id} className={`break-inside-avoid border-l-[3px] pl-4 ${BORDER[meta.color] ?? "border-l-gray-300"}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-gray-900">{mmdd(item.scheduledDate)}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${BADGE[meta.color] ?? "bg-gray-100 text-gray-600"}`}>{meta.label}</span>
                    <span className="text-[11px] text-gray-400">{item.format === "CAROUSEL" ? "多圖" : "單圖"}</span>
                  </div>
                  <h3 className="mt-1.5 text-[15px] font-semibold leading-snug text-gray-900">{item.topic}</h3>
                  {item.contentDirection.trim() && <p className="mt-1 text-sm leading-6 text-gray-500"><span className="text-gray-400">溝通點：</span>{item.contentDirection}</p>}
                  {item.campaign?.name && <p className="mt-1.5 text-[11px] text-gray-400">{item.campaign.name}</p>}
                </article>
              );
            })}
          </div>
        )}

        <footer className="no-print mt-10 border-t border-gray-100 pt-4 text-center text-[11px] text-gray-300">{plan.year} 年 {plan.month} 月 · {plan.client.name} 內容排程</footer>
      </div>
    </div>
  );
}
