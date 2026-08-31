"use client";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  open: boolean;
  saving: boolean;
  onCancel: () => void;
  onLeaveWithoutSaving: () => void;
  onSaveAndLeave: () => void;
};

/** 撳返上一頁／側欄品牌名嗰陣，有未儲存改動先會彈出嚟——見 useUnsavedChangesGuard.ts。 */
export function UnsavedChangesModal({ open, saving, onCancel, onLeaveWithoutSaving, onSaveAndLeave }: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <div className="shrink-0 w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">有未儲存的修改</h3>
            <p className="text-sm text-gray-500 mt-1">離開這頁會遺失未儲存的修改，確定要離開？</p>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Button onClick={onSaveAndLeave} disabled={saving}
            className="w-full gap-1.5 bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-60">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            先儲存再離開
          </Button>
          <Button onClick={onLeaveWithoutSaving} disabled={saving} variant="outline"
            className="w-full border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 hover:text-red-600">
            不儲存，直接離開
          </Button>
          <Button onClick={onCancel} disabled={saving} variant="ghost"
            className="w-full text-gray-500 hover:bg-gray-50">
            取消，留喺呢頁
          </Button>
        </div>
      </div>
    </div>
  );
}
