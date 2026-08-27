"use client";
/**
 * NewLibraryAssetPage — 「新增產品／素材圖片」全頁版（原本係 popup：ProductComposeModal /
 * GenerateAssetModal）。入口第一步（大卡片揀類型）維持喺 AddAssetModal 唔變，揀完之後
 * 由 LibraryWorkspace router.push 過嚟呢頁，唔再開 modal。
 *
 * 右上「已選類型」落咗呢頁之後想轉類型（產品圖／背景／人像／2D插圖）就用佢——呢個場景得 4 揀 1，
 * 落頁之前已經喺 AddAssetModal 大卡片揀過一次、知道有邊 4 樣，所以唔重用大卡片，改用輕量 dropdown
 * （4 行 icon+文字，冇 sub description），夠快夠輕。大卡片留返做真正冇睇過內容嗰下（入口第一步）。
 */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronDown, ImageIcon, Mountain, UserRound, Palette } from "lucide-react";
import { PromptComposer } from "@/components/library/PromptComposer";
import { GenerateAssetForm, type AssetType } from "@/components/library/GenerateAssetForm";
import { type AddAssetType } from "@/components/library/AddAssetModal";
import { consumeLibraryGenHandoff } from "@/components/library/libraryGenerateHandoff";
import type { PromptSlots, StyleComponent } from "@/types/library";
import { CATEGORY_META } from "@/types/library";

const TYPE_META: Record<AddAssetType, { label: string; icon: React.ReactNode }> = {
  product: { label: "產品圖", icon: <ImageIcon className="h-4 w-4" /> },
  background: { label: "背景", icon: <Mountain className="h-4 w-4" /> },
  person: { label: "人像", icon: <UserRound className="h-4 w-4" /> },
  illustration: { label: "2D 插圖", icon: <Palette className="h-4 w-4" /> },
};

export default function NewLibraryAssetPage({ params }: { params: Promise<{ clientId: string }> }) {
  const [clientId, setClientId] = useState("");
  const router = useRouter();
  const [type, setType] = useState<AddAssetType>("product");
  const [showTypeMenu, setShowTypeMenu] = useState(false);
  const typeMenuRef = useRef<HTMLDivElement>(null);

  // 產品圖用：積木 slots（同 LibraryWorkspace 舊時做法一致，呢頁自己揸住）。
  const [slots, setSlots] = useState<PromptSlots>({ layout: null, color: null, tone: null, background: null });
  const [prefill, setPrefill] = useState<{ subject?: string; notes?: string; useFlags?: Record<string, boolean> }>({});
  const [prefillNonce, setPrefillNonce] = useState(0);
  // 背景／人像／插畫用：重新生成/調整 帶入嘅初始值。
  const [assetInit, setAssetInit] = useState<{ description?: string; refImageUrl?: string; engine?: "flux" | "nano" }>({});

  // consumeLibraryGenHandoff() 讀一次 sessionStorage 就清走（一次性交接）。Dev 環境 React
  // Strict Mode 會將呢個 effect 嘅 setup 連續invoke 兩次（mount→cleanup→remount），第二次先
  // 讀就已經俾第一次清空，交接資料會靜靜哋跌咗（生成頁見返一片空白，但唔會報錯）。用呢個
  // ref 確保實際「讀走」呢個動作淨係做一次，Production build 冇呢個 dev-only 雙重invoke，
  // 本身唔會撞到，但保留呢個 guard 更穩陣。
  const handoffConsumedRef = useRef(false);
  useEffect(() => {
    params.then(({ clientId }) => setClientId(clientId));
    const sp = new URLSearchParams(window.location.search);
    const qType = sp.get("type") as AddAssetType | null;
    if (qType && qType in TYPE_META) setType(qType);
    if (!handoffConsumedRef.current) {
      handoffConsumedRef.current = true;
      const handoff = consumeLibraryGenHandoff();
      if (handoff.slots) setSlots(handoff.slots);
      if (handoff.prefill) { setPrefill(handoff.prefill); setPrefillNonce((n) => n + 1); }
      if (handoff.assetInit) setAssetInit(handoff.assetInit);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  // 「已選類型」dropdown：click 出邊即關。
  useEffect(() => {
    if (!showTypeMenu) return;
    const onClickOutside = (e: MouseEvent) => {
      if (typeMenuRef.current && !typeMenuRef.current.contains(e.target as Node)) setShowTypeMenu(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [showTypeMenu]);

  const handleClearSlot = (key: keyof PromptSlots) => setSlots((prev) => ({ ...prev, [key]: null }));
  const handlePickSlot = (comp: StyleComponent) => {
    const slotKey = CATEGORY_META[comp.type].slot as keyof PromptSlots;
    setSlots((prev) => ({ ...prev, [slotKey]: comp }));
  };

  const backToLibrary = () => router.push(`/clients/${clientId}/components`);

  // 轉類型：清走 product-only / asset-only 嘅殘留初始值，避免轉去另一類型時見到上一類型嘅資料。
  const handlePickType = (t: AddAssetType) => {
    setShowTypeMenu(false);
    if (t === type) return;
    setType(t);
    setSlots({ layout: null, color: null, tone: null, background: null });
    setPrefill({});
    setAssetInit({});
  };

  if (!clientId) return null;

  const meta = TYPE_META[type];

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-2 mb-6">
        <button onClick={backToLibrary} className="text-gray-400 hover:text-gray-700">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-semibold flex-1">新增{meta.label}</h1>
        <div className="relative w-56 shrink-0" ref={typeMenuRef}>
          <button
            type="button"
            onClick={() => setShowTypeMenu((s) => !s)}
            className="w-full flex items-center gap-1.5 text-sm text-gray-500 hover:text-violet-600 border border-gray-200 hover:border-violet-300 rounded-lg px-3 py-1.5 transition-all whitespace-nowrap"
          >
            已選類型：<span className="flex items-center gap-1 font-medium text-gray-800 whitespace-nowrap">{meta.icon}{meta.label}</span>
            <ChevronDown className={`h-4 w-4 ml-auto shrink-0 transition-transform ${showTypeMenu ? "rotate-180" : ""}`} />
          </button>
          {showTypeMenu && (
            <div className="absolute inset-x-0 top-full mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-md py-1 z-20">
              {(Object.keys(TYPE_META) as AddAssetType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => handlePickType(t)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left whitespace-nowrap hover:bg-gray-50 transition-colors ${t === type ? "text-violet-600 font-medium" : "text-gray-700"}`}
                >
                  {TYPE_META[t].icon}{TYPE_META[t].label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {type === "product" ? (
        <PromptComposer
          key="product"
          slots={slots}
          onClearSlot={handleClearSlot}
          onPickSlot={handlePickSlot}
          clientId={clientId}
          onGenerated={backToLibrary}
          prefill={prefill}
          prefillNonce={prefillNonce}
        />
      ) : (
        <GenerateAssetForm
          key={type}
          clientId={clientId}
          type={type as AssetType}
          init={assetInit}
          onSaved={backToLibrary}
        />
      )}
    </div>
  );
}
