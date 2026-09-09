"use client";
import { useCallback, useEffect, useState } from "react";
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
import { pickReuseOpportunities } from "@/lib/home/reuse-picker";
import { TodayInspirationCard } from "@/components/inspiration/TodayInspirationCard";
import { brandCompleteness } from "@/lib/brandCompleteness";
import { buildQuickActivityPayload, classifyQuickCreate, type QuickCreateInput } from "@/lib/home/quick-create";

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
  // 只為了「內容再利用機會」的產品相關性評分（判斷舊內容是否提到現在有在推的產品）。
  const [productNames, setProductNames] = useState<string[]>([]);
  const [clientId, setClientId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [quickCreating, setQuickCreating] = useState(false);

  // 載入品牌 + 素材數。品牌讀取失敗 → 設 error 狀態顯示重試（不再永久卡「載入中」）；
  // gallery 只用來算素材數，失敗就當 0、不阻擋整頁。
  const load = useCallback((cid: string) => {
    setLoadError(false);
    fetch(`/api/clients/${cid}`)
      .then((r) => { if (!r.ok) throw new Error("client fetch failed"); return r.json(); })
      .then(setClient)
      .catch(() => setLoadError(true));
    fetch(`/api/library/gallery?clientId=${cid}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setAssets(Array.isArray(data) ? data : []))
      .catch(() => setAssets([]));
    fetch(`/api/products?clientId=${cid}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setProductNames(Array.isArray(data) ? data.map((p: { name?: string }) => p.name ?? "").filter(Boolean) : []))
      .catch(() => setProductNames([]));
  }, []);

  useEffect(() => {
    params.then(({ clientId }) => {
      setLastClientId(clientId);
      setClientId(clientId);
      load(clientId);
    });
  }, [params, load]);

  if (!client) {
    if (loadError) {
      return (
        <div className="flex flex-col items-center gap-3 py-24 text-center">
          <p className="text-sm text-gray-500">載入失敗，請檢查網路後再試一次。</p>
          <button
            type="button"
            onClick={() => clientId && load(clientId)}
            className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700"
          >
            重新載入
          </button>
        </div>
      );
    }
    return <div className="text-gray-400">載入中…</div>;
  }

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

  const handoffQuickCreate = (input: QuickCreateInput) => {
    sessionStorage.setItem(ACTIVITY_HANDOFF_KEY, JSON.stringify({
      clientId: client.id,
      imagePrompt: input.prompt.trim(),
      requiredText: "",
      imageRatio: input.imageRatio,
      variantCount: input.outputCount,
      productImageUrls: input.productImageUrls,
      referenceImageUrls: input.referenceImageUrls,
    }));
  };

  const openFullSettings = (input: QuickCreateInput) => {
    handoffQuickCreate(input);
    router.push(`/clients/${client.id}/activities/new`);
  };

  const handleQuickCreate = async (input: QuickCreateInput) => {
    const route = classifyQuickCreate({
      prompt: input.prompt,
      attachmentCount: input.productImageUrls.length + input.referenceImageUrls.length,
    });
    if (route !== "direct") {
      handoffQuickCreate(input);
      router.push(route === "multi" ? `/clients/${client.id}/activities/new/multi` : `/clients/${client.id}/activities/new`);
      return;
    }

    setQuickCreating(true);
    try {
      const response = await fetch("/api/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildQuickActivityPayload({ ...input, clientId: client.id })),
      });
      const activity = await response.json();
      if (!response.ok || !activity.id) throw new Error("create failed");
      router.push(`/clients/${client.id}/activities/${activity.id}`);
    } catch (error) {
      setQuickCreating(false);
      throw error;
    }
  };

  // 內容再利用機會：依「時間／季節性／產品相關性／內容缺口／主題時效／重複程度」
  // 評分挑出最值得翻新的舊內容（規則見 src/lib/home/reuse-picker.ts）。
  // 刻意不用「最新三篇」——那和下方「最近作品」是同一批資料，等於列兩次。
  const reusePicks = pickReuseOpportunities(client.activities ?? [], {
    productNames,
  });
  const byId = new Map((client.activities ?? []).map((a) => [a.id, a]));
  const pastItems: PastActivityItem[] = reusePicks.map((r) => {
    const a = byId.get(r.activity.id);
    return {
      thumb: a?.generatedLayouts?.find((l) => l.isSelected)?.imageUrl ?? a?.generatedLayouts?.[0]?.imageUrl,
      title: r.activity.theme,
      dateStr: new Date(r.activity.createdAt).toLocaleDateString("zh-TW"),
      reason: r.reason,
      onReuse: () => handleReuse(r.activity.id),
    };
  });

  return (
    <div className="flex gap-6">
      <div className="min-w-0 flex-1 space-y-8">
        <HomeHero submitting={quickCreating} onQuickCreate={handleQuickCreate} onOpenFullSettings={openFullSettings} />
        <QuickStartCards clientId={client.id} />
        <RecentWorks clientId={client.id} activities={client.activities ?? []} />
      </div>
      <div className="w-64 shrink-0 space-y-4">
        <TodayInspirationCard clientId={client.id} />
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
