"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { X, Upload, Loader2 } from "lucide-react";
import { INDUSTRY_PRESETS } from "@/types/presets";

// [MERGED] union of WIP(素材庫: taboos) + COLLEAGUE(clients: logoUrl/commonText)
export type LogoVersion = { url: string; label: string };

export type BrandFormValues = {
  name: string;
  primaryColor: string;
  secondaryColor: string;
  logoUrl: string;             // 主要 logo（向後相容；= logoUrls[0]）
  logoUrls: LogoVersion[];     // 多版本 logo（放置標誌時可選）
  toneLabels: string[];
  taboos: string[];      // [WIP/素材庫] 禁忌事項（negative prompts）
  commonText: string;    // [COLLEAGUE] 常用字體（legacy，向後相容保留，UI 已改用 fonts）
  pastPostImageUrls: string[];
  description: string;   // 品牌簡介
  industry: string;      // 品牌產業
  fonts: string[];       // 常用字體（chips）
};

type Props = {
  initialValues?: Partial<BrandFormValues>;
  onSubmit: (values: BrandFormValues) => Promise<void>;
  submitLabel?: string;
};

// ── Card：白底圓角卡片，統一分區外觀 ─────────────────────────────
function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-4">
      <div className="space-y-1">
        <h3 className="text-sm font-bold text-gray-900">{title}</h3>
        {sub && <p className="text-xs text-gray-400">{sub}</p>}
      </div>
      {children}
    </div>
  );
}

export function BrandSettingsForm({ initialValues, onSubmit, submitLabel = "儲存" }: Props) {
  const [values, setValues] = useState<BrandFormValues>({
    name: initialValues?.name ?? "",
    primaryColor: initialValues?.primaryColor ?? "#000000",
    secondaryColor: initialValues?.secondaryColor ?? "",
    logoUrl: initialValues?.logoUrl ?? "",
    // 遷移：舊資料只有單一 logoUrl → 轉成一個版本
    logoUrls: initialValues?.logoUrls?.length
      ? initialValues.logoUrls
      : (initialValues?.logoUrl ? [{ url: initialValues.logoUrl, label: "主要" }] : []),
    toneLabels: initialValues?.toneLabels ?? [],
    taboos: initialValues?.taboos ?? [],
    commonText: initialValues?.commonText ?? "",
    pastPostImageUrls: initialValues?.pastPostImageUrls ?? [],
    description: initialValues?.description ?? "",
    industry: initialValues?.industry ?? "",
    fonts: initialValues?.fonts ?? [],
  });
  const [toneInput, setToneInput] = useState("");
  const [tabooInput, setTabooInput] = useState("");
  const [fontInput, setFontInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [loading, setLoading] = useState(false);

  const addTone = () => {
    const t = toneInput.trim();
    if (t && !values.toneLabels.includes(t)) {
      setValues((v) => ({ ...v, toneLabels: [...v.toneLabels, t] }));
      setToneInput("");
    }
  };

  const addTaboo = () => {
    const t = tabooInput.trim();
    if (t && !values.taboos.includes(t)) {
      setValues((v) => ({ ...v, taboos: [...v.taboos, t] }));
      setTabooInput("");
    }
  };

  const addFont = () => {
    const t = fontInput.trim();
    if (t && !values.fonts.includes(t)) {
      setValues((v) => ({ ...v, fonts: [...v.fonts, t] }));
      setFontInput("");
    }
  };

  const uploadImage = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: formData });
    const data = await res.json();
    return data.url;
  };

  // 上傳一或多個 logo 版本（可多選）。每個版本可自訂標籤（如 橫式 / 完整版 / 圖騰）。
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploadingLogo(true);
    const urls = await Promise.all(files.map(uploadImage));
    setValues((v) => {
      const start = v.logoUrls.length;
      const added = urls.map((url, i) => ({ url, label: `版本 ${start + i + 1}` }));
      const logoUrls = [...v.logoUrls, ...added];
      return { ...v, logoUrls, logoUrl: logoUrls[0]?.url ?? "" };
    });
    setUploadingLogo(false);
    e.target.value = "";
  };

  const removeLogo = (idx: number) =>
    setValues((v) => {
      const logoUrls = v.logoUrls.filter((_, i) => i !== idx);
      return { ...v, logoUrls, logoUrl: logoUrls[0]?.url ?? "" };
    });

  const renameLogo = (idx: number, label: string) =>
    setValues((v) => ({ ...v, logoUrls: v.logoUrls.map((l, i) => (i === idx ? { ...l, label } : l)) }));

  const handlePastPostUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).slice(0, 5 - values.pastPostImageUrls.length);
    if (!files.length) return;
    setUploading(true);
    const urls = await Promise.all(files.map(uploadImage));
    setValues((v) => ({ ...v, pastPostImageUrls: [...v.pastPostImageUrls, ...urls].slice(0, 5) }));
    setUploading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onSubmit(values);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">

      {/* 1. 品牌基本資訊 */}
      <Card title="品牌基本資訊" sub="設定品牌基本資訊以協助 AI 產出更符合背景脈絡的文案與圖文。">
        <div className="space-y-2">
          <Label>品牌 Logo</Label>
          <div className="flex gap-3 flex-wrap">
            {values.logoUrls.map((lg, i) => (
              <div key={i} className="w-28 space-y-1">
                <div className="relative w-28 h-24">
                  <img
                    src={lg.url}
                    alt={lg.label}
                    className="w-28 h-24 object-contain rounded-lg border bg-gray-50 p-1"
                  />
                  <button
                    type="button"
                    className="absolute -top-1 -right-1 bg-white rounded-full border p-0.5 shadow"
                    onClick={() => removeLogo(i)}
                  >
                    <X className="h-3 w-3" />
                  </button>
                  {i === 0 && (
                    <span className="absolute bottom-1 left-1 text-[9px] font-medium bg-black/60 text-white px-1 py-0.5 rounded">主要</span>
                  )}
                </div>
                <Input
                  value={lg.label}
                  onChange={(e) => renameLogo(i, e.target.value)}
                  placeholder="版本名稱"
                  className="h-7 text-xs px-2"
                />
              </div>
            ))}
            <label className="flex flex-col items-center justify-center w-28 h-24 border-2 border-dashed rounded-lg cursor-pointer hover:bg-gray-50 self-start">
              {uploadingLogo ? (
                <Loader2 className="h-5 w-5 text-gray-400 animate-spin" />
              ) : (
                <>
                  <Upload className="h-6 w-6 text-gray-400" />
                  <span className="text-xs text-gray-400 mt-1 text-center px-1">上傳新 Logo</span>
                </>
              )}
              <input type="file" accept="image/*" multiple className="hidden" onChange={handleLogoUpload} />
            </label>
          </div>
        </div>

        <div className="space-y-1" data-tour="settings-name">
          <Label>品牌名稱 *</Label>
          <Input
            value={values.name}
            onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
            placeholder="例：ABC 品牌"
            required
          />
        </div>

        <div className="space-y-1">
          <Label>品牌簡介<span className="text-xs text-gray-400 font-normal ml-1">（選填）</span></Label>
          <textarea
            value={values.description}
            onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
            placeholder="專注於女性保養與生活美學的品牌"
            rows={3}
            className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-200"
          />
        </div>
      </Card>

      {/* 2. 品牌色彩設定 */}
      <Card title="品牌色彩設定" sub="定義品牌的視覺色彩主調，AI 生成設計時將優先套用此調色盤。（選填）">
        <div className="flex gap-4">
          <div className="space-y-1 flex-1">
            <Label>主色</Label>
            <div className="flex gap-2 items-center">
              <input
                type="color"
                value={values.primaryColor}
                onChange={(e) => setValues((v) => ({ ...v, primaryColor: e.target.value }))}
                className="h-9 w-12 rounded border cursor-pointer"
              />
              <Input
                value={values.primaryColor}
                onChange={(e) => setValues((v) => ({ ...v, primaryColor: e.target.value }))}
                placeholder="#000000"
              />
            </div>
          </div>
          <div className="space-y-1 flex-1">
            <Label>輔色</Label>
            <div className="flex gap-2 items-center">
              <input
                type="color"
                value={values.secondaryColor || "#ffffff"}
                onChange={(e) => setValues((v) => ({ ...v, secondaryColor: e.target.value }))}
                className="h-9 w-12 rounded border cursor-pointer"
              />
              <Input
                value={values.secondaryColor}
                onChange={(e) => setValues((v) => ({ ...v, secondaryColor: e.target.value }))}
                placeholder="#ffffff"
              />
            </div>
          </div>
        </div>
      </Card>

      {/* 3. 品牌產業 */}
      <Card title="品牌產業" sub="選擇品牌所屬產業，AI 會根據產業特性調整語調與視覺風格。">
        <div className="space-y-1">
          <Label>產業類別 *</Label>
          <select
            value={values.industry}
            onChange={(e) => setValues((v) => ({ ...v, industry: e.target.value }))}
            className="w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-200"
            required
          >
            <option value="">選擇產業類別</option>
            {INDUSTRY_PRESETS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.emoji} {p.label}
              </option>
            ))}
          </select>
        </div>
      </Card>

      {/* 4. 品牌調性關鍵字 */}
      <Card title="品牌調性關鍵字" sub="點選或新增描述品牌調性的風格詞彙，AI 會將這些屬性融入文案與設計。（選填）">
        <div className="flex gap-2">
          <Input
            value={toneInput}
            onChange={(e) => setToneInput(e.target.value)}
            placeholder="例：幽默、高質感、年輕活力、專業中帶親切"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTone(); } }}
          />
          <Button type="button" variant="outline" onClick={addTone}>加入</Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {values.toneLabels.map((t) => (
            <Badge key={t} variant="secondary" className="flex items-center gap-1 bg-violet-50 text-violet-700 border-violet-200">
              {t}
              <button
                type="button"
                className="cursor-pointer rounded-full hover:bg-black/10 p-0.5 -mr-1"
                onClick={() => setValues((v) => ({ ...v, toneLabels: v.toneLabels.filter((x) => x !== t) }))}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      </Card>

      {/* 5. 禁忌事項 — [WIP/素材庫] negative prompts */}
      <Card title="禁忌事項" sub="AI 生成時會避開這些內容（negative prompts）。（選填）">
        <div className="flex gap-2">
          <Input
            value={tabooInput}
            onChange={(e) => setTabooInput(e.target.value)}
            placeholder="例：不可出現競品名稱、避免負面用詞"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTaboo(); } }}
          />
          <Button type="button" variant="outline" onClick={addTaboo}>加入</Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {values.taboos.map((t) => (
            <Badge key={t} variant="secondary" className="flex items-center gap-1 bg-red-50 text-red-700 border-red-200">
              {t}
              <button
                type="button"
                className="cursor-pointer rounded-full hover:bg-black/10 p-0.5 -mr-1"
                onClick={() => setValues((v) => ({ ...v, taboos: v.taboos.filter((x) => x !== t) }))}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      </Card>

      {/* 6. 常用字體 — chips（取代舊 commonText 單行輸入） */}
      <Card title="常用字體" sub="填入品牌慣用的字體名稱，AI 生成圖文時會參考。（選填）">
        <div className="flex gap-2">
          <Input
            value={fontInput}
            onChange={(e) => setFontInput(e.target.value)}
            placeholder="例：Noto Sans TC、思源黑體、微軟正黑體"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addFont(); } }}
          />
          <Button type="button" variant="outline" onClick={addFont}>加入</Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {values.fonts.map((t) => (
            <Badge key={t} variant="secondary" className="flex items-center gap-1">
              {t}
              <button
                type="button"
                className="cursor-pointer rounded-full hover:bg-black/10 p-0.5 -mr-1"
                onClick={() => setValues((v) => ({ ...v, fonts: v.fonts.filter((x) => x !== t) }))}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      </Card>

      {/* 7. 過往貼文圖片上傳 */}
      <Card title="過往貼文圖片上傳" sub="上傳以前做過的圖，AI 會學習你們的視覺風格，每次生成都更貼近品牌調性。（選填，最多 5 張）">
        <div className="flex gap-2 flex-wrap">
          {values.pastPostImageUrls.map((url, i) => (
            <div key={i} className="relative w-24 h-24">
              <img src={url} alt={`past-${i}`} className="w-24 h-24 object-cover rounded-lg border" />
              <button
                type="button"
                className="absolute -top-1 -right-1 bg-white rounded-full border p-0.5 shadow"
                onClick={() =>
                  setValues((v) => ({ ...v, pastPostImageUrls: v.pastPostImageUrls.filter((_, idx) => idx !== i) }))
                }
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          {values.pastPostImageUrls.length < 5 && (
            <label className="flex flex-col items-center justify-center w-full sm:w-auto sm:min-w-[12rem] h-24 border-2 border-dashed rounded-lg cursor-pointer hover:bg-gray-50 px-4">
              {uploading ? (
                <Loader2 className="h-5 w-5 text-gray-400 animate-spin" />
              ) : (
                <>
                  <span className="text-sm text-gray-500">＋ 點擊或拖曳上傳圖片</span>
                  <span className="text-xs text-gray-400 mt-1 text-center">可上傳多張，支援 PNG、JPG 格式</span>
                </>
              )}
              <input type="file" accept="image/*" multiple className="hidden" onChange={handlePastPostUpload} />
            </label>
          )}
        </div>
      </Card>

      <Button type="submit" disabled={loading} className="bg-violet-600 hover:bg-violet-700">
        {loading ? "儲存中..." : submitLabel}
      </Button>
    </form>
  );
}
