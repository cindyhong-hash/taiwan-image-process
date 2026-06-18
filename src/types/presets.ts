// ─── Industry style presets ──────────────────────────────────────────────────
// Default 構圖 / 配色(5色) / 語氣 / 背景 templates per industry.
// Used by QuickAddModal「套用行業範本」to pre-fill the create form.

import type { PaletteColor } from "./library";

export interface IndustryPreset {
  key: string;
  label: string;
  emoji: string;
  composition: { name: string; description: string; aiPromptText: string };
  color: { name: string; colors: PaletteColor[]; aiPromptText: string };
  tone: { name: string; toneLabels: string[]; aiPromptText: string };
  background: { name: string; description: string; aiPromptText: string };
}

export const INDUSTRY_PRESETS: IndustryPreset[] = [
  {
    key: "skincare",
    label: "護膚品",
    emoji: "🧴",
    composition: {
      name: "留白極簡居中",
      description: "主體置中、大量留白、柔和投影，乾淨療癒",
      aiPromptText: "centered product, generous negative space, soft diffused studio light, gentle shadow, minimal clean beauty",
    },
    color: {
      name: "柔米療癒系",
      colors: [
        { hex: "#E7C6B5", role: "primary", label: "主色" },
        { hex: "#F4ECE3", role: "secondary", label: "輔色" },
        { hex: "#C98E74", role: "accent", label: "強調色" },
        { hex: "#FBF8F4", role: "neutral", label: "中性色" },
        { hex: "#A7B5A0", role: "highlight", label: "點綴色" },
      ],
      aiPromptText: "soft beige and blush tones, warm neutral palette, calm and clean",
    },
    tone: {
      name: "溫和療癒",
      toneLabels: ["溫和", "純淨", "專業可信"],
      aiPromptText: "gentle, clean, dermatological trust, calm and reassuring",
    },
    background: {
      name: "柔米漸層棚拍",
      description: "米白漸層背景、柔光、淡投影",
      aiPromptText: "soft beige gradient studio backdrop, gentle window light, subtle shadow",
    },
  },
  {
    key: "feminine",
    label: "女性用品",
    emoji: "💄",
    composition: {
      name: "柔焦優雅近景",
      description: "近距特寫、柔焦、細緻佈置，優雅女性感",
      aiPromptText: "elegant close-up, soft focus, delicate styling, feminine, refined detail",
    },
    color: {
      name: "胭脂玫瑰系",
      colors: [
        { hex: "#E8A2B0", role: "primary", label: "主色" },
        { hex: "#F6E7EC", role: "secondary", label: "輔色" },
        { hex: "#B76E79", role: "accent", label: "強調色" },
        { hex: "#FFFFFF", role: "neutral", label: "中性色" },
        { hex: "#C98BA0", role: "highlight", label: "點綴色" },
      ],
      aiPromptText: "blush pink and mauve tones, soft romantic palette, elegant",
    },
    tone: {
      name: "親密貼心",
      toneLabels: ["溫柔", "貼心", "自信"],
      aiPromptText: "intimate, caring, gently empowering, warm and confident",
    },
    background: {
      name: "粉色絲緞花瓣",
      description: "柔粉絲綢、散落花瓣、唯美",
      aiPromptText: "soft blush pink silk fabric with scattered rose petals, dreamy",
    },
  },
  {
    key: "electronics",
    label: "生活電子",
    emoji: "🎧",
    composition: {
      name: "科技硬光幾何",
      description: "硬邊光、幾何構成、戲劇陰影，俐落科技感",
      aiPromptText: "modern tech product, hard rim light, geometric composition, sleek, dramatic shadow",
    },
    color: {
      name: "炭黑電光藍",
      colors: [
        { hex: "#1E2A38", role: "primary", label: "主色" },
        { hex: "#C7CDD4", role: "secondary", label: "輔色" },
        { hex: "#2D7FF9", role: "accent", label: "強調色" },
        { hex: "#0B0F14", role: "neutral", label: "中性色" },
        { hex: "#5AD1FF", role: "highlight", label: "點綴色" },
      ],
      aiPromptText: "charcoal and electric blue, high contrast, sleek metallic tech palette",
    },
    tone: {
      name: "簡潔理性",
      toneLabels: ["俐落", "創新", "可靠"],
      aiPromptText: "sleek, innovative, confident, minimal and precise tech voice",
    },
    background: {
      name: "暗色光束漸層",
      description: "深炭灰漸層、藍色光束、現代",
      aiPromptText: "dark charcoal gradient with subtle blue light streaks, modern minimal",
    },
  },
  {
    key: "apparel",
    label: "衣服 / 時尚",
    emoji: "👗",
    composition: {
      name: "編輯時尚",
      description: "全身或平鋪、動態姿態、生活情境，雜誌感",
      aiPromptText: "editorial fashion, full-length or flat lay, dynamic pose, lifestyle, magazine style",
    },
    color: {
      name: "大地赤陶系",
      colors: [
        { hex: "#B08968", role: "primary", label: "主色" },
        { hex: "#EDE0D4", role: "secondary", label: "輔色" },
        { hex: "#9C6644", role: "accent", label: "強調色" },
        { hex: "#7F5539", role: "neutral", label: "中性色" },
        { hex: "#DDB892", role: "highlight", label: "點綴色" },
      ],
      aiPromptText: "earthy terracotta and warm neutral tones, natural muted palette",
    },
    tone: {
      name: "時尚個性",
      toneLabels: ["自信", "質感", "街頭"],
      aiPromptText: "stylish, confident, editorial, aspirational and effortless",
    },
    background: {
      name: "質感灰泥牆",
      description: "米色質感灰泥牆、自然光，極簡時尚",
      aiPromptText: "textured beige plaster wall with soft natural daylight, minimal fashion backdrop",
    },
  },
  {
    key: "food",
    label: "食品飲料",
    emoji: "🍽️",
    composition: {
      name: "俯拍新鮮感",
      description: "俯拍或 45°、新鮮誘人、道具佈置，食慾構圖",
      aiPromptText: "top-down or 45-degree angle, fresh appetizing, vibrant, prop styling, food photography",
    },
    color: {
      name: "暖食慾系",
      colors: [
        { hex: "#F46036", role: "primary", label: "主色" },
        { hex: "#FFF3E0", role: "secondary", label: "輔色" },
        { hex: "#D7263D", role: "accent", label: "強調色" },
        { hex: "#FFD166", role: "neutral", label: "中性色" },
        { hex: "#2E8B57", role: "highlight", label: "點綴色" },
      ],
      aiPromptText: "warm appetizing orange and red tones, fresh vibrant food palette",
    },
    tone: {
      name: "食慾誘人",
      toneLabels: ["美味", "新鮮", "衝動"],
      aiPromptText: "appetizing, fresh, crave-worthy, energetic and inviting",
    },
    background: {
      name: "原木 / 大理石廚台",
      description: "原木或大理石枱面、暖光廚房氛圍",
      aiPromptText: "rustic wood or marble kitchen surface, warm appetizing light",
    },
  },
  {
    key: "home",
    label: "家居生活",
    emoji: "🛋️",
    composition: {
      name: "情境生活感",
      description: "生活情境、自然窗光、溫暖室內，有人味",
      aiPromptText: "cozy lifestyle scene, natural window light, warm interior, lived-in styling",
    },
    color: {
      name: "暖木奶油系",
      colors: [
        { hex: "#A68A64", role: "primary", label: "主色" },
        { hex: "#FAF3E0", role: "secondary", label: "輔色" },
        { hex: "#8A9A5B", role: "accent", label: "強調色" },
        { hex: "#EDE0D4", role: "neutral", label: "中性色" },
        { hex: "#6B705C", role: "highlight", label: "點綴色" },
      ],
      aiPromptText: "warm wood, cream and sage tones, cozy natural home palette",
    },
    tone: {
      name: "溫暖舒適",
      toneLabels: ["溫馨", "自然", "放鬆"],
      aiPromptText: "warm, cozy, natural, relaxing and homely",
    },
    background: {
      name: "暖調室內",
      description: "暖色室內、亞麻與木質、柔光",
      aiPromptText: "warm interior scene with linen and wood, soft daylight, cozy home",
    },
  },
];
