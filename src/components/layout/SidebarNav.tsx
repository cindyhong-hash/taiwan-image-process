"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, ShoppingBag, Image as ImageIcon, Settings } from "lucide-react";

export function SidebarNav({ currentClientId, collapsed }: { currentClientId: string; collapsed?: boolean }) {
  const pathname = usePathname();
  const base = `/clients/${currentClientId}`;
  const items = [
    { label: "首頁", href: base, icon: Home, tour: "nav-home", match: (p: string) => p === base },
    { label: "廣告圖文", href: `${base}/activities`, icon: ShoppingBag, tour: "nav-activities", match: (p: string) => p.startsWith(`${base}/activities`) },
    { label: "素材庫", href: `${base}/components`, icon: ImageIcon, tour: "nav-library", match: (p: string) => p.startsWith(`${base}/components`) },
    { label: "品牌設定", href: `${base}/settings`, icon: Settings, tour: "nav-settings", match: (p: string) => p.startsWith(`${base}/settings`) },
  ];
  if (collapsed) {
    return (
      <nav className="flex flex-col items-center gap-1">
        {items.map(({ label, href, icon: Icon, tour, match }) => {
          const active = match(pathname);
          return (
            <Link key={label} href={href} title={label} data-tour={tour}
              className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${active ? "bg-violet-50" : "hover:bg-gray-50"}`}>
              <Icon className={`h-5 w-5 ${active ? "text-violet-600" : "text-gray-400"}`} />
            </Link>
          );
        })}
      </nav>
    );
  }
  return (
    <nav className="flex flex-col gap-1">
      {items.map(({ label, href, icon: Icon, tour, match }) => {
        const active = match(pathname);
        return (
          <Link key={label} href={href} data-tour={tour}
            className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm transition-colors ${active ? "bg-violet-50 text-violet-700 font-medium" : "text-gray-600 hover:bg-gray-50"}`}>
            <Icon className={`h-5 w-5 ${active ? "text-violet-600" : "text-gray-400"}`} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
