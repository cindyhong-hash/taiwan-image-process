/**
 * 「收藏靈感」— V1 存 localStorage（per-client、per-browser）。
 * 不動 DB、不需 migration；交接打包最單純。之後若要跨裝置持久化再改成 API。
 * 收藏的是整則 Recommendation（連同 brief 欄位），以便之後仍能「用這個做貼文」。
 */
import type { Recommendation } from "./types";

const KEY = (clientId: string) => `inspirationFavorites:${clientId}`;

export function loadFavorites(clientId: string): Recommendation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY(clientId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Recommendation[]) : [];
  } catch {
    return [];
  }
}

export function isFavorited(clientId: string, id: string): boolean {
  return loadFavorites(clientId).some((r) => r.id === id);
}

/** 切換收藏，回傳切換後是否為已收藏。 */
export function toggleFavorite(clientId: string, rec: Recommendation): boolean {
  const list = loadFavorites(clientId);
  const idx = list.findIndex((r) => r.id === rec.id);
  let nowFavorited: boolean;
  if (idx >= 0) {
    list.splice(idx, 1);
    nowFavorited = false;
  } else {
    list.unshift(rec);
    nowFavorited = true;
  }
  try {
    window.localStorage.setItem(KEY(clientId), JSON.stringify(list.slice(0, 60)));
  } catch {
    /* ignore quota / private mode */
  }
  return nowFavorited;
}
