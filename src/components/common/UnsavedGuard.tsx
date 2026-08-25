"use client";
/* ============================================================
   useUnsavedGuard — 「寫到一半離開就問」的通用攔截。
   涵蓋：
     • 關分頁 / 重整 / 離站   → beforeunload（瀏覽器原生提示）
     • 點站內連結跳到別頁      → 捕獲階段攔截 <a> 點擊 → 跳自訂對話框
     • 元件自己的離開動作      → guard(proceed) 包一層
   對話框三選：儲存草稿 / 不儲存 / 取消。
   （備註：瀏覽器「上一頁」按鈕未攔截，以免 popstate 迴圈；上述三種已涵蓋常見離開。）
   ============================================================ */
import { useCallback, useEffect, useRef, useState } from "react";

export function useUnsavedGuard(dirty: boolean, onSaveDraft: () => Promise<void>) {
  const [proceed, setProceed] = useState<null | (() => void)>(null); // 決定後要執行的離開動作
  const [saving, setSaving] = useState(false);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  // 關分頁 / 重整 / 離站
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (dirtyRef.current) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, []);

  // 點站內 <a> 連結跳走（側邊欄品牌、頂部 tab…）
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!dirtyRef.current || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement)?.closest?.("a") as HTMLAnchorElement | null;
      if (!a) return;
      const href = a.getAttribute("href");
      if (!href || href.startsWith("#") || a.target === "_blank" || /^https?:\/\//.test(href)) return;
      e.preventDefault();
      e.stopPropagation();
      setProceed(() => () => { window.location.href = href; }); // 離開＝整頁導向（可靠）
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // 元件自己掌控的離開（例如編輯器「返回」鈕）
  const guard = useCallback((run: () => void) => {
    if (dirtyRef.current) setProceed(() => run); else run();
  }, []);

  const run = useCallback((p: () => void) => { setProceed(null); p(); }, []);
  const dialog = proceed ? (
    <div style={{ position: "fixed", inset: 0, zIndex: 90, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Manrope','Noto Sans TC',system-ui,sans-serif" }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.4)" }} onClick={() => setProceed(null)} />
      <div style={{ position: "relative", width: "min(380px,92%)", background: "#fff", borderRadius: 16, padding: 22, boxShadow: "0 20px 60px rgba(0,0,0,.25)" }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: "#1f2937", marginBottom: 6 }}>尚未儲存的變更</div>
        <div style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.6, marginBottom: 18 }}>要把目前進度存成草稿嗎？不儲存會遺失這次的變更。</div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={() => setProceed(null)} disabled={saving}
            style={{ height: 38, padding: "0 14px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", color: "#374151", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>取消</button>
          <button onClick={() => { const p = proceed; run(p); }} disabled={saving}
            style={{ height: 38, padding: "0 14px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", color: "#ef4444", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>不儲存</button>
          <button onClick={async () => { setSaving(true); try { await onSaveDraft(); } catch { /* 存失敗就別離開 */ setSaving(false); return; } setSaving(false); const p = proceed; run(p); }} disabled={saving}
            style={{ height: 38, padding: "0 16px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#8b5cf6,#7c3aed)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{saving ? "儲存中…" : "儲存草稿"}</button>
        </div>
      </div>
    </div>
  ) : null;

  return { guard, dialog };
}
