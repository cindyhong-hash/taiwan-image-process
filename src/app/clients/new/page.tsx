"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { BrandSettingsForm, type BrandFormValues } from "@/components/clients/BrandSettingsForm";

export default function NewClientPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (values: BrandFormValues) => {
    setError(null);
    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const client = await res.json().catch(() => ({}));
      // 原本沒檢查 res.ok：失敗時 client.id 是 undefined，直接跳到
      // /clients/undefined（一個不存在的品牌頁），使用者看不出哪裡錯了。
      // 後端的 error 是英文開發訊息（"name and primaryColor are required"），
      // 不要直接丟給使用者看。
      if (!res.ok || !client?.id) throw new Error("create failed");
      router.push(`/clients/${client.id}`);
      router.refresh();
    } catch (e) {
      setError("建立失敗，請稍後再試一次。你的內容仍保留在下方表單。");
      throw e;   // 讓表單知道失敗，不要亮出「已更新」
    }
  };

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold mb-6">新增客戶</h1>
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {error}
        </div>
      )}
      <BrandSettingsForm onSubmit={handleSubmit} submitLabel="建立客戶資料夾" />
    </div>
  );
}
