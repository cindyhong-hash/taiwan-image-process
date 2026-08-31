"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { setLastClientId } from "@/lib/lastClient";
import { ACTIVITY_REF_KEY, ACTIVITY_BASE_KEY, ACTIVITY_IMAGE_PROMPT_KEY, ML_COMPOSE_BG_KEY, ML_COMPOSE_CLIENT_KEY } from "@/components/activities/RolePickerModal";
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
  kind?: string;          // generated | uploaded | material
  paramsJson?: string;    // 內含 genType（person/illustration/reference…）
};

// 依素材類型「偵測適合拿來做什麼」+ 排出可重用優先序。priority 越小越前。
function reuseKind(a: GalleryAsset): { priority: number; hint: string; action: string; target: "compose" | "activity" } {
  if (a.kind === "material") return { priority: 0, hint: "背景 · 適合當新排版底圖", action: "做排版底圖", target: "compose" };
  let g: string | undefined;
  try { g = a.paramsJson ? JSON.parse(a.paramsJson).genType : undefined; } catch { /* ignore */ }
  if (a.kind === "uploaded" || g === "reference") return { priority: 2, hint: "參考圖 · 適合當風格參考", action: "帶入生成", target: "activity" };
  if (g === "person") return { priority: 3, hint: "人像 · 適合做人物情境", action: "帶入生成", target: "activity" };
  if (g === "illustration") return { priority: 4, hint: "插畫 · 適合做插畫貼文", action: "帶入生成", target: "activity" };
  return { priority: 1, hint: "產品圖 · 適合套新場景", action: "帶入生成", target: "activity" }; // product 成圖
}

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

  // 可重用素材優先（背景→產品→參考→人像→插畫），並依類型偵測「適合拿來做什麼」+ 一鍵接下一步。
  const reuse = (url: string, target: "compose" | "activity") => {
    try {
      sessionStorage.removeItem(ACTIVITY_REF_KEY);
      sessionStorage.removeItem(ACTIVITY_BASE_KEY);
      sessionStorage.removeItem(ACTIVITY_IMAGE_PROMPT_KEY);
      if (target === "compose") {
        sessionStorage.setItem(ML_COMPOSE_BG_KEY, url);
        sessionStorage.setItem(ML_COMPOSE_CLIENT_KEY, client.id);
      } else {
        sessionStorage.setItem(ACTIVITY_REF_KEY, url); // 帶入活動圖生成（作參考圖）
      }
    } catch { /* ignore */ }
    router.push(target === "compose" ? `/clients/${client.id}/magic-layers/compose` : `/clients/${client.id}/activities/new`);
  };
  const recommendItems: ReuseRecommendItem[] = assets
    .map((a) => ({ a, r: reuseKind(a) }))
    .sort((x, y) => x.r.priority - y.r.priority)
    .slice(0, 3)
    .map(({ a, r }) => ({
      thumb: a.imageUrl,
      title: a.name || a.subject || "已生成素材",
      hint: r.hint,
      actionLabel: r.action,
      onClick: () => reuse(a.imageUrl, r.target),
    }));

  return (
    <div className="flex gap-6">
      <div className="min-w-0 flex-1 space-y-8">
        <HomeHero clientId={client.id} />
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
