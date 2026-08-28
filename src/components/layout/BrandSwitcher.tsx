"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Plus } from "lucide-react";
import { setLastClientId } from "@/lib/lastClient";

type Brand = { id: string; name: string };

export function BrandSwitcher({ currentClientId }: { currentClientId: string }) {
  const router = useRouter();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => { fetch("/api/clients").then(r => r.json()).then(setBrands).catch(() => {}); }, []);
  const current = brands.find(b => b.id === currentClientId);
  const pick = (id: string) => { setOpen(false); setLastClientId(id); router.push(`/clients/${id}`); };
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(v => !v)}
        className="flex w-full items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50">
        <span className="truncate font-medium text-gray-800">{current?.name ?? "選擇品牌"}</span>
        <ChevronDown className="h-3 w-3 text-gray-400" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 z-50 mt-1 rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
            {brands.map(b => (
              <button key={b.id} type="button" onClick={() => pick(b.id)}
                className={`block w-full px-3 py-2 text-left text-sm hover:bg-gray-50 ${b.id === currentClientId ? "text-violet-600 font-medium" : "text-gray-700"}`}>
                {b.name}
              </button>
            ))}
            <div className="my-1 border-t border-gray-100" />
            <button type="button" onClick={() => { setOpen(false); router.push("/clients/new"); }}
              className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-sm text-gray-600 hover:bg-gray-50">
              <Plus className="h-3.5 w-3.5" /> 新增品牌
            </button>
          </div>
        </>
      )}
    </div>
  );
}
