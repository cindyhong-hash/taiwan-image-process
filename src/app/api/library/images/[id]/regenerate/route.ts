import { after, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  prepareImageSetRegeneration,
  regenerateImageSetItem,
  requestImageSetRegeneration,
} from "@/lib/products/image-set-orchestrator";

// Vercel Hobby 硬上限 300s；設 290（單張重生，遠低於上限，足夠）。
export const maxDuration = 290;

/** Re-runs only one saved product image-set role; sibling assets are never touched. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await requestImageSetRegeneration(id, {
    prepare: prepareImageSetRegeneration,
    claimFailedRow: async (rowId) => {
      const claimed = await db.libraryImage.updateMany({
        where: { id: rowId, status: "FAILED" },
        data: { status: "GENERATING", errorMessage: null },
      });
      return claimed.count === 1;
    },
    scheduleAfter: (callback) => after(callback),
    regenerate: regenerateImageSetItem,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ id: result.id, status: result.status });
}
