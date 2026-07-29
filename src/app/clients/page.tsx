"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type Client = { id: string; name: string };

/**
 * Onboarding：入嚟唔好停喺空白 / 客戶清單。
 * 有品牌 → 自動入第一個品牌（釘選置頂優先，同側欄一致）嘅「廣告活動圖」tab（= /clients/[id]）。
 * 一個品牌都冇 → 先顯示「還沒有客戶」空狀態。
 */
export default function ClientsPage() {
  const router = useRouter();
  const [empty, setEmpty] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/clients")
      .then((r) => r.json())
      .then((clients: Client[]) => {
        if (cancelled) return;
        if (!Array.isArray(clients) || clients.length === 0) { setEmpty(true); return; }
        let pinned: Record<string, number> = {};
        try { pinned = JSON.parse(localStorage.getItem("pinnedBrands") || "{}"); } catch { /* ignore */ }
        const sorted = [...clients].sort((a, b) => {
          const pa = pinned[a.id], pb = pinned[b.id];
          if (pa && pb) return pb - pa;
          if (pa) return -1;
          if (pb) return 1;
          return 0;
        });
        router.replace(`/clients/${sorted[0].id}`);
      })
      .catch(() => { if (!cancelled) setEmpty(true); });
    return () => { cancelled = true; };
  }, [router]);

  if (!empty) {
    return <div className="flex items-center justify-center h-96 text-gray-400 text-sm">載入中…</div>;
  }

  return (
    <div className="flex flex-col items-center justify-center h-96 gap-4 text-center">
      <h1 className="text-2xl font-semibold text-gray-800">還沒有客戶</h1>
      <p className="text-gray-500">從左側新增你的第一個客戶資料夾</p>
      <Link href="/clients/new">
        <Button>＋ 新增客戶</Button>
      </Link>
    </div>
  );
}
