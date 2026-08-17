"use client";
/**
 * ProductComposeModal — wireframe v2 ⑧「產品圖」生成（由「新增產品／素材圖片」→ 產品圖 進入）。
 * 將原「生成圖片」tab 嘅 PromptComposer 包成 modal：合併入融合入口，唔再做 sub-tab。
 * Controlled：slots / prefill 由上層 LibraryWorkspace 持有，令原有「帶入生成 / 重新生成」flow 照用。
 */
import { useRef, useState } from "react";
import { X, RotateCcw } from "lucide-react";
import { PromptComposer, type PromptComposerHandle } from "./PromptComposer";
import type { PromptSlots, StyleComponent } from "@/types/library";

type Prefill = { subject?: string; notes?: string; useFlags?: Record<string, boolean> };

export function ProductComposeModal({
  clientId,
  slots,
  onClearSlot,
  onPickSlot,
  onGenerated,
  onStarted,
  prefill,
  prefillNonce,
  onClose,
}: {
  clientId: string | null;
  slots: PromptSlots;
  onClearSlot: (slot: keyof PromptSlots) => void;
  onPickSlot: (comp: StyleComponent) => void;
  onGenerated?: () => void;
  onStarted?: () => void;
  prefill?: Prefill;
  prefillNonce?: number;
  onClose: () => void;
}) {
  const composerRef = useRef<PromptComposerHandle>(null);
  const [dirty, setDirty] = useState(false);
  return (
    // 同 GenerateAssetModal 一致：flex-col + max-height + body 內捲（修破版；body 先係 scroll 容器）
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 overflow-y-auto p-4" onClick={onClose}>
      <div className="relative w-full max-w-5xl bg-white rounded-2xl shadow-xl my-6 flex flex-col max-h-[calc(100vh-3rem)] overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between px-6 py-4 border-b shrink-0">
          <div>
            <h2 className="text-lg font-semibold">產品圖生成</h2>
            <p className="text-xs text-gray-400 mt-0.5">上傳產品主圖（或輸入文字主體），配搭風格積木合成乾淨產品成圖；出完入素材庫。</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {/* 清空重來：清晒產品圖／主體／積木／說明，開新設計（保留輸出設定）；有內容先顯示 */}
            {dirty && (
              <button onClick={() => composerRef.current?.reset()}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 rounded-lg px-2 py-1 hover:bg-red-50 transition-colors"
                title="清空所有輸入，開新設計">
                <RotateCcw className="h-3.5 w-3.5" />清空重來
              </button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 rounded-full p-1 hover:bg-gray-100">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <PromptComposer
            ref={composerRef}
            slots={slots}
            onClearSlot={onClearSlot}
            onPickSlot={onPickSlot}
            clientId={clientId}
            onGenerated={onGenerated}
            onStarted={onStarted}
            prefill={prefill}
            prefillNonce={prefillNonce}
            onDirtyChange={setDirty}
          />
        </div>
      </div>
    </div>
  );
}
