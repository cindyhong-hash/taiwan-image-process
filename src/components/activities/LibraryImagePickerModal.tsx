"use client";
/**
 * LibraryImagePickerModal — 從素材庫（client gallery）揀一張圖做「活動圖參考圖」。
 * Tag / filter banner 樣式跟返素材庫 gallery（ComponentGrid FILTER_META）：solid 色 icon pill + icon filter。
 * 搜尋涵蓋 標題 + AI Prompt 文字。點一張即回傳 imageUrl。
 */
import { useEffect, useMemo, useState } from "react";
import { X, Search, LayoutGrid, Package, Mountain, UserRound, Palette, Paperclip, type LucideIcon } from "lucide-react";

type GalleryItem = {
  kind: "generated" | "uploaded" | "material";
  imageUrl: string;
  name?: string;
  subject?: string;
  prompt?: string;
  aiPromptText?: string;
  paramsJson?: string;
};

type TypeKey = "product" | "background" | "person" | "illustration" | "reference";
type Client = { id: string; name: string };

// 圖卡上的分類標籤：每類保留自己顏色，但用淺底＋深字（pastel），跟 Figma。
const META: Record<TypeKey, { label: string; Icon: LucideIcon; badge: string }> = {
  product:      { label: "產品成圖", Icon: Package,    badge: "bg-gray-100 text-gray-600" },
  background:   { label: "背景",     Icon: Mountain,   badge: "bg-emerald-100 text-emerald-700" },
  person:       { label: "人像",     Icon: UserRound,  badge: "bg-violet-100 text-violet-700" },
  illustration: { label: "插畫",     Icon: Palette,    badge: "bg-rose-100 text-rose-600" },
  reference:    { label: "參考圖",   Icon: Paperclip,  badge: "bg-blue-100 text-blue-600" },
};
const ALL_META = { label: "全部", Icon: LayoutGrid };
// 下方分類 chip 統一色：選中一律品牌紫、未選白底灰字（不分類上色，跟 Figma）。
const CHIP_ACTIVE = "bg-violet-600 text-white border-violet-600";
const CHIP_IDLE = "bg-white text-gray-600 border-gray-200 hover:border-gray-300";

function itemType(it: GalleryItem): TypeKey {
  if (it.kind === "material") return "background";
  if (it.kind === "uploaded") return "reference";
  try {
    const g = JSON.parse(it.paramsJson ?? "{}").genType as string | undefined;
    if (g === "person") return "person";
    if (g === "illustration") return "illustration";
    if (g === "reference") return "reference";
  } catch { /* ignore */ }
  return "product";
}

export function LibraryImagePickerModal({
  clientId,
  onPick,
  onClose,
  title = "從素材庫選圖",
}: {
  clientId: string;
  onPick: (url: string, promptText?: string) => void; // 連帶回傳該圖已有嘅 AI Prompt（免再分析）
  onClose: () => void;
  title?: string;
}) {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeKey | "ALL">("ALL");
  const [clients, setClients] = useState<Client[]>([]);
  const [filterClientId, setFilterClientId] = useState<string>(clientId ?? ""); // 預設鎖當前品牌

  useEffect(() => {
    fetch("/api/clients").then((r) => r.json()).then((d: Client[]) => setClients(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    // [WIP / 待 auth] 「全部品牌」= 唔傳 clientId → gallery API 攞晒所有 client 素材。
    // 將來接 login 後，呢度應 scope 做「登入用戶自己 account 內品牌」，唔可見其他用戶 client 素材。
    const url = filterClientId ? `/api/library/gallery?clientId=${filterClientId}` : "/api/library/gallery";
    fetch(url)
      .then((r) => r.json())
      .then((d: GalleryItem[]) => setItems(Array.isArray(d) ? d.filter((i) => i.imageUrl) : []))
      .finally(() => setLoading(false));
  }, [filterClientId]);

  const withType = useMemo(() => items.map((it) => ({ it, t: itemType(it) })), [items]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const { t } of withType) c[t] = (c[t] ?? 0) + 1;
    return c;
  }, [withType]);

  const filtered = withType.filter(({ it, t }) => {
    if (typeFilter !== "ALL" && t !== typeFilter) return false;
    if (!q.trim()) return true;
    const hay = `${it.subject ?? ""} ${it.name ?? ""} ${it.prompt ?? ""} ${it.aiPromptText ?? ""}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  const pills: (TypeKey | "ALL")[] = ["ALL", "reference", "background", "person", "illustration", "product"];

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-3xl h-[80vh] bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 pt-5 pb-3 shrink-0">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"><X className="h-4 w-4" /></button>
        </div>
        <div className="px-6 pb-3 shrink-0 space-y-3">
          {/* 品牌切換：預設鎖當前品牌；撳「全部品牌」可跨品牌揀。選中＝紫色外框（跟 Figma）*/}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setFilterClientId("")}
              className={`text-sm px-4 py-1.5 rounded-full border transition-colors ${
                filterClientId === "" ? "bg-white border-violet-400 text-violet-600 font-medium" : "bg-white border-gray-200 text-gray-700 hover:border-gray-300"}`}>
              全部品牌
            </button>
            {clients.map((c) => (
              <button type="button" key={c.id} onClick={() => setFilterClientId(c.id)}
                className={`text-sm px-4 py-1.5 rounded-full border transition-colors ${
                  filterClientId === c.id ? "bg-white border-violet-400 text-violet-600 font-medium" : "bg-white border-gray-200 text-gray-700 hover:border-gray-300"}`}>
                {c.name}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜尋標題 / AI Prompt…"
              className="w-full border border-gray-200 rounded-xl pl-10 pr-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-gray-400" />
          </div>
          <div className="flex gap-2 flex-wrap">
            {pills.map((k) => {
              const m = k === "ALL" ? ALL_META : META[k];
              const Icon = m.Icon;
              const active = typeFilter === k;
              const cnt = k === "ALL" ? withType.length : (counts[k] ?? 0);
              return (
                <button key={k} type="button" onClick={() => setTypeFilter(k)}
                  className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full border transition-colors ${active ? CHIP_ACTIVE : CHIP_IDLE}`}>
                  <Icon className="h-3.5 w-3.5" />{m.label} <span className="opacity-60">{cnt}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-6 pb-6 pt-1">
          {loading ? (
            <div className="text-center text-gray-400 py-10 text-sm">載入中…</div>
          ) : filtered.length === 0 ? (
            <div className="text-center text-gray-400 py-10 text-sm">沒有符合的素材</div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {filtered.map(({ it, t }) => {
                const m = META[t];
                const Icon = m.Icon;
                return (
                  <button type="button" key={it.imageUrl} onClick={() => onPick(it.imageUrl, it.prompt || it.aiPromptText || "")} title={it.subject || it.name || ""}
                    className="group relative rounded-2xl border border-gray-200 p-1.5 bg-white hover:border-violet-400 hover:shadow-md transition-all">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={it.imageUrl} alt="" loading="lazy" decoding="async" className="w-full aspect-square object-contain bg-gray-50 rounded-xl" />
                    <div className="absolute inset-1.5 rounded-xl bg-black/0 group-hover:bg-black/10 transition-colors pointer-events-none" />
                    <span className={`absolute top-3 left-3 flex items-center gap-1 text-[11px] font-medium ${m.badge} px-2 py-0.5 rounded-full whitespace-nowrap pointer-events-none`}>
                      <Icon className="h-3 w-3" />{m.label}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
