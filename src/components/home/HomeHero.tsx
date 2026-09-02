"use client";
import { useRef, useState } from "react";
import { ImagePlus, Loader2, Package, Palette, Plus, SlidersHorizontal, Sparkles, X } from "lucide-react";
import type { QuickCreateInput } from "@/lib/home/quick-create";

const RATIOS = ["1:1", "4:5", "16:9", "9:16"];

type AttachmentKind = "product" | "reference";

async function uploadFile(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch("/api/upload", { method: "POST", body: formData });
  const data = await response.json();
  if (!response.ok || !data.url) throw new Error("upload failed");
  return data.url;
}

type Props = {
  submitting: boolean;
  onQuickCreate: (input: QuickCreateInput) => Promise<void>;
  onOpenFullSettings: (input: QuickCreateInput) => void;
};

export function HomeHero({ submitting, onQuickCreate, onOpenFullSettings }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [prompt, setPrompt] = useState("");
  const [imageRatio, setImageRatio] = useState("1:1");
  const [outputCount, setOutputCount] = useState<1 | 2 | 3>(3);
  const [productImageUrls, setProductImageUrls] = useState<string[]>([]);
  const [referenceImageUrls, setReferenceImageUrls] = useState<string[]>([]);
  const [attachmentKind, setAttachmentKind] = useState<AttachmentKind>("product");
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const input = (): QuickCreateInput => ({ prompt, imageRatio, outputCount, productImageUrls, referenceImageUrls });

  const chooseAttachment = (kind: AttachmentKind) => {
    setAttachmentKind(kind);
    setAttachmentMenuOpen(false);
    fileInputRef.current?.click();
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    setError("");
    try {
      const urls = await Promise.all(Array.from(files).slice(0, 4).map(uploadFile));
      if (attachmentKind === "product") setProductImageUrls((current) => [...current, ...urls].slice(0, 4));
      else setReferenceImageUrls((current) => [...current, ...urls].slice(0, 4));
    } catch {
      setError("圖片上傳失敗，請重新選擇。其他內容已保留。");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const submit = async () => {
    if (!prompt.trim() || submitting || uploading) return;
    setError("");
    try {
      await onQuickCreate(input());
    } catch {
      setError("暫時無法建立生成任務，請稍後再試。你的描述與圖片已保留。");
    }
  };

  const attachments = [
    ...productImageUrls.map((url, index) => ({ url, index, kind: "product" as const, label: "產品圖片" })),
    ...referenceImageUrls.map((url, index) => ({ url, index, kind: "reference" as const, label: "風格參考" })),
  ];

  return (
    <section className="space-y-5">
      <div>
        <h1 className="flex flex-wrap items-center gap-x-2 text-3xl font-bold text-gray-900">
          <span>今天，想<span className="text-violet-600">創作</span>什麼？</span>
          <Sparkles className="h-6 w-6 text-violet-500" />
        </h1>
        <p className="mt-2 text-sm text-gray-400">說出你的想法，AI 會依品牌記憶判斷最快的製作方式。</p>
      </div>

      <div className="overflow-visible rounded-2xl border border-[#ebeff5] bg-white shadow-sm transition-shadow focus-within:shadow-[0_8px_24px_rgba(124,58,237,0.08)]">
        <label htmlFor="home-quick-prompt" className="sr-only">描述想生成的圖片</label>
        <textarea
          id="home-quick-prompt"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") submit(); }}
          maxLength={500}
          rows={3}
          placeholder="描述產品、畫面、用途或想放的文字……例如：為女性除毛刀製作一張清爽的夏日 Instagram 貼文"
          className="block min-h-28 w-full resize-none rounded-t-2xl bg-transparent px-5 pb-3 pt-5 text-sm leading-6 text-gray-900 outline-none placeholder:text-gray-400 sm:px-6"
        />

        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 px-5 pb-4 sm:px-6">
            {attachments.map(({ url, index, kind, label }) => (
              <div key={`${kind}-${url}-${index}`} className="group relative h-16 w-16 overflow-hidden rounded-xl border border-[#ebeff5] bg-gray-50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={label} className="h-full w-full object-cover" />
                <span className="absolute inset-x-0 bottom-0 bg-black/55 py-0.5 text-center text-[9px] text-white">{label}</span>
                <button type="button" aria-label={`移除${label}`} onClick={() => kind === "product" ? setProductImageUrls((current) => current.filter((_, i) => i !== index)) : setReferenceImageUrls((current) => current.filter((_, i) => i !== index))} className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-white/90 text-gray-600 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus:opacity-100"><X className="h-3 w-3" /></button>
              </div>
            ))}
          </div>
        )}

        {error && <p role="alert" className="mx-5 mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 sm:mx-6">{error}</p>}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#ebeff5] px-3 py-3 sm:px-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              {attachmentMenuOpen && <button type="button" aria-label="關閉圖片選單" onClick={() => setAttachmentMenuOpen(false)} className="fixed inset-0 z-10 cursor-default" />}
              <button type="button" aria-label="加入圖片" aria-expanded={attachmentMenuOpen} onClick={() => setAttachmentMenuOpen((open) => !open)} disabled={uploading} className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#ebeff5] text-gray-500 transition-colors hover:border-violet-300 hover:bg-violet-50 hover:text-violet-600 disabled:opacity-50">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              </button>
              {attachmentMenuOpen && (
                <div className="absolute bottom-11 left-0 z-20 w-44 rounded-xl border border-[#ebeff5] bg-white p-1.5 shadow-lg">
                  <button type="button" onClick={() => chooseAttachment("product")} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-gray-700 transition-colors hover:bg-violet-50 hover:text-violet-700"><Package className="h-4 w-4" />加入產品圖片</button>
                  <button type="button" onClick={() => chooseAttachment("reference")} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-gray-700 transition-colors hover:bg-violet-50 hover:text-violet-700"><Palette className="h-4 w-4" />加入風格參考</button>
                </div>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(event) => handleFiles(event.target.files)} />
            </div>

            <div className="flex items-center rounded-lg border border-[#ebeff5] bg-[#f8f9fb] p-0.5" aria-label="圖片比例">
              {RATIOS.map((ratio) => (
                <button key={ratio} type="button" onClick={() => setImageRatio(ratio)} aria-pressed={imageRatio === ratio} className={`rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors ${imageRatio === ratio ? "bg-white text-violet-600 shadow-sm" : "text-gray-400 hover:text-gray-600"}`}>{ratio}</button>
              ))}
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-gray-400">生成</span>
              <div className="flex items-center rounded-lg border border-[#ebeff5] bg-[#f8f9fb] p-0.5" aria-label="候選圖款數">
                {([1, 2, 3] as const).map((count) => (
                  <button key={count} type="button" onClick={() => setOutputCount(count)} aria-pressed={outputCount === count} className={`rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors ${outputCount === count ? "bg-white text-violet-600 shadow-sm" : "text-gray-400 hover:text-gray-600"}`}>{count} 張</button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button type="button" onClick={() => onOpenFullSettings(input())} className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-gray-500 transition-colors hover:bg-violet-50 hover:text-violet-600"><SlidersHorizontal className="h-3.5 w-3.5" />完整設定</button>
            <button type="button" onClick={submit} disabled={!prompt.trim() || submitting || uploading} className="inline-flex h-10 items-center gap-2 rounded-full bg-violet-600 px-5 text-sm font-bold text-white shadow-[0_6px_10px_rgba(124,58,237,0.18)] transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-[#F8F9FB] disabled:text-[#868D99] disabled:shadow-none">
              {submitting ? <><Loader2 className="h-4 w-4 animate-spin" />建立中…</> : <><ImagePlus className="h-4 w-4" />AI 快速生成</>}
            </button>
          </div>
        </div>
      </div>
      <p className="text-right text-[11px] text-gray-400">⌘ Enter 快速送出</p>
    </section>
  );
}
