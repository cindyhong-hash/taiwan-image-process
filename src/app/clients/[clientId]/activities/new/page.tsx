"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ActivityForm, type ActivityFormValues } from "@/components/activities/ActivityForm";

export default function NewActivityPage({ params }: { params: Promise<{ clientId: string }> }) {
  const [clientId, setClientId] = useState<string>("");
  const router = useRouter();

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
    <div>
      <h1 className="text-xl font-semibold mb-6">新增活動</h1>
      <ActivityForm clientId={clientId} onSubmit={handleSubmit} />
    </div>
  );
}
