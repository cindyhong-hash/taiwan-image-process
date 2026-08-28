"use client";
import { usePathname } from "next/navigation";
import { PanelLeft } from "lucide-react";
import { BrandSwitcher } from "./BrandSwitcher";
import { SidebarNav } from "./SidebarNav";
import { SidebarUser } from "./SidebarUser";

export function Sidebar() {
  const pathname = usePathname();
  const m = pathname.match(/^\/clients\/([^/]+)/);
  const clientId = m && m[1] !== "new" ? m[1] : null;
  return (
    <aside className="flex w-[220px] shrink-0 flex-col border-r border-gray-200 bg-white p-4">
      <div className="mb-6 flex items-center justify-between px-1">
        <span className="text-lg font-bold text-gray-900">Content</span>
        <PanelLeft className="h-5 w-5 text-gray-400" />
      </div>
      {clientId && (
        <>
          <div className="mb-4"><BrandSwitcher currentClientId={clientId} /></div>
          <SidebarNav currentClientId={clientId} />
        </>
      )}
      <div className="mt-auto"><SidebarUser /></div>
    </aside>
  );
}
