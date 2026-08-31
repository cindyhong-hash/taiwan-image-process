"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { HelpCircle, Bell, CheckCircle2, Sparkles, PlayCircle, X } from "lucide-react";

// 專注型頁面（建立/編輯流程）本身有自己的頁首（返回 + 已選版型 等），不再疊全域頂欄。
const HIDE_ON = [
  /\/activities\/new/,              // 單圖 / 多圖 生成表單
  /\/activities\/[^/]+\/edit/,      // 編輯
  /\/activities\/[^/]+\/editor/,    // 微調編輯器
  /\/activities\/[^/]+$/,           // 生成結果 / 版型選擇（step4-generation-results）
  /\/magic-layers/,                 // Magic Layers 編輯器
];

type NotiItem = { id: string; title: string; time: string; href?: string };

function timeAgo(iso?: string): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "剛剛";
  if (m < 60) return `${m} 分鐘前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小時前`;
  const d = Math.floor(h / 24);
  return d === 1 ? "昨天" : `${d} 天前`;
}

export function TopHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState<"help" | "noti" | null>(null);
  const [notis, setNotis] = useState<NotiItem[]>([]);

  // clientId 來自路由 /clients/[clientId]/…；用來拉「已完成作品」當通知來源。
  const clientId = pathname.match(/\/clients\/([^/]+)/)?.[1];

  useEffect(() => {
    if (!clientId) { setNotis([]); return; }
    let ok = true;
    fetch(`/api/clients/${clientId}`)
      .then((r) => r.json())
      .then((c) => {
        if (!ok) return;
        const acts: { id: string; theme: string; status: string; createdAt: string }[] = c.activities ?? [];
        const items = acts
          .filter((a) => a.status === "DONE")
          .slice(0, 6)
          .map((a) => ({ id: a.id, title: `您的作品「${a.theme}」已生成完成`, time: timeAgo(a.createdAt), href: `/clients/${clientId}/activities/${a.id}` }));
        setNotis(items);
      })
      .catch(() => { if (ok) setNotis([]); });
    return () => { ok = false; };
  }, [clientId]);

  if (HIDE_ON.some((re) => re.test(pathname))) return null;

  return (
    <header className="relative flex h-16 items-center justify-end gap-3 border-b border-gray-200 bg-gray-50 px-8">
      {/* 說明 */}
      <div className="relative">
        <button type="button" onClick={() => setOpen((o) => (o === "help" ? null : "help"))}
          className={`rounded-lg p-1.5 transition-colors ${open === "help" ? "text-violet-600 bg-violet-50" : "text-gray-400 hover:text-gray-600"}`}>
          <HelpCircle className="h-5 w-5" />
        </button>
        {open === "help" && (
          <Popover onClose={() => setOpen(null)}>
            <div className="px-4 pt-4 pb-2 text-base font-semibold text-gray-900">需要幫忙嗎？</div>
            <button type="button" onClick={() => setOpen(null)}
              className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-violet-50/60 transition-colors">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-600"><Sparkles className="h-4 w-4" /></span>
              <span>
                <span className="block text-sm font-medium text-gray-800">這個頁面怎麼用？</span>
                <span className="block text-xs text-gray-400 mt-0.5">AI 根據目前所在頁面解釋操作流程</span>
              </span>
            </button>
            <button type="button" onClick={() => setOpen(null)}
              className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-violet-50/60 transition-colors">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600"><PlayCircle className="h-4 w-4" /></span>
              <span>
                <span className="block text-sm font-medium text-gray-800">查看快速教學</span>
                <span className="block text-xs text-gray-400 mt-0.5">例如「1 分鐘建立第一篇內容」</span>
              </span>
            </button>
            <div className="h-2" />
          </Popover>
        )}
      </div>

      {/* 通知 */}
      <div className="relative">
        <button type="button" onClick={() => setOpen((o) => (o === "noti" ? null : "noti"))}
          className={`relative rounded-lg p-1.5 transition-colors ${open === "noti" ? "text-violet-600 bg-violet-50" : "text-gray-400 hover:text-gray-600"}`}>
          <Bell className="h-5 w-5" />
          {notis.length > 0 && (
            <span className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-medium text-white">{notis.length}</span>
          )}
        </button>
        {open === "noti" && (
          <Popover onClose={() => setOpen(null)}>
            <div className="flex items-center justify-between px-4 pt-4 pb-3">
              <span className="text-base font-semibold text-gray-900">通知</span>
              <button type="button" onClick={() => setOpen(null)} className="text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
            </div>
            {notis.length === 0 ? (
              <div className="px-4 pb-6 pt-2 text-center text-sm text-gray-400">目前沒有新通知</div>
            ) : (
              <div className="max-h-[60vh] overflow-y-auto pb-2">
                {notis.map((n) => (
                  <button key={n.id} type="button"
                    onClick={() => { setOpen(null); if (n.href) router.push(n.href); }}
                    className="flex w-full items-start gap-3 border-t border-gray-100 px-4 py-3 text-left transition-colors hover:bg-gray-50 first:border-t-0">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600"><CheckCircle2 className="h-4 w-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-gray-800 leading-snug">{n.title}</span>
                      <span className="block text-xs text-gray-400 mt-0.5">{n.time}</span>
                    </span>
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-500" />
                  </button>
                ))}
              </div>
            )}
          </Popover>
        )}
      </div>
    </header>
  );
}

// 右上小 popover：點外面關閉。
function Popover({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl">
        {children}
      </div>
    </>
  );
}
