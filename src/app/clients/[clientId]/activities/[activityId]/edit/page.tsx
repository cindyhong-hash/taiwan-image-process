"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, X, Loader2, ChevronLeft } from "lucide-react";
import Link from "next/link";

type Activity = {
  id: string;
  theme: string;
  focusPoint: string;
  productImageUrl: string;
  referenceImageUrls: string[];
};

export default function EditActivityPage({
  params,
}: {
  params: Promise<{ clientId: string; activityId: string }>;
}) {
  const [clientId, setClientId] = useState("");
  const [activityId, setActivityId] = useState("");
  const [values, setValues] = useState<Activity | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploadingProduct, setUploadingProduct] = useState(false);
  const [uploadingRef, setUploadingRef] = useState(false);
  const router = useRouter();

  useEffect(() => {
    params.then(({ clientId, activityId }) => {
      setClientId(clientId);
      setActivityId(activityId);
      fetch(`/api/activities/${activityId}`)
        .then((r) => r.json())
        .then((data) =>
          setValues({
            id: data.id,
            theme: data.theme,
            focusPoint: data.focusPoint,
            productImageUrl: data.productImageUrl,
            referenceImageUrls: data.referenceImageUrls ?? [],
          })
        );
    });
  }, [params]);

  const uploadImage = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: formData });
    const data = await res.json();
    return data.url;
  };

  const handleProductUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !values) return;
    setUploadingProduct(true);
    const url = await uploadImage(file);
    setValues((v) => v && { ...v, productImageUrl: url });
    setUploadingProduct(false);
  };

  const handleRefUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!values) return;
    const files = Array.from(e.target.files ?? []).slice(0, 3 - values.referenceImageUrls.length);
    if (!files.length) return;
    setUploadingRef(true);
    const urls = await Promise.all(files.map(uploadImage));
    setValues((v) => v && { ...v, referenceImageUrls: [...v.referenceImageUrls, ...urls].slice(0, 3) });
    setUploadingRef(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!values) return;
    setLoading(true);

    await fetch(`/api/activities/${activityId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        theme: values.theme,
        focusPoint: values.focusPoint,
        productImageUrl: values.productImageUrl,
        referenceImageUrls: values.referenceImageUrls,
        _regenerate: true, // delete old layouts + reset to PENDING
      }),
    });

    router.push(`/clients/${clientId}/activities/${activityId}`);
  };

  if (!values) return <div className="text-gray-400">載入中...</div>;

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <Link href={`/clients/${clientId}/activities/${activityId}`} className="text-gray-400 hover:text-gray-700">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-semibold">編輯活動</h1>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-6 text-sm text-amber-700">
        儲存後將會刪除舊的 3 款版型，重新用 AI 生成新版本。
      </div>

      <form onSubmit={handleSubmit} className="space-y-5 max-w-lg">
        <div className="space-y-1">
          <Label>活動主題 *</Label>
          <Input
            value={values.theme}
            onChange={(e) => setValues((v) => v && { ...v, theme: e.target.value })}
            required
          />
        </div>

        <div className="space-y-1">
          <Label>訴求重點 *</Label>
          <Input
            value={values.focusPoint}
            onChange={(e) => setValues((v) => v && { ...v, focusPoint: e.target.value })}
            required
          />
        </div>

        <div className="space-y-2">
          <Label>產品主圖</Label>
          <div className="flex items-center gap-3">
            <img
              src={values.productImageUrl}
              alt="product"
              className="w-24 h-24 object-cover rounded-lg border"
            />
            <label className="flex flex-col items-center justify-center w-24 h-24 border-2 border-dashed rounded-lg cursor-pointer hover:bg-gray-50">
              {uploadingProduct ? (
                <Loader2 className="h-5 w-5 text-gray-400 animate-spin" />
              ) : (
                <>
                  <Upload className="h-5 w-5 text-gray-400" />
                  <span className="text-xs text-gray-400 mt-1">換圖</span>
                </>
              )}
              <input type="file" accept="image/*" className="hidden" onChange={handleProductUpload} />
            </label>
          </div>
        </div>

        <div className="space-y-2">
          <Label>參考圖（最多 3 張）</Label>
          <div className="flex gap-2 flex-wrap">
            {values.referenceImageUrls.map((url, i) => (
              <div key={i} className="relative w-20 h-20">
                <img src={url} alt={`ref-${i}`} className="w-20 h-20 object-cover rounded-lg border" />
                <button
                  type="button"
                  className="absolute -top-1 -right-1 bg-white rounded-full border p-0.5 shadow"
                  onClick={() =>
                    setValues((v) =>
                      v && { ...v, referenceImageUrls: v.referenceImageUrls.filter((_, idx) => idx !== i) }
                    )
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

        <Button type="submit" disabled={loading}>
          {loading ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" />儲存並重新生成...</>
          ) : (
            "儲存並重新生成"
          )}
        </Button>
      </form>
    </div>
  );
}
