"use client";
/**
 * SlotPickerModal — click a composer slot → pick an existing component of that type.
 * Brand filter: horizontal pills (not dropdown). Items: image thumbnail + text overlay.
 */
import { useEffect, useState } from "react";
import { X, Loader2, Search } from "lucide-react";
import type { StyleComponent, ComponentCategory } from "@/types/library";
import { CATEGORY_META, getColors } from "@/types/library";
import { ColorCards } from "./ColorCards";

type Client = { id: string; name: string };

type Props = {
  clientId: string | null;
  category: ComponentCategory;
  onPick: (comp: StyleComponent) => void;
  onClose: () => void;
};

export function SlotPickerModal({ clientId, category, onPick, onClose }: Props) {
  const [items, setItems] = useState<StyleComponent[]>([]);
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<Client[]>([]);
  const [filterClientId, setFilterClientId] = useState<string>(clientId ?? "");
  const [search, setSearch] = useState("");
  const meta = CATEGORY_META[category];

  useEffect(() => {
    fetch("/api/clients")
      .then((r) => r.json())
      .then((data: Client[]) => setClients(Array.isArray(data) ? data : []));
  }, []);

  useEffect(() => {
    setLoading(true);
    const url = filterClientId ? `/api/components?clientId=${filterClientId}` : "/api/components";
    fetch(url)
      .then((r) => r.json())
      .then((comps: StyleComponent[]) =>
        setItems(Array.isArray(comps) ? comps.filter((c) => c.type === category) : []),
      )
      .finally(() => setLoading(false));
  }, [filterClientId, category]);

  // 背景 is now an image-only asset — hide legacy text-only backgrounds (no image).
  const visible = category === "BACKGROUND"
    ? items.filter((c) => c.previewUrl || c.data?.imageUrl)
    : items;
  const filtered = search.trim()
    ? visible.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
    : visible;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-5xl h-[85vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b shrink-0">
          <h2 className={`text-sm font-semibold ${meta.color}`}>選擇{meta.label}積木</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><X className="h-4 w-4" /></button>
        </div>

        {/* Brand pills filter */}
        <div className="px-4 pt-3 pb-2 shrink-0 border-b bg-gray-50/60 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setFilterClientId("")}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                filterClientId === "" ? "bg-gray-900 text-white border-gray-900" : "bg-white border-gray-200 text-gray-600 hover:border-gray-400"}`}>
              全部品牌
            </button>
            {clients.map((c) => (
              <button key={c.id}
                onClick={() => setFilterClientId(c.id)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  filterClientId === c.id ? "bg-gray-900 text-white border-gray-900" : "bg-white border-gray-200 text-gray-600 hover:border-gray-400"}`}>
                {c.name}
              </button>
            ))}
          </div>
          {/* Text search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="搜尋名稱…"
              className="w-full pl-8 pr-3 py-2 rounded-lg border border-gray-200 bg-white text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-400" />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 text-sm text-gray-400 py-8">
              <Loader2 className="h-4 w-4 animate-spin" />載入中…
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10 text-sm text-gray-400">
              {items.length === 0 ? `尚無${meta.label}素材，請先用「上傳參考圖」或「素材生成」建立。` : "找不到符合的素材"}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {filtered.map((comp) => (
                <div key={comp.id} role="button" tabIndex={0}
                  onClick={() => { onPick(comp); onClose(); }}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(comp); onClose(); } }}
                  className={`relative rounded-xl border overflow-hidden text-left cursor-pointer transition-all hover:shadow-lg hover:scale-[1.01] ${meta.bg} ${meta.border}`}>
                  {/* Image preview (same as ComponentCard in 風格組件) */}
                  {comp.previewUrl ? (
                    <div className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={comp.previewUrl} alt={comp.name} loading="lazy" decoding="async" className={`w-full object-cover ${comp.type === "BACKGROUND" ? "aspect-square" : "h-32"}`} />
                      <div className="absolute inset-0 bg-gradient-to-b from-black/60 to-black/10" />
                      <div className="absolute top-2.5 left-2.5 right-2.5">
                        <div className="text-sm font-semibold text-white leading-snug drop-shadow line-clamp-2">{comp.name}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="px-4 pt-4">
                      <div className={`text-sm font-semibold mb-1 line-clamp-2 ${meta.color}`}>{comp.name}</div>
                    </div>
                  )}
                  {/* Content preview — matches ComponentCard in 風格組件 */}
                  <div className="px-4 pb-4 pt-2">
                    {comp.type === "COLOR_SCHEME" && (
                      <ColorCards colors={getColors(comp.data)} height="h-16" />
                    )}
                    {comp.type === "COMPOSITION" && (
                      <p className="text-xs text-gray-600 line-clamp-3 leading-relaxed">{(comp.data.description as string) ?? ""}</p>
                    )}
                    {comp.type === "COPY_TONE" && (
                      <div className="flex flex-wrap gap-1">
                        {((comp.data.toneLabels as string[]) ?? []).map((t, i) => (
                          <span key={i} className="text-[11px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full border border-amber-200">{t}</span>
                        ))}
                      </div>
                    )}
                    {comp.type === "BACKGROUND" && !comp.previewUrl && Boolean(comp.data.imageUrl) && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={comp.data.imageUrl as string} alt="bg" className="w-full h-20 object-cover rounded-lg border" />
                    )}
                    {comp.type === "BACKGROUND" && Boolean(comp.data.description) && !comp.data.imageUrl && (
                      <p className="text-xs text-gray-600 line-clamp-3 leading-relaxed">{comp.data.description as string}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
