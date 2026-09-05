import React from "react";
import { formatBeijingTime } from "../../time-format";
import type { ArticleTrashImpactItem } from "../../types/publication";
import type {
  ArticleRemovalSessionIntents,
  ArticleRemovalSessionSnapshot,
} from "./use-article-removal-session";

export type ArticleRemovalDialogProps = {
  snapshot: ArticleRemovalSessionSnapshot;
  intents: ArticleRemovalSessionIntents;
};

function impactPlatform(item: ArticleTrashImpactItem): string {
  return (
    item.displayName || item.targetPlatformId || item.platformId || "未知平台"
  );
}

function transactionReason(
  transaction: ArticleRemovalSessionSnapshot["transaction"],
): string {
  return transaction?.reasonCode || transaction?.errorCode || "状态冲突";
}

export default function ArticleRemovalDialog({
  snapshot,
  intents,
}: ArticleRemovalDialogProps) {
  const preview = snapshot.preview;
  const transaction = snapshot.transaction;
  const hasOpenTransaction = Boolean(
    preview?.openTransactionId ||
      preview?.transactionId ||
      preview?.openTransaction ||
      preview?.transaction,
  );

  if (!preview && !transaction && !snapshot.feedback) return null;

  return (
    <>
      {snapshot.feedback && (
        <div
          role={snapshot.feedback.kind === "error" ? "alert" : "status"}
          aria-live={
            snapshot.feedback.kind === "error" ? "assertive" : "polite"
          }
          className={`min-w-0 rounded border p-2 text-xs ${snapshot.feedback.kind === "error" ? "border-rose-100 bg-rose-50 text-rose-700" : "border-blue-100 bg-blue-50 text-blue-700"}`}
        >
          {snapshot.feedback.text}
        </div>
      )}
      {transaction && (
        <div
          role={snapshot.transactionStatus === "needs_repair" ? "alert" : "status"}
          aria-live={
            snapshot.transactionStatus === "needs_repair"
              ? "assertive"
              : "polite"
          }
          className={`min-w-0 rounded border p-2 text-xs ${snapshot.transactionStatus === "needs_repair" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-blue-100 bg-blue-50 text-blue-700"}`}
        >
          {snapshot.transactionStatus === "pending_auto_recovery" ? (
            `删除事务正在自动恢复${transaction.updatedAt ? ` · 最近更新：${formatBeijingTime(transaction.updatedAt)}` : ""}`
          ) : snapshot.transactionStatus === "needs_repair" ? (
            <>
              <span>删除事务需要修复：{transactionReason(transaction)}</span>
              <button
                type="button"
                onClick={() => void intents.retryTransaction()}
                disabled={snapshot.retryBusy}
                className="ml-2 rounded border border-rose-300 px-2 py-1 text-xs disabled:opacity-40"
              >
                重试修复删除事务
              </button>
            </>
          ) : snapshot.transactionStatus === "superseded" ? (
            "删除事务已由现有事务复用并归档。"
          ) : (
            "删除事务已完成。"
          )}
        </div>
      )}
      {preview && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/30 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="移入回收站预检"
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-semibold text-slate-800">
                  移入回收站预检
                </h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  发布记录和标题快照会保留；已发布文章不会进入回收站，恢复文章也不会自动恢复投稿队列。
                </p>
              </div>
              <button
                type="button"
                onClick={intents.closePreview}
                disabled={snapshot.trashBusy}
                aria-label="关闭回收站预检"
                className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-40"
              >
                ×
              </button>
            </div>
            <div className="mt-4 grid gap-2 text-sm text-slate-700">
              <div>
                文章数：<strong>{preview.articleCount}</strong>
              </div>
              <div>仍在投稿/待确认：{preview.blockedItems.length}</div>
              <div>发布记录和最小证据：保留</div>
            </div>
            {hasOpenTransaction && (
              <div className="mt-4 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                已存在相同删除事务，已复用现有事务；请查看上方状态，不会重复创建。
              </div>
            )}
            {preview.blockedItems.length > 0 && (
              <div className="mt-4 rounded border border-rose-200 bg-rose-50 p-3">
                <div className="text-sm font-semibold text-rose-800">
                  阻止项（整批不可提交）
                </div>
                <ul className="mt-2 grid gap-1 text-xs text-rose-700">
                  {preview.blockedItems.map((item, index) => (
                    <li key={`${item.articleId || "article"}-${index}`}>
                      {item.articleId || "文章"} · {impactPlatform(item)} ·{" "}
                      {item.reasonCode || item.status || "状态冲突"}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-rose-700">
                  请取消选择风险文章后重新预检。
                </p>
              </div>
            )}
            {preview.canCommit && !snapshot.removalSubmitDisabled && (
              <div className="mt-4 rounded border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-800">
                确认后只会将文章内容移入回收站；投稿任务必须先在投稿中心安全结束，
                已发布文章和发布证据不会被清理。
              </div>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={intents.closePreview}
                disabled={snapshot.trashBusy}
                className="rounded border border-slate-300 px-3 py-2 text-xs disabled:opacity-40"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void intents.commitTrash()}
                disabled={
                  !preview.canCommit ||
                  hasOpenTransaction ||
                  snapshot.trashBusy ||
                  snapshot.removalSubmitDisabled
                }
                className="rounded bg-rose-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
              >
                {snapshot.removalSubmitDisabled
                  ? "已有开放删除事务"
                  : hasOpenTransaction
                    ? "正在复用现有删除事务"
                  : "确认移入回收站"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

