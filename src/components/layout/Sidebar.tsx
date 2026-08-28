"use client";
import { useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { PanelLeft, PanelLeftOpen } from "lucide-react";
import { BrandSwitcher } from "./BrandSwitcher";
import { SidebarNav } from "./SidebarNav";
import { SidebarUser } from "./SidebarUser";
import { getLastClientId } from "@/lib/lastClient";
import { useSidebarCollapsed } from "@/lib/useSidebarCollapsed";

const noopSubscribe = () => () => {};

export function Sidebar() {
  const pathname = usePathname();
  const m = pathname.match(/^\/clients\/([^/]+)/);
  const pathClientId = m && m[1] !== "new" ? m[1] : null;
  // 路徑沒有品牌（如 /magic-layers、/clients 清單）→ 退回「上次品牌」，
  // 讓側欄 nav 不會整個空掉（例：從品牌首頁點自由排版進 magic-layers）。
  // useSyncExternalStore：SSR 回 null、client mount 後讀 localStorage，無 hydration 落差。
  const lastId = useSyncExternalStore(noopSubscribe, getLastClientId, () => null);
  const clientId = pathClientId ?? lastId;
  const [collapsed, toggleCollapsed] = useSidebarCollapsed();

  if (collapsed) {
    return (
      <aside className="flex w-16 shrink-0 flex-col items-center border-r border-gray-200 bg-white p-4">
        <button
          type="button"
          onClick={toggleCollapsed}
          title="展開側欄"
          className="mb-6 flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-50"
        >
          <PanelLeftOpen className="h-5 w-5" />
        </button>
        {clientId && <SidebarNav currentClientId={clientId} collapsed />}
        <div className="mt-auto"><SidebarUser collapsed /></div>
      </aside>
    );
  }

  return (
    <aside className="flex w-[220px] shrink-0 flex-col border-r border-gray-200 bg-white p-4">
      <div className="mb-6 flex items-center justify-between px-1">
        <span className="text-lg font-bold text-gray-900">Content</span>
        <button
          type="button"
          onClick={toggleCollapsed}
          title="收合側欄"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-50"
        >
          <PanelLeft className="h-5 w-5" />
        </button>
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
