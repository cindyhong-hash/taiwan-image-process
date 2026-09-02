"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, ShoppingBag, Image as ImageIcon, Settings, CalendarDays, Sparkles, type LucideIcon } from "lucide-react";

type NavItem = { label: string; href: string; icon: LucideIcon; tour: string; match: (p: string) => boolean };
type NavGroup = { label?: string; items: NavItem[] };

export function SidebarNav({ currentClientId, collapsed }: { currentClientId: string; collapsed?: boolean }) {
  const pathname = usePathname();
  const base = `/clients/${currentClientId}`;
  const isCalendar = (p: string) => p.startsWith(`${base}/marketing-plans`) && (p.endsWith("/calendar") || p === `${base}/marketing-plans/calendar`);
  const groups: NavGroup[] = [
    { items: [
      { label: "首頁", href: base, icon: Home, tour: "nav-home", match: (p) => p === base },
    ] },
    { label: "企劃", items: [
      { label: "AI 月度企劃", href: `${base}/marketing-plans`, icon: Sparkles, tour: "nav-planner", match: (p) => p.startsWith(`${base}/marketing-plans`) && !isCalendar(p) },
      { label: "內容日曆", href: `${base}/marketing-plans/calendar`, icon: CalendarDays, tour: "nav-calendar", match: (p) => isCalendar(p) },
    ] },
    { label: "內容", items: [
      { label: "建立圖文", href: `${base}/activities`, icon: ShoppingBag, tour: "nav-activities", match: (p) => p.startsWith(`${base}/activities`) },
    ] },
    { label: "資源", items: [
      { label: "素材庫", href: `${base}/components`, icon: ImageIcon, tour: "nav-library", match: (p) => p.startsWith(`${base}/components`) },
      { label: "品牌設定", href: `${base}/settings`, icon: Settings, tour: "nav-settings", match: (p) => p.startsWith(`${base}/settings`) },
    ] },
  ];

  if (collapsed) {
    return (
      <nav className="flex flex-col items-center gap-1">
        {groups.map((group, gi) => (
          <div key={group.label ?? `g-${gi}`} className={`flex flex-col items-center gap-1 ${gi > 0 ? "mt-2 border-t border-[#ebeff5] pt-2" : ""}`}>
            {group.items.map(({ label, href, icon: Icon, tour, match }) => {
              const active = match(pathname);
              return (
                <Link key={label} href={href} title={label} data-tour={tour}
                  className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${active ? "bg-violet-50" : "hover:bg-gray-50"}`}>
                  <Icon className={`h-5 w-5 ${active ? "text-violet-600" : "text-gray-400"}`} />
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    );
  }

  return (
    <nav className="flex flex-col gap-1">
      {groups.map((group, gi) => (
        <div key={group.label ?? `g-${gi}`} className={gi > 0 ? "mt-4" : ""}>
          {group.label && <p className="px-4 pb-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">{group.label}</p>}
          {group.items.map(({ label, href, icon: Icon, tour, match }) => {
            const active = match(pathname);
            return (
              <Link key={label} href={href} data-tour={tour}
                className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm transition-colors ${active ? "bg-violet-50 text-violet-700 font-medium" : "text-gray-600 hover:bg-gray-50"}`}>
                <Icon className={`h-5 w-5 ${active ? "text-violet-600" : "text-gray-400"}`} />
                {label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
