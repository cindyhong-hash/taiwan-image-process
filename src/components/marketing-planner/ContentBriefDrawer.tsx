"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, Copy, ExternalLink, Images, Loader2, X } from "lucide-react";
import { buildContentBrief, plannerActivityDestination, type BriefCampaign, type BriefSourceItem } from "@/lib/planner/content-brief";

const PLATFORMS = ["Instagram", "Facebook"];
type Work = { id: string; theme: string; status: string; layoutId?: string; generatedLayouts?: { imageUrl: string; isSelected?: boolean }[] };

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
  const [showPicker, setShowPicker] = useState(false);
  const [works, setWorks] = useState<Work[]>([]);
  const [worksLoading, setWorksLoading] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [preview, setPreview] = useState<{ imageUrl: string; copyText: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const campaign = campaigns.find((candidate) => candidate.id === draft.campaignId);
  const isProduced = !!draft.generatedActivityId;

  // 已製作的主題：抓出成品圖 + 文案（選定那張，退回第一張），讓抽屜直接看到完整貼文
  useEffect(() => {
    if (!draft.generatedActivityId) { setPreview(null); return; }
    let alive = true;
    setPreviewLoading(true);
    fetch(`/api/activities/${draft.generatedActivityId}`)
      .then((r) => r.json())
      .then((activity: { generatedLayouts?: { imageUrl: string; copyText: string; isSelected?: boolean }[] }) => {
        if (!alive) return;
        const layouts = activity.generatedLayouts ?? [];
        const chosen = layouts.find((l) => l.isSelected) ?? layouts[0];
        setPreview(chosen ? { imageUrl: chosen.imageUrl, copyText: chosen.copyText ?? "" } : null);
      })
      .catch(() => { if (alive) setPreview(null); })
      .finally(() => { if (alive) setPreviewLoading(false); });
    return () => { alive = false; };
  }, [draft.generatedActivityId]);

  const copyCaption = async () => {
    if (!preview?.copyText) return;
    try { await navigator.clipboard.writeText(preview.copyText); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  };

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

  const openPicker = async () => {
    setShowPicker(true); setError(""); setWorksLoading(true);
    try {
      const c = await fetch(`/api/clients/${clientId}`).then((r) => r.json());
      const list: Work[] = (c?.activities ?? []).filter((a: Work) => (a.generatedLayouts?.length ?? 0) > 0);
      setWorks(list);
    } catch { setError("無法載入作品，請稍後再試。"); }
    finally { setWorksLoading(false); }
  };
  const attachWork = async (activityId: string) => {
    setAttaching(true); setError("");
    try {
      const r = await fetch(`/api/content-plan-items/${draft.id}/attach`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ activityId }) });
      if (!r.ok) throw new Error();
      const updated = await r.json();
      const next = { ...draft, generatedActivityId: updated.generatedActivityId, status: updated.status };
      setDraft(next); onSaved(next); setShowPicker(false);
    } catch { setError("綁定作品失敗，請稍後再試。"); }
    finally { setAttaching(false); }
  };

  return (
    <div className="fixed inset-0 z-50">
      <button aria-label="關閉內容簡介" onClick={onClose} className="absolute inset-0 cursor-default bg-gray-950/25 backdrop-blur-[1px]" />
      <aside role="dialog" aria-modal="true" aria-labelledby="content-brief-title"
        className="absolute inset-y-0 right-0 flex w-full max-w-xl flex-col bg-white shadow-2xl">
        <header className="flex items-start justify-between border-b border-gray-100 px-6 py-5">
          <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-600">Content Brief</p><h2 id="content-brief-title" className="mt-1 text-xl font-bold text-gray-900">{isProduced ? "檢視這篇貼文" : "製作這篇內容"}</h2><p className="mt-1 text-xs text-gray-400">{isProduced ? "以下是已完成的成品與文案，企劃資訊仍可調整。" : "確認企劃資訊，下一步將帶入既有創作流程。"}</p></div>
          <button aria-label="關閉" onClick={onClose} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><X className="h-5 w-5" /></button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {error && <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

          {isProduced && (
            <section className="mb-6">
              <h3 className="mb-3 text-sm font-semibold text-gray-800">貼文預覽</h3>
              {previewLoading ? (
                <div className="flex justify-center rounded-xl border border-gray-200 py-12 text-gray-400"><Loader2 className="h-5 w-5 animate-spin" /></div>
              ) : preview ? (
                <div className="overflow-hidden rounded-xl border border-gray-200">
                  {preview.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={preview.imageUrl} alt={draft.topic} className="w-full bg-gray-50 object-contain" />
                  )}
                  <div className="border-t border-gray-100 px-4 py-3">
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-[11px] font-medium text-gray-500">文案</span>
                      {preview.copyText && <button onClick={copyCaption} className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-violet-700 hover:bg-violet-50">{copied ? <><Check className="h-3 w-3" />已複製</> : <><Copy className="h-3 w-3" />複製文案</>}</button>}
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-6 text-gray-700">{preview.copyText || "這篇還沒有文案，可到成品頁重新生成。"}</p>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-gray-200 px-4 py-8 text-center text-xs text-gray-400">尚未有成品，點下方「{draft.status === "NEEDS_REVIEW" ? "前往審核" : "查看成品"}」查看。</div>
              )}
            </section>
          )}

          {isProduced && <h3 className="mb-3 text-sm font-semibold text-gray-800">企劃資訊</h3>}
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

          <section className="mt-6 flex items-center justify-between border-t border-gray-100 pt-5">
            <div><h3 className="text-sm font-semibold text-gray-800">用自己做的圖</h3><p className="mt-0.5 text-[11px] text-gray-400">改用既有作品或自由排版設計稿，掛到這篇主題</p></div>
            <button onClick={openPicker} className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"><Images className="h-3.5 w-3.5" />改用既有作品</button>
          </section>

          {(initial.recommendationReason || initial.sourceSignals.length > 0) && <section className="mt-6 rounded-xl border border-amber-100 bg-amber-50/60 p-4"><h3 className="text-xs font-semibold text-amber-800">為什麼推薦這篇？</h3>{initial.recommendationReason && <p className="mt-2 text-sm leading-5 text-amber-900">{initial.recommendationReason}</p>}<div className="mt-2 flex flex-wrap gap-1.5">{initial.sourceSignals.map((signal) => <span key={signal.id} className="rounded-md bg-white px-2 py-1 text-[10px] text-amber-700 shadow-sm">來源：{signal.label}</span>)}</div></section>}
        </div>

        <footer className="border-t border-gray-100 bg-white px-6 py-4"><div className="flex items-center justify-between gap-3"><button onClick={onClose} className="rounded-lg px-4 py-2.5 text-sm text-gray-500 hover:bg-gray-100">返回日曆</button><div className="flex flex-wrap justify-end gap-2"><button onClick={save} disabled={saving || starting || approving || !draft.topic.trim()} className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">{saving && <Loader2 className="mr-1.5 inline h-4 w-4 animate-spin" />}儲存變更</button>{draft.status === "NEEDS_REVIEW" && <button onClick={approve} disabled={approving} className="flex items-center gap-1 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">{approving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}核准完成</button>}{draft.generatedActivityId ? <button onClick={continueMaking} className="flex items-center gap-1 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-violet-700">{draft.status === "NEEDS_REVIEW" ? "前往審核" : draft.status === "APPROVED" ? "查看成品" : draft.status === "GENERATING" ? "查看進度" : "繼續製作"}<ExternalLink className="h-4 w-4" /></button> : <button onClick={startMaking} disabled={saving || starting || !draft.topic.trim()} className="flex items-center gap-1 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50">{starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <>開始製作<ChevronRight className="h-4 w-4" /></>}</button>}</div></div></footer>
        {showPicker && (
          <div className="absolute inset-0 z-10 flex flex-col bg-white">
            <header className="flex items-start justify-between border-b border-gray-100 px-6 py-5">
              <div><h2 className="text-lg font-bold text-gray-900">改用既有作品</h2><p className="mt-1 text-xs text-gray-400">選一張已完成的作品或自由排版設計稿，掛到這篇主題。</p></div>
              <button aria-label="返回" onClick={() => setShowPicker(false)} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><X className="h-5 w-5" /></button>
            </header>
            <div className="flex-1 overflow-y-auto p-6">
              {error && <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
              {worksLoading ? (
                <div className="flex justify-center py-12 text-gray-400"><Loader2 className="h-5 w-5 animate-spin" /></div>
              ) : works.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-200 py-12 text-center text-sm text-gray-400">目前沒有可用的作品／設計稿。<br />可先到「建立圖文」用自由排版做一張。</div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {works.map((w) => {
                    const img = w.generatedLayouts?.find((l) => l.isSelected)?.imageUrl ?? w.generatedLayouts?.[0]?.imageUrl;
                    const isDesign = w.layoutId === "magic-layers";
                    return (
                      <button key={w.id} disabled={attaching} onClick={() => attachWork(w.id)}
                        className="group overflow-hidden rounded-xl border border-gray-200 text-left transition hover:border-violet-300 hover:shadow-sm disabled:opacity-50">
                        <div className="aspect-square bg-gray-50">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          {img && <img src={img} alt={w.theme} className="h-full w-full object-cover" />}
                        </div>
                        <div className="flex items-center justify-between gap-2 px-2.5 py-2">
                          <span className="truncate text-xs text-gray-700">{w.theme}</span>
                          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${isDesign ? "bg-violet-50 text-violet-700" : "bg-emerald-50 text-emerald-700"}`}>{isDesign ? "設計稿" : "已完成"}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            {attaching && <div className="absolute inset-0 flex items-center justify-center bg-white/60"><Loader2 className="h-6 w-6 animate-spin text-violet-600" /></div>}
          </div>
        )}
      </aside>
    </div>
  );
}
