"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BrandSettingsForm, type BrandFormValues } from "@/components/clients/BrandSettingsForm";

export default function ClientSettingsPage({ params }: { params: Promise<{ clientId: string }> }) {
  const [clientId, setClientId] = useState<string>("");
  const [client, setClient] = useState<BrandFormValues | null>(null);
  const router = useRouter();

  useEffect(() => {
    params.then(({ clientId }) => {
      setClientId(clientId);
      fetch(`/api/clients/${clientId}`).then((r) => r.json()).then(setClient);
    });
  }, [params]);

  const handleSubmit = async (values: BrandFormValues) => {
    await fetch(`/api/clients/${clientId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    router.push(`/clients/${clientId}`);
    router.refresh();
  };

  if (!client) return <div className="text-gray-400">載入中...</div>;

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6">品牌設定</h1>
      <BrandSettingsForm initialValues={client} onSubmit={handleSubmit} submitLabel="更新設定" />
    </div>
  );
}
