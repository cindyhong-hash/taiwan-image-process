"use client";
import { Layers } from "lucide-react";
import { LibraryWorkspace } from "@/components/library/LibraryWorkspace";

// wireframe 後續：取消「全部」跨品牌視圖後，clientId 為 null 嘅素材改由呢度（未分組）收納。
export default function UnassignedLibraryPage() {
  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <Layers className="h-5 w-5 text-gray-500" />
        <h1 className="text-xl font-semibold">未分組素材</h1>
        <span className="text-xs text-gray-400">（未指派品牌嘅素材）</span>
      </div>
      <LibraryWorkspace clientId={null} unassigned />
    </div>
  );
}
