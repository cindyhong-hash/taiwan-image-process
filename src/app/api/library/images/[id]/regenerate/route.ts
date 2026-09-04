import { after, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  prepareImageSetRegeneration,
  regenerateImageSetItem,
  requestImageSetRegeneration,
} from "@/lib/products/image-set-orchestrator";

export const maxDuration = 120;

/** Re-runs only one saved product image-set role; sibling assets are never touched. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await requestImageSetRegeneration(id, {
    prepare: prepareImageSetRegeneration,
    updateRow: (rowId, data) => db.libraryImage.update({ where: { id: rowId }, data }),
    scheduleAfter: (callback) => after(callback),
    regenerate: regenerateImageSetItem,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ id: result.id, status: result.status });
}
