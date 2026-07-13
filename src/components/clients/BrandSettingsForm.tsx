"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { X, Upload, Loader2 } from "lucide-react";

// [MERGED] union of WIP(素材庫: taboos) + COLLEAGUE(clients: logoUrl/commonText)
export type BrandFormValues = {
  name: string;
  primaryColor: string;
  secondaryColor: string;
  logoUrl: string;
  toneLabels: string[];
  taboos: string[];      // [WIP/素材庫] 禁忌事項（negative prompts）
  commonText: string;    // [COLLEAGUE] 常用字體
  pastPostImageUrls: string[];
};

type Props = {
  initialValues?: Partial<BrandFormValues>;
  onSubmit: (values: BrandFormValues) => Promise<void>;
  submitLabel?: string;
};

export function BrandSettingsForm({ initialValues, onSubmit, submitLabel = "儲存" }: Props) {
  const [values, setValues] = useState<BrandFormValues>({
    name: initialValues?.name ?? "",
    primaryColor: initialValues?.primaryColor ?? "#000000",
    secondaryColor: initialValues?.secondaryColor ?? "",
    logoUrl: initialValues?.logoUrl ?? "",
    toneLabels: initialValues?.toneLabels ?? [],
    taboos: initialValues?.taboos ?? [],
    commonText: initialValues?.commonText ?? "",
    pastPostImageUrls: initialValues?.pastPostImageUrls ?? [],
  });
  const [toneInput, setToneInput] = useState("");
  const [tabooInput, setTabooInput] = useState("");
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

  const uploadImage = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: formData });
    const data = await res.json();
    return data.url;
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    const url = await uploadImage(file);
    setValues((v) => ({ ...v, logoUrl: url }));
    setUploadingLogo(false);
    e.target.value = "";
  };

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
    <form onSubmit={handleSubmit} className="space-y-6 max-w-lg">

      {/* 客戶名稱 */}
      <div className="space-y-1">
        <Label>客戶名稱 *</Label>
        <Input
          value={values.name}
          onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
          placeholder="例：ABC 品牌"
          required
        />
      </div>

      {/* 主色 / 輔色 */}
      <div className="flex gap-4">
        <div className="space-y-1 flex-1">
          <Label>主色 *</Label>
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

      {/* 品牌 Logo — [COLLEAGUE] */}
      <div className="space-y-2">
        <Label>品牌 Logo</Label>
        <p className="text-xs text-gray-400">上傳品牌標誌（建議去背 PNG），可用於合成與識別</p>
        <div className="flex items-center gap-3">
          {values.logoUrl ? (
            <div className="relative w-24 h-24">
              <img
                src={values.logoUrl}
                alt="logo"
                className="w-24 h-24 object-contain rounded-lg border bg-gray-50 p-1"
              />
              <button
                type="button"
                className="absolute -top-1 -right-1 bg-white rounded-full border p-0.5 shadow"
                onClick={() => setValues((v) => ({ ...v, logoUrl: "" }))}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center w-24 h-24 border-2 border-dashed rounded-lg cursor-pointer hover:bg-gray-50">
              {uploadingLogo ? (
                <Loader2 className="h-5 w-5 text-gray-400 animate-spin" />
              ) : (
                <>
                  <Upload className="h-6 w-6 text-gray-400" />
                  <span className="text-xs text-gray-400 mt-1 text-center px-1">上傳 Logo</span>
                </>
              )}
              <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
            </label>
          )}
        </div>
      </div>

      {/* 品牌調性 — 自由輸入 */}
      <div className="space-y-2">
        <Label>品牌調性</Label>
        <p className="text-xs text-gray-400">自由輸入你覺得符合這個品牌的形容詞，AI 會參考這些來寫文案</p>
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
            <Badge key={t} variant="secondary" className="flex items-center gap-1">
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
      </div>

      {/* 禁忌事項 — [WIP/素材庫] negative prompts */}
      <div className="space-y-2">
        <Label>禁忌事項</Label>
        <p className="text-xs text-gray-400">AI 生成時會避開這些內容（negative prompts）</p>
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
      </div>

      {/* 常用字體 — [COLLEAGUE] */}
      <div className="space-y-1">
        <Label>常用字體</Label>
        <p className="text-xs text-gray-400">填入品牌慣用的字體名稱，AI 生成文案時會參考</p>
        <Input
          value={values.commonText}
          onChange={(e) => setValues((v) => ({ ...v, commonText: e.target.value }))}
          placeholder="例：Noto Sans TC、思源黑體、微軟正黑體"
        />
      </div>

      {/* 過往貼文圖片 */}
      <div className="space-y-2">
        <Label>過往貼文圖片（最多 5 張）</Label>
        <p className="text-xs text-gray-400">上傳以前做過的圖，AI 會學習你們的視覺風格，每次生成都更貼近品牌調性</p>
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
            <label className="flex flex-col items-center justify-center w-24 h-24 border-2 border-dashed rounded-lg cursor-pointer hover:bg-gray-50">
              {uploading ? (
                <Loader2 className="h-5 w-5 text-gray-400 animate-spin" />
              ) : (
                <>
                  <Upload className="h-6 w-6 text-gray-400" />
                  <span className="text-xs text-gray-400 mt-1 text-center px-1">上傳貼文圖</span>
                </>
              )}
              <input type="file" accept="image/*" multiple className="hidden" onChange={handlePastPostUpload} />
            </label>
          )}
        </div>
      </div>

      <Button type="submit" disabled={loading}>
        {loading ? "儲存中..." : submitLabel}
      </Button>
    </form>
  );
}
