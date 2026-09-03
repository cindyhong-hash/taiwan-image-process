import type { ProductArchetype, ProductVisualProfile } from "./product-visual-profile.ts";

export type ImageSetRole = "hero" | "detail" | "lifestyle" | "background" | "decoration";

export type ImageSetRoleSpec = {
  role: ImageSetRole;
  label: string;
  path: "edit" | "text";
  cutout: boolean;
  sceneCn: string;
  objective: string;
  composition: string;
  mustNotShow: string[];
};

type ArchetypeRoleCopy = Pick<ImageSetRoleSpec, "label" | "sceneCn" | "objective" | "composition">;
type ArchetypeRoleMap = Record<ImageSetRole, ArchetypeRoleCopy>;

const SHARED_COPY: Pick<Record<ImageSetRole, ArchetypeRoleCopy>, "hero" | "background" | "decoration"> = {
  hero: {
    label: "主視覺",
    sceneCn: "乾淨專業的產品棚拍主視覺，讓產品成為畫面唯一焦點",
    objective: "Create the primary product image with the product as the clear focal point.",
    composition: "置中或三分法構圖，完整呈現產品輪廓，保留乾淨視線。",
  },
  background: {
    label: "情境背景版",
    sceneCn: "產品相關的乾淨空景背景，畫面刻意保留留白供後續放置產品與文字，不出現任何產品",
    objective: "Create a product-free background plate for later layout composition.",
    composition: "保留明確留白與平穩視覺重心，讓後續產品與文字可以置入。",
  },
  decoration: {
    label: "裝飾元素",
    sceneCn: "可獨立去背的簡約裝飾元素，呼應產品的視覺語彙，不含產品本體",
    objective: "Create one restrained, isolated decorative element that supports the image set.",
    composition: "單一元素、清楚輪廓、乾淨背景，方便去背後疊加。",
  },
};

const ROLE_GENERATION: Record<ImageSetRole, Pick<ImageSetRoleSpec, "path" | "cutout" | "mustNotShow">> = {
  hero: { path: "edit", cutout: false, mustNotShow: ["其他產品", "誇大或未提供的功能宣稱"] },
  detail: { path: "edit", cutout: false, mustNotShow: ["未提供的功能", "改變後的產品結構", "其他品牌"] },
  lifestyle: { path: "edit", cutout: false, mustNotShow: ["未提供的使用方式", "醫療或療效宣稱", "其他品牌"] },
  background: { path: "text", cutout: false, mustNotShow: ["不出現任何產品", "產品包裝", "人物手持產品", "文字與 Logo"] },
  decoration: { path: "text", cutout: true, mustNotShow: ["產品本體", "產品包裝", "文字與 Logo"] },
};

const GENERIC_DETAIL: Omit<ArchetypeRoleCopy, "label"> = {
  sceneCn: "產品可見外觀細節特寫",
  objective: "Show only visible product details supplied by the profile.",
  composition: "清晰近距離特寫，維持真實比例與可辨識外觀。",
};

const GENERIC_LIFESTYLE: Omit<ArchetypeRoleCopy, "label"> = {
  sceneCn: "可信的產品使用情境",
  objective: "Show a usage scene only when supported by the supplied profile facts.",
  composition: "自然使用情境，產品清楚可辨，避免未提供的用途或宣稱。",
};

function archetypeRoleMap(detailLabel: string, lifestyleLabel: string): ArchetypeRoleMap {
  return {
    ...SHARED_COPY,
    detail: { label: detailLabel, ...GENERIC_DETAIL },
    lifestyle: { label: lifestyleLabel, ...GENERIC_LIFESTYLE },
  };
}

// Archetypes choose presentation intent only; product-specific nouns come from the profile below.
const ROLE_MAPS: Record<ProductArchetype, ArchetypeRoleMap> = {
  beauty_device: archetypeRoleMap("功能細節", "護理使用情境"),
  skincare: archetypeRoleMap("產品細節", "使用情境"),
  cosmetics: archetypeRoleMap("產品細節", "使用情境"),
  food_beverage: archetypeRoleMap("產品細節", "使用情境"),
  fashion: archetypeRoleMap("產品細節", "使用情境"),
  electronics: archetypeRoleMap("功能細節", "使用情境"),
  home: archetypeRoleMap("產品細節", "使用情境"),
  other: archetypeRoleMap("產品細節", "日常使用情境"),
};

function first(values: string[]): string | null {
  return values.find((value) => value.trim())?.trim() ?? null;
}

function detailScene(profile: ProductVisualProfile, base: string): string {
  const subject = first(profile.appearance.distinctiveDetails)
    ?? first(profile.appearance.materials)
    ?? profile.appearance.shape.trim()
    ?? "商品可見外觀";
  return `${base}，聚焦${subject}`;
}

function lifestyleScene(profile: ProductVisualProfile, base: string): string {
  const useCase = first(profile.useCases);
  const suitableScene = first(profile.suitableScenes);
  if (!useCase && !suitableScene) return `${base}，僅依據可見產品資訊安排，不臆測用途或場景`;
  return `${base}，${[useCase && `依據使用方式：${useCase}`, suitableScene && `場景參考：${suitableScene}`].filter(Boolean).join("；")}`;
}

export function planImageSetRoles(profile: ProductVisualProfile): ImageSetRoleSpec[] {
  const map = ROLE_MAPS[profile.productArchetype];
  return (["hero", "detail", "lifestyle", "background", "decoration"] as const).map((role) => ({
    ...ROLE_GENERATION[role],
    ...map[role],
    sceneCn: role === "detail"
      ? detailScene(profile, map.detail.sceneCn)
      : role === "lifestyle"
        ? lifestyleScene(profile, map.lifestyle.sceneCn)
        : map[role].sceneCn,
    role,
  }));
}
