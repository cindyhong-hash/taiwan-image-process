"use client";
import { useEffect, useState } from "react";

export type BrandFont = { id: string; name: string; url: string; format: string; family: string };

/**
 * 載入並注入品牌字體。
 *
 * 為什麼要自己注入而不是走 next/font：next/font 是 build 時決定的，
 * 使用者上傳的字體只有 runtime 才知道，只能用 FontFace API 動態載。
 *
 * 用 document.fonts.add() 而不是塞 <style> 的 @font-face：
 * canvas 的 ctx.font 只認「已經載入完成」的字體，塞 CSS 的話第一次繪製
 * 往往還沒下載完就畫下去，會靜默 fallback 成系統字型 —— 而畫布是用
 * canvas 畫字的，看起來就像上傳沒生效。FontFace.load() 可以等它真的好。
 */
export function useBrandFonts(clientId: string | null | undefined): { fonts: BrandFont[]; ready: boolean } {
  const [fonts, setFonts] = useState<BrandFont[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    // 換品牌時要先清空並回到「未就緒」，否則會沿用上一個品牌的字體清單。
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!clientId) { setFonts([]); setReady(true); return; }
    setReady(false);
    /* eslint-enable react-hooks/set-state-in-effect */
    fetch(`/api/brand-fonts?clientId=${clientId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then(async (list: BrandFont[]) => {
        if (!alive || !Array.isArray(list)) { if (alive) { setFonts([]); setReady(true); } return; }
        // 逐一載入；單一字體失敗（檔壞掉、網路問題）不該擋住其他字體。
        const loaded = await Promise.all(list.map(async (f) => {
          try {
            const face = new FontFace(f.family, `url(${JSON.stringify(f.url)}) format(${JSON.stringify(f.format)})`);
            await face.load();
            document.fonts.add(face);
            return f;
          } catch {
            return null;
          }
        }));
        if (!alive) return;
        setFonts(loaded.filter((f): f is BrandFont => f !== null));
        setReady(true);
      })
      .catch(() => { if (alive) { setFonts([]); setReady(true); } });
    return () => { alive = false; };
  }, [clientId]);

  return { fonts, ready };
}
