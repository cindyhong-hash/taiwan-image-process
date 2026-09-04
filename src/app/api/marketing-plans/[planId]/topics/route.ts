import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { chatTextOpenRouter } from "@/lib/openrouter";
import { CONTENT_TYPES, CONTENT_TYPE_META, createFallbackStrategy, parseJsonArray, parseJsonObject, type ContentType, type PlannerStrategy , parseJsonArrayAny} from "@/lib/marketing-planner";
import { collectTrendSignals, filterCitedSignals, type TrendSignal } from "@/lib/planner/trend-signals";
import { analyzePlannerProducts } from "@/lib/planner/analyze-products";
import { buildPlannerContext, hasUngroundedProductClaim, hasUsableCampaignProducts, NO_PRODUCT_TOPIC_TEMPLATES } from "@/lib/planner/planner-context";

type TopicDraft = { campaignId?: string; contentType?: string; topic?: string; contentDirection?: string; format?: string; platforms?: string[]; recommendationReason?: string; sourceSignals?: unknown };
function extractArray(text: string | null): TopicDraft[] { if (!text) return []; try { const parsed = JSON.parse(text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")); return Array.isArray(parsed) ? parsed : []; } catch { return []; } }

function fallbackTopics(plan: { totalPostCount: number; platforms: string; goals: string }, campaigns: { id: string; name: string; goals: string }[], strategy: PlannerStrategy, hasProducts: boolean): TopicDraft[] {
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
    const queuedType = typeQueue[i] ?? CONTENT_TYPES[i % CONTENT_TYPES.length];
    const type = (!hasProducts && queuedType === "PRODUCT" ? "ENGAGEMENT" : queuedType) as ContentType;
    const campaignId = campaignQueue[i] ?? campaigns[i % Math.max(1, campaigns.length)]?.id;
    const campaign = campaigns.find((c) => c.id === campaignId);
    const topicTemplates = hasProducts ? templates[type] : NO_PRODUCT_TOPIC_TEMPLATES[type];
    return { campaignId, contentType: type, topic: `${campaign?.name ?? "本月企劃"}｜${topicTemplates[i % topicTemplates.length]}`, contentDirection: `讓受眾記住品牌在「${parseJsonArray(plan.goals).join("、") || "品牌溝通"}」上的價值。`, format: i % 3 === 1 ? "CAROUSEL" : "SINGLE", platforms: parseJsonArray(plan.platforms), recommendationReason: `符合本月「${CONTENT_TYPE_META[type].label}」內容節奏`, sourceSignals: [] };
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ planId: string }> }) {
  const { planId } = await params;
  const body = await request.json().catch(() => ({}));
  const plan = await db.monthlyMarketingPlan.findUnique({
    where: { id: planId },
    include: {
      client: { select: { name: true, description: true, industry: true, toneLabels: true } },
      campaigns: { include: { products: true, importantDates: true }, orderBy: { sortOrder: "asc" } },
    },
  });
  if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  if (body.action === "add") {
    const item = await db.contentPlanItem.create({ data: { monthlyPlanId: plan.id, campaignId: plan.campaigns[0]?.id, contentType: "BRAND", topic: "新的內容主題", platforms: plan.platforms, sortOrder: await db.contentPlanItem.count({ where: { monthlyPlanId: plan.id } }) } });
    return NextResponse.json({ ...item, platforms: parseJsonArray(item.platforms), sourceSignals: parseJsonArrayAny(item.sourceSignals) });
  }

  const campaignInfo = plan.campaigns.map((c) => ({ id: c.id, name: c.name, goals: c.goals }));
  const strategy = parseJsonObject<PlannerStrategy>(plan.strategyJson, createFallbackStrategy(plan.totalPostCount, parseJsonArray(plan.goals), campaignInfo.map((c) => ({ ...c, goals: parseJsonArray(c.goals) }))));
  const productAnalyses = await analyzePlannerProducts(plan.campaigns);
  const plannerContext = buildPlannerContext(plan, productAnalyses);
  const hasProducts = hasUsableCampaignProducts(plan.campaigns);

  // 重產保護：mode=all 全部重來；否則(預設 keep)保留「已製作(有 Activity)」的，只補/重產其餘到目標篇數
  const mode = body.mode === "all" ? "all" : "keep";
  const existing = await db.contentPlanItem.findMany({ where: { monthlyPlanId: plan.id }, orderBy: { sortOrder: "asc" } });
  const kept = mode === "all" ? [] : existing.filter((t) => t.generatedActivityId);
  const keptCount = kept.length;
  const targetNew = Math.max(0, plan.totalPostCount - keptCount);

  // ── Trend Signals：收集（可空）→ 存快照 → 注入 prompt ─────────────────────────
  const signals: TrendSignal[] = await collectTrendSignals({
    clientId: plan.clientId, clientName: plan.client.name, year: plan.year, month: plan.month,
    goals: parseJsonArray(plan.goals),
    campaigns: campaignInfo.map((c) => ({ id: c.id, name: c.name, goals: parseJsonArray(c.goals) })),
    importantDates: plan.campaigns.flatMap((c) => c.importantDates.map((d) => ({ date: d.date, label: d.label }))),
    industry: plan.client.industry ?? undefined,
    products: plan.campaigns.flatMap((c) => c.products.map((p) => p.label)),
  });
  const signalsBlock = signals.length
    ? `\n以下為本月外部趨勢訊號（僅供參考，可選用，不得杜撰未列出的訊號）：\n${JSON.stringify(signals.map((s) => ({ id: s.id, label: s.label, score: s.score })))}\n每個 topic 額外回傳 "recommendationReason"（一句話說明為何本月適合這主題）與 "sourceSignals"（字串陣列，只能填上面列出的 signal id，沒用到就 []）。`
    : `\n每個 topic 額外回傳 "recommendationReason"（一句話說明為何本月適合這主題）與 "sourceSignals"（沒有外部訊號時給 []）。`;

  const campaignIds = new Set(plan.campaigns.map((c) => c.id));
  const fallbackAll = fallbackTopics(plan, campaignInfo, strategy, hasProducts);
  const keptBlock = keptCount ? `\n已存在（請勿與這些主題重複）：${JSON.stringify(kept.map((k) => k.topic))}` : "";

  // 只產生「需要補的」targetNew 篇；kept（已製作）保留不動
  const generateNew = async () => {
    const toneList = parseJsonArray(plan.client.toneLabels);
    const toneLine = toneList.length ? `\n品牌語氣：${toneList.join("、")}（標題與溝通點都要貼這個語氣）` : "";
    const prompt = `你是台灣社群內容企劃。產生 ${targetNew} 個不重複貼文 Topics。\n本次可依據的品牌與產品事實：${JSON.stringify(plannerContext)}\n月目標：${parseJsonArray(plan.goals).join("、")}\n內容分配：${JSON.stringify(strategy)}${toneLine}${signalsBlock}${keptBlock}\n請嚴格遵守 groundingRules。\n標題(topic)要像社群小編寫的：口語、平台原生、一看就想點，可用最多 1 個 emoji 或在地流行語，避免官腔與生硬行銷腔。\ncontentDirection 是「溝通點」：用一句話說這篇最想讓受眾記住或相信的一件事，要具體、扣住實際產品賣點，不是空泛的內容方向。\n只回傳 JSON array，每項：{"campaignId":"必須使用原 ID","contentType":"BRAND|EDUCATION|PRODUCT|ENGAGEMENT|PROMOTION","topic":"口語勾人的繁中標題","contentDirection":"一句溝通點","format":"SINGLE|CAROUSEL","platforms":${JSON.stringify(parseJsonArray(plan.platforms))},"recommendationReason":"一句推薦理由","sourceSignals":[]}。`;
    let drafts = extractArray(await chatTextOpenRouter(prompt, 4000));
    const fallback = fallbackAll.slice(0, targetNew);
    if (drafts.length !== targetNew) drafts = fallback;
    if (!hasProducts) drafts = drafts.map((draft, index) => hasUngroundedProductClaim(draft) ? fallback[index] : draft);
    return drafts.map((draft, i) => ({
      monthlyPlanId: plan.id,
      campaignId: draft.campaignId && campaignIds.has(draft.campaignId) ? draft.campaignId : fallback[i].campaignId,
      contentType: CONTENT_TYPES.includes(draft.contentType as ContentType) ? draft.contentType! : fallback[i].contentType!,
      topic: String(draft.topic || fallback[i].topic),
      contentDirection: String(draft.contentDirection || fallback[i].contentDirection),
      recommendationReason: String(draft.recommendationReason || fallback[i].recommendationReason || ""),
      sourceSignals: JSON.stringify(filterCitedSignals(draft.sourceSignals, signals)),
      format: draft.format === "CAROUSEL" ? "CAROUSEL" : "SINGLE",
      platforms: JSON.stringify(Array.isArray(draft.platforms) ? draft.platforms : fallback[i].platforms),
      sortOrder: keptCount + i,
    }));
  };
  const normalized = targetNew > 0 ? await generateNew() : [];

  const keptIds = kept.map((k) => k.id);
  await db.$transaction([
    keptIds.length
      ? db.contentPlanItem.deleteMany({ where: { monthlyPlanId: plan.id, id: { notIn: keptIds } } })
      : db.contentPlanItem.deleteMany({ where: { monthlyPlanId: plan.id } }),
    ...kept.map((k, i) => db.contentPlanItem.update({ where: { id: k.id }, data: { sortOrder: i } })),
    ...(normalized.length ? [db.contentPlanItem.createMany({ data: normalized })] : []),
    db.monthlyMarketingPlan.update({ where: { id: plan.id }, data: { status: "TOPICS_READY", signalsJson: JSON.stringify(signals) } }),
  ]);
  const items = await db.contentPlanItem.findMany({ where: { monthlyPlanId: plan.id }, orderBy: { sortOrder: "asc" } });
  return NextResponse.json({ items: items.map((x) => ({ ...x, platforms: parseJsonArray(x.platforms), sourceSignals: parseJsonArrayAny(x.sourceSignals) })), signals, kept: keptCount });
}
