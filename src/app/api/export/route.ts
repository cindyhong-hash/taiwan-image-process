import { NextResponse } from "next/server";

const SIZE_MAP = {
  fb: { label: "1200x630", width: 1200, height: 630 },
  ig: { label: "1080x1080", width: 1080, height: 1080 },
};

export async function POST(request: Request) {
  const { imageUrl, size } = await request.json();
  if (!imageUrl || !size || !(size in SIZE_MAP)) {
    return NextResponse.json({ error: "imageUrl and size (fb|ig) required" }, { status: 400 });
  }
  const sizeInfo = SIZE_MAP[size as keyof typeof SIZE_MAP];
  return NextResponse.json({
    url: imageUrl,
    sizeLabel: sizeInfo.label,
    filename: `export-${size}-${sizeInfo.label}.png`,
  });
}
