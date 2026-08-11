import type { NextConfig } from "next";
import { readFileSync } from "node:fs";

// 版本號單一來源 = package.json；build 時注入 client bundle，喺 UI 左下角顯示。
const { version } = JSON.parse(readFileSync("./package.json", "utf8")) as { version: string };

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_APP_VERSION: version },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "*.public.blob.vercel-storage.com" }],
  },
  // Vercel serverless runtime 冇裝中文字型，sharp 用 SVG 燒字需要打包埋 assets/fonts/
  // （Noto Sans TC + fontconfig），否則中文字會變 tofu box。見 src/lib/fonts.ts。
  outputFileTracingIncludes: {
    "/*": ["./assets/fonts/**/*"],
  },
};

export default nextConfig;
