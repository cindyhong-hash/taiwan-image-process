"use client";

import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";

// 匯出頁頂列：返回 + 列印/存 PDF。列印時整條隱藏（print:hidden）。
export function ExportPrintBar({ backHref }: { backHref: string }) {
  return (
    <div className="no-print sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white/90 px-6 py-3 backdrop-blur">
      <Link href={backHref} className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900">
        <ArrowLeft className="h-4 w-4" />返回日曆
      </Link>
      <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-full bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700">
        <Printer className="h-4 w-4" />列印 / 存成 PDF
      </button>
    </div>
  );
}
