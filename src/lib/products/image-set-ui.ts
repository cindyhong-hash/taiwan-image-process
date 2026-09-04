export type ImageSetUiPhase = "analyzing" | "pick" | "generating" | "done";

export type ImageSetUiRoleStatus = "PENDING" | "GENERATING" | "DONE" | "FAILED";

export type ImageSetUiRole = {
  status: ImageSetUiRoleStatus;
  label?: string;
};

export type SavedImageSetBatch = {
  batchId: string;
  items: Array<{ id: string; role: string; label: string }>;
};

export type ImageSetStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const savedBatchKey = (productId: string) => `product-image-set:${productId}:latest-batch`;

function isSavedImageSetBatch(value: unknown): value is SavedImageSetBatch {
  if (!value || typeof value !== "object") return false;
  const batch = value as Partial<SavedImageSetBatch>;
  return typeof batch.batchId === "string" && !!batch.batchId && Array.isArray(batch.items) && batch.items.length > 0
    && batch.items.every((item) => !!item && typeof item.id === "string" && !!item.id
      && typeof item.role === "string" && !!item.role && typeof item.label === "string" && !!item.label);
}

export function readSavedImageSetBatch(storage: ImageSetStorage, productId: string): SavedImageSetBatch | null {
  try {
    const value = JSON.parse(storage.getItem(savedBatchKey(productId)) ?? "null");
    return isSavedImageSetBatch(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeSavedImageSetBatch(storage: ImageSetStorage, productId: string, batch: SavedImageSetBatch): boolean {
  try {
    storage.setItem(savedBatchKey(productId), JSON.stringify(batch));
    return true;
  } catch {
    return false;
  }
}

export function clearSavedImageSetBatch(storage: ImageSetStorage, productId: string): boolean {
  try {
    storage.removeItem(savedBatchKey(productId));
    return true;
  } catch {
    return false;
  }
}

export function shouldAnalyzeBeforeImageSetPicker(payload: { needsAnalysis?: boolean; profile: unknown }): boolean {
  return payload.needsAnalysis === true || !payload.profile;
}

export function shouldNotifySettledBatch(
  items: Array<Pick<ImageSetUiRole, "status">>,
  alreadyNotified: boolean,
): boolean {
  return !alreadyNotified && isImageSetBatchSettled(items);
}

/** Returns a wrapped focus target only when Tab would otherwise leave the dialog. */
export function dialogFocusTargetIndex(currentIndex: number, itemCount: number, shiftKey: boolean): number | null {
  if (itemCount <= 0) return null;
  if (currentIndex < 0) return shiftKey ? itemCount - 1 : 0;
  if (shiftKey && currentIndex <= 0) return itemCount - 1;
  if (!shiftKey && currentIndex >= itemCount - 1) return 0;
  return null;
}

export function isImageSetBatchSettled(items: Array<Pick<ImageSetUiRole, "status">>): boolean {
  return items.length > 0 && items.every(({ status }) => status === "DONE" || status === "FAILED");
}

export function imageSetBatchProgress(items: ImageSetUiRole[]) {
  const completed = items.filter(({ status }) => status === "DONE" || status === "FAILED").length;
  const active = items.find(({ status }) => status === "GENERATING")
    ?? items.find(({ status }) => status === "PENDING");
  return {
    completed,
    total: items.length,
    activeRoleLabel: active?.label,
  };
}

export function imageSetProgressLabel(state:
  | { phase: "analyzing"; sourceImageCount: number }
  | { phase: "generating"; completed: number; total: number; activeRoleLabel?: string }
): string {
  if (state.phase === "analyzing") {
    return state.sourceImageCount > 0
      ? `正在讀取 ${state.sourceImageCount} 張商品照，整理產品外觀與套圖方向…`
      : "正在讀取商品照，整理產品外觀與套圖方向…";
  }
  const subject = state.activeRoleLabel ? `正在建立${state.activeRoleLabel}` : "正在整理商品套圖";
  return `${subject} · 完成 ${state.completed}/${state.total}`;
}

export function mergeImageSetPollResult<T extends { status: ImageSetUiRoleStatus }>(
  current: T,
  result:
    | { kind: "timeout" }
    | { kind: "row"; row: Partial<Omit<T, "status">> & { status: ImageSetUiRoleStatus } },
): Omit<T, "status"> & { status: ImageSetUiRoleStatus } {
  return result.kind === "timeout" ? current : { ...current, ...result.row };
}
