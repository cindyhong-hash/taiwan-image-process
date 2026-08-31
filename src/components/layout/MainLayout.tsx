"use client";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { TopHeader } from "./TopHeader";

export function MainLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Magic Layers 編輯器要滿版（自己管理捲動/縮放），去掉外層 padding 讓它貼齊側邊欄與頂部。
  const fullBleed = !!pathname && pathname.includes("/magic-layers/compose");
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopHeader />
        <main className={fullBleed ? "min-h-0 flex-1 overflow-auto" : "flex-1 overflow-auto p-8"}>{children}</main>
      </div>
    </div>
  );
}
