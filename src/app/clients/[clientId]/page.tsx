"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Settings, Plus } from "lucide-react";

type Activity = { id: string; theme: string; focusPoint: string; status: string; createdAt: string };
type Client = { id: string; name: string; activities: Activity[] };

const STATUS_LABEL: Record<string, string> = { PENDING: "待生成", GENERATING: "生成中", DONE: "已完成" };
const STATUS_VARIANT: Record<string, "secondary" | "outline" | "default"> = {
  PENDING: "secondary",
  GENERATING: "outline",
  DONE: "default",
};

export default function ClientFolderPage({ params }: { params: Promise<{ clientId: string }> }) {
  const [clientId, setClientId] = useState<string>("");
  const [client, setClient] = useState<Client | null>(null);

  useEffect(() => {
    params.then(({ clientId }) => {
      setClientId(clientId);
      fetch(`/api/clients/${clientId}`).then((r) => r.json()).then(setClient);
    });
  }, [params]);

  if (!client) return <div className="text-gray-400">載入中...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">{client.name}</h1>
        <div className="flex gap-2">
          <Link href={`/clients/${clientId}/settings`}>
            <Button variant="outline" size="sm">
              <Settings className="h-4 w-4 mr-1" />品牌設定
            </Button>
          </Link>
          <Link href={`/clients/${clientId}/activities/new`}>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" />新增活動
            </Button>
          </Link>
        </div>
      </div>

      {client.activities.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          還沒有活動，點右上角「新增活動」開始
        </div>
      ) : (
        <div className="space-y-2">
          {client.activities.map((act) => (
            <Link key={act.id} href={`/clients/${clientId}/activities/${act.id}`}>
              <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 cursor-pointer">
                <div>
                  <div className="font-medium">{act.theme}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{act.focusPoint}</div>
                  <div className="text-xs text-gray-300 mt-0.5">
                    {new Date(act.createdAt).toLocaleDateString("zh-TW")}
                  </div>
                </div>
                <Badge variant={STATUS_VARIANT[act.status]}>{STATUS_LABEL[act.status]}</Badge>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
