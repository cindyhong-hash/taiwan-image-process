"use client";
/**
 * ComponentSelector — 三個下拉選單版本
 * 分別對應構圖 / 配色，各自單選，選取後以 chip 顯示。
 */
import { useEffect, useState } from "react";
import { X, ChevronDown } from "lucide-react";

type StyleComponent = {
  id: string;
  name: string;
  type: "COMPOSITION" | "COLOR_SCHEME" | "COPY_TONE";
  data: Record<string, unknown>;
  aiPromptText: string;
  clientId: string | null;
};

const SLOTS = [
  { type: "COMPOSITION" as const, label: "構圖風格", placeholder: "選擇構圖" },
  { type: "COLOR_SCHEME" as const, label: "配色方案", placeholder: "選擇配色" },
] as const;

const CHIP_COLOR: Record<string, string> = {
  COMPOSITION: "bg-indigo-50 text-indigo-700 border-indigo-200",
  COLOR_SCHEME: "bg-rose-50   text-rose-700   border-rose-200",
  COPY_TONE:   "bg-amber-50  text-amber-700  border-amber-200",
};

type Props = {
  clientId: string;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
};

export function ComponentSelector({ clientId, selectedIds, onChange }: Props) {
  const [components, setComponents] = useState<StyleComponent[]>([]);

  useEffect(() => {
    fetch(`/api/components?clientId=${clientId}`)
      .then((r) => r.json())
      .then(setComponents)
      .catch(() => {});
  }, [clientId]);

  const byType = (type: string) => components.filter((c) => c.type === type);

  const selectedFor = (type: string) =>
    components.find((c) => c.type === type && selectedIds.includes(c.id)) ?? null;

  const select = (type: string, id: string) => {
    // Remove any existing selection of this type first
    const others = selectedIds.filter(
      (sid) => !components.find((c) => c.id === sid && c.type === type)
    );
    // "__none__" or "" = explicitly clear; any real id = add
    onChange(id && id !== "__none__" ? [...others, id] : others);
  };

  const clear = (type: string) => select(type, "");

  if (components.length === 0) {
    return (
      <p className="text-xs text-gray-400 italic py-1">
        此客戶尚無風格組件（生成第一個活動後自動建立）
      </p>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-3">
      {SLOTS.map(({ type, label, placeholder }) => {
        const options = byType(type);
        const selected = selectedFor(type);
        if (options.length === 0) return null;

        return (
          <div key={type} className="space-y-1.5">
            <label className="text-xs font-medium text-gray-500">{label}</label>

            {selected ? (
              /* Selected chip */
              <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium ${CHIP_COLOR[type]}`}>
                <span className="truncate flex-1">
                  {selected.name.replace(/-\d{4}\/\d+\/\d+$/, "")}
                </span>
                <button
                  type="button"
                  onClick={() => clear(type)}
                  className="shrink-0 opacity-60 hover:opacity-100"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              /* Dropdown */
              <div className="relative">
                <select
                  value=""
                  onChange={(e) => select(type, e.target.value)}
                  className="w-full appearance-none border border-gray-200 rounded-lg px-3 py-1.5 pr-7 text-xs text-gray-500 bg-white focus:outline-none focus:ring-2 focus:ring-gray-300 cursor-pointer"
                >
                  <option value="">{placeholder}</option>
                  <option value="__none__">不套用</option>
                  {options.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name.replace(/-\d{4}\/\d+\/\d+$/, "")}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
