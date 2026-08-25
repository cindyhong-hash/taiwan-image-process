"use client";
/* Standalone entry (no brand context) — renders inside the app shell so the
   brand sidebar stays visible. Brand-scoped entry lives at
   /clients/[clientId]/magic-layers/compose. */
import { ComposeView } from "@/components/magic-layers/ComposeView";

export default function ComposePage() {
  return <ComposeView />;
}
