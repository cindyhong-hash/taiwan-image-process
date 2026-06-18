"use client";
import { useEffect, useState } from "react";
import { EditorCanvas } from "@/components/activities/EditorCanvas";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

type Layout = { id: string; imageUrl: string; copyText: string; layoutType: string; isSelected: boolean };
type Activity = { id: string; theme: string; generatedLayouts: Layout[] };

export default function EditorPage({ params }: { params: Promise<{ clientId: string; activityId: string }> }) {
  const [clientId, setClientId] = useState<string>("");
  const [activityId, setActivityId] = useState<string>("");
  const [activity, setActivity] = useState<Activity | null>(null);

  useEffect(() => {
    params.then(({ clientId, activityId }) => {
      setClientId(clientId);
      setActivityId(activityId);
      fetch(`/api/activities/${activityId}`).then((r) => r.json()).then(setActivity);
    });
  }, [params]);

  if (!activity) return <div className="text-gray-400">載入中...</div>;

  const selectedLayout =
    activity.generatedLayouts.find((l) => l.isSelected) ?? activity.generatedLayouts[0];

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <Link href={`/clients/${clientId}/activities/${activityId}`} className="text-gray-400 hover:text-gray-700">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-semibold">{activity.theme} — 微調畫布</h1>
      </div>
      <EditorCanvas layout={selectedLayout} />
    </div>
  );
}
