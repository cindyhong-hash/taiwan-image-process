const KEY = "lastClientId";
export function setLastClientId(id: string): void {
  try { localStorage.setItem(KEY, id); } catch { /* ignore */ }
}
export function getLastClientId(): string | null {
  try { return localStorage.getItem(KEY); } catch { return null; }
}
