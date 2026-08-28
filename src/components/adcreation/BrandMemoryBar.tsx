import Link from "next/link";
import { ShieldCheck, Settings } from "lucide-react";

function parseColors(data: unknown): string[] {
  if (Array.isArray(data)) return data.filter((x): x is string => typeof x === "string");
  if (typeof data === "string") { try { const v = JSON.parse(data); return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []; } catch { return []; } }
  return [];
}

export function BrandMemoryBar({ clientId, primaryColor, secondaryColor, paletteColors, toneLabels = [], taboos = [] }: {
  clientId: string; primaryColor?: string; secondaryColor?: string | null; paletteColors?: unknown; toneLabels?: string[]; taboos?: string[];
}) {
  const swatches = [primaryColor, secondaryColor, ...parseColors(paletteColors)].filter((c): c is string => !!c).filter((c, i, a) => a.indexOf(c) === i).slice(0, 4);
  return (
    <div className="mb-6 flex flex-wrap items-center gap-x-8 gap-y-3 rounded-2xl border border-gray-200 bg-white px-5 py-4">
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-100"><ShieldCheck className="h-4 w-4 text-violet-600" /></span>
        <div className="leading-tight">
          <div className="text-sm font-semibold text-gray-900">AI 品牌記憶</div>
          <div className="text-[11px] text-gray-400">已套用你的品牌設定</div>
        </div>
      </div>
      {swatches.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">視覺基調</span>
          <div className="flex gap-1.5">{swatches.map((c, i) => <span key={i} className="h-7 w-7 rounded-md border border-gray-100" style={{ background: c }} />)}</div>
        </div>
      )}
      {toneLabels.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">視覺風格</span>
          <div className="flex flex-wrap gap-1.5">{toneLabels.map((t) => <span key={t} className="rounded-md bg-violet-50 px-2 py-0.5 text-xs text-violet-600">{t}</span>)}</div>
        </div>
      )}
      {taboos.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-red-500">風格禁忌</span>
          <div className="flex flex-wrap gap-1.5">{taboos.map((t) => <span key={t} className="rounded-md bg-red-50 px-2 py-0.5 text-xs text-red-500">{t}</span>)}</div>
        </div>
      )}
      <Link href={`/clients/${clientId}/settings`} className="ml-auto flex items-center gap-1.5 rounded-lg border border-violet-200 px-3 py-1.5 text-xs font-medium text-violet-600 hover:bg-violet-50">
        <Settings className="h-3.5 w-3.5" /> 編輯品牌設定
      </Link>
    </div>
  );
}
