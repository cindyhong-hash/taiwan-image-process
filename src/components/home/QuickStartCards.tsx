import Link from "next/link";
import { ShoppingBag, Image as ImageIcon, ChevronRight } from "lucide-react";
import { FreeLayoutIcon } from "@/components/icons/FreeLayoutIcon";
export function QuickStartCards({ clientId }: { clientId: string }) {
  const cards = [
    { title: "AI 廣告圖", sub: "IG / FB 廣告素材", icon: ShoppingBag, href: `/clients/${clientId}/activities/new`, tint: "bg-pink-100 text-pink-500" },
    { title: "產品情境", sub: "產品情境圖", icon: ImageIcon, href: `/clients/${clientId}/components/new`, tint: "bg-blue-100 text-blue-500" },
    { title: "自由排版", sub: "選擇專業的底圖與素材，自由移動，打造專屬設計", icon: FreeLayoutIcon, href: `/magic-layers/compose?blank=1&clientId=${clientId}`, tint: "bg-violet-100 text-violet-500" },
  ];
  return (
    <section>
      <h2 className="mb-4 text-base font-semibold text-gray-900">開始創作</h2>
      <div className="grid grid-cols-3 gap-3">
        {cards.map(c => (
          <Link key={c.title} href={c.href}
            className="group relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-5 transition-all hover:border-violet-300 hover:shadow-sm">
            <div className="mb-6 flex items-start justify-between">
              <span className={`flex h-13 w-13 items-center justify-center rounded-xl ${c.tint}`} style={{ height: 52, width: 52 }}>
                <c.icon className="h-6 w-6" />
              </span>
              <ChevronRight className="h-5 w-5 text-gray-300 group-hover:text-violet-400" />
            </div>
            <div className="text-lg font-semibold text-gray-900">{c.title}</div>
            <div className="mt-1 text-sm text-gray-400">{c.sub}</div>
          </Link>
        ))}
      </div>
    </section>
  );
}
