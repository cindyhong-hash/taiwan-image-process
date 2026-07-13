// ⚠️ LEGACY / 暫時無人用（2026-06-26）：同事最初嘅 OpenAI(DALL·E/gpt-image) 出圖引擎，
// 後來圖片生成轉咗去 OpenRouter Gemini，呢個檔已被取代、目前 0 import（grep "@/lib/openai" 為空）。
// 用戶決定留住做後備。將來整合/merge 時若仍然無人用，考慮刪除 + 拎走 OPENAI_API_KEY。詳見 docs/MERGE-MAP.md §8。
import OpenAI from "openai";

let _client: OpenAI | null = null;

export function getOpenAI(): OpenAI {
  if (!_client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is not set in environment");
    _client = new OpenAI({ apiKey });
  }
  return _client;
}

/**
 * Generate an image and return the URL.
 * Model priority: gpt-image-1 → dall-e-3 → dall-e-2 → picsum fallback
 * On billing/permission errors, falls back gracefully instead of crashing.
 */
export async function generateImage(prompt: string, seed?: string): Promise<string> {
  const fallback = `https://picsum.photos/seed/${seed ?? "default"}/1024/1024`;

  if (!process.env.OPENAI_API_KEY) {
    console.warn("[generateImage] No OPENAI_API_KEY — using placeholder");
    return fallback;
  }

  const openai = getOpenAI();

  // Try models in order until one works
  const models = ["gpt-image-1", "dall-e-3", "dall-e-2"];

  for (const model of models) {
    try {
      console.log(`[generateImage] Trying model: ${model}`);

      const response = await openai.images.generate({
        model,
        prompt: prompt.slice(0, 4000), // safety trim
        n: 1,
        size: "1024x1024",
        ...(model === "dall-e-3" ? { quality: "standard" as const, response_format: "url" as const } : {}),
        ...(model !== "gpt-image-1" ? { response_format: "url" as const } : {}),
      });

      // gpt-image-1 returns b64_json, others return url
      const item = response.data?.[0];
      if (!item) continue;

      if (item.url) {
        console.log(`[generateImage] ✅ Success with ${model}`);
        return item.url;
      }

      if (item.b64_json) {
        // Save b64 to /public/uploads and return local URL
        const buf = Buffer.from(item.b64_json, "base64");
        const { writeFile, mkdir } = await import("fs/promises");
        const { join } = await import("path");
        const dir = join(process.cwd(), "public/uploads");
        await mkdir(dir, { recursive: true });
        const filename = `ai-${seed ?? Date.now()}.png`;
        await writeFile(join(dir, filename), buf);
        console.log(`[generateImage] ✅ Success with ${model} (b64 saved)`);
        return `/uploads/${filename}`;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[generateImage] ❌ ${model} failed: ${msg}`);

      // Billing errors won't be fixed by trying another model
      if (msg.includes("Billing hard limit") || msg.includes("insufficient_quota")) {
        console.error("[generateImage] 💳 OpenAI billing limit reached — using placeholder");
        console.error("→ Fix: platform.openai.com → Billing → raise limit or add credits");
        return fallback;
      }
      // Otherwise try next model
    }
  }

  console.warn("[generateImage] All models failed — using placeholder");
  return fallback;
}
