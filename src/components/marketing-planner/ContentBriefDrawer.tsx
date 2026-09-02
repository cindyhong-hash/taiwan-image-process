"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, ExternalLink, Loader2, X } from "lucide-react";
import { buildContentBrief, plannerActivityDestination, type BriefCampaign, type BriefSourceItem } from "@/lib/planner/content-brief";

const PLATFORMS = ["Instagram", "Facebook"];

export function ContentBriefDrawer({ item, campaigns, clientId, onClose, onSaved }: {
  item: BriefSourceItem;
  campaigns: BriefCampaign[];
  clientId: string;
  onClose: () => void;
  onSaved: (item: BriefSourceItem) => void;
}) {
  const router = useRouter();
  const initial = useMemo(() => buildContentBrief(item, campaigns), [campaigns, item]);
  const [draft, setDraft] = useState(item);
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState("");
  const campaign = campaigns.find((candidate) => candidate.id === draft.campaignId);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKeyDown); document.body.style.overflow = previousOverflow; };
  }, [onClose]);

  const togglePlatform = (platform: string) => setDraft((current) => ({
    ...current,
    platforms: current.platforms.includes(platform) ? current.platforms.filter((value) => value !== platform) : [...current.platforms, platform],
  }));

  const persist = async () => {
    try {
      const response = await fetch(`/api/content-plan-items/${draft.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: draft.topic, contentDirection: draft.contentDirection, campaignId: draft.campaignId, format: draft.format, platforms: draft.platforms }),
      });
      if (!response.ok) throw new Error("save failed");
      onSaved(draft);
      return true;
    } catch { setError("內容簡介未能儲存，請稍後再試。"); return false; }
  };

  const save = async () => {
    setSaving(true); setError("");
    if (await persist()) onClose();
    setSaving(false);
  };

  const startMaking = async () => {
    setStarting(true); setError("");
    try {
      if (!await persist()) return;
      const response = await fetch(`/api/content-plan-items/${draft.id}/activity`, { method: "POST" });
      if (!response.ok) throw new Error("activity handoff failed");
      const result = await response.json() as { activityId: string; format: string };
      router.push(plannerActivityDestination(clientId, result.activityId, result.format));
    } catch { setError("目前無法開始製作，請稍後再試。"); }
    finally { setStarting(false); }
  };

  const activityHref = draft.generatedActivityId
    ? `/clients/${clientId}/activities/${draft.generatedActivityId}`
    : "";

  const continueMaking = () => {
    if (!draft.generatedActivityId) return;
    const href = draft.status === "DRAFT"
      ? plannerActivityDestination(clientId, draft.generatedActivityId, draft.format)
      : activityHref;
    router.push(href);
  };

  const approve = async () => {
    setApproving(true); setError("");
    try {
      const response = await fetch(`/api/content-plan-items/${draft.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "APPROVED" }),
      });
      if (!response.ok) throw new Error("approve failed");
      const approved = { ...draft, status: "APPROVED" };
      setDraft(approved);
      onSaved(approved);
    } catch { setError("目前無法核准這篇內容，請稍後再試。"); }
    finally { setApproving(false); }
  };

  return (
    <div className="fixed inset-0 z-50">
      <button aria-label="關閉內容簡介" onClick={onClose} className="absolute inset-0 cursor-default bg-gray-950/25 backdrop-blur-[1px]" />
      <aside role="dialog" aria-modal="true" aria-labelledby="content-brief-title"
        className="absolute inset-y-0 right-0 flex w-full max-w-xl flex-col bg-white shadow-2xl">
        <header className="flex items-start justify-between border-b border-gray-100 px-6 py-5">
          <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-600">Content Brief</p><h2 id="content-brief-title" className="mt-1 text-xl font-bold text-gray-900">製作這篇內容</h2><p className="mt-1 text-xs text-gray-400">確認企劃資訊，下一步將帶入既有創作流程。</p></div>
          <button aria-label="關閉" onClick={onClose} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><X className="h-5 w-5" /></button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {error && <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

          <section className="space-y-4">
            <div><label className="text-xs font-medium text-gray-600">Campaign</label><select value={draft.campaignId ?? ""} onChange={(event) => setDraft((current) => ({ ...current, campaignId: event.target.value || null }))} className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm">
              <option value="">未指定 Campaign</option>{campaigns.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
            </select>{campaign?.description && <p className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-xs leading-5 text-gray-500">{campaign.description}</p>}</div>

            <div><label className="text-xs font-medium text-gray-600">主題</label><input value={draft.topic} onChange={(event) => setDraft((current) => ({ ...current, topic: event.target.value }))} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-medium" /></div>
            <div><label className="text-xs font-medium text-gray-600">內容方向</label><textarea value={draft.contentDirection} onChange={(event) => setDraft((current) => ({ ...current, contentDirection: event.target.value }))} rows={4} className="mt-1 w-full resize-none rounded-xl border border-gray-200 px-3 py-2.5 text-sm leading-6" /></div>

            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-xs font-medium text-gray-600">內容形式</label><div className="mt-2 grid grid-cols-2 gap-2">{(["SINGLE", "CAROUSEL"] as const).map((format) => <button key={format} onClick={() => setDraft((current) => ({ ...current, format }))} className={`rounded-lg border px-2 py-2 text-xs ${draft.format === format ? "border-violet-300 bg-violet-50 font-medium text-violet-700" : "border-gray-200 text-gray-500"}`}>{format === "SINGLE" ? "單圖" : "多圖"}</button>)}</div></div>
              <div><label className="text-xs font-medium text-gray-600">發布平台</label><div className="mt-2 flex gap-2">{PLATFORMS.map((platform) => <button key={platform} onClick={() => togglePlatform(platform)} className={`flex flex-1 items-center justify-center gap-1 rounded-lg border px-2 py-2 text-xs ${draft.platforms.includes(platform) ? "border-violet-300 bg-violet-50 font-medium text-violet-700" : "border-gray-200 text-gray-500"}`}>{draft.platforms.includes(platform) && <Check className="h-3 w-3" />}{platform}</button>)}</div></div>
            </div>
          </section>

          <section className="mt-6 border-t border-gray-100 pt-5"><div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold text-gray-800">關聯產品</h3><span className="text-[11px] text-gray-400">來自 Campaign</span></div>
            {campaign?.products.length ? <div className="grid grid-cols-3 gap-3">{campaign.products.map((product) => <div key={product.id} className="overflow-hidden rounded-xl border border-gray-200"><div className="aspect-square bg-gray-50">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={product.imageUrl} alt={product.label} className="h-full w-full object-cover" /></div><p className="truncate px-2 py-2 text-[11px] text-gray-600">{product.label}</p></div>)}</div> : <div className="rounded-xl border border-dashed border-gray-200 px-4 py-6 text-center text-xs text-gray-400">這個 Campaign 尚未關聯產品</div>}
          </section>

          {(initial.recommendationReason || initial.sourceSignals.length > 0) && <section className="mt-6 rounded-xl border border-amber-100 bg-amber-50/60 p-4"><h3 className="text-xs font-semibold text-amber-800">為什麼推薦這篇？</h3>{initial.recommendationReason && <p className="mt-2 text-sm leading-5 text-amber-900">{initial.recommendationReason}</p>}<div className="mt-2 flex flex-wrap gap-1.5">{initial.sourceSignals.map((signal) => <span key={signal.id} className="rounded-md bg-white px-2 py-1 text-[10px] text-amber-700 shadow-sm">來源：{signal.label}</span>)}</div></section>}
        </div>

        <footer className="border-t border-gray-100 bg-white px-6 py-4"><div className="flex items-center justify-between gap-3"><button onClick={onClose} className="rounded-lg px-4 py-2.5 text-sm text-gray-500 hover:bg-gray-100">返回日曆</button><div className="flex flex-wrap justify-end gap-2"><button onClick={save} disabled={saving || starting || approving || !draft.topic.trim()} className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">{saving && <Loader2 className="mr-1.5 inline h-4 w-4 animate-spin" />}儲存變更</button>{draft.status === "NEEDS_REVIEW" && <button onClick={approve} disabled={approving} className="flex items-center gap-1 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">{approving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}核准完成</button>}{draft.generatedActivityId ? <button onClick={continueMaking} className="flex items-center gap-1 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-violet-700">{draft.status === "NEEDS_REVIEW" ? "前往審核" : draft.status === "APPROVED" ? "查看成品" : draft.status === "GENERATING" ? "查看進度" : "繼續製作"}<ExternalLink className="h-4 w-4" /></button> : <button onClick={startMaking} disabled={saving || starting || !draft.topic.trim()} className="flex items-center gap-1 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50">{starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <>開始製作<ChevronRight className="h-4 w-4" /></>}</button>}</div></div></footer>
      </aside>
    </div>
  );
}
