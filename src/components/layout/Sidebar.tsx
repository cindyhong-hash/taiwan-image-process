"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { FolderOpen, Plus, Trash2, Layers, Pin } from "lucide-react";
import { Button } from "@/components/ui/button";

type Client = { id: string; name: string; _count: { activities: number } };

/**
 * 「未分類素材」（clientId=null）已從 layout 隱藏 —— 屬未採用 / 待清理素材，唔再喺側欄出現。
 * 仍可用 URL /unassigned 入去 recover（搬返去某品牌）；清理同回收方法見 docs/UNUSED-ASSETS.md。
 * 將來想喺側欄攞返呢個入口：改 true 即可。
 */
const SHOW_UNASSIGNED_LINK = false;

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // 釘選品牌（localStorage）：{ brandId: 釘選時間戳 }。釘咗永遠置頂，最新釘嘅最上。
  const [pinned, setPinned] = useState<Record<string, number>>({});
  useEffect(() => {
    try { setPinned(JSON.parse(localStorage.getItem("pinnedBrands") || "{}")); } catch { /* ignore */ }
  }, []);
  const togglePin = (e: React.MouseEvent, id: string) => {
    e.preventDefault(); e.stopPropagation();
    setPinned((prev) => {
      const next = { ...prev };
      if (next[id]) delete next[id]; else next[id] = Date.now();
      try { localStorage.setItem("pinnedBrands", JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };
  // 釘選（依釘選時間新→舊）置頂，其餘保持原有次序。
  const sortedClients = [...clients].sort((a, b) => {
    const pa = pinned[a.id], pb = pinned[b.id];
    if (pa && pb) return pb - pa;
    if (pa) return -1;
    if (pb) return 1;
    return 0;
  });

  const loadClients = () => {
    fetch("/api/clients")
      .then((r) => r.json())
      .then(setClients);
  };

  useEffect(() => {
    loadClients();
  }, [pathname]);

  const handleDelete = async (e: React.MouseEvent, clientId: string, clientName: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`確定要刪除「${clientName}」嗎？此客戶的所有活動也會一併刪除。`)) return;
    setDeletingId(clientId);
    await fetch(`/api/clients/${clientId}`, { method: "DELETE" });
    setDeletingId(null);
    loadClients();
    if (pathname.startsWith(`/clients/${clientId}`)) {
      router.push("/clients");
    }
  };

  return (
    <aside className="w-60 min-h-screen border-r bg-gray-50 flex flex-col p-3 gap-1 shrink-0">
      <div className="flex items-center justify-between px-2 py-1 mb-2">
        <span className="font-semibold text-sm text-gray-700">品牌</span>
        <Link href="/clients/new">
          <Button variant="ghost" size="icon" className="h-6 w-6">
            <Plus className="h-4 w-4" />
          </Button>
        </Link>
      </div>

      {clients.length === 0 && (
        <div className="px-2 text-xs text-gray-400">尚無客戶，點 + 新增</div>
      )}

      {sortedClients.map((client) => {
        const isPinned = !!pinned[client.id];
        return (
          <Link key={client.id} href={`/clients/${client.id}`} className="block group">
            <div
              className={`flex items-center gap-2 px-2 py-2 rounded-md text-sm cursor-pointer hover:bg-gray-100 ${
                pathname.startsWith(`/clients/${client.id}`) ? "bg-gray-200 font-medium" : ""
              }`}
            >
              {/* 釘選：擺最左（遠離右邊刪除掣，避免撳錯）；已釘→紫色常顯，未釘→hover 淡入。slot 常留位免跳動。 */}
              <button
                onClick={(e) => togglePin(e, client.id)}
                title={isPinned ? "取消釘選" : "釘選置頂"}
                className={`shrink-0 w-5 h-5 flex items-center justify-center rounded hover:bg-violet-100 transition-all ${
                  isPinned ? "text-violet-600" : "text-gray-400 opacity-0 group-hover:opacity-100 hover:text-violet-600"
                }`}
              >
                <Pin className={`h-3.5 w-3.5 ${isPinned ? "fill-violet-600" : ""}`} />
              </button>
              <FolderOpen className="h-4 w-4 text-gray-500 shrink-0" />
              <span className="truncate flex-1">{client.name}</span>
              <button
                onClick={(e) => handleDelete(e, client.id, client.name)}
                disabled={deletingId === client.id}
                className="hidden group-hover:flex items-center justify-center w-5 h-5 rounded hover:bg-red-100 text-gray-400 hover:text-red-500 transition-colors"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </Link>
        );
      })}

      {/* 未分類素材（clientId=null）入口已隱藏 —— 見上方 SHOW_UNASSIGNED_LINK 註解。 */}
      {SHOW_UNASSIGNED_LINK && (
        <div className="mt-auto pt-2 border-t">
          <Link href="/unassigned">
            <div
              className={`flex items-center gap-2 px-2 py-2 rounded-md text-sm cursor-pointer hover:bg-gray-100 ${
                pathname === "/unassigned" ? "bg-gray-200 font-medium" : "text-gray-600"
              }`}
            >
              <Layers className="h-4 w-4 text-gray-500 shrink-0" />
              <span>未分組素材</span>
            </div>
          </Link>
        </div>
      )}
    </aside>
  );
}
