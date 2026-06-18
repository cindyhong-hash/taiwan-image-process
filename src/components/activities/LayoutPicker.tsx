"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

type Layout = { id: string; layoutType: string; imageUrl: string; copyText: string };

const LAYOUT_META: Record<string, { label: string; description: string }> = {
  A: { label: "產品置中", description: "清晰展示" },
  B: { label: "視覺強烈", description: "設計感強" },
  C: { label: "氣氛感", description: "品牌形象" },
};

type Props = {
  layouts: Layout[];
  selectedId?: string;
  activityId: string;
  clientId: string;
  onSelect: (layoutId: string) => void;
};

export function LayoutPicker({ layouts, selectedId, activityId, clientId, onSelect }: Props) {
  return (
    <div className="space-y-6">
      <h2 className="font-medium text-gray-700">選擇一款版型</h2>
      <div className="grid grid-cols-3 gap-4">
        {layouts.map((layout) => {
          const meta = LAYOUT_META[layout.layoutType];
          const isSelected = layout.id === selectedId;
          return (
            <div
              key={layout.id}
              onClick={() => onSelect(layout.id)}
              className={`cursor-pointer rounded-xl border-2 overflow-hidden transition-all ${
                isSelected ? "border-black shadow-lg" : "border-gray-200 hover:border-gray-400"
              }`}
            >
              <div className="relative">
                <img
                  src={layout.imageUrl}
                  alt={`Layout ${layout.layoutType}`}
                  className="w-full aspect-square object-cover"
                />
                {isSelected && (
                  <div className="absolute top-2 right-2 bg-black text-white rounded-full p-1">
                    <Check className="h-3 w-3" />
                  </div>
                )}
              </div>
              <div className="p-3">
                <div className="font-medium text-sm">
                  Layout {layout.layoutType} — {meta?.label}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">{meta?.description}</div>
                <div className="text-xs text-gray-600 mt-2 line-clamp-3 whitespace-pre-line">
                  {layout.copyText}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {selectedId && (
        <div className="flex justify-end">
          <Link href={`/clients/${clientId}/activities/${activityId}/editor`}>
            <Button>進入微調畫布 →</Button>
          </Link>
        </div>
      )}
    </div>
  );
}
