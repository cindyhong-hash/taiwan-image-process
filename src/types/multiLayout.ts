import type { CSSProperties } from "react";

/**
 * 多圖版型定義（依 Facebook 官方多圖貼文幾何比例）。
 * 容器一律 1200×1200（輪播除外，各自獨立 1:1）。
 * - count：格數
 * - cellAspects：每格「生成時」的比例（對應 Gemini 支援值），順序同 getCellRects
 * - grid / cells：縮圖用 CSS Grid；main=true 為主視覺
 * - carousel：true 代表獨立輪播卡（非單張拼版）
 */
export type MultiLayoutCell = { style: CSSProperties; main?: boolean };

export type MultiLayout = {
  id: string;
  label: string;
  count: number;
  carousel?: boolean;
  expandable?: boolean;
  maxCount?: number;
  badge?: string;
  cellAspects: string[];     // 每格生成比例（Gemini 支援：1:1 / 3:2 / 2:3 / 4:3 / 3:4 / 16:9 / 9:16）
  grid: CSSProperties;
  cells: MultiLayoutCell[];
};

export const MULTI_LAYOUTS: MultiLayout[] = [
  // 1. 單圖
  {
    id: "single",
    label: "1張（單圖）",
    count: 1,
    cellAspects: ["1:1"],
    grid: { gridTemplateColumns: "1fr", gridTemplateRows: "1fr" },
    cells: [{ style: {}, main: true }],
  },
  // 2. 正方形輪播（2 張獨立 1:1）
  {
    id: "carousel-2",
    label: "2張（正方形輪播）",
    count: 2,
    carousel: true,
    cellAspects: ["1:1", "1:1"],
    grid: { gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr" },
    cells: [{ style: {}, main: true }, { style: {} }],
  },
  // 3. 雙圖對稱（橫式）上下，各 2:1
  {
    id: "two-h",
    label: "2張（上下）",
    count: 2,
    cellAspects: ["16:9", "16:9"],
    grid: { gridTemplateColumns: "1fr", gridTemplateRows: "1fr 1fr" },
    cells: [{ style: {}, main: true }, { style: {} }],
  },
  // 4. 雙圖對稱（直式）左右，各 1:2
  {
    id: "two-v",
    label: "2張（左右）",
    count: 2,
    cellAspects: ["9:16", "9:16"],
    grid: { gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr" },
    cells: [{ style: {}, main: true }, { style: {} }],
  },
  // 5. 橫式首圖 + 下2
  {
    id: "three-h-top",
    label: "3張（橫式首圖＋下2）",
    count: 3,
    cellAspects: ["16:9", "1:1", "1:1"],
    grid: { gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr" },
    cells: [{ style: { gridColumn: "1 / 3" }, main: true }, { style: {} }, { style: {} }],
  },
  // 6. 直式首圖 + 右2
  {
    id: "three-v-left",
    label: "3張（直式首圖＋右2）",
    count: 3,
    cellAspects: ["9:16", "1:1", "1:1"],
    grid: { gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr" },
    cells: [{ style: { gridRow: "1 / 3" }, main: true }, { style: {} }, { style: {} }],
  },
  // 7. 直式首圖 + 右3（左 2:3 / 右 3× 1:1）
  {
    id: "four-v-left",
    label: "4張（直式首圖＋右3）",
    count: 4,
    cellAspects: ["2:3", "1:1", "1:1", "1:1"],
    grid: { gridTemplateColumns: "2fr 1fr", gridTemplateRows: "1fr 1fr 1fr" },
    cells: [{ style: { gridRow: "1 / 4" }, main: true }, { style: {} }, { style: {} }, { style: {} }],
  },
  // 8. 橫式首圖 + 下3（上 3:2 / 下 3× 1:1）
  {
    id: "four-h-top",
    label: "4張（橫式首圖＋下3）",
    count: 4,
    cellAspects: ["3:2", "1:1", "1:1", "1:1"],
    grid: { gridTemplateColumns: "1fr 1fr 1fr", gridTemplateRows: "2fr 1fr" },
    cells: [{ style: { gridColumn: "1 / 4" }, main: true }, { style: {} }, { style: {} }, { style: {} }],
  },
  // 8.5 田字／四宮格（4 格全部 1:1）
  {
    id: "four-grid",
    label: "4張（田字／四宮格）",
    count: 4,
    cellAspects: ["1:1", "1:1", "1:1", "1:1"],
    grid: { gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr" },
    cells: [{ style: {}, main: true }, { style: {} }, { style: {} }, { style: {} }],
  },
  // 9. 5張 上2下3（全部 1:1 正方形，cover 裁切）
  {
    id: "five-top2-bottom3",
    label: "5張（上2下3）",
    count: 5,
    cellAspects: ["1:1", "1:1", "1:1", "1:1", "1:1"],
    grid: { gridTemplateColumns: "repeat(6, 1fr)", gridTemplateRows: "2fr 1fr" },
    cells: [
      { style: { gridColumn: "1 / 4" }, main: true }, { style: { gridColumn: "4 / 7" } },
      { style: { gridColumn: "1 / 3" } }, { style: { gridColumn: "3 / 5" } }, { style: { gridColumn: "5 / 7" } },
    ],
  },
  // 10. 5張 左2右3（全部 1:1 正方形，cover 裁切）
  {
    id: "five-left2-right3",
    label: "5張（左2右3）",
    count: 5,
    cellAspects: ["1:1", "1:1", "1:1", "1:1", "1:1"],
    grid: { gridTemplateColumns: "2fr 1fr", gridTemplateRows: "repeat(6, 1fr)" },
    cells: [
      { style: { gridRow: "1 / 4" }, main: true }, { style: { gridRow: "4 / 7" } },
      { style: { gridRow: "1 / 3" } }, { style: { gridRow: "3 / 5" } }, { style: { gridRow: "5 / 7" } },
    ],
  },
  // 11. 5+張（疊加/更多）— 幾何同 #9，最後一格疊「+X」遮罩
  {
    id: "five-plus",
    label: "5張+（疊加）",
    count: 5,
    expandable: true,
    maxCount: 9,
    badge: "5+",
    cellAspects: ["1:1", "1:1", "1:1", "1:1", "1:1"],
    grid: { gridTemplateColumns: "repeat(6, 1fr)", gridTemplateRows: "2fr 1fr" },
    cells: [
      { style: { gridColumn: "1 / 4" }, main: true }, { style: { gridColumn: "4 / 7" } },
      { style: { gridColumn: "1 / 3" } }, { style: { gridColumn: "3 / 5" } }, { style: { gridColumn: "5 / 7" } },
    ],
  },
];

// 舊版型 id → 新版型 id（向下相容：之前已建立的活動不會卡載入）
const LEGACY_LAYOUT_ALIAS: Record<string, string> = {
  "two-lr": "two-v",        // 左右
  "two-tb": "two-h",        // 上下
  "three-main": "three-v-left",
  "four-top": "four-h-top",
  "four-side": "four-v-left",
  // single / five-plus 維持同名
};

export function normalizeLayoutId(id: string): string {
  return LEGACY_LAYOUT_ALIAS[id] ?? id;
}

export function getMultiLayout(id: string): MultiLayout | undefined {
  return MULTI_LAYOUTS.find((l) => l.id === normalizeLayoutId(id));
}

/** 歸一化矩形（0~1）：拼版合成時每格的位置 [x, y, w, h] */
export type Rect = { x: number; y: number; w: number; h: number };

const T = 1 / 3;
const TT = 2 / 3;

/** 取得某版型在實際格數 n 下，每格的歸一化矩形（與 cellAspects 同順序）*/
export function getCellRects(layoutIdRaw: string, n: number): Rect[] {
  const layoutId = normalizeLayoutId(layoutIdRaw);
  switch (layoutId) {
    case "single":
      return [{ x: 0, y: 0, w: 1, h: 1 }];
    case "carousel-2":
    case "two-v":
      return [{ x: 0, y: 0, w: 0.5, h: 1 }, { x: 0.5, y: 0, w: 0.5, h: 1 }];
    case "two-h":
      return [{ x: 0, y: 0, w: 1, h: 0.5 }, { x: 0, y: 0.5, w: 1, h: 0.5 }];
    case "three-h-top":
      return [
        { x: 0, y: 0, w: 1, h: 0.5 },
        { x: 0, y: 0.5, w: 0.5, h: 0.5 }, { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
      ];
    case "three-v-left":
      return [
        { x: 0, y: 0, w: 0.5, h: 1 },
        { x: 0.5, y: 0, w: 0.5, h: 0.5 }, { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
      ];
    case "four-v-left":
      return [
        { x: 0, y: 0, w: TT, h: 1 },
        { x: TT, y: 0, w: T, h: T }, { x: TT, y: T, w: T, h: T }, { x: TT, y: TT, w: T, h: T },
      ];
    case "four-h-top":
      return [
        { x: 0, y: 0, w: 1, h: TT },
        { x: 0, y: TT, w: T, h: T }, { x: T, y: TT, w: T, h: T }, { x: 2 * T, y: TT, w: T, h: T },
      ];
    case "four-grid":
      return [
        { x: 0, y: 0, w: 0.5, h: 0.5 }, { x: 0.5, y: 0, w: 0.5, h: 0.5 },
        { x: 0, y: 0.5, w: 0.5, h: 0.5 }, { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
      ];
    case "five-top2-bottom3":
    case "five-plus":
      return [
        { x: 0, y: 0, w: 0.5, h: TT }, { x: 0.5, y: 0, w: 0.5, h: TT },
        { x: 0, y: TT, w: T, h: T }, { x: T, y: TT, w: T, h: T }, { x: 2 * T, y: TT, w: T, h: T },
      ];
    case "five-left2-right3":
      return [
        { x: 0, y: 0, w: TT, h: 0.5 }, { x: 0, y: 0.5, w: TT, h: 0.5 },
        { x: TT, y: 0, w: T, h: T }, { x: TT, y: T, w: T, h: T }, { x: TT, y: 2 * T, w: T, h: T },
      ];
    default:
      return [{ x: 0, y: 0, w: 1, h: 1 }];
  }
}
