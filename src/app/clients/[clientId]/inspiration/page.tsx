"use client";
import { useEffect, useState } from "react";
import { InspirationClient } from "@/components/inspiration/InspirationClient";

export default function InspirationPage({ params }: { params: Promise<{ clientId: string }> }) {
  const [clientId, setClientId] = useState("");
  useEffect(() => {
    params.then(({ clientId }) => setClientId(clientId));
  }, [params]);
  if (!clientId) return null;
  return <InspirationClient clientId={clientId} />;
}
