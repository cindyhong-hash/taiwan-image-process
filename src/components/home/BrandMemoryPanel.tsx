import Link from "next/link";
import { ArrowRight, CircleSlash } from "lucide-react";

/**
 * client.paletteColors 來自 `/api/clients/[clientId]` 未解析的原始值——
 * DB 存 JSON 字串（見 prisma schema `paletteColors String @default("[]")`），
 * PATCH 時前端亦可能已傳 array 過嚟，所以兩種形狀都要接（同 BrandMemoryCards.tsx 做法一致）。
 */
function parseColors(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((x) => typeof x === "string") as string[];
  if (typeof raw === "string") {
    try {
      const a = JSON.parse(raw);
      return Array.isArray(a) ? a.filter((x) => typeof x === "string") : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function BrandMemoryPanel({
  clientId,
  primaryColor,
  secondaryColor,
  paletteColors,
  toneLabels = [],
  taboos = [],
}: {
  clientId: string;
  primaryColor?: string;
  secondaryColor?: string | null;
  paletteColors?: unknown;
  toneLabels?: string[];
  taboos?: string[];
}) {
  const swatches = [primaryColor, secondaryColor, ...parseColors(paletteColors)]
    .filter((c): c is string => !!c)
    .filter((c, i, arr) => arr.indexOf(c) === i)
    .slice(0, 4);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-semibold text-gray-900">AI 品牌記憶</h3>
        <Link href={`/clients/${clientId}/settings`} className="rounded-md bg-violet-50 px-2.5 py-1 text-xs text-violet-600">
          編輯
        </Link>
      </div>
      <div className="mb-4">
        <div className="mb-2 text-xs text-gray-500">視覺基調</div>
        {swatches.length > 0 ? (
          <div className="flex gap-2">
            {swatches.map((c, i) => (
              <span key={`${c}-${i}`} className="h-8 w-8 rounded-lg border border-gray-100" style={{ background: c }} />
            ))}
          </div>
        ) : (
          <div className="text-xs text-gray-400">未設定品牌色</div>
        )}
      </div>
      <div className="mb-4">
        <div className="mb-2 text-xs text-gray-500">視覺風格</div>
        {toneLabels.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {toneLabels.map((t) => (
              <span key={t} className="rounded-md bg-violet-50 px-2 py-1 text-xs text-violet-600">
                {t}
              </span>
            ))}
          </div>
        ) : (
          <div className="text-xs text-gray-400">未設定</div>
        )}
      </div>
      <div className="my-3 border-t border-gray-100" />
      <div className="mb-4">
        <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-red-500">
          <CircleSlash className="h-3 w-3" /> 風格禁忌
        </div>
        <div className="text-xs text-gray-600">{taboos.length ? taboos.join(" · ") : "未設定"}</div>
      </div>
      <Link
        href={`/clients/${clientId}/settings`}
        className="flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 py-2 text-sm text-gray-700 hover:bg-gray-50"
      >
        前往品牌設定 <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );
}
