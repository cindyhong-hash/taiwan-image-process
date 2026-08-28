"use client";
import { useEffect, useState } from "react";
import { setLastClientId } from "@/lib/lastClient";
import { HomeHero } from "@/components/home/HomeHero";
import { QuickStartCards } from "@/components/home/QuickStartCards";
import { RecentWorks } from "@/components/home/RecentWorks";

type Client = {
  id: string;
  name: string;
  primaryColor?: string;
  secondaryColor?: string | null;
  paletteColors?: unknown;
  toneLabels?: string[];
  taboos?: string[];
  logoUrls?: unknown[];
  pastPostUrls?: unknown[];
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

  useEffect(() => {
    params.then(({ clientId }) => {
      setLastClientId(clientId);
      fetch(`/api/clients/${clientId}`)
        .then((r) => r.json())
        .then(setClient)
        .catch(() => {});
    });
  }, [params]);

  if (!client) return <div className="text-gray-400">載入中…</div>;

  return (
    <div className="flex gap-6">
      <div className="min-w-0 flex-1 space-y-8">
        <HomeHero />
        <QuickStartCards clientId={client.id} />
        <RecentWorks clientId={client.id} activities={client.activities ?? []} />
      </div>
      <div className="w-64 shrink-0 space-y-4">
        {/* Task 12 BrandMemoryPanel / AiLearnedCard */}
        {/* Task 13 ReuseRecommendCard */}
      </div>
    </div>
  );
}
