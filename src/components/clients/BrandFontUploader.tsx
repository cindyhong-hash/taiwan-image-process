"use client";
import { useEffect, useRef, useState } from "react";
import { FileUp, Loader2, Trash2 } from "lucide-react";
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
  // 純視覺：拖曳經過時高亮
  const [dragging, setDragging] = useState(false);
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
      // 檔案已經進 Blob 了：之後就算登記失敗也不能再走 multipart 重傳一次，
      // 否則 Blob 上會留下一個沒人引用的孤兒檔。
      let uploadedToBlob = false;
      try {
        const { upload: blobUpload } = await import("@vercel/blob/client");
        const blob = await blobUpload(`brandfont-${Date.now()}-${file.name}`, file, {
          access: "public",
          handleUploadUrl: "/api/brand-fonts/blob",
        });
        uploadedToBlob = true;
        const res = await fetch("/api/brand-fonts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId, url: blob.url, fileName: file.name }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "登記失敗");
        registered = true;
      } catch (blobError) {
        if (uploadedToBlob) {
          throw new Error(blobError instanceof Error ? blobError.message : "字體已上傳但登記失敗，請重試");
        }
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

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 左：拖放區。真的接 onDrop —— 只寫「拖曳」卻沒有 handler 的話文案就是騙人的。 */}
        <div
          onDragOver={(e) => { e.preventDefault(); if (!dragging) setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files?.[0];
            if (f && !busy) upload(f);
          }}
          onClick={() => { if (!busy) fileRef.current?.click(); }}
          className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors ${
            dragging ? "border-violet-400 bg-violet-50" : "border-[#ebeff5] bg-white hover:border-violet-300"
          } ${busy ? "cursor-wait opacity-70" : ""}`}
        >
          {busy
            ? <Loader2 className="h-7 w-7 animate-spin text-violet-500" />
            : <FileUp className="h-7 w-7 text-gray-400" />}
          <span className="mt-1 text-sm font-bold text-gray-900">
            {busy ? "上傳中…" : "拖曳字體檔案至此"}
          </span>
          {!busy && (
            <span className="text-xs text-gray-500">
              或 <span className="font-bold text-violet-600">點擊選擇檔案</span>
            </span>
          )}
          <span className="mt-2 text-xs text-gray-400">支援格式：.woff2 / .woff / .ttf / .otf</span>
          <span className="text-xs text-gray-400">（建議使用 woff2，檔案小很多）</span>
        </div>

        {/* 右：已上傳清單。手機直接疊在下面，分隔線只在寬螢幕出現。 */}
        <div className="lg:border-l lg:border-[#ebeff5] lg:pl-6">
          <p className="mb-3 text-sm font-bold text-gray-900">已上傳的字體（{fonts.length}）</p>
          {fonts.length === 0 ? (
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-sm font-bold text-gray-400">
                Aa
              </span>
              <span className="min-w-0">
                <span className="block text-sm text-gray-500">尚未上傳任何字體</span>
                <span className="block text-xs text-gray-400">上傳後會顯示在這裡，方便團隊成員使用。</span>
              </span>
            </div>
          ) : (
            <ul className="divide-y divide-[#ebeff5] rounded-lg border border-[#ebeff5]">
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
        </div>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
