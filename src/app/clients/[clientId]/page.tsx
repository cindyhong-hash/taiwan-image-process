"use client";
import { useEffect, useState } from "react";
import { setLastClientId } from "@/lib/lastClient";
import { HomeHero } from "@/components/home/HomeHero";
import { QuickStartCards } from "@/components/home/QuickStartCards";
import { RecentWorks } from "@/components/home/RecentWorks";
import { BrandMemoryPanel } from "@/components/home/BrandMemoryPanel";
import { AiLearnedCard } from "@/components/home/AiLearnedCard";
import { ReuseRecommendCard, type ReuseRecommendItem } from "@/components/home/ReuseRecommendCard";
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
  const [client, setClient] = useState<Client | null>(null);
  const [assets, setAssets] = useState<GalleryAsset[]>([]);

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

  const recommendItems: ReuseRecommendItem[] = assets.slice(0, 3).map((a) => ({
    thumb: a.imageUrl,
    title: a.name || a.subject || "已生成素材",
    hint: "可再利用",
  }));

  return (
    <div className="flex gap-6">
      <div className="min-w-0 flex-1 space-y-8">
        <HomeHero />
        <QuickStartCards clientId={client.id} />
        <RecentWorks clientId={client.id} activities={client.activities ?? []} />
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
        <ReuseRecommendCard items={recommendItems} />
      </div>
    </div>
  );
}
