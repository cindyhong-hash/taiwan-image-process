"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * 有未儲存改動嗰陣，攔截「離開呢頁」嘅動作（撳返上一頁箭嘴、側欄品牌名、或者任何內部
 * <Link>），彈自訂確認框先過。用 document 層級嘅 click listener（capture phase，行喺
 * Next.js 自己個 <Link> handler 之前）——所以唔理個連結實際擺喺邊個 component（呢頁本身、
 * 側欄呢啲全域 layout 都得），淨係要呢個 hook 有掛住就會攔截到。
 * beforeunload 用嚟攔截真正離開個 tab（關閉/重新整理）——瀏覽器唔畀自訂內容，只會出返
 * 佢自己嗰個原生提示框，呢個係平台限制，冇得custom畫面。
 */
export function useUnsavedChangesGuard(isDirty: boolean) {
  const router = useRouter();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const isDirtyRef = useRef(isDirty);
  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirtyRef.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (!isDirtyRef.current) return;
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // 中鍵/開新分頁等唔攔
      const link = (e.target as HTMLElement)?.closest("a[href]") as HTMLAnchorElement | null;
      if (!link) return;
      const href = link.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("http") || link.target === "_blank") return;
      e.preventDefault();
      e.stopPropagation();
      setPendingHref(href);
    };
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, []);

  const confirmLeave = useCallback(() => {
    if (pendingHref) router.push(pendingHref);
    setPendingHref(null);
  }, [pendingHref, router]);

  const cancelLeave = useCallback(() => setPendingHref(null), []);

  return { pendingHref, confirmLeave, cancelLeave };
}
