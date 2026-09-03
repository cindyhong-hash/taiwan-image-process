"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { HelpCircle, Bell, CheckCircle2, Sparkles, X } from "lucide-react";
import { GuidedTour, type TourStep } from "./GuidedTour";

// 快速教學：依「目前所在頁面」給專屬步驟。第一步錨在對應側欄項目（每頁都有、穩定），
// 其餘置中說明「這頁能做什麼、第一步怎麼做」。找不到錨點會自動置中。

// 首頁：整體流程總覽（設定 → 規劃 → 排程 → 產出 → 資源）
const OVERVIEW_STEPS: TourStep[] = [
  { anchor: '[data-tour="nav-settings"]', title: "① 先設定品牌規範", desc: "填品牌名稱、簡介、色彩與產業，AI 生成才會貼近你的品牌調性。" },
  { anchor: '[data-tour="nav-planner"]', title: "② AI 月度企劃", desc: "讓 AI 依品牌與目標，一次規劃整個月的內容主題與方向。" },
  { anchor: '[data-tour="nav-calendar"]', title: "③ 內容日曆", desc: "把規劃好的內容排進日曆，清楚掌握每篇的發布安排。" },
  { anchor: '[data-tour="nav-activities"]', title: "④ 建立圖文", desc: "單圖或多圖：填主題，AI 幫你生成社群圖文。" },
  { anchor: '[data-tour="nav-library"]', title: "⑤ 素材庫", desc: "產品圖、背景、人像、插圖集中管理，可重複拿來生成。" },
  { anchor: '[data-tour="help"]', title: "隨時回來看說明", desc: "點這顆問號，隨時看目前頁面的操作教學。" },
];

// AI 月度企劃
const PLANNER_STEPS: TourStep[] = [
  { anchor: '[data-tour="nav-planner"]', title: "這裡是 AI 月度企劃", desc: "讓 AI 依你的品牌與目標，一次規劃整個月的內容主題與方向。" },
  { title: "第一步：建立當月企劃", desc: "設定這個月的目標與檔期，AI 會產出一組內容主題建議。" },
  { title: "接著：挑主題 → 產出", desc: "從建議主題挑選，直接帶進「建立圖文」生成，或排進「內容日曆」。" },
];

// 內容日曆
const CALENDAR_STEPS: TourStep[] = [
  { anchor: '[data-tour="nav-calendar"]', title: "這裡是內容日曆", desc: "把規劃好的內容排進月曆，一眼看清每天要發什麼。" },
  { title: "第一步：把主題放上日期", desc: "從企劃把內容主題排到日期，或點某一天新增內容。" },
  { title: "調整發布安排", desc: "拖曳卡片就能改日期；點卡片可進一步編輯或去生成圖文。" },
];

// 建立圖文（活動列表）
const ACTIVITIES_STEPS: TourStep[] = [
  { anchor: '[data-tour="nav-activities"]', title: "這裡是建立圖文", desc: "你所有的社群圖文活動都列在這裡。" },
  { title: "第一步：新增活動", desc: "點「新增活動」，選單圖或多圖版型。" },
  { title: "填主題 → AI 生成", desc: "填畫面描述與必放文字，AI 會依品牌記憶生成圖文。" },
];

// 素材庫
const LIBRARY_STEPS: TourStep[] = [
  { anchor: '[data-tour="nav-library"]', title: "這裡是素材庫", desc: "集中管理產品圖、背景、人像、插圖等素材。" },
  { title: "第一步：新增素材", desc: "點「新增素材」，上傳圖片或用 AI 生成。" },
  { title: "重複使用", desc: "素材可在建立圖文時直接挑選，不用重複上傳。" },
];

// 品牌設定
const SETTINGS_STEPS: TourStep[] = [
  { anchor: '[data-tour="nav-settings"]', title: "這裡是品牌設定", desc: "填品牌資訊，AI 生成才會貼近你的品牌調性。" },
  { title: "第一步：填品牌基本資訊", desc: "品牌名稱、簡介、色彩、產業；越完整，AI 越懂你的品牌。" },
  { title: "刪除品牌", desc: "拉到最下方「危險操作」可刪除整個品牌（含所有活動與素材）。" },
];

// 依 pathname 選對應頁面的教學步驟
function getTourSteps(pathname: string): TourStep[] {
  if (/\/marketing-plans(\/|$)/.test(pathname) && /calendar/.test(pathname)) return CALENDAR_STEPS;
  if (/\/marketing-plans(\/|$)/.test(pathname)) return PLANNER_STEPS;
  if (/\/activities(\/|$)/.test(pathname)) return ACTIVITIES_STEPS;
  if (/\/components(\/|$)/.test(pathname)) return LIBRARY_STEPS;
  if (/\/settings(\/|$)/.test(pathname)) return SETTINGS_STEPS;
  return OVERVIEW_STEPS; // 首頁與其他
}

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
  const [tour, setTour] = useState(false);

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
        <button type="button" data-tour="help" onClick={() => setOpen((o) => (o === "help" ? null : "help"))}
          className={`rounded-lg p-1.5 transition-colors ${open === "help" ? "text-violet-600 bg-violet-50" : "text-gray-400 hover:text-gray-600"}`}>
          <HelpCircle className="h-5 w-5" />
        </button>
        {open === "help" && (
          <Popover onClose={() => setOpen(null)}>
            <div className="px-4 pt-4 pb-2 text-base font-semibold text-gray-900">需要幫忙嗎？</div>
            <button type="button" onClick={() => { setOpen(null); setTour(true); }}
              className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-violet-50/60 transition-colors">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-600"><Sparkles className="h-4 w-4" /></span>
              <span>
                <span className="block text-sm font-medium text-gray-800">這個頁面怎麼用？</span>
                <span className="block text-xs text-gray-400 mt-0.5">用步驟導覽快速帶你看操作流程</span>
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

      {tour && <GuidedTour steps={getTourSteps(pathname)} onClose={() => setTour(false)} />}
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
