"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Settings, Plug } from "lucide-react";
import { BrandSettingsForm, type BrandFormValues } from "@/components/clients/BrandSettingsForm";
import { AiLearnedCard } from "@/components/home/AiLearnedCard";

type SettingsTab = "settings" | "linking";

export default function ClientSettingsPage({ params }: { params: Promise<{ clientId: string }> }) {
  const [clientId, setClientId] = useState<string>("");
  const [client, setClient] = useState<BrandFormValues | null>(null);
  const [tab, setTab] = useState<SettingsTab>("settings");
  const router = useRouter();

  useEffect(() => {
    params.then(({ clientId }) => {
      setClientId(clientId);
      fetch(`/api/clients/${clientId}`).then((r) => r.json()).then(setClient);
    });
  }, [params]);

  const handleSubmit = async (values: BrandFormValues) => {
    await fetch(`/api/clients/${clientId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    router.push(`/clients/${clientId}`);
    router.refresh();
  };

  if (!client) return <div className="text-gray-400">載入中...</div>;

  // AI 已學習側卡：以已填欄位數估算品牌辨識完成度
  const assetCount = client.pastPostImageUrls?.length ?? 0;
  const learnedFields = [
    !!client.name,
    !!client.description,
    !!client.industry,
    !!client.primaryColor,
    (client.logoUrls?.length ?? 0) > 0,
    (client.toneLabels?.length ?? 0) > 0,
    (client.fonts?.length ?? 0) > 0,
    assetCount > 0,
  ];
  const percent = Math.round((learnedFields.filter(Boolean).length / learnedFields.length) * 100);

  return (
    <div>
      {/* 2-tab：修改品牌設定 / 連動帳號調整（wireframe ⑨） */}
      <div className="flex gap-1 border-b mb-6">
        {([
          { key: "settings" as SettingsTab, label: "修改品牌設定", icon: <Settings className="h-4 w-4" /> },
          { key: "linking" as SettingsTab, label: "連動帳號調整", icon: <Plug className="h-4 w-4" /> },
        ]).map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 pb-3 pt-1 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key ? "border-violet-600 text-violet-700" : "border-transparent text-gray-400 hover:text-gray-600"}`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {tab === "settings" ? (
        <>
          <div className="mb-6">
            <h1 className="text-lg font-bold text-gray-900">品牌設定 ✨</h1>
            <p className="text-sm text-gray-500 mt-1">管理你的品牌資訊，讓 AI 更精準生成符合品牌調性的內容</p>
          </div>
          <div className="flex gap-6 items-start">
            <div className="flex-1 min-w-0 max-w-3xl">
              <BrandSettingsForm initialValues={client} onSubmit={handleSubmit} submitLabel="更新品牌設定" />
            </div>
            <div className="hidden lg:block w-[300px] shrink-0 sticky top-6">
              <AiLearnedCard assetCount={assetCount} percent={percent} />
            </div>
          </div>
        </>
      ) : (
        <AccountLinkingStub />
      )}
    </div>
  );
}

// ── Tab 2：連動帳號（UI stub；OAuth 後端排 backlog） ──
function AccountLinkingStub() {
  return (
    <div className="max-w-lg space-y-4">
      <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
        <Plug className="h-4 w-4 shrink-0 mt-0.5" />
        <span>連動帳號功能開發中：授權後會自動拉返廣告圖／IG 貼文相入「風格組件」。OAuth（Meta / Google / IG）正排程開發，暫以手動上載頂住。</span>
      </div>

      {/* Meta */}
      <div className="border rounded-lg p-3 opacity-70">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#534AB7]" /> Meta（Facebook + Instagram）</span>
          <span className="text-[11px] text-gray-400 border rounded-full px-2 py-0.5">未連動</span>
        </div>
        <div className="flex items-center justify-between py-2 border-t text-sm text-gray-500">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#378ADD]" /> Facebook 廣告圖</span>
          <button disabled className="text-xs text-gray-400 cursor-not-allowed">敬請期待</button>
        </div>
        <div className="flex items-center justify-between py-2 border-t text-sm text-gray-500">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#D4537E]" /> Instagram 貼文相</span>
          <button disabled className="text-xs text-gray-400 cursor-not-allowed">敬請期待</button>
        </div>
      </div>

      {/* Google Ads */}
      <div className="flex items-center justify-between border rounded-lg p-3 opacity-70">
        <span className="text-sm">Google Ads 圖片素材</span>
        <button disabled className="text-xs text-gray-400 cursor-not-allowed">敬請期待</button>
      </div>

      {/* 手動上載（過渡可用） */}
      <div className="flex items-center justify-between border border-dashed rounded-lg p-3">
        <span className="text-sm text-gray-600">手動上載（過渡後備）</span>
        <span className="text-xs text-gray-400">用「風格組件 → 上傳參考圖」</span>
      </div>
    </div>
  );
}
