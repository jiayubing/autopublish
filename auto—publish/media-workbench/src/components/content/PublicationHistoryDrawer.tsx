import React from "react";
import { AlertTriangle, Check, ExternalLink, X, XCircle } from "lucide-react";
import { formatBeijingTime } from "../../time-format";
import type {
  PublicationHistoryRecord,
  PublicationHistorySummary,
} from "../../types/publication";
import type { GeneratedContentArticle } from "../../types/generation";
import {
  latestPublicationAttempt,
  publicationRecordStatusLabel,
  publicationStatusLabel,
  publicationTargetLabel,
} from "../../publication-status";

interface PublicationHistoryDrawerProps {
  article: GeneratedContentArticle | null;
  records: PublicationHistoryRecord[];
  summary?: PublicationHistorySummary;
  onClose: () => void;
  onReconcile?: (
    record: PublicationHistoryRecord,
    status: "published" | "failed",
  ) => void;
  busy?: boolean;
}

function safeRemoteUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export default function PublicationHistoryDrawer({
  article,
  records,
  summary: snapshotSummary,
  onClose,
  onReconcile,
  busy = false,
}: PublicationHistoryDrawerProps) {
  if (!article) return null;
  const summary = snapshotSummary || null;
  const summaryLabel = summary
    ? summary.label || publicationStatusLabel(summary.status)
    : "状态不可用";
  return (
    <div
      className="fixed inset-0 z-[100] flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={`文章 ${article.title} 的发布详情`}
    >
      <button
        type="button"
        aria-label="关闭发布详情"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-slate-900/20"
      />
      <aside className="relative flex h-full w-full max-w-md min-w-0 flex-col overflow-y-auto border-l border-slate-200 bg-white shadow-xl">
        <div className="flex min-w-0 items-start gap-3 border-b border-slate-200 p-4">
          <div className="min-w-0 flex-1">
            <h3 className="break-words text-base font-semibold text-slate-800">
              发布详情
            </h3>
            <p className="mt-1 break-words text-xs text-slate-500">
              {article.title}
            </p>
            <div
              className={`mt-2 inline-flex max-w-full flex-wrap rounded-full border px-2 py-1 text-xs font-semibold ${summary?.uncertain ? "border-rose-200 bg-rose-50 text-rose-700" : "border-slate-200 bg-slate-50 text-slate-700"}`}
            >
              {summaryLabel}
            </div>
          </div>
          <button
            type="button"
            aria-label="关闭发布详情"
            onClick={onClose}
            className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {summary?.uncertain && (
          <div className="m-4 flex min-w-0 gap-2 rounded-md border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="min-w-0 break-words">
              <strong>存在待确认结果。</strong>
              请先到远端核对；此处不提供直接重试，避免重复投稿。
            </span>
          </div>
        )}
        <div className="min-w-0 flex-1 space-y-3 p-4">
          {!records.length && (
            <div className="rounded-md border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
              尚未发现发布记录；完整文章可直接进入待投稿。
            </div>
          )}
          {records.map((record) => {
            const attempt = latestPublicationAttempt(record);
            const remoteUrl = safeRemoteUrl(attempt.remoteUrl);
            const uncertain = record.status === "uncertain";
            const regularUncertain =
              uncertain && record.targetKey.startsWith("platform:");
            return (
              <section
                key={record.publicationId}
                className={`min-w-0 rounded-md border p-3 ${uncertain ? "border-rose-200 bg-rose-50/50" : "border-slate-200 bg-white"}`}
              >
                <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="break-words text-sm font-semibold text-slate-800">
                      {publicationTargetLabel(record)}
                    </div>
                    <div
                      className={`mt-1 inline-flex max-w-full flex-wrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${uncertain ? "border-rose-200 bg-rose-50 text-rose-700" : "border-slate-200 bg-slate-50 text-slate-600"}`}
                    >
                      {publicationRecordStatusLabel(record.status, record)}
                    </div>
                  </div>
                  <span className="shrink-0 text-[11px] text-slate-500">
                    {formatBeijingTime(
                      record.updatedAt || attempt.updatedAt || record.createdAt,
                    )}
                  </span>
                </div>
                <dl className="mt-3 grid min-w-0 gap-2 text-xs">
                  <div className="grid min-w-0 grid-cols-[5rem_minmax(0,1fr)] gap-2">
                    <dt className="text-slate-400">目标</dt>
                    <dd className="min-w-0 break-words text-slate-700">
                      {record.targetKey}
                    </dd>
                  </div>
                  {remoteUrl && (
                    <div className="grid min-w-0 grid-cols-[5rem_minmax(0,1fr)] gap-2">
                      <dt className="text-slate-400">远端 URL</dt>
                      <dd className="min-w-0 break-all">
                        <a
                          href={remoteUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex max-w-full items-center gap-1 text-blue-700 underline"
                        >
                          <span className="break-all">{remoteUrl}</span>
                          <ExternalLink className="h-3 w-3 shrink-0" />
                        </a>
                      </dd>
                    </div>
                  )}
                  {attempt.remoteId && (
                    <div className="grid min-w-0 grid-cols-[5rem_minmax(0,1fr)] gap-2">
                      <dt className="text-slate-400">订单号/远端 ID</dt>
                      <dd className="min-w-0 break-all font-mono text-slate-700">
                        {attempt.remoteId}
                      </dd>
                    </div>
                  )}
                  {attempt.errorCode && (
                    <div className="grid min-w-0 grid-cols-[5rem_minmax(0,1fr)] gap-2">
                      <dt className="text-slate-400">安全错误码</dt>
                      <dd className="min-w-0 break-all font-mono text-rose-700">
                        {attempt.errorCode}
                      </dd>
                    </div>
                  )}
                  {attempt.reasonCode && (
                    <div className="grid min-w-0 grid-cols-[5rem_minmax(0,1fr)] gap-2">
                      <dt className="text-slate-400">核对结果码</dt>
                      <dd className="min-w-0 break-all font-mono text-slate-700">
                        {attempt.reasonCode}
                      </dd>
                    </div>
                  )}
                </dl>
                {uncertain && (
                  <div className="mt-3 min-w-0 rounded border border-rose-200 bg-white/70 p-2.5">
                    <div className="text-xs font-semibold leading-5 text-rose-700">
                      待确认状态会阻止直接重试，请先核对远端结果。
                    </div>
                    {regularUncertain ? (
                      <div className="mt-2 flex min-w-0 flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => onReconcile?.(record, "published")}
                          disabled={busy}
                          className="inline-flex items-center gap-1 rounded border border-emerald-300 px-2 py-1.5 text-xs font-semibold text-emerald-700 disabled:opacity-40"
                        >
                          <Check className="h-3.5 w-3.5" />
                          确认已发布
                        </button>
                        <button
                          type="button"
                          onClick={() => onReconcile?.(record, "failed")}
                          disabled={busy}
                          className="inline-flex items-center gap-1 rounded border border-rose-300 px-2 py-1.5 text-xs font-semibold text-rose-700 disabled:opacity-40"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          确认未发布
                        </button>
                      </div>
                    ) : (
                      <div className="mt-2 text-xs text-amber-700">
                        付费订单结果请在订单页使用具名核对动作。
                      </div>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </aside>
    </div>
  );
}
