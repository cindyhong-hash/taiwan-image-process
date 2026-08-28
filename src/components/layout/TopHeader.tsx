"use client";
import { usePathname } from "next/navigation";
import { HelpCircle, Bell } from "lucide-react";

// 專注型頁面（建立/編輯流程）本身有自己的頁首（返回 + 已選版型 等），不再疊全域頂欄。
const HIDE_ON = [
  /\/activities\/new/,              // 單圖 / 多圖 生成表單
  /\/activities\/[^/]+\/edit/,      // 編輯
  /\/activities\/[^/]+\/editor/,    // 微調編輯器
  /\/activities\/[^/]+$/,           // 生成結果 / 版型選擇（step4-generation-results）
  /\/magic-layers/,                 // Magic Layers 編輯器
];

export function TopHeader() {
  const pathname = usePathname();
  if (HIDE_ON.some((re) => re.test(pathname))) return null;
  return (
    <header className="flex h-16 items-center justify-end gap-4 border-b border-gray-200 bg-gray-50 px-8">
      <button type="button" className="text-gray-400 hover:text-gray-600"><HelpCircle className="h-5 w-5" /></button>
      <button type="button" className="relative text-gray-400 hover:text-gray-600">
        <Bell className="h-5 w-5" />
        <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-medium text-white">3</span>
      </button>
    </header>
  );
}
