/**
 * libraryGenerateHandoff — 「新增產品／素材圖片」由 popup 改全頁之後嘅跨頁資料交接。
 * 跟 RolePickerModal 嘅 ACTIVITY_REF_KEY 同一套做法：用 sessionStorage（唔喺網址外露），
 * 新頁 mount 嗰刻讀一次就清走，避免殘留舊資料影響下次。
 */

import type { PromptSlots, StyleComponent } from "@/types/library";
import type { AssetType } from "./GenerateAssetForm";

const SLOTS_KEY = "libraryGen_slots";
const PREFILL_KEY = "libraryGen_prefill";
const ASSET_INIT_KEY = "libraryGen_assetInit";
const QUICK_ADD_KEY = "libraryGen_quickAdd";

export type LibraryGenPrefill = { subject?: string; notes?: string; useFlags?: Record<string, boolean> };
export type LibraryGenAssetInit = { description?: string; refImageUrl?: string; engine?: "flux" | "nano" };

/** 產品圖：積木已選取 / 重新生成 → 帶 slots(+prefill) 去新頁。 */
export function stashProductHandoff(slots: PromptSlots, prefill?: LibraryGenPrefill) {
  try {
    sessionStorage.setItem(SLOTS_KEY, JSON.stringify(slots));
    if (prefill) sessionStorage.setItem(PREFILL_KEY, JSON.stringify(prefill));
  } catch { /* ignore */ }
}

/** 背景／人像／插畫：由 popup「重新生成/調整」帶 init 去新頁。 */
export function stashAssetInitHandoff(init: LibraryGenAssetInit) {
  try {
    sessionStorage.setItem(ASSET_INIT_KEY, JSON.stringify(init));
  } catch { /* ignore */ }
}

/** 新頁 mount 時讀一次交接資料，讀完即刻清走（一次性）。 */
export function consumeLibraryGenHandoff(): {
  slots: PromptSlots | null;
  prefill: LibraryGenPrefill | null;
  assetInit: LibraryGenAssetInit | null;
} {
  if (typeof window === "undefined") return { slots: null, prefill: null, assetInit: null };
  let slots: PromptSlots | null = null;
  let prefill: LibraryGenPrefill | null = null;
  let assetInit: LibraryGenAssetInit | null = null;
  try {
    const rawSlots = sessionStorage.getItem(SLOTS_KEY);
    if (rawSlots) { slots = JSON.parse(rawSlots); sessionStorage.removeItem(SLOTS_KEY); }
    const rawPrefill = sessionStorage.getItem(PREFILL_KEY);
    if (rawPrefill) { prefill = JSON.parse(rawPrefill); sessionStorage.removeItem(PREFILL_KEY); }
    const rawInit = sessionStorage.getItem(ASSET_INIT_KEY);
    if (rawInit) { assetInit = JSON.parse(rawInit); sessionStorage.removeItem(ASSET_INIT_KEY); }
  } catch { /* ignore */ }
  return { slots, prefill, assetInit };
}

export type LibraryQuickAddHandoff = {
  imageUrl?: string | null;
  prefillComponents?: StyleComponent[] | null;
  libraryImageId?: string | null;
};

/** 「上傳參考圖」：由圖片詳情觸發「分析」/「調整」→ 帶初始圖／既有積木去新頁。 */
export function stashQuickAddHandoff(handoff: LibraryQuickAddHandoff) {
  try {
    sessionStorage.setItem(QUICK_ADD_KEY, JSON.stringify(handoff));
  } catch { /* ignore */ }
}

/** 新頁 mount 時讀一次「上傳參考圖」交接資料，讀完即刻清走（一次性）。冇交接過 → 全部 null（乾淨新增）。 */
export function consumeQuickAddHandoff(): LibraryQuickAddHandoff {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(QUICK_ADD_KEY);
    if (!raw) return {};
    sessionStorage.removeItem(QUICK_ADD_KEY);
    return JSON.parse(raw);
  } catch { return {}; }
}

export type { AssetType };
