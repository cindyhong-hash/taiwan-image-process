export type QuickCreateRoute = "direct" | "single" | "multi";

export type QuickCreateInput = {
  prompt: string;
  imageRatio: string;
  productImageUrls: string[];
  referenceImageUrls: string[];
};

const MULTI_REQUEST = /(輪播|多張|多圖|系列圖|系列貼文|每一頁|每頁|分成\s*[二兩三四五六七八九十\d]+\s*(張|頁)|carousel)/i;
const RATIO_DIMS: Record<string, { customW: number; customH: number }> = {
  "1:1": { customW: 1200, customH: 1200 },
  "4:5": { customW: 1200, customH: 1500 },
  "16:9": { customW: 1920, customH: 1080 },
  "9:16": { customW: 1080, customH: 1920 },
};

export function classifyQuickCreate(input: { prompt: string; attachmentCount: number }): QuickCreateRoute {
  const prompt = input.prompt.trim();
  if (MULTI_REQUEST.test(prompt)) return "multi";
  if (input.attachmentCount === 0 && prompt.length < 8) return "single";
  return "direct";
}

export function buildQuickActivityPayload(input: QuickCreateInput & { clientId: string }) {
  const size = RATIO_DIMS[input.imageRatio] ?? RATIO_DIMS["1:1"];
  return {
    clientId: input.clientId,
    requiredText: "",
    imagePrompt: input.prompt.trim(),
    imageRatio: input.imageRatio,
    ...size,
    imageModel: "google/gemini-3-pro-image-preview",
    productImageUrls: input.productImageUrls,
    referenceImageUrls: input.referenceImageUrls,
    selectedComponentIds: [],
    layoutId: "single",
  };
}
