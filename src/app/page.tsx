"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getLastClientId } from "@/lib/lastClient";
export default function Home() {
  const router = useRouter();
  useEffect(() => {
    const id = getLastClientId();
    router.replace(id ? `/clients/${id}` : "/clients");
  }, [router]);
  return null;
}
