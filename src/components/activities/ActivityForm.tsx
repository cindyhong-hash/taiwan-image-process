"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, X, Loader2 } from "lucide-react";

export type ActivityFormValues = {
  theme: string;
  focusPoint: string;
  productImageUrl: string;
  referenceImageUrls: string[];
};

type Props = {
  clientId: string;
  onSubmit: (values: ActivityFormValues) => Promise<void>;
};

export function ActivityForm({ clientId: _clientId, onSubmit }: Props) {
  const [values, setValues] = useState<ActivityFormValues>({
    theme: "",
    focusPoint: "",
    productImageUrl: "",
    referenceImageUrls: [],
  });
  const [loading, setLoading] = useState(false);
  const [uploadingProduct, setUploadingProduct] = useState(false);
  const [uploadingRef, setUploadingRef] = useState(false);

  const uploadImage = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: formData });
    const data = await res.json();
    return data.url;
  };

  const handleProductUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingProduct(true);
    const url = await uploadImage(file);
    setValues((v) => ({ ...v, productImageUrl: url }));
    setUploadingProduct(false);
  };

  const handleRefUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).slice(0, 3 - values.referenceImageUrls.length);
    if (!files.length) return;
    setUploadingRef(true);
    const urls = await Promise.all(files.map(uploadImage));
    setValues((v) => ({ ...v, referenceImageUrls: [...v.referenceImageUrls, ...urls].slice(0, 3) }));
    setUploadingRef(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onSubmit(values);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-lg">
      <div className="space-y-1">
        <Label>活動主題 *</Label>
        <Input
          value={values.theme}
          onChange={(e) => setValues((v) => ({ ...v, theme: e.target.value }))}
          placeholder="例：夏季新品上市"
          required
        />
      </div>

      <div className="space-y-1">
        <Label>訴求重點 *</Label>
        <Input
          value={values.focusPoint}
          onChange={(e) => setValues((v) => ({ ...v, focusPoint: e.target.value }))}
          placeholder="例：主打涼感，限定優惠"
          required
        />
      </div>

      <div className="space-y-2">
        <Label>產品主圖 *</Label>
        {values.productImageUrl ? (
          <div className="relative w-32 h-32">
            <img
              src={values.productImageUrl}
              alt="product"
              className="w-32 h-32 object-cover rounded-lg border"
            />
            <button
              type="button"
              className="absolute -top-1 -right-1 bg-white rounded-full border p-0.5 shadow"
              onClick={() => setValues((v) => ({ ...v, productImageUrl: "" }))}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <label className="flex flex-col items-center justify-center w-32 h-32 border-2 border-dashed rounded-lg cursor-pointer hover:bg-gray-50">
            {uploadingProduct ? (
              <Loader2 className="h-5 w-5 text-gray-400 animate-spin" />
            ) : (
              <>
                <Upload className="h-6 w-6 text-gray-400" />
                <span className="text-xs text-gray-400 mt-1">上傳圖片</span>
              </>
            )}
            <input type="file" accept="image/*" className="hidden" onChange={handleProductUpload} />
          </label>
        )}
      </div>

      <div className="space-y-2">
        <Label>參考圖（最多 3 張，AI 學習風格用）</Label>
        <div className="flex gap-2 flex-wrap">
          {values.referenceImageUrls.map((url, i) => (
            <div key={i} className="relative w-20 h-20">
              <img src={url} alt={`ref-${i}`} className="w-20 h-20 object-cover rounded-lg border" />
              <button
                type="button"
                className="absolute -top-1 -right-1 bg-white rounded-full border p-0.5 shadow"
                onClick={() =>
                  setValues((v) => ({
                    ...v,
                    referenceImageUrls: v.referenceImageUrls.filter((_, idx) => idx !== i),
                  }))
                }
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          {values.referenceImageUrls.length < 3 && (
            <label className="flex flex-col items-center justify-center w-20 h-20 border-2 border-dashed rounded-lg cursor-pointer hover:bg-gray-50">
              {uploadingRef ? (
                <Loader2 className="h-4 w-4 text-gray-400 animate-spin" />
              ) : (
                <>
                  <Upload className="h-5 w-5 text-gray-400" />
                  <span className="text-xs text-gray-400 mt-1">加入</span>
                </>
              )}
              <input type="file" accept="image/*" multiple className="hidden" onChange={handleRefUpload} />
            </label>
          )}
        </div>
      </div>

      <Button type="submit" disabled={loading || !values.productImageUrl}>
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />建立中...
          </>
        ) : (
          "建立活動並生成圖片"
        )}
      </Button>
    </form>
  );
}
