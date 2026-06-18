"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { FolderOpen, Plus, Library, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type Client = { id: string; name: string; _count: { activities: number } };

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadClients = () => {
    fetch("/api/clients")
      .then((r) => r.json())
      .then(setClients);
  };

  useEffect(() => {
    loadClients();
  }, [pathname]);

  // 素材庫 has its own client-folder column (with a 《 back link), so hide the global sidebar there.
  if (pathname === "/library") return null;

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
        <span className="font-semibold text-sm text-gray-700">客戶</span>
        <Link href="/clients/new">
          <Button variant="ghost" size="icon" className="h-6 w-6">
            <Plus className="h-4 w-4" />
          </Button>
        </Link>
      </div>

      {clients.length === 0 && (
        <div className="px-2 text-xs text-gray-400">尚無客戶，點 + 新增</div>
      )}

      {clients.map((client) => (
        <Link key={client.id} href={`/clients/${client.id}`} className="block group">
          <div
            className={`flex items-center gap-2 px-2 py-2 rounded-md text-sm cursor-pointer hover:bg-gray-100 ${
              pathname.startsWith(`/clients/${client.id}`) ? "bg-gray-200 font-medium" : ""
            }`}
          >
            <FolderOpen className="h-4 w-4 text-gray-500 shrink-0" />
            <span className="truncate flex-1">{client.name}</span>
            <span className="text-xs text-gray-400 group-hover:hidden">
              {client._count.activities}
            </span>
            <button
              onClick={(e) => handleDelete(e, client.id, client.name)}
              disabled={deletingId === client.id}
              className="hidden group-hover:flex items-center justify-center w-5 h-5 rounded hover:bg-red-100 text-gray-400 hover:text-red-500 transition-colors"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </Link>
      ))}

      <div className="mt-auto">
        <Link href="/library">
          <div
            className={`flex items-center gap-2 px-2 py-2 rounded-md text-sm cursor-pointer hover:bg-gray-100 ${
              pathname === "/library" ? "bg-gray-200 font-medium" : ""
            }`}
          >
            <Library className="h-4 w-4 text-gray-500" />
            <span>素材庫</span>
          </div>
        </Link>
      </div>
    </aside>
  );
}
