"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { ActivityForm, type ActivityFormValues } from "@/components/activities/ActivityForm";

export default function EditActivityPage({
  params,
}: {
  params: Promise<{ clientId: string; activityId: string }>;
}) {
  const [clientId,   setClientId]   = useState("");
  const [activityId, setActivityId] = useState("");
  const [initial,    setInitial]    = useState<Partial<ActivityFormValues> | null>(null);
  const router = useRouter();

  useEffect(() => {
    params.then(({ clientId, activityId }) => {
      setClientId(clientId);
      setActivityId(activityId);
      fetch(`/api/activities/${activityId}`)
        .then((r) => r.json())
        .then((data) =>
          setInitial({
            requiredText:         data.titleText ?? data.focusPoint ?? "",
            imagePrompt:          data.imagePrompt ?? "",
            imageRatio:           data.imageRatio ?? "1:1",
            customW:              data.customW ?? 0,
            customH:              data.customH ?? 0,
            imageModel:           data.imageModel ?? "google/gemini-3-pro-image-preview",
            productImageUrls:     data.productImageUrls  ?? [],
            referenceImageUrls:   data.referenceImageUrls ?? [],
            selectedComponentIds: data.selectedComponentIds ?? [],
            baseImageUrl:         data.baseImageUrl ?? undefined, // [2b] 底圖模式：編輯時要保留，唔可以 fallback 去普通生成
          })
        );
    });
  }, [params]);

  const handleSubmit = async (values: ActivityFormValues) => {
    await fetch(`/api/activities/${activityId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        theme:                values.requiredText?.slice(0, 30) || values.imagePrompt?.slice(0, 30) || "未命名活動",
        focusPoint:           values.requiredText,
        titleText:            values.requiredText,
        imagePrompt:          values.imagePrompt,
        imageRatio:           values.imageRatio,
        customW:              values.customW,
        customH:              values.customH,
        imageModel:           values.imageModel,
        productImageUrls:     values.productImageUrls,
        referenceImageUrls:   values.referenceImageUrls,
        selectedComponentIds: values.selectedComponentIds,
        baseImageUrl:         values.baseImageUrl ?? null, // [2b] 底圖模式 round-trip（取消底圖 → null → 轉普通生成）
        _regenerate: true,
      }),
    });
    router.push(`/clients/${clientId}/activities/${activityId}`);
  };

  if (!initial) return <div className="text-gray-400">載入中...</div>;

  return (
    <div className="max-w-xl">
      <div className="flex items-center gap-2 mb-6">
        <Link
          href={`/clients/${clientId}/activities/${activityId}`}
          className="text-gray-400 hover:text-gray-700"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-semibold">編輯活動</h1>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-8 text-sm text-amber-700">
        儲存後將刪除舊的 3 款版型，重新用 AI 生成新版本。
      </div>

      <ActivityForm
        clientId={clientId}
        initialValues={initial}
        submitLabel="儲存並重新生成"
        onSubmit={handleSubmit}
      />
    </div>
  );
}
