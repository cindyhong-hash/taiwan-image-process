import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      clientId,
      requiredText, imagePrompt, imageRatio, imageModel, customW, customH,
      productImageUrls, referenceImageUrls, selectedComponentIds,
      baseImageUrl, typographyMood,
      layoutId, genMode, cells, logoMode, variantCount, variantChoice,  // [MULTI] 多圖欄位
    } = body;

    if (!clientId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // 自動從必放文字或畫面描述帶入主題
    const theme = requiredText?.slice(0, 30) || imagePrompt?.slice(0, 30) || "未命名活動";

    const imgUrls: string[] = productImageUrls ?? [];

    const activity = await db.activity.create({
      data: {
        clientId,
        theme,
        focusPoint:           requiredText || "",
        titleText:            requiredText || null,
        subtitleText:         null,
        imagePrompt:          imagePrompt   || null,
        productImageUrl:      imgUrls[0]   ?? "",
        productImageUrls:     JSON.stringify(imgUrls),
        referenceImageUrls:   JSON.stringify(referenceImageUrls  ?? []),
        selectedComponentIds: JSON.stringify(selectedComponentIds ?? []),
        imageRatio:           imageRatio ?? "1:1",
        customW:              Number(customW) > 0 ? Math.round(Number(customW)) : 0,
        customH:              Number(customH) > 0 ? Math.round(Number(customH)) : 0,
        imageModel:           imageModel ?? "google/gemini-3-pro-image-preview",
        baseImageUrl:         baseImageUrl || null,  // [2b] 底圖模式
        typographyMood:       typographyMood || null, // [2b] 特效字風格 override
        // [MULTI] 多圖版型欄位（single 時走他的單圖流程）
        layoutId:             layoutId ?? "single",
        genMode:              genMode ?? "unified",
        cells:                JSON.stringify(cells ?? []),
        logoMode:             logoMode ?? "first",
        variantCount:         Number(variantCount) === 2 ? 2 : 1,
        variantChoice:        variantChoice === "B" ? "B" : "A",
        status: "PENDING",
      },
    });

    return NextResponse.json(activity, { status: 201 });
  } catch (err) {
    console.error("[POST /api/activities]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
