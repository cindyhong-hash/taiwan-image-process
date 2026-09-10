"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Settings, Plug, Trash2, AlertTriangle, Loader2 } from "lucide-react";
import { BrandSettingsForm, type BrandFormValues } from "@/components/clients/BrandSettingsForm";
import { AiLearnedCard } from "@/components/home/AiLearnedCard";
import { brandCompleteness } from "@/lib/brandCompleteness";

type SettingsTab = "settings" | "linking";

export default function ClientSettingsPage({ params }: { params: Promise<{ clientId: string }> }) {
  const [clientId, setClientId] = useState<string>("");
  const [client, setClient] = useState<BrandFormValues | null>(null);
  const [tab, setTab] = useState<SettingsTab>("settings");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loadError, setLoadError] = useState(false);
  // 「AI 已學習」的素材張數要跟首頁同定義（素材庫圖片數），
  // 原本這頁改用 pastPostImageUrls，導致同一張卡兩頁顯示 19 張 / 5 張。
  const [assetCount, setAssetCount] = useState(0);
  const [saveError, setSaveError] = useState(false);
  const [deleteError, setDeleteError] = useState(false);
  const router = useRouter();

  const load = useCallback((cid: string) => {
    setLoadError(false);
    fetch(`/api/clients/${cid}`)
      .then((r) => { if (!r.ok) throw new Error("client fetch failed"); return r.json(); })
      .then(setClient)
      .catch(() => setLoadError(true));
    fetch(`/api/library/gallery?clientId=${cid}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setAssetCount(Array.isArray(data) ? data.length : 0))
      .catch(() => setAssetCount(0));
  }, []);

  useEffect(() => {
    params.then(({ clientId }) => {
      setClientId(clientId);
      load(clientId);
    });
  }, [params, load]);

  // 存檔：檢查 res.ok，失敗顯示錯誤且不導頁（不再「失敗也當成功」）。
  const handleSubmit = async (values: BrandFormValues) => {
    setSaveError(false);
    try {
      const res = await fetch(`/api/clients/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) throw new Error("save failed");
      router.push(`/clients/${clientId}`);
      router.refresh();
    } catch {
      setSaveError(true);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setDeleteError(false);
    try {
      const res = await fetch(`/api/clients/${clientId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      try { localStorage.removeItem("lastClientId"); } catch { /* ignore */ }
      router.push("/clients");
      router.refresh();
      setConfirmDelete(false);
    } catch {
      setDeleteError(true);
    } finally {
      setDeleting(false);
    }
  };

  if (!client) {
    if (loadError) {
      return (
        <div className="flex flex-col items-center gap-3 py-24 text-center">
          <p className="text-sm text-gray-500">載入失敗，請檢查網路後再試一次。</p>
          <button type="button" onClick={() => clientId && load(clientId)}
            className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700">重新載入</button>
        </div>
      );
    }
    return <div className="text-gray-400">載入中...</div>;
  }

  // AI 已學習側卡：與首頁共用 brandCompleteness()，兩頁數字才會一致。
  const { percent, missing } = brandCompleteness({
    description: client.description,
    primaryColor: client.primaryColor,
    toneLabels: client.toneLabels,
    taboos: client.taboos,
    logoUrls: client.logoUrls,
    pastPostUrls: client.pastPostImageUrls,
    assetCount,
  });

  return (
    <div>
      {/* 2-tab：修改品牌設定 / 連動帳號調整（wireframe ⑨） */}
      <div className="flex gap-1 border-b mb-6">
        {([
          { key: "settings" as SettingsTab, label: "修改品牌設定", icon: <Settings className="h-4 w-4" /> },
          { key: "linking" as SettingsTab, label: "連動帳號調整", icon: <Plug className="h-4 w-4" /> },
        ]).map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 pb-3 pt-1 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key ? "border-violet-600 text-violet-700" : "border-transparent text-gray-400 hover:text-gray-600"}`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {tab === "settings" ? (
        <>
          <div className="mb-6">
            <h1 className="text-lg font-bold text-gray-900">品牌設定 ✨</h1>
            <p className="text-sm text-gray-500 mt-1">管理你的品牌資訊，讓 AI 更精準生成符合品牌調性的內容</p>
          </div>
          <div className="flex gap-6 items-start">
            <div className="flex-1 min-w-0 max-w-3xl">
              {saveError && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
                  儲存失敗，請稍後再試一次。你的內容仍保留在下方表單。
                </div>
              )}
              <BrandSettingsForm initialValues={client} clientId={clientId} onSubmit={handleSubmit} submitLabel="更新品牌設定" />
            </div>
            <div className="hidden lg:block w-[300px] shrink-0 sticky top-6">
              <AiLearnedCard assetCount={assetCount} percent={percent} missing={missing} />
            </div>
          </div>

          {/* 危險操作：刪除品牌 */}
          <div className="mt-10 max-w-3xl border-t border-gray-200 pt-6">
            <h2 className="text-sm font-bold text-red-600">危險操作</h2>
            <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50/50 p-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800">刪除品牌</p>
                <p className="text-xs text-gray-500 mt-0.5">會一併刪除此品牌的所有活動、圖文與素材，無法復原。</p>
              </div>
              <button type="button" onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1.5 text-sm font-medium text-red-600 border border-red-300 rounded-lg px-3 py-2 hover:bg-red-100 transition-colors shrink-0">
                <Trash2 className="h-4 w-4" />刪除品牌
              </button>
            </div>
          </div>
        </>
      ) : (
        <AccountLinkingStub />
      )}

      {/* 刪除確認 */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-5">
            <div className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <h3 className="text-sm font-semibold">刪除品牌「{client.name}」？</h3>
            </div>
            <p className="text-xs text-gray-500 mt-2 leading-relaxed">
              這會永久刪除此品牌，以及底下<b>所有活動、圖文與素材</b>，無法復原。
            </p>
            {deleteError && (
              <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">刪除失敗，請稍後再試。</p>
            )}
            <div className="flex items-center justify-end gap-2 mt-4">
              <button type="button" onClick={() => setConfirmDelete(false)} disabled={deleting}
                className="text-xs font-medium text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors disabled:opacity-50">取消</button>
              <button type="button" onClick={handleDelete} disabled={deleting}
                className="flex items-center gap-1 text-xs font-medium text-white bg-red-500 rounded-lg px-3 py-1.5 hover:bg-red-600 disabled:opacity-50 transition-colors">
                {deleting ? <><Loader2 className="h-3 w-3 animate-spin" />刪除中…</> : "確認刪除"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab 2：連動帳號（UI stub；OAuth 後端排 backlog） ──
function AccountLinkingStub() {
  return (
    <div className="max-w-lg space-y-4">
      <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
        <Plug className="h-4 w-4 shrink-0 mt-0.5" />
        <span>連動帳號功能開發中：授權後會自動拉返廣告圖／IG 貼文相入「風格組件」。OAuth（Meta / Google / IG）正排程開發，暫以手動上載頂住。</span>
      </div>

      {/* Meta */}
      <div className="border rounded-lg p-3 opacity-70">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#534AB7]" /> Meta（Facebook + Instagram）</span>
          <span className="text-[11px] text-gray-400 border rounded-full px-2 py-0.5">未連動</span>
        </div>
        <div className="flex items-center justify-between py-2 border-t text-sm text-gray-500">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#378ADD]" /> Facebook 廣告圖</span>
          <button disabled className="text-xs text-gray-400 cursor-not-allowed">敬請期待</button>
        </div>
        <div className="flex items-center justify-between py-2 border-t text-sm text-gray-500">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#D4537E]" /> Instagram 貼文相</span>
          <button disabled className="text-xs text-gray-400 cursor-not-allowed">敬請期待</button>
        </div>
      </div>

      {/* Google Ads */}
      <div className="flex items-center justify-between border rounded-lg p-3 opacity-70">
        <span className="text-sm">Google Ads 圖片素材</span>
        <button disabled className="text-xs text-gray-400 cursor-not-allowed">敬請期待</button>
      </div>

      {/* 手動上載（過渡可用） */}
      <div className="flex items-center justify-between border border-dashed rounded-lg p-3">
        <span className="text-sm text-gray-600">手動上載（過渡後備）</span>
        <span className="text-xs text-gray-400">用「風格組件 → 上傳參考圖」</span>
      </div>
    </div>
  );
}
