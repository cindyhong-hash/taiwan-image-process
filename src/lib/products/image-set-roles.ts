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

const ROLE_MAPS: Record<ProductArchetype, ArchetypeRoleMap> = {
  beauty_device: {
    ...SHARED_COPY,
    detail: {
      label: "刀頭／功能細節",
      sceneCn: "刀頭、按鍵與材質結構的功能細節特寫，清晰呈現可見設計",
      objective: "Show the visible blade, button, and material details without altering the device.",
      composition: "微距特寫，清楚對焦刀頭、按鍵或可見結構。",
    },
    lifestyle: {
      label: "護理使用情境",
      sceneCn: "明亮、乾淨的身體護理使用情境，呈現日常修整的自然氛圍",
      objective: "Show a credible body-grooming use scene grounded in the supplied use case.",
      composition: "自然使用情境，產品與使用動作清晰，避免醫療感。",
    },
  },
  skincare: {
    ...SHARED_COPY,
    detail: {
      label: "瓶身／質地細節",
      sceneCn: "瓶身、按壓頭或可見質地的細節特寫，呈現真實材質與光澤",
      objective: "Show visible packaging and texture details without inventing ingredients or efficacy.",
      composition: "微距產品特寫，保留可辨識包裝細節。",
    },
    lifestyle: {
      label: "日常保養情境",
      sceneCn: "明亮梳妝台或洗手台的日常保養使用情境",
      objective: "Show a grounded skincare routine scene without unsupported claims.",
      composition: "乾淨生活場景，產品清楚可辨。",
    },
  },
  cosmetics: {
    ...SHARED_COPY,
    detail: {
      label: "色彩／質地細節",
      sceneCn: "產品色彩、膏體或粉質的細節特寫，呈現可見妝感材質",
      objective: "Show visible cosmetic color and texture without changing packaging.",
      composition: "細緻微距特寫，控制背景避免搶走產品焦點。",
    },
    lifestyle: {
      label: "梳妝使用情境",
      sceneCn: "時尚但真實的梳妝使用情境，呼應日常上妝流程",
      objective: "Show a credible cosmetics use scene grounded in the supplied product facts.",
      composition: "自然梳妝畫面，避免新增未提供的產品。",
    },
  },
  food_beverage: {
    ...SHARED_COPY,
    detail: {
      label: "包裝／口感細節",
      sceneCn: "包裝、飲品表面或可見食材質感的細節特寫",
      objective: "Show visible packaging and food or beverage texture without inventing ingredients.",
      composition: "近距離清晰特寫，維持包裝文字與比例。",
    },
    lifestyle: {
      label: "餐桌享用情境",
      sceneCn: "明亮餐桌或廚房的自然享用使用情境",
      objective: "Show a credible serving or enjoying scene without health claims.",
      composition: "生活感構圖，產品保持可辨識。",
    },
  },
  fashion: {
    ...SHARED_COPY,
    detail: {
      label: "材質／工藝細節",
      sceneCn: "布料、五金或車縫工藝的細節特寫",
      objective: "Show visible material and construction details without changing the item.",
      composition: "微距細節與真實材質紋理。",
    },
    lifestyle: {
      label: "生活穿搭情境",
      sceneCn: "自然生活場景中的穿搭或使用情境",
      objective: "Show a grounded styling scene that keeps the supplied item identifiable.",
      composition: "自然姿態與完整商品辨識度。",
    },
  },
  electronics: {
    ...SHARED_COPY,
    detail: {
      label: "介面／功能細節",
      sceneCn: "按鍵、介面、接口或材質結構的功能細節特寫",
      objective: "Show visible controls and hardware details without inventing features.",
      composition: "清晰近距離產品特寫，介面與結構可辨。",
    },
    lifestyle: {
      label: "桌面使用情境",
      sceneCn: "簡約現代桌面或日常使用情境",
      objective: "Show a credible everyday electronics use scene grounded in visible facts.",
      composition: "乾淨桌面構圖，避免額外品牌或未提供配件。",
    },
  },
  home: {
    ...SHARED_COPY,
    detail: {
      label: "材質／設計細節",
      sceneCn: "產品材質、結構與可見設計的細節特寫",
      objective: "Show visible material and design details without changing the home item.",
      composition: "清晰細節特寫，保留產品真實比例。",
    },
    lifestyle: {
      label: "居家使用情境",
      sceneCn: "溫暖整潔的居家使用情境",
      objective: "Show a credible home use scene grounded in the supplied product facts.",
      composition: "自然居家構圖，產品仍是可辨識焦點。",
    },
  },
  other: {
    ...SHARED_COPY,
    detail: {
      label: "產品細節",
      sceneCn: "產品外型、材質與可見結構的細節特寫",
      objective: "Show only visible product details without inventing category-specific facts.",
      composition: "清楚微距特寫，維持真實比例與外觀。",
    },
    lifestyle: {
      label: "日常使用情境",
      sceneCn: "簡潔、可信的日常使用情境",
      objective: "Show a safe generic use scene grounded only in supplied product facts.",
      composition: "自然情境，產品清楚可辨，避免不受支持的用途。",
    },
  },
};

export function planImageSetRoles(profile: ProductVisualProfile): ImageSetRoleSpec[] {
  const map = ROLE_MAPS[profile.productArchetype];
  return (["hero", "detail", "lifestyle", "background", "decoration"] as const).map((role) => ({
    ...ROLE_GENERATION[role],
    ...map[role],
    role,
  }));
}
