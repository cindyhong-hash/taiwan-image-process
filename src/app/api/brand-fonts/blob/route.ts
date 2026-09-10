/**
 * 品牌字體的 Blob 直傳授權。
 *
 * 為什麼不能直接 POST 檔案給 /api/brand-fonts：
 * Next.js route handler 的 body 上限是 10MB，而 Vercel serverless 更只有 4.5MB。
 * 中文字體動輒 5–20MB（我們自己打包的 Noto Sans TC 就 11.9MB），
 * 直傳到函式在正式站一定失敗。
 *
 * 這支只發一個短效 token，檔案由瀏覽器直接送到 Vercel Blob，不經過函式。
 * 上傳完成後前端再呼叫 POST /api/brand-fonts 建立 DB 記錄（只帶 URL，body 很小）。
 */
import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

const ALLOWED_CONTENT = ["font/woff2", "font/woff", "font/ttf", "font/otf", "application/octet-stream"];

export async function POST(request: Request) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    // 本機沒設 Blob 時回 501，前端會退回走 multipart（小檔可用）。
    return NextResponse.json({ error: "blob-not-configured" }, { status: 501 });
  }
  const body = (await request.json()) as HandleUploadBody;
  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ALLOWED_CONTENT,
        maximumSizeInBytes: 30 * 1024 * 1024,
        addRandomSuffix: true,
      }),
      // 這個 callback 只有部署在 Vercel 時才會被回呼（本機收不到），
      // 所以 DB 記錄改由前端上傳成功後自己呼叫 POST /api/brand-fonts 建立。
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "上傳授權失敗" }, { status: 400 });
  }
}
