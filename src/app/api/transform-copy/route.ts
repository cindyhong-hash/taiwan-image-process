import { NextResponse } from "next/server";
import { anthropic } from "@/lib/anthropic";

export async function POST(request: Request) {
  const { copyText, instruction } = await request.json();
  if (!copyText || !instruction) {
    return NextResponse.json({ error: "copyText and instruction required" }, { status: 400 });
  }

  const response = await anthropic.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 300,
    messages: [
      {
        role: "user",
        content: `原始文案：\n${copyText}\n\n指令：${instruction}\n\n只回傳修改後的文案，不要加說明。`,
      },
    ],
  });

  return NextResponse.json({ result: (response.content[0] as { text: string }).text });
}
