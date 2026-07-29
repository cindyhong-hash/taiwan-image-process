"use client";
/**
 * LibraryImagePickerModal — 從素材庫（client gallery）揀一張圖做「活動圖參考圖」。
 * Tag / filter banner 樣式跟返素材庫 gallery（ComponentGrid FILTER_META）：solid 色 icon pill + icon filter。
 * 搜尋涵蓋 標題 + AI Prompt 文字。點一張即回傳 imageUrl。
 */
import { useEffect, useMemo, useState } from "react";
import { X, Search, LayoutGrid, Package, Image as ImageIcon, UserRound, Palette, Paperclip, type LucideIcon } from "lucide-react";

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

// 同 ComponentGrid FILTER_META 一致：lucide icon + 每類 solid 底色（tag 用 cls，filter 選中用 activeCls）。
const META: Record<TypeKey, { label: string; Icon: LucideIcon; cls: string; activeCls: string }> = {
  product:      { label: "產品成圖", Icon: Package,    cls: "bg-violet-600", activeCls: "bg-violet-600 text-white border-violet-600" },
  background:   { label: "背景",     Icon: ImageIcon,  cls: "bg-teal-600",   activeCls: "bg-teal-600 text-white border-teal-600" },
  person:       { label: "人像",     Icon: UserRound,  cls: "bg-rose-500",   activeCls: "bg-rose-500 text-white border-rose-500" },
  illustration: { label: "插畫",     Icon: Palette,    cls: "bg-amber-500",  activeCls: "bg-amber-500 text-white border-amber-500" },
  reference:    { label: "參考圖",   Icon: Paperclip,  cls: "bg-blue-500",   activeCls: "bg-blue-500 text-white border-blue-500" },
};
const ALL_META = { label: "全部", Icon: LayoutGrid, activeCls: "bg-violet-600 text-white border-violet-600" };

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
  title = "從素材庫揀圖",
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
      <div className="relative w-full max-w-3xl h-[80vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b shrink-0">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="px-4 pt-2.5 pb-2 border-b bg-gray-50/60 shrink-0 space-y-2">
          {/* 品牌切換：預設鎖當前品牌；撳「全部品牌」可跨品牌揀（同積木 picker 一致）*/}
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => setFilterClientId("")}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                filterClientId === "" ? "bg-gray-900 text-white border-gray-900" : "bg-white border-gray-200 text-gray-600 hover:border-gray-400"}`}>
              全部品牌
            </button>
            {clients.map((c) => (
              <button type="button" key={c.id} onClick={() => setFilterClientId(c.id)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  filterClientId === c.id ? "bg-gray-900 text-white border-gray-900" : "bg-white border-gray-200 text-gray-600 hover:border-gray-400"}`}>
                {c.name}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜尋標題 / AI Prompt…"
              className="w-full border border-gray-300 rounded-full pl-9 pr-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-violet-300" />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {pills.map((k) => {
              const m = k === "ALL" ? ALL_META : META[k];
              const Icon = m.Icon;
              const active = typeFilter === k;
              const cnt = k === "ALL" ? withType.length : (counts[k] ?? 0);
              return (
                <button key={k} type="button" onClick={() => setTypeFilter(k)}
                  className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition-colors ${active ? m.activeCls : "bg-white text-gray-500 border-gray-200 hover:border-gray-400"}`}>
                  <Icon className="h-3 w-3" />{m.label} <span className="opacity-60">{cnt}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="text-center text-gray-400 py-10 text-sm">載入中…</div>
          ) : filtered.length === 0 ? (
            <div className="text-center text-gray-400 py-10 text-sm">冇符合嘅素材</div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {filtered.map(({ it, t }) => {
                const m = META[t];
                const Icon = m.Icon;
                return (
                  <button type="button" key={it.imageUrl} onClick={() => onPick(it.imageUrl, it.prompt || it.aiPromptText || "")} title={it.subject || it.name || ""}
                    className="group relative rounded-xl border border-gray-200 overflow-hidden hover:border-violet-400 hover:shadow-md transition-all">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={it.imageUrl} alt="" loading="lazy" decoding="async" className="w-full aspect-square object-contain bg-gray-50" />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors pointer-events-none" />
                    <span className={`absolute top-2 left-2 flex items-center gap-1 text-[10px] font-semibold ${m.cls} text-white px-1.5 py-0.5 rounded-full shadow whitespace-nowrap pointer-events-none`}>
                      <Icon className="h-2.5 w-2.5" />{m.label}
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
