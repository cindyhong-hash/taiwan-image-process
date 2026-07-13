"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ActivityForm, type ActivityFormValues } from "@/components/activities/ActivityForm";

export default function NewActivityPage({ params }: { params: Promise<{ clientId: string }> }) {
  const [clientId, setClientId] = useState("");
  const router = useRouter();

  // 由素材 popup「帶入作活動圖參考」跳過嚟：URL 存喺 sessionStorage（唔喺網址外露）。
  // 同步喺首次 render 讀取並清走，令 ActivityForm mount 時已有預填參考圖。
  const [initialRef] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const v = sessionStorage.getItem("activityRefImage");
    if (v) sessionStorage.removeItem("activityRefImage");
    return v;
  });

  useEffect(() => {
    params.then(({ clientId }) => setClientId(clientId));
  }, [params]);

  const handleSubmit = async (values: ActivityFormValues) => {
    const res = await fetch("/api/activities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...values, clientId }),
    });
    const activity = await res.json();
    router.push(`/clients/${clientId}/activities/${activity.id}`);
  };

  if (!clientId) return null;

  return (
    <div className="max-w-xl">
      <h1 className="text-xl font-semibold mb-8">新增活動</h1>
      <ActivityForm clientId={clientId} onSubmit={handleSubmit}
        initialValues={initialRef ? { referenceImageUrls: [initialRef] } : undefined} />
    </div>
  );
}
