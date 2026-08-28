"use client";
import { useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { PanelLeft } from "lucide-react";
import { BrandSwitcher } from "./BrandSwitcher";
import { SidebarNav } from "./SidebarNav";
import { SidebarUser } from "./SidebarUser";
import { getLastClientId } from "@/lib/lastClient";

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
