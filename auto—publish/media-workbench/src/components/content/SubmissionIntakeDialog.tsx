import React, { useEffect, useState } from "react";
import type { ContentSubmissionPlatform } from "../../types/publication";
import type { MediaResource } from "../../types/media";
import AccountProfileSelector from "./AccountProfileSelector";
import FavoriteMediaSelectorDialog from "./FavoriteMediaSelectorDialog";
import type { FavoriteMediaPage } from "./GeneratedArticlesView.types";
import PaidMediaPreflightDialog from "./PaidMediaPreflightDialog";
import type {
  SubmissionIntakeIntents,
  SubmissionIntakeSnapshot,
} from "./use-submission-intake-session";

export type SubmissionIntakeDialogProps = {
  snapshot: SubmissionIntakeSnapshot;
  intents: SubmissionIntakeIntents;
  submissionPlatforms: ContentSubmissionPlatform[];
  favoriteMediaPage: FavoriteMediaPage;
  onFavoriteMediaPageChange?: (page: number) => void;
};

export default function SubmissionIntakeDialog({
  snapshot,
  intents,
  submissionPlatforms,
  favoriteMediaPage,
  onFavoriteMediaPageChange,
}: SubmissionIntakeDialogProps) {
  const [favoriteSelectorOpen, setFavoriteSelectorOpen] = useState(false);
  const [selectedFavoriteMedia, setSelectedFavoriteMedia] =
    useState<MediaResource | null>(null);

  useEffect(() => {
    if (snapshot.open) return;
    setFavoriteSelectorOpen(false);
    setSelectedFavoriteMedia(null);
  }, [snapshot.open]);

  function openFavoriteMediaSelector() {
    if (snapshot.mutationBusy) return;
    setFavoriteSelectorOpen(true);
    onFavoriteMediaPageChange?.(1);
  }

  function selectFavoriteMedia(resource: MediaResource) {
    setSelectedFavoriteMedia(resource);
    intents.setMediaResource(resource.resourceId);
    setFavoriteSelectorOpen(false);
  }

  if (!snapshot.open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/30 p-4"
        role="dialog"
        aria-modal="true"
        aria-label="发起投稿"
      >
        <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg bg-white p-5 shadow-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-slate-800">发起投稿</h3>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                当前选择 {snapshot.articleCount} 篇文章；确认前不会创建投稿批次或订单。
              </p>
            </div>
            <button
              type="button"
              aria-label="关闭发起投稿"
              onClick={intents.close}
              disabled={snapshot.mutationBusy}
              className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-40"
            >
              ×
            </button>
          </div>
          <div className="mt-4 flex gap-2" role="tablist" aria-label="投稿类型">
            <button
              type="button"
              role="tab"
              aria-selected={snapshot.mode === "regular"}
              onClick={() => intents.setMode("regular")}
              disabled={snapshot.mutationBusy}
              className={`rounded px-3 py-2 text-xs font-semibold ${snapshot.mode === "regular" ? "bg-slate-900 text-white" : "border border-slate-300 text-slate-600"}`}
            >
              普通平台
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={snapshot.mode === "paid"}
              onClick={() => intents.setMode("paid")}
              disabled={snapshot.mutationBusy}
              className={`rounded px-3 py-2 text-xs font-semibold ${snapshot.mode === "paid" ? "bg-slate-900 text-white" : "border border-slate-300 text-slate-600"}`}
            >
              付费媒体
            </button>
          </div>
          {snapshot.mode === "regular" ? (
            <div className="mt-4 grid gap-3">
              <label className="grid gap-1 text-xs text-slate-600">
                普通平台投稿目标
                <select
                  aria-label="普通平台投稿目标"
                  value={snapshot.platformId}
                  onChange={(event) =>
                    intents.setRegularPlatform(event.target.value)
                  }
                  disabled={snapshot.mutationBusy}
                  className="h-9 rounded border border-slate-300 px-2 text-sm"
                >
                  <option value="">请选择一个平台</option>
                  {submissionPlatforms.map((platform) => (
                    <option key={platform.id} value={platform.id}>
                      {platform.displayName || platform.id}
                    </option>
                  ))}
                </select>
              </label>
              <AccountProfileSelector
                platforms={submissionPlatforms}
                platformId={snapshot.platformId}
                value={snapshot.accountProfileId}
                onChange={intents.setAccountProfile}
              />
              <button
                type="button"
                onClick={() => void intents.submitRegular()}
                disabled={
                  !snapshot.articleCount ||
                  !snapshot.platformId ||
                  !snapshot.accountProfileId ||
                  snapshot.regularBusy
                }
                className="justify-self-end rounded bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
              >
                {snapshot.regularBusy ? "检查中…" : "确认发起投稿"}
              </button>
            </div>
          ) : (
            <div className="mt-4 grid gap-3">
              <div className="rounded border border-slate-200 bg-slate-50 p-3">
                {selectedFavoriteMedia && snapshot.mediaResourceId ? (
                  <div className="flex min-w-0 items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-800">
                        {selectedFavoriteMedia.name || selectedFavoriteMedia.resourceId}
                      </p>
                      <p className="mt-1 truncate text-xs text-slate-500">
                        资源码：{selectedFavoriteMedia.resourceId}
                        {typeof selectedFavoriteMedia.price === "number"
                          ? ` · 缓存参考价 ¥${selectedFavoriteMedia.price.toFixed(2)}`
                          : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={openFavoriteMediaSelector}
                      disabled={snapshot.mutationBusy}
                      className="shrink-0 rounded border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-40"
                    >
                      更换收藏媒体
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">从收藏媒体中选择</p>
                      <p className="mt-1 text-xs text-slate-500">
                        收藏池共 {favoriteMediaPage.total} 个媒体，不加载媒体资源总库。
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={openFavoriteMediaSelector}
                      disabled={snapshot.mutationBusy}
                      className="rounded bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
                    >
                      选择收藏媒体
                    </button>
                  </div>
                )}
              </div>
              {!snapshot.paidPreflight && (
                <button
                  type="button"
                  onClick={() => void intents.previewPaid()}
                  disabled={!snapshot.mediaResourceId || snapshot.paidPreviewBusy}
                  className="justify-self-end rounded bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
                >
                  {snapshot.paidPreviewBusy ? "检查中…" : "确认投稿信息"}
                </button>
              )}
            </div>
          )}
          {snapshot.error && (
            <p role="alert" className="mt-3 rounded border border-rose-100 bg-rose-50 p-2 text-xs text-rose-700">
              {snapshot.error}
            </p>
          )}
        </div>
      </div>
      {snapshot.paidPreflight && (
        <PaidMediaPreflightDialog
          model={snapshot.paidPreflight}
          busy={snapshot.paidConfirmBusy}
          error={snapshot.error}
          onClose={intents.closePaidPreflight}
          onConfirm={intents.confirmPaid}
        />
      )}
      {favoriteSelectorOpen && (
        <FavoriteMediaSelectorDialog
          page={favoriteMediaPage}
          onPageChange={(page) => onFavoriteMediaPageChange?.(page)}
          onSelect={selectFavoriteMedia}
          onClose={() => setFavoriteSelectorOpen(false)}
        />
      )}
    </>
  );
}
