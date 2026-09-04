export type ImageSetUiPhase = "analyzing" | "pick" | "generating" | "done";

export type ImageSetUiRoleStatus = "PENDING" | "GENERATING" | "DONE" | "FAILED";

export type ImageSetUiRole = {
  status: ImageSetUiRoleStatus;
  label?: string;
};

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
