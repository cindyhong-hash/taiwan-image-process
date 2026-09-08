import type { ProductVisualProfile } from "./product-visual-profile.ts";

// lifestyle stays accepted for rows created by previous versions. New batches use benefit instead.
export type ImageSetRole = "hero" | "detail" | "lifestyle" | "background" | "benefit" | "decoration";
export type ImageSetGenerationPath = "cutout" | "edit" | "text";

export type ImageSetRoleSpec = {
  role: ImageSetRole;
  label: string;
  usageDescription: string;
  path: ImageSetGenerationPath;
  cutout: boolean;
  sceneCn: string;
  objective: string;
  composition: string;
  mustNotShow: string[];
};

function first(values: string[]): string | null {
  return values.find((value) => value.trim())?.trim() ?? null;
}

function productContext(profile: ProductVisualProfile): string {
  return [
    first(profile.suitableScenes) && `場景參考：${first(profile.suitableScenes)}`,
    first(profile.useCases) && `使用／賣點參考：${first(profile.useCases)}`,
  ].filter(Boolean).join("；") || "依產品定位建立可合成的廣告素材，不臆測未提供資訊";
}

export function planImageSetRoles(profile: ProductVisualProfile): ImageSetRoleSpec[] {
  const context = productContext(profile);
  const motif = first(profile.visualMotifs);
  return [
    {
      role: "hero",
      label: "商品主體",
      usageDescription: "廣告中的主要商品",
      path: "cutout",
      cutout: true,
      sceneCn: "直接保留原始商品照的瓶身比例、Logo、文字與包裝細節，僅移除背景並輸出透明 PNG。",
      objective: "Create a transparent cutout from the supplied original product photograph. Do not generate or redesign the product.",
      composition: "保留完整商品輪廓與原始比例，方便作為後續廣告合成的主要商品圖層。",
      mustNotShow: ["重新生成商品造型", "改變 Logo、文字、包裝、比例或結構"],
    },
    {
      role: "detail",
      label: "質地細節",
      usageDescription: "呈現產品使用感與質地",
      path: "text",
      cutout: false,
      sceneCn: `抽象且高級的保養品質地素材，可用乳液、水感液體、細緻泡沫或柔光微粒表現；${context}`,
      objective: "Create an abstract texture asset with information value. Show lotion texture, foam, water, liquid, or tactile macro detail only; never stage a complete product.",
      composition: "近距離抽象質地構圖，保留可裁切與疊加的乾淨區域。",
      mustNotShow: ["完整商品", "瓶罐", "包裝", "Logo", "文字", "未提供的成分或功效宣稱"],
    },
    {
      role: "background",
      label: "情境背景",
      usageDescription: "後續合成用純背景",
      path: "text",
      cutout: false,
      sceneCn: `純情境背景，不出現任何產品；${context}`,
      objective: "Create a product-free advertising background plate. Match the product positioning through the environment only, with no product depiction.",
      composition: "明確保留文案區與商品擺放區，畫面有乾淨留白、平穩重心，供後續廣告合成。",
      mustNotShow: ["任何商品", "瓶罐", "產品包裝", "Logo", "文字", "人物手持產品"],
    },
    {
      role: "benefit",
      label: "賣點視覺",
      usageDescription: "將產品功效轉成視覺素材",
      path: "text",
      cutout: false,
      sceneCn: `以抽象、高級保養品廣告視覺表現產品賣點；${context}`,
      objective: "Create an abstract benefit visual that translates supplied use cases into liquid, particles, soft light, water, or skin-like texture. Never depict the actual product.",
      composition: "概念型素材，有層次但保留可放置文案或與商品主體合成的空間。",
      mustNotShow: ["實際商品", "瓶罐", "包裝", "Logo", "文字", "未提供的成分、功效、認證或醫療宣稱"],
    },
    {
      role: "decoration",
      label: "裝飾元素",
      usageDescription: "增加版面完整度的 PNG 元素",
      path: "text",
      cutout: true,
      sceneCn: `單一可獨立疊加的裝飾元素，如水滴、氣泡、柔光、閃光或液體曲線${motif ? `；視覺元素參考：${motif}` : ""}。`,
      objective: "Create one isolated decorative overlay element on a plain removable background, suitable for a transparent PNG layer.",
      composition: "單一元素、清楚輪廓、無完整場景，方便去背後獨立疊加。",
      mustNotShow: ["商品", "Logo", "文字", "完整場景", "產品包裝"],
    },
  ];
}
