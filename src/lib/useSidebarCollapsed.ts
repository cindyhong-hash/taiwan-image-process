"use client";
import { useSyncExternalStore, useCallback } from "react";
const KEY = "sidebarCollapsed";
const EVT = "sidebar-collapsed-change";
function read(): boolean { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } }
function subscribe(cb: () => void) {
  window.addEventListener(EVT, cb);
  window.addEventListener("storage", cb);
  return () => { window.removeEventListener(EVT, cb); window.removeEventListener("storage", cb); };
}
export function useSidebarCollapsed(): [boolean, () => void] {
  const collapsed = useSyncExternalStore(subscribe, read, () => false);
  const toggle = useCallback(() => {
    try { localStorage.setItem(KEY, read() ? "0" : "1"); } catch { /* ignore */ }
    window.dispatchEvent(new Event(EVT));
  }, []);
  return [collapsed, toggle];
}
