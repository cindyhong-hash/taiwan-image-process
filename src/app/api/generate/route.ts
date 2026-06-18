import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { anthropic } from "@/lib/anthropic";
import { buildCopyPrompt } from "@/lib/prompts";
import { extractStyleComponents, buildAiPromptText } from "@/lib/extract-components";
import { LAYOUT_CONFIGS } from "@/types";
import type { LayoutType } from "@/types";

// Mock image URLs for each layout type (replace with DALL-E 3 when key is available)
const MOCK_IMAGES: Record<string, string> = {
  A: "https://picsum.photos/seed/layoutA/1024/1024",
  B: "https://picsum.photos/seed/layoutB/1024/1024",
  C: "https://picsum.photos/seed/layoutC/1024/1024",
};

export async function POST(request: Request) {
  const { activityId } = await request.json();
  if (!activityId) {
    return NextResponse.json({ error: "activityId required" }, { status: 400 });
  }

  const activity = await db.activity.findUnique({
    where: { id: activityId },
    include: { client: true },
  });
  if (!activity) {
    return NextResponse.json({ error: "Activity not found" }, { status: 404 });
  }

  await db.activity.update({ where: { id: activityId }, data: { status: "GENERATING" } });

  const { client } = activity;
  const toneLabels: string[] = JSON.parse(client.toneLabels);
  const taboos: string[] = JSON.parse(client.taboos);

  const layouts = await Promise.all(
    LAYOUT_CONFIGS.map(async (layoutConfig) => {
      // Generate copy with Claude
      const copyPrompt = buildCopyPrompt({
        theme: activity.theme,
        focusPoint: activity.focusPoint,
        toneLabels,
        layoutType: layoutConfig.type,
        taboos,
      });

      const copyResponse = await anthropic.messages.create({
        model: "claude-opus-4-5",
        max_tokens: 300,
        messages: [{ role: "user", content: copyPrompt }],
      });

      const copyText = (copyResponse.content[0] as { text: string }).text;

      // Use mock image (swap for DALL-E 3 later)
      const imageUrl = MOCK_IMAGES[layoutConfig.type];

      // Extract style components
      const styleComponents = extractStyleComponents({
        layoutType: layoutConfig.type as LayoutType,
        primaryColor: client.primaryColor,
        secondaryColor: client.secondaryColor ?? undefined,
        toneLabels,
      });

      // Save layout to DB
      const savedLayout = await db.generatedLayout.create({
        data: {
          activityId,
          layoutType: layoutConfig.type,
          imageUrl,
          copyText,
          styleComponents: JSON.stringify(styleComponents),
        },
      });

      // Save style components to component library
      const today = new Date().toLocaleDateString("zh-TW");
      const aiPrompts = buildAiPromptText({
        layoutType: layoutConfig.type as LayoutType,
        primaryColor: client.primaryColor,
        secondaryColor: client.secondaryColor ?? undefined,
        toneLabels,
      });
      await db.styleComponent.createMany({
        data: [
          {
            name: `構圖-${layoutConfig.label}-${today}`,
            type: "COMPOSITION",
            data: JSON.stringify(styleComponents.composition),
            sourceLayoutId: savedLayout.id,
            clientId: activity.clientId,
            aiPromptText: aiPrompts.composition,
          },
          {
            name: `配色-${client.primaryColor}-${today}`,
            type: "COLOR_SCHEME",
            data: JSON.stringify(styleComponents.colorScheme),
            sourceLayoutId: savedLayout.id,
            clientId: activity.clientId,
            aiPromptText: aiPrompts.color,
          },
          {
            name: `語氣-${toneLabels[0] ?? "標準"}-${layoutConfig.label}`,
            type: "COPY_TONE",
            data: JSON.stringify(styleComponents.copyTone),
            sourceLayoutId: savedLayout.id,
            clientId: activity.clientId,
            aiPromptText: aiPrompts.tone,
          },
        ],
      });

      return savedLayout;
    })
  );

  await db.activity.update({ where: { id: activityId }, data: { status: "DONE" } });

  return NextResponse.json({ layouts });
}
