"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { ACTIVITY_REF_KEY, ACTIVITY_BASE_KEY, ACTIVITY_IMAGE_PROMPT_KEY } from "@/components/activities/RolePickerModal";

// 意圖啟動器：打描述→直接開廣告圖文表單並預填「畫面描述 Prompt」；chips→對應創作流程。
const CHIPS: { label: string; to: (clientId: string) => string }[] = [
  { label: "貼文", to: (c) => `/clients/${c}/activities/new` },
  { label: "情境圖", to: (c) => `/clients/${c}/components/new?type=product` },
  { label: "圖片去背", to: (c) => `/clients/${c}/components/quick-add` },
  { label: "品牌形象海報", to: (c) => `/clients/${c}/activities/new` },
];

export function HomeHero({ clientId }: { clientId: string }) {
  const [q, setQ] = useState("");
  const router = useRouter();

  const start = () => {
    const t = q.trim();
    try {
      sessionStorage.removeItem(ACTIVITY_REF_KEY);
      sessionStorage.removeItem(ACTIVITY_BASE_KEY);
      sessionStorage.removeItem(ACTIVITY_IMAGE_PROMPT_KEY);
      if (t) sessionStorage.setItem(ACTIVITY_IMAGE_PROMPT_KEY, t); // 預填畫面描述
    } catch { /* ignore */ }
    router.push(`/clients/${clientId}/activities/new`);
  };

  return (
    <section className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold text-gray-900">
          今天，想做什麼 <span className="text-violet-600">素材</span>呢？
          <Sparkles className="h-6 w-6 text-violet-500" />
        </h1>
        <p className="mt-2 text-sm text-gray-400">描述需求、貼上參考，AI 會依照品牌記憶自動生成素材</p>
      </div>
      <div className="flex items-center gap-2 rounded-2xl border border-gray-200 bg-white p-2 pl-4 shadow-sm">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") start(); }}
          placeholder="描述你想要的素材，例如：夏日海邊清爽保養品情境"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400"
        />
        <button type="button" onClick={start} className="shrink-0 rounded-xl bg-violet-600 px-5 py-2 text-sm font-medium text-white hover:bg-violet-700 transition-colors">開始生成 ✨</button>
      </div>
      <div className="flex items-center gap-2 text-xs">
        <span className="text-gray-400">試試：</span>
        {CHIPS.map((c) => (
          <button
            key={c.label}
            type="button"
            onClick={() => router.push(c.to(clientId))}
            className="rounded-full border border-gray-200 px-3 py-1 text-gray-600 hover:border-violet-300 hover:text-violet-600 transition-colors"
          >
            {c.label}
          </button>
        ))}
      </div>
    </section>
  );
}
