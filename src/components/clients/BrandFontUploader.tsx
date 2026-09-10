"use client";
import { useEffect, useRef, useState } from "react";
import { Loader2, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BrandFont } from "@/lib/fonts/useBrandFonts";

/**
 * 品牌字體上傳。
 *
 * 預覽用 style={{ fontFamily }} 直接掛已注入的 family —— 這裡是 DOM 文字，
 * 瀏覽器會自己等字體載入，不像 canvas 需要先 FontFace.load()。
 */
export function BrandFontUploader({ clientId }: { clientId: string }) {
  const [fonts, setFonts] = useState<BrandFont[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => {
    fetch(`/api/brand-fonts?clientId=${clientId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((list: BrandFont[]) => {
        setFonts(Array.isArray(list) ? list : []);
        // 注入到頁面，讓下方預覽看得到實際字形。
        for (const f of Array.isArray(list) ? list : []) {
          try {
            const face = new FontFace(f.family, `url(${JSON.stringify(f.url)}) format(${JSON.stringify(f.format)})`);
            face.load().then((l) => document.fonts.add(l)).catch(() => {});
          } catch { /* 舊瀏覽器沒有 FontFace：預覽退回系統字型，不影響上傳 */ }
        }
      })
      .catch(() => setFonts([]));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps -- 只在 clientId 變更時重載
  useEffect(() => { load(); }, [clientId]);

  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      // 先試 Blob 直傳：Vercel 函式的 body 上限只有 4.5MB，
      // 中文字體幾乎一定超過，只有直傳才過得去。
      let registered = false;
      try {
        const { upload: blobUpload } = await import("@vercel/blob/client");
        const blob = await blobUpload(`brandfont-${Date.now()}-${file.name}`, file, {
          access: "public",
          handleUploadUrl: "/api/brand-fonts/blob",
        });
        const res = await fetch("/api/brand-fonts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId, url: blob.url, fileName: file.name }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "登記失敗");
        registered = true;
      } catch (blobError) {
        // 本機沒設 Blob（token 端點回 501）→ 退回 multipart，小檔仍可用。
        if (file.size > 4 * 1024 * 1024) {
          throw new Error(
            blobError instanceof Error && /501|blob-not-configured/.test(blobError.message)
              ? "這個環境未設定 Blob 儲存，只能上傳 4MB 以下的字體檔"
              : blobError instanceof Error ? blobError.message : "上傳失敗，請稍後再試",
          );
        }
      }

      if (!registered) {
        const fd = new FormData();
        fd.append("clientId", clientId);
        fd.append("file", file);
        const res = await fetch("/api/brand-fonts", { method: "POST", body: fd });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error ?? "上傳失敗，請稍後再試");
        }
      }
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "上傳失敗，請稍後再試");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const remove = async (id: string) => {
    await fetch(`/api/brand-fonts/${id}`, { method: "DELETE" }).catch(() => {});
    load();
  };

  return (
    <div className="space-y-3">
      <input
        ref={fileRef}
        type="file"
        accept=".woff2,.woff,.ttf,.otf"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }}
      />
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {busy ? "上傳中…" : "上傳字體檔"}
        </Button>
        <span className="text-xs text-gray-400">支援 woff2 / woff / ttf / otf，建議 woff2（檔案小很多）</span>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      {fonts.length > 0 && (
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
          {fonts.map((f) => (
            <li key={f.id} className="flex items-center gap-3 px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-gray-800">{f.name}</span>
                <span className="block truncate text-lg text-gray-500" style={{ fontFamily: `'${f.family}', system-ui` }}>
                  永和去角質 Salon+ 123
                </span>
              </span>
              <button
                type="button"
                onClick={() => remove(f.id)}
                title="移除這個字體"
                className="shrink-0 rounded p-1 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* 講清楚生效範圍，避免使用者上傳後以為套圖上的字也會換。 */}
      <p className="text-xs leading-relaxed text-gray-400">
        上傳後可在<span className="text-gray-600">自由畫布</span>與<span className="text-gray-600">AI 幫我設計</span>的文字圖層選用。
        <br />
        產品套圖與單圖生成的文字是 AI 直接畫進圖片裡的，不會套用這裡的字體。
        <br />
        請確認你擁有該字體的使用授權。
      </p>
    </div>
  );
}
