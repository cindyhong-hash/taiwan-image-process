"use client";
import { useRef, useState } from "react";
import { X, Plus, Loader2, ChevronDown, Sparkles } from "lucide-react";
import { PRODUCT_CATEGORIES, type Product } from "@/lib/productMeta";

// [PRODUCT] 新增產品 modal：上傳 2–3 張原始商品照 → 建立產品（後端會自動去背產出主圖）
export function NewProductModal({
  clientId,
  onClose,
  onCreated,
}: {
  clientId: string;
  onClose: () => void;
  onCreated: (product: Product) => void;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [rawImageUrls, setRawImageUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const MAX = 3;

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setUploading(true);
    try {
      const room = MAX - rawImageUrls.length;
      const picked = Array.from(files).slice(0, Math.max(0, room));
      const urls: string[] = [];
      for (const f of picked) {
        const fd = new FormData();
        fd.append("file", f);
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        const data = await res.json();
        if (data.url) urls.push(data.url);
      }
      setRawImageUrls((prev) => [...prev, ...urls].slice(0, MAX));
    } catch {
      setError("上傳失敗，請再試一次");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleSubmit() {
    if (!name.trim()) { setError("請輸入產品名稱"); return; }
    setError(null);
    setCreating(true);
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          name: name.trim(),
          category: category || null,
          description: description.trim() || null,
          rawImageUrls,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "建立失敗");
      }
      const product: Product = await res.json();
      onCreated(product);
    } catch (e) {
      setError(e instanceof Error ? e.message : "建立失敗");
      setCreating(false);
    }
  }

  const busy = uploading || creating;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl bg-white p-6 sm:p-8 shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-lg font-bold text-gray-900">新增產品</h2>
            <p className="mt-1 text-xs text-gray-400">建立一次，之後做內容都能直接選這支產品帶入素材</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="關閉">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5">
          {/* 產品名稱 */}
          <div>
            <label className="block text-sm font-bold text-gray-900 mb-1.5">
              產品名稱 <span className="text-red-500">*</span>
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例：水光精華"
              className="w-full h-11 px-3 rounded-lg border-[1.5px] border-[#ebeff5] focus:ring-2 focus:ring-ring outline-none text-sm"
            />
          </div>

          {/* 產品類型 */}
          <div>
            <label className="block text-sm font-bold text-gray-900 mb-1.5">
              產品類型 <span className="text-xs text-gray-400 font-normal">決定 AI 建議哪幾種套圖</span>
            </label>
            <div className="relative">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full h-11 px-3 pr-9 rounded-lg border-[1.5px] border-[#ebeff5] focus:ring-2 focus:ring-ring outline-none text-sm appearance-none bg-white"
              >
                <option value="">未指定</option>
                {PRODUCT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* 賣點/定位 */}
          <div>
            <label className="block text-sm font-bold text-gray-900 mb-1.5">
              賣點／定位 <span className="text-xs text-gray-400 font-normal">（選填）生成套圖時給 AI 參考</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="例：玻尿酸保濕、水光透亮"
              rows={2}
              className="w-full px-3 py-2 rounded-lg border-[1.5px] border-[#ebeff5] focus:ring-2 focus:ring-ring outline-none text-sm resize-none"
            />
          </div>

          {/* 原始商品照 */}
          <div>
            <label className="block text-sm font-bold text-gray-900 mb-1.5">
              原始商品照 <span className="text-xs text-gray-400 font-normal">2–3 張，系統會自動去背產出主圖</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {rawImageUrls.map((url) => (
                <div key={url} className="relative h-20 w-20 rounded-lg overflow-hidden border border-[#ebeff5] bg-gray-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="h-full w-full object-cover" />
                  <button
                    onClick={() => setRawImageUrls((prev) => prev.filter((u) => u !== url))}
                    className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5 hover:bg-black/80"
                    aria-label="移除"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {rawImageUrls.length < MAX && (
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="h-20 w-20 rounded-lg border-[1.5px] border-dashed border-[#ebeff5] flex flex-col items-center justify-center text-gray-400 hover:border-violet-300 hover:text-violet-500 transition-colors disabled:opacity-50"
                >
                  {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
                  <span className="text-[11px] mt-0.5">上傳</span>
                </button>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        <div className="flex flex-col items-center pt-6">
          <button
            onClick={handleSubmit}
            disabled={busy || !name.trim()}
            className="inline-flex h-auto items-center justify-center gap-2 rounded-full bg-violet-600 hover:bg-violet-700 text-white px-12 py-3.5 text-sm font-bold shadow-[0_8px_8px_rgba(124,58,237,0.15)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {creating ? (
              <><Loader2 className="h-[18px] w-[18px] animate-spin" /> 建立中…（去背處理）</>
            ) : (
              <><Sparkles className="h-[18px] w-[18px]" /> 建立產品</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
