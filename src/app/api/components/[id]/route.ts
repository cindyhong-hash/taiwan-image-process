import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await db.styleComponent.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}

// Update an existing component in place (edit mode). Only provided fields change.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: Record<string, any> = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.aiPromptText !== undefined) data.aiPromptText = body.aiPromptText;
  if (body.previewUrl !== undefined) data.previewUrl = body.previewUrl;
  if (body.data !== undefined) data.data = JSON.stringify(body.data);
  if (body.type !== undefined) data.type = body.type;
  if (body.clientId !== undefined) data.clientId = body.clientId;
  // Bump createdAt so the edited component sorts to the top (schema has no updatedAt)
  data.createdAt = new Date();
  try {
    const updated = await db.styleComponent.update({ where: { id }, data });
    return NextResponse.json({ ...updated, data: JSON.parse(updated.data) });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
