import type { NextConfig } from "next";
import { readFileSync } from "node:fs";

// 版本號單一來源 = package.json；build 時注入 client bundle，喺 UI 左下角顯示。
const { version } = JSON.parse(readFileSync("./package.json", "utf8")) as { version: string };

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_APP_VERSION: version },
};

export default nextConfig;
