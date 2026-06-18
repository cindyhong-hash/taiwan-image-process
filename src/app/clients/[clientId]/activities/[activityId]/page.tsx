"use client";
import { useEffect, useState, useRef } from "react";
import { LayoutPicker } from "@/components/activities/LayoutPicker";
import { Loader2, Pencil } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

type GeneratedLayout = { id: string; layoutType: string; imageUrl: string; copyText: string };
type Activity = { id: string; theme: string; focusPoint: string; status: string; generatedLayouts: GeneratedLayout[] };

export default function ActivityPage({ params }: { params: Promise<{ clientId: string; activityId: string }> }) {
  const [clientId, setClientId] = useState<string>("");
  const [activityId, setActivityId] = useState<string>("");
  const [activity, setActivity] = useState<Activity | null>(null);
  const [selectedId, setSelectedId] = useState<string>();
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generationTriggered = useRef(false);

  useEffect(() => {
    params.then(({ clientId, activityId }) => {
      setClientId(clientId);
      setActivityId(activityId);
    });
  }, [params]);

  useEffect(() => {
    if (!activityId) return;

    const fetchActivity = () => {
      fetch(`/api/activities/${activityId}`)
        .then((r) => r.json())
        .then((data: Activity) => {
          setActivity(data);

          // If PENDING and not yet triggered, kick off generation
          if (data.status === "PENDING" && !generationTriggered.current) {
            generationTriggered.current = true;
            fetch("/api/generate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ activityId }),
            });
          }

          if (data.status === "GENERATING" || data.status === "PENDING") {
            pollingRef.current = setTimeout(fetchActivity, 3000);
          }
        });
    };

    fetchActivity();
    return () => {
      if (pollingRef.current) clearTimeout(pollingRef.current);
    };
  }, [activityId]);

  const handleSelect = async (layoutId: string) => {
    setSelectedId(layoutId);
  };

  if (!activity) return <div className="text-gray-400">載入中...</div>;

  if (activity.status === "GENERATING" || activity.status === "PENDING") {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-gray-500">
        <Loader2 className="h-8 w-8 animate-spin" />
        <div className="font-medium">AI 正在生成 3 款版型，請稍候...</div>
        <div className="text-sm text-gray-400">通常需要 15-30 秒</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-semibold">{activity.theme}</h1>
        <Link href={`/clients/${clientId}/activities/${activityId}/edit`}>
          <Button variant="outline" size="sm">
            <Pencil className="h-4 w-4 mr-1" />編輯 / 重新生成
          </Button>
        </Link>
      </div>
      <p className="text-gray-500 text-sm mb-6">{activity.focusPoint}</p>
      <LayoutPicker
        layouts={activity.generatedLayouts}
        selectedId={selectedId}
        activityId={activityId}
        clientId={clientId}
        onSelect={handleSelect}
      />
    </div>
  );
}
