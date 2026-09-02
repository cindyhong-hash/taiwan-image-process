import Link from "next/link";
import Image from "next/image";
import { ShoppingBag, Image as ImageIcon, ChevronRight } from "lucide-react";
import { FreeLayoutIcon } from "@/components/icons/FreeLayoutIcon";

export function QuickStartCards({ clientId }: { clientId: string }) {
  const cards = [
    { title: "AI 廣告圖", sub: "IG / FB 廣告素材", icon: ShoppingBag, href: `/clients/${clientId}/activities/new`, tint: "bg-[#fff0f6] text-pink-500", preview: "/quickstart/ad.png" },
    { title: "產品情境", sub: "產品情境圖", icon: ImageIcon, href: `/clients/${clientId}/components/new`, tint: "bg-[#e6f7ff] text-blue-500", preview: "/quickstart/scene.png" },
    { title: "自由排版", sub: "選擇專業的底圖與素材，自由移動，打造專屬設計", icon: FreeLayoutIcon, href: `/magic-layers/compose?blank=1&clientId=${clientId}`, tint: "bg-[#ecdfff] text-violet-600", preview: "/quickstart/freelayout.png" },
  ];
  return (
    <section>
      <h2 className="mb-4 text-base font-semibold text-gray-900">開始創作</h2>
      <div className="grid grid-cols-3 gap-3">
        {cards.map((c) => (
          <Link key={c.title} href={c.href}
            className="group flex flex-col gap-3 overflow-hidden rounded-2xl border border-[#ebebeb] bg-white px-5 pb-3 pt-4 transition-all hover:border-violet-300 hover:shadow-sm">
            {/* 標題列：icon + 標題/副標 + 箭頭 */}
            <div className="flex items-center gap-3">
              <span className={`flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full ${c.tint}`}>
                <c.icon className="h-6 w-6" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-base font-bold text-gray-900">{c.title}</div>
                <div className="mt-0.5 text-xs text-gray-500 line-clamp-2">{c.sub}</div>
              </div>
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-xl bg-[#f3e8ff] text-violet-600 transition-colors group-hover:bg-violet-200">
                <ChevronRight className="h-3.5 w-3.5" />
              </span>
            </div>
            {/* 預覽圖 */}
            <div className="relative h-[210px] w-full overflow-hidden rounded-xl bg-gray-50">
              <Image src={c.preview} alt="" fill className="object-cover" sizes="(max-width: 768px) 100vw, 33vw" />
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
