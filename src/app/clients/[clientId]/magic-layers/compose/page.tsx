"use client";
/* Brand-scoped Magic Layers compose. Lives under /clients/[clientId] so the app
   shell renders the brand sidebar AND highlights the active brand; clientId comes
   from the route (drives the 背景庫 that mirrors this brand's 素材庫). */
import { useEffect, useState } from "react";
import { ComposeView } from "@/components/magic-layers/ComposeView";

export default function BrandComposePage({ params }: { params: Promise<{ clientId: string }> }) {
  const [clientId, setClientId] = useState<string>("");
  useEffect(() => { params.then(({ clientId }) => setClientId(clientId)); }, [params]);
  if (!clientId) return <div className="text-gray-400">載入中...</div>;
  return <ComposeView clientId={clientId} />;
}
