import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { chatTextOpenRouter } from "@/lib/openrouter";
import { CONTENT_TYPES, CONTENT_TYPE_META, createFallbackStrategy, parseJsonArray, parseJsonObject, type ContentType, type PlannerStrategy , parseJsonArrayAny} from "@/lib/marketing-planner";
import { collectTrendSignals, filterCitedSignals, type TrendSignal } from "@/lib/planner/trend-signals";

type TopicDraft = { campaignId?: string; contentType?: string; topic?: string; contentDirection?: string; format?: string; platforms?: string[]; recommendationReason?: string; sourceSignals?: unknown };
function extractArray(text: string | null): TopicDraft[] { if (!text) return []; try { const parsed = JSON.parse(text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")); return Array.isArray(parsed) ? parsed : []; } catch { return []; } }

function fallbackTopics(plan: { totalPostCount: number; platforms: string; goals: string }, campaigns: { id: string; name: string; goals: string }[], strategy: PlannerStrategy): TopicDraft[] {
  const typeQueue = strategy.contentMix.flatMap((x) => Array(x.count).fill(x.type)) as ContentType[];
  const campaignQueue = strategy.campaignAllocations.flatMap((x) => Array(x.count).fill(x.campaignId));
  const templates: Record<ContentType, string[]> = {
    BRAND: ["品牌理念：我們在乎的日常細節", "品牌故事：從需求出發的設計", "本月品牌關鍵字"],
    EDUCATION: ["新手也能懂的 3 個實用知識", "常見迷思一次釐清", "使用前後要注意什麼？"],
    PRODUCT: ["本月焦點產品完整介紹", "產品特色與適合族群", "3 個值得選擇它的理由"],
    ENGAGEMENT: ["你是哪一派？留言告訴我們", "本月 Q&A 小教室", "選出你最喜歡的使用情境"],
    PROMOTION: ["本月限定優惠整理", "把握最後入手機會", "會員專屬好康提醒"],
  };
  return Array.from({ length: plan.totalPostCount }, (_, i) => {
    const type = typeQueue[i] ?? CONTENT_TYPES[i % CONTENT_TYPES.length];
    const campaignId = campaignQueue[i] ?? campaigns[i % Math.max(1, campaigns.length)]?.id;
    const campaign = campaigns.find((c) => c.id === campaignId);
    return { campaignId, contentType: type, topic: `${campaign?.name ?? "本月企劃"}｜${templates[type][i % templates[type].length]}`, contentDirection: `以清楚、符合品牌調性的方式切入，聚焦「${parseJsonArray(plan.goals).join("、") || "品牌溝通"}」。`, format: i % 3 === 1 ? "CAROUSEL" : "SINGLE", platforms: parseJsonArray(plan.platforms), recommendationReason: `符合本月「${CONTENT_TYPE_META[type].label}」內容節奏`, sourceSignals: [] };
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ planId: string }> }) {
  const { planId } = await params;
  const body = await request.json().catch(() => ({}));
  const plan = await db.monthlyMarketingPlan.findUnique({ where: { id: planId }, include: { client: { select: { name: true } }, campaigns: { include: { importantDates: true }, orderBy: { sortOrder: "asc" } } } });
  if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  if (body.action === "add") {
    const item = await db.contentPlanItem.create({ data: { monthlyPlanId: plan.id, campaignId: plan.campaigns[0]?.id, contentType: "BRAND", topic: "新的內容主題", platforms: plan.platforms, sortOrder: await db.contentPlanItem.count({ where: { monthlyPlanId: plan.id } }) } });
    return NextResponse.json({ ...item, platforms: parseJsonArray(item.platforms), sourceSignals: parseJsonArrayAny(item.sourceSignals) });
  }

  const campaignInfo = plan.campaigns.map((c) => ({ id: c.id, name: c.name, goals: c.goals }));
  const strategy = parseJsonObject<PlannerStrategy>(plan.strategyJson, createFallbackStrategy(plan.totalPostCount, parseJsonArray(plan.goals), campaignInfo.map((c) => ({ ...c, goals: parseJsonArray(c.goals) }))));

  // ── Trend Signals：收集（可空）→ 存快照 → 注入 prompt ─────────────────────────
  const signals: TrendSignal[] = await collectTrendSignals({
    clientId: plan.clientId, clientName: plan.client.name, year: plan.year, month: plan.month,
    goals: parseJsonArray(plan.goals),
    campaigns: campaignInfo.map((c) => ({ id: c.id, name: c.name, goals: parseJsonArray(c.goals) })),
    importantDates: plan.campaigns.flatMap((c) => c.importantDates.map((d) => ({ date: d.date, label: d.label }))),
  });
  const signalsBlock = signals.length
    ? `\n以下為本月外部趨勢訊號（僅供參考，可選用，不得杜撰未列出的訊號）：\n${JSON.stringify(signals.map((s) => ({ id: s.id, label: s.label, score: s.score })))}\n每個 topic 額外回傳 "recommendationReason"（一句話說明為何本月適合這主題）與 "sourceSignals"（字串陣列，只能填上面列出的 signal id，沒用到就 []）。`
    : `\n每個 topic 額外回傳 "recommendationReason"（一句話說明為何本月適合這主題）與 "sourceSignals"（沒有外部訊號時給 []）。`;

  const prompt = `你是台灣社群內容企劃。為品牌 ${plan.client.name} 產生 ${plan.totalPostCount} 個不重複貼文 Topics。\n月目標：${parseJsonArray(plan.goals).join("、")}\nCampaign：${JSON.stringify(campaignInfo)}\n內容分配：${JSON.stringify(strategy)}${signalsBlock}\n只回傳 JSON array，每項：{"campaignId":"必須使用原 ID","contentType":"BRAND|EDUCATION|PRODUCT|ENGAGEMENT|PROMOTION","topic":"吸引人的繁中標題","contentDirection":"一句具體內容方向","format":"SINGLE|CAROUSEL","platforms":${JSON.stringify(parseJsonArray(plan.platforms))},"recommendationReason":"一句推薦理由","sourceSignals":[]}。`;

  let drafts = extractArray(await chatTextOpenRouter(prompt, 4000));
  const fallback = fallbackTopics(plan, campaignInfo, strategy);
  if (drafts.length !== plan.totalPostCount) drafts = fallback;
  const campaignIds = new Set(plan.campaigns.map((c) => c.id));
  const normalized = drafts.map((draft, i) => ({
    monthlyPlanId: plan.id,
    campaignId: draft.campaignId && campaignIds.has(draft.campaignId) ? draft.campaignId : fallback[i].campaignId,
    contentType: CONTENT_TYPES.includes(draft.contentType as ContentType) ? draft.contentType! : fallback[i].contentType!,
    topic: String(draft.topic || fallback[i].topic),
    contentDirection: String(draft.contentDirection || fallback[i].contentDirection),
    recommendationReason: String(draft.recommendationReason || fallback[i].recommendationReason || ""),
    sourceSignals: JSON.stringify(filterCitedSignals(draft.sourceSignals, signals)),
    format: draft.format === "CAROUSEL" ? "CAROUSEL" : "SINGLE",
    platforms: JSON.stringify(Array.isArray(draft.platforms) ? draft.platforms : fallback[i].platforms),
    sortOrder: i,
  }));
  await db.$transaction([
    db.contentPlanItem.deleteMany({ where: { monthlyPlanId: plan.id } }),
    db.contentPlanItem.createMany({ data: normalized }),
    db.monthlyMarketingPlan.update({ where: { id: plan.id }, data: { status: "TOPICS_READY", signalsJson: JSON.stringify(signals) } }),
  ]);
  const items = await db.contentPlanItem.findMany({ where: { monthlyPlanId: plan.id }, orderBy: { sortOrder: "asc" } });
  return NextResponse.json({ items: items.map((x) => ({ ...x, platforms: parseJsonArray(x.platforms), sourceSignals: parseJsonArrayAny(x.sourceSignals) })), signals });
}
