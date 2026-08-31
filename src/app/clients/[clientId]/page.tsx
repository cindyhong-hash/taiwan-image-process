"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { setLastClientId } from "@/lib/lastClient";
import { ACTIVITY_REF_KEY, ACTIVITY_BASE_KEY, ACTIVITY_IMAGE_PROMPT_KEY, ACTIVITY_HANDOFF_KEY, ACTIVITY_UPDATE_FLAGS_KEY } from "@/components/activities/RolePickerModal";
import { detectUpdateFlags } from "@/lib/updateFlags";
import { HomeHero } from "@/components/home/HomeHero";
import { QuickStartCards } from "@/components/home/QuickStartCards";
import { RecentWorks } from "@/components/home/RecentWorks";
import { BrandMemoryPanel } from "@/components/home/BrandMemoryPanel";
import { AiLearnedCard } from "@/components/home/AiLearnedCard";
import { PastActivityCard, type PastActivityItem } from "@/components/home/PastActivityCard";
import { brandCompleteness } from "@/lib/brandCompleteness";

// `/api/library/gallery` 回傳嘅其中一個 tile 形狀（見 src/types/library.ts GalleryItem）——
// 呢度淨係攞右欄推薦用得到嘅欄位，唔想 import 成個 union type。
type GalleryAsset = {
  imageUrl: string;
  name?: string;
  subject?: string | null;
  prompt?: string | null;
};

type Client = {
  id: string;
  name: string;
  primaryColor?: string;
  secondaryColor?: string | null;
  paletteColors?: unknown;
  toneLabels?: string[];
  taboos?: string[];
  logoUrls?: unknown[];
  pastPostImageUrls?: unknown[];
  activities?: {
    id: string;
    theme: string;
    focusPoint: string;
    status: string;
    createdAt: string;
    imageRatio?: string;
    customW?: number;
    customH?: number;
    layoutId?: string;
    generatedLayouts?: { imageUrl: string; isSelected?: boolean }[];
  }[];
};

export default function DashboardPage({ params }: { params: Promise<{ clientId: string }> }) {
  const router = useRouter();
  const [client, setClient] = useState<Client | null>(null);
  const [assets, setAssets] = useState<GalleryAsset[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    params.then(({ clientId }) => {
      setLastClientId(clientId);
      fetch(`/api/clients/${clientId}`)
        .then((r) => r.json())
        .then(setClient)
        .catch(() => {});
      fetch(`/api/library/gallery?clientId=${clientId}`)
        .then((r) => r.json())
        .then((data) => setAssets(Array.isArray(data) ? data : []))
        .catch(() => {});
    });
  }, [params]);

  if (!client) return <div className="text-gray-400">載入中…</div>;

  const assetCount = assets.length;
  const { percent } = brandCompleteness({
    primaryColor: client.primaryColor,
    toneLabels: client.toneLabels,
    taboos: client.taboos,
    logoUrls: client.logoUrls,
    pastPostUrls: client.pastPostImageUrls,
    assetCount,
  });

  // 過往活動推薦 → 再次使用：複製舊活動核心設定 → 新草稿 + 規則偵測「需更新」→ 提示 banner。
  const handleReuse = async (activityId: string) => {
    try {
      const a = await fetch(`/api/activities/${activityId}`).then((r) => r.json());
      const products: string[] = Array.isArray(a.productImageUrls) ? a.productImageUrls : [];
      const flags = detectUpdateFlags(a.theme, a.titleText, a.imagePrompt);
      sessionStorage.removeItem(ACTIVITY_REF_KEY);
      sessionStorage.removeItem(ACTIVITY_BASE_KEY);
      sessionStorage.removeItem(ACTIVITY_IMAGE_PROMPT_KEY);
      // 複製核心設定（畫面描述 / 必放文字 / 產品圖）到新增單圖表單。
      sessionStorage.setItem(ACTIVITY_HANDOFF_KEY, JSON.stringify({
        clientId: client!.id,
        imagePrompt: a.imagePrompt ?? a.theme ?? "",
        requiredText: a.titleText ?? "",
        productImageUrls: products,
      }));
      if (flags.length) sessionStorage.setItem(ACTIVITY_UPDATE_FLAGS_KEY, JSON.stringify(flags));
      else sessionStorage.removeItem(ACTIVITY_UPDATE_FLAGS_KEY);
    } catch { /* ignore — 仍導去空白新增頁 */ }
    router.push(`/clients/${client!.id}/activities/new`);
  };
  // 網站搜尋：比對活動(主題/焦點)與素材(名稱/主體/prompt)。
  const qy = query.trim().toLowerCase();
  const matchedActs = qy ? (client.activities ?? []).filter((a) => `${a.theme} ${a.focusPoint}`.toLowerCase().includes(qy)) : [];
  const matchedAssets = qy ? assets.filter((a) => `${a.name ?? ""} ${a.subject ?? ""} ${a.prompt ?? ""}`.toLowerCase().includes(qy)) : [];

  const pastItems: PastActivityItem[] = (client.activities ?? [])
    .filter((a) => a.status === "DONE" && a.layoutId !== "magic-layers")
    .slice(0, 3)
    .map((a) => ({
      thumb: a.generatedLayouts?.find((l) => l.isSelected)?.imageUrl ?? a.generatedLayouts?.[0]?.imageUrl,
      title: a.theme,
      dateStr: new Date(a.createdAt).toLocaleDateString("zh-TW"),
      onReuse: () => handleReuse(a.id),
    }));

  return (
    <div className="flex gap-6">
      <div className="min-w-0 flex-1 space-y-8">
        <HomeHero query={query} onSearch={setQuery} />
        {qy ? (
          <section className="space-y-5">
            <h2 className="text-base font-semibold text-gray-900">搜尋「{query.trim()}」</h2>
            {matchedActs.length === 0 && matchedAssets.length === 0 && (
              <div className="py-10 text-center text-sm text-gray-400">找不到符合的活動或素材</div>
            )}
            {matchedActs.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-medium text-gray-400">活動 {matchedActs.length}</div>
                {matchedActs.map((a) => {
                  const thumb = a.generatedLayouts?.find((l) => l.isSelected)?.imageUrl ?? a.generatedLayouts?.[0]?.imageUrl;
                  return (
                    <button key={a.id} type="button" onClick={() => router.push(`/clients/${client.id}/activities/${a.id}`)}
                      className="flex w-full items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 text-left transition-all hover:border-gray-300 hover:shadow-sm">
                      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-gray-100">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {thumb && <img src={thumb} alt="" className="h-full w-full object-cover" />}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-gray-800">{a.theme}</div>
                        <div className="truncate text-xs text-gray-400">{new Date(a.createdAt).toLocaleDateString("zh-TW")}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            {matchedAssets.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-medium text-gray-400">素材 {matchedAssets.length}</div>
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                  {matchedAssets.map((a, i) => (
                    <button key={i} type="button" onClick={() => router.push(`/clients/${client.id}/components`)}
                      className="overflow-hidden rounded-xl border border-gray-200 bg-white transition-all hover:border-violet-300 hover:shadow-md" title={a.name || a.subject || ""}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={a.imageUrl} alt="" loading="lazy" className="aspect-square w-full object-contain bg-gray-50" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
        ) : (
          <>
            <QuickStartCards clientId={client.id} />
            <RecentWorks clientId={client.id} activities={client.activities ?? []} />
          </>
        )}
      </div>
      <div className="w-64 shrink-0 space-y-4">
        <BrandMemoryPanel
          clientId={client.id}
          primaryColor={client.primaryColor}
          secondaryColor={client.secondaryColor}
          paletteColors={client.paletteColors}
          toneLabels={client.toneLabels}
          taboos={client.taboos}
        />
        <AiLearnedCard assetCount={assetCount} percent={percent} />
        <PastActivityCard items={pastItems} />
      </div>
    </div>
  );
}
