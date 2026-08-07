import { fallbackFramePlans, framePlanCellBlock } from "../src/lib/multi/frame-planner";
for (const n of [2, 3, 4, 5]) {
  const plans = fallbackFramePlans({ theme: "敏感肌女刀", n, userHeadline: "手足細節藏不住年齡感" });
  if (plans.length !== n) throw new Error(`n=${n} 格數錯`);
  if (plans[0].copy.headline !== "手足細節藏不住年齡感") throw new Error("userHeadline 未套到 frame0");
  if (plans[0].productRole !== "hero") throw new Error("frame0 應為 hero");
}
console.log("OK frame-planner 動態格數 + 文案\n" + framePlanCellBlock(fallbackFramePlans({ theme: "x", n: 3 })[0], 0, 3));
