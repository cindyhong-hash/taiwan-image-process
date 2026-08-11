"use client";

export type PolledLibraryImage = {
  id: string;
  status: string;
  imageUrl: string;
  copyText?: string | null;
  prompt?: string;
  paramsJson?: string;
  errorMessage?: string | null;
};

/**
 * Poll `/api/library/images?ids=` until the row leaves GENERATING/PENDING (DONE 或 FAILED)。
 * 生成本身喺 server 用 `after()` 喺背景繼續行（唔理呢個 poll 有冇人聽），所以就算用戶
 * 中途關咗 popup（poll 停咗），DB 記錄都會照樣完成，唔會有嘢跟住流失。
 */
export async function pollLibraryImage(
  id: string,
  opts?: { intervalMs?: number; timeoutMs?: number }
): Promise<PolledLibraryImage> {
  const interval = opts?.intervalMs ?? 2000;
  const timeout = opts?.timeoutMs ?? 150_000;
  const start = Date.now();
  for (;;) {
    const res = await fetch(`/api/library/images?ids=${id}`);
    const data = await res.json();
    const item: PolledLibraryImage | undefined = data.items?.[0];
    if (item && item.status !== "GENERATING" && item.status !== "PENDING") return item;
    if (Date.now() - start > timeout) {
      return { id, status: "FAILED", imageUrl: "", errorMessage: "生成逾時，請重試" };
    }
    await new Promise((r) => setTimeout(r, interval));
  }
}
