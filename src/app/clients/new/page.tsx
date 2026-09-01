"use client";
import { useRouter } from "next/navigation";
import { BrandSettingsForm, type BrandFormValues } from "@/components/clients/BrandSettingsForm";

export default function NewClientPage() {
  const router = useRouter();

  const handleSubmit = async (values: BrandFormValues) => {
    const res = await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const client = await res.json();
    router.push(`/clients/${client.id}`);
    router.refresh();
  };

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold mb-6">新增客戶</h1>
      <BrandSettingsForm onSubmit={handleSubmit} submitLabel="建立客戶資料夾" />
    </div>
  );
}
