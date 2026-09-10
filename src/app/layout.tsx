import type { Metadata } from "next";
import { Geist, Noto_Sans_TC, Noto_Serif_TC, Manrope } from "next/font/google";
import "./globals.css";
import { MainLayout } from "@/components/layout/MainLayout";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

/* 設計畫布用的字體。
   之前整個 app 只載 Geist（拉丁），而畫布圖層寫的是
   `'Noto Sans TC','PingFang TC',system-ui` —— 沒有人載入 Noto Sans TC，
   所以實際渲染出什麼字完全取決於觀看者的作業系統：
   這台 Mac 掉到 PingFang、Windows 掉到微軟正黑體，
   同一張設計稿在不同電腦上是不同字體。編輯器選單裡的 Manrope 更是從未存在。

   這裡把它們真正載進來，讓設計稿跨機器一致。
   preload: false —— 中文字體是依 unicode-range 切片的大量檔案，
   預載會拖慢每一頁；改成用到才抓（畫布才會用到，一般頁面不需要）。 */
const notoSansTC = Noto_Sans_TC({
  variable: "--font-noto-sans-tc",
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
  display: "swap",
  preload: false,
});
const notoSerifTC = Noto_Serif_TC({
  variable: "--font-noto-serif-tc",
  subsets: ["latin"],
  weight: ["400", "700", "900"],
  display: "swap",
  preload: false,
});
const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["400", "700", "800"],
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "行銷圖文工具",
  robots: { index: false, follow: false, nocache: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW" className={`${geistSans.variable} ${notoSansTC.variable} ${notoSerifTC.variable} ${manrope.variable} h-full antialiased`}>
      <body className="min-h-full">
        <MainLayout>{children}</MainLayout>
      </body>
    </html>
  );
}
