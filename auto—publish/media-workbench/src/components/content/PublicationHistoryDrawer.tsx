import React from "react";
import { AlertTriangle, ExternalLink, X } from "lucide-react";
import { formatBeijingTime } from "../../time-format";
import type {
  PublicationArchiveEntry,
  PublicationEvidence,
  PublicationHistoryRecord,
  PublicationHistorySummary,
} from "../../types/publication";
import type { GeneratedContentArticle } from "../../types/generation";
import {
  latestPublicationAttempt,
  publicationRecordStatusLabel,
  publicationStatusLabel,
} from "../../publication-status";

interface PublicationHistoryDrawerProps {
  article: GeneratedContentArticle | null;
  records: PublicationHistoryRecord[];
  archives?: PublicationArchiveEntry[];
  summary?: PublicationHistorySummary;
  onClose: () => void;
  onOpenPublicationUrl?: (record: PublicationHistoryRecord) => void;
  publicationUrlBusy?: boolean;
  publicationUrlError?: string | null;
  onOpenAttention?: () => void;
}

const SENSITIVE_QUERY_NAME =
  /^(?:access_token|api[_-]?key|apikey|auth(?:orization)?|cookie|password|refresh_token|secret|session(?:id)?|token)$/iu;

function safeRemoteUrl(value: string | null | undefined): string | null {
  if (typeof value !== "string" || !value || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.hash)
      return null;
    for (const name of url.searchParams.keys())
      if (SENSITIVE_QUERY_NAME.test(name)) return null;
    return url.href;
  } catch {
    return null;
  }
}

function missingReasonLabel(reason: string | undefined): string {
  const labels: Record<string, string> = {
    LEGACY_SUBMISSION_CONTENT_UNAVAILABLE: "历史实际投稿正文不可得",
    LEGACY_SUBMITTED_AT_UNAVAILABLE: "历史提交时间不可得",
    LEGACY_FIRST_PUBLISHED_AT_UNAVAILABLE: "历史首次发布时间不可得",
    LEGACY_IMAGE_SUMMARY_UNAVAILABLE: "历史图片摘要不可得",
  };
  return (reason && labels[reason]) || "历史证据不可得";
}

function evidenceTime(
  evidence: PublicationEvidence,
  value: string | null,
  missingReason: string,
): string {
  if (value) return formatBeijingTime(value);
  const reason = evidence.missingReasons.find((item) => item === missingReason);
  return missingReasonLabel(reason || missingReason);
}

function targetFacts(
  record: PublicationHistoryRecord,
  evidence: PublicationEvidence | undefined,
): { platform: string; account: string | null } {
  if (evidence?.targetSnapshotV1.kind === "platform") {
    return {
      platform: evidence.targetSnapshotV1.platformName,
      account: evidence.targetSnapshotV1.accountLabel,
    };
  }
  if (evidence?.targetSnapshotV1.kind === "media") {
    return { platform: evidence.targetSnapshotV1.mediaName, account: null };
  }
  if (evidence?.targetSnapshotV1.kind === "legacy-unknown-account") {
    return {
      platform: evidence.targetSnapshotV1.platformName,
      account: "历史账号未记录",
    };
  }
  return {
    platform: record.displayName || record.platformId || "目标未记录",
    account: null,
  };
}

function evidenceSourceLabel(evidence: PublicationEvidence | undefined): string {
  if (!evidence) return "执行记录";
  if (evidence.firstPublishedAtSource === "manual_positive_evidence_time")
    return "人工确认";
  if (evidence.firstPublishedAtSource === "provider_event_time")
    return "平台事件时间";
  if (evidence.firstPublishedAtSource === "first_positive_observation_time")
    return "平台接受结果";
  return "已归档发布证据";
}

function publicationTime(
  record: PublicationHistoryRecord,
  evidence: PublicationEvidence | undefined,
): { label: string; value: string } {
  if (evidence?.firstPublishedAt)
    return {
      label:
        evidence.firstPublishedAtSource === "manual_positive_evidence_time"
          ? "人工确认时间"
          : "确认/发布时间",
      value: formatBeijingTime(evidence.firstPublishedAt),
    };
  return {
    label: "最近更新时间",
    value: formatBeijingTime(record.updatedAt || record.createdAt),
  };
}

function resultExplanation(
  record: PublicationHistoryRecord,
  reasonSummary: string | null | undefined,
): string | null {
  if (record.status === "failed")
    return reasonSummary || "投稿未被平台接受，请从统一投稿入口重新发起。";
  if (record.status === "uncertain" || record.status === "manual_check")
    return "远端结果尚未确认，可能已经成功；请在需处理事项中完成核对。";
  return null;
}

export default function PublicationHistoryDrawer({
  article,
  records,
  archives = [],
  summary: snapshotSummary,
  onClose,
  onOpenPublicationUrl,
  publicationUrlBusy = false,
  publicationUrlError,
  onOpenAttention,
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
          <div className="m-4 grid min-w-0 gap-2 rounded-md border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-700">
            <div className="flex min-w-0 gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="min-w-0 break-words">
                <strong>存在待确认结果。</strong>
                请到“投稿中心 &gt; 需处理事项”核对远端结果；文章库只展示记录，不在这里执行人工确认或直接重试。
              </span>
            </div>
            {onOpenAttention && (
              <button
                type="button"
                onClick={onOpenAttention}
                className="justify-self-start rounded border border-rose-300 bg-white px-2.5 py-1.5 font-semibold text-rose-700 hover:bg-rose-100"
              >
                前往需处理事项
              </button>
            )}
          </div>
        )}
        {publicationUrlError && (
          <div
            role="alert"
            className="mx-4 mt-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700"
          >
            暂时无法打开发布链接，请稍后重试或向平台核对。
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
            const archive = archives.find(
              (entry) => entry.publicationId === record.publicationId,
            );
            const evidence = archive?.publicationEvidence;
            const locator = archive?.publicationLocator;
            const remoteUrl = safeRemoteUrl(
              locator?.remoteUrl || evidence?.remoteUrl || attempt.remoteUrl,
            );
            const remoteIdentity =
              locator?.remoteId ||
              (evidence && evidence.version === 2 ? evidence.remoteId : null) ||
              evidence?.orderNumber ||
              attempt.remoteId;
            const uncertain = record.status === "uncertain";
            const target = targetFacts(record, evidence);
            const publishedAt = publicationTime(record, evidence);
            const explanation = resultExplanation(
              record,
              attempt.reasonSummary || record.reasonSummary,
            );
            const manualWithoutLocator =
              locator?.displayStatus === "MANUAL_CONFIRMED_NO_LOCATOR";
            return (
              <section
                key={record.publicationId}
                className={`min-w-0 rounded-md border p-3 ${uncertain ? "border-rose-200 bg-rose-50/50" : "border-slate-200 bg-white"}`}
              >
                <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="break-words text-sm font-semibold text-slate-800">
                      {target.platform}
                    </div>
                    <div
                      className={`mt-1 inline-flex max-w-full flex-wrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${uncertain ? "border-rose-200 bg-rose-50 text-rose-700" : "border-slate-200 bg-slate-50 text-slate-600"}`}
                    >
                      {publicationRecordStatusLabel(record.status, record)}
                    </div>
                  </div>
                </div>
                <dl className="mt-3 grid min-w-0 gap-2 text-xs">
                  <div className="grid min-w-0 grid-cols-[5rem_minmax(0,1fr)] gap-2">
                    <dt className="text-slate-400">平台</dt>
                    <dd className="min-w-0 break-words text-slate-700">
                      {target.platform}
                    </dd>
                  </div>
                  {target.account && (
                    <div className="grid min-w-0 grid-cols-[5rem_minmax(0,1fr)] gap-2">
                      <dt className="text-slate-400">账号</dt>
                      <dd className="min-w-0 break-words text-slate-700">
                        {target.account}
                      </dd>
                    </div>
                  )}
                  <div className="grid min-w-0 grid-cols-[5rem_minmax(0,1fr)] gap-2">
                    <dt className="text-slate-400">最终结果</dt>
                    <dd className="min-w-0 break-words text-slate-700">
                      {publicationRecordStatusLabel(record.status, record)}
                    </dd>
                  </div>
                  <div className="grid min-w-0 grid-cols-[5rem_minmax(0,1fr)] gap-2">
                    <dt className="text-slate-400">{publishedAt.label}</dt>
                    <dd className="min-w-0 break-words text-slate-700">
                      {publishedAt.value}
                    </dd>
                  </div>
                  <div className="grid min-w-0 grid-cols-[5rem_minmax(0,1fr)] gap-2">
                    <dt className="text-slate-400">证据来源</dt>
                    <dd className="min-w-0 break-words text-slate-700">
                      {evidenceSourceLabel(evidence)}
                    </dd>
                  </div>
                  {remoteUrl && (
                    <div className="grid min-w-0 grid-cols-[5rem_minmax(0,1fr)] gap-2">
                      <dt className="text-slate-400">发布链接</dt>
                      <dd className="min-w-0">
                        <button
                          type="button"
                          onClick={() => onOpenPublicationUrl?.(record)}
                          disabled={publicationUrlBusy || !onOpenPublicationUrl}
                          className="inline-flex items-center gap-1.5 rounded border border-blue-200 px-2 py-1.5 font-semibold text-blue-700 hover:border-blue-400 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                          <span>打开发布链接</span>
                        </button>
                      </dd>
                    </div>
                  )}
                  {remoteIdentity && (
                    <div className="grid min-w-0 grid-cols-[5rem_minmax(0,1fr)] gap-2">
                      <dt className="text-slate-400">远端 ID</dt>
                      <dd className="min-w-0 break-all font-mono text-slate-700">
                        {remoteIdentity}
                      </dd>
                    </div>
                  )}
                </dl>
                {manualWithoutLocator && (
                  <p className="mt-3 rounded border border-emerald-200 bg-emerald-50 p-2.5 text-xs leading-5 text-emerald-800">
                    已人工确认发布，未记录可用链接。
                  </p>
                )}
                {explanation && (
                  <p className="mt-3 rounded border border-amber-100 bg-amber-50/60 p-2.5 text-xs leading-5 text-amber-900">
                    {explanation}
                  </p>
                )}
                {evidence && (
                  <details className="mt-3 rounded border border-blue-100 bg-blue-50/40 p-3 text-xs">
                    <summary className="cursor-pointer font-semibold text-slate-800">
                      投稿内容快照
                    </summary>
                    <div className="mt-3 grid min-w-0 gap-2">
                      <div className="grid min-w-0 grid-cols-[5rem_minmax(0,1fr)] gap-2">
                        <span className="text-slate-400">客户</span>
                        <span className="min-w-0 break-words text-slate-700">
                          {evidence.customerSnapshotV1.displayName}
                        </span>
                      </div>
                    <div className="grid min-w-0 grid-cols-[5rem_minmax(0,1fr)] gap-2">
                        <span className="text-slate-400">投稿标题</span>
                        <span className="min-w-0 break-words text-slate-700">
                          {evidence.contentAvailable
                            ? evidence.title
                            : missingReasonLabel(
                                "LEGACY_SUBMISSION_CONTENT_UNAVAILABLE",
                              )}
                        </span>
                      </div>
                      <div className="grid min-w-0 grid-cols-[5rem_minmax(0,1fr)] gap-2">
                        <span className="text-slate-400">投稿正文</span>
                        {evidence.contentAvailable ? (
                          <pre className="max-h-64 min-w-0 overflow-auto whitespace-pre-wrap break-words font-sans text-slate-700">
                            {evidence.body}
                          </pre>
                        ) : (
                          <span className="min-w-0 break-words text-amber-700">
                            {missingReasonLabel(
                              "LEGACY_SUBMISSION_CONTENT_UNAVAILABLE",
                            )}
                          </span>
                        )}
                      </div>
                      <div className="grid min-w-0 grid-cols-[5rem_minmax(0,1fr)] gap-2">
                        <span className="text-slate-400">图片摘要</span>
                        <span className="min-w-0 break-words text-slate-700">
                          {evidence.imageSummaryV1
                            ? `${evidence.imageSummaryV1.deliveryMode} · ${evidence.imageSummaryV1.images.length} 张 · ${evidence.imageSummaryV1.decisionKind}`
                            : missingReasonLabel(
                                "LEGACY_IMAGE_SUMMARY_UNAVAILABLE",
                              )}
                        </span>
                      </div>
                    </div>
                  </details>
                )}
                <details className="mt-3 rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                  <summary className="cursor-pointer font-semibold text-slate-700">
                    投稿处理与核对详情
                  </summary>
                  <dl className="mt-3 grid min-w-0 gap-2">
                    <div className="grid min-w-0 grid-cols-[5rem_minmax(0,1fr)] gap-2">
                      <dt className="text-slate-400">投稿目标</dt>
                      <dd className="min-w-0 break-all font-mono">{record.targetKey}</dd>
                    </div>
                    <div className="grid min-w-0 grid-cols-[5rem_minmax(0,1fr)] gap-2">
                      <dt className="text-slate-400">结果代码</dt>
                      <dd className="min-w-0 break-all font-mono">
                        {evidence?.resultCode || attempt.reasonCode || attempt.errorCode || "未记录"}
                      </dd>
                    </div>
                    <div className="grid min-w-0 grid-cols-[5rem_minmax(0,1fr)] gap-2">
                      <dt className="text-slate-400">提交时间</dt>
                      <dd className="min-w-0 break-words">
                        {evidence
                          ? evidenceTime(
                              evidence,
                              evidence.submittedAt,
                              "LEGACY_SUBMITTED_AT_UNAVAILABLE",
                            )
                          : formatBeijingTime(
                              attempt.startedAt || record.createdAt,
                            )}
                      </dd>
                    </div>
                  </dl>
                </details>
                {uncertain && (
                  <div className="mt-3 min-w-0 rounded border border-rose-200 bg-white/70 p-2.5">
                    <div className="text-xs font-semibold leading-5 text-rose-700">
                      待确认状态会冻结文章并阻止直接重试。请到“投稿中心 &gt; 需处理事项”完成具名核对。
                    </div>
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
