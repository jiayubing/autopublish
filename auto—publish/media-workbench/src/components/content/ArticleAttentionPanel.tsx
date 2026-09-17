import React, { useEffect, useMemo, useRef, useState } from "react";
import { useConfirmation } from "../../confirmation";
import { deriveAttentionFailureCapabilities } from "../../features/attention/attention-failure-capabilities.js";
import type { createAttentionFeature } from "../../features/attention/attention-feature.js";
import type { ArticleAttentionItem } from "../../types/publication";
import { formatBeijingTime } from "../../time-format";
import { reportRuntimeDiagnostic } from "../../features/workspace/runtime-diagnostic-sink";
import { Button } from "../ui/primitives";

type AttentionFeature = ReturnType<typeof createAttentionFeature>;
type ArticleAttentionSnapshot = ReturnType<AttentionFeature["getSnapshot"]>;

function labelFor(item: ArticleAttentionItem): string {
  if (item.kind === "removal_needs_repair") return "删除事务需要修复";
  if (item.kind === "regular_platform_failed") return "投稿未被平台接受";
  if (item.kind === "regular_platform_uncertain") return "远端投稿结果待确认";
  if (item.kind === "paid_order_creation_uncertain")
    return "付费订单创建待确认";
  if (item.kind === "order_status_anomaly") return "订单状态异常";
  if (item.kind === "published_archive_failed")
    return "远端成功，本地归档待处理";
  return "需处理项需要核对";
}

function reasonCopy(item: ArticleAttentionItem): string {
  if (item.kind === "regular_platform_failed")
    return item.reasonSummary || "投稿未被平台接受，请查看详情后决定后续处理。";
  if (item.kind === "regular_platform_uncertain")
    return "投稿请求已发出，但远端结果尚未确认，远端可能已经接受。";
  return item.message || "当前状态需要进一步处理。";
}

function confirmationMessage(
  item: ArticleAttentionItem,
  action: string,
  fallback: string,
): string {
  if (action === "confirm-regular-accepted")
    return "请仅在已人工核对远端接受后确认。确认后文章将永久标记为已发布；发布链接不是必填项。";
  if (action === "confirm-regular-not-accepted")
    return "请仅在已人工核对远端未接受后确认。确认后当前待确认事项会按最终事实关闭。";
  return (
    fallback || `${item.titleSnapshot || item.attentionId} 需要确认后才能继续。`
  );
}

function actionLabel(action: string, item?: ArticleAttentionItem): string {
  if (action === "open-submission" && item?.kind === "regular_platform_failed")
    return "改投其他平台";
  const labels: Record<string, string> = {
    "retry-removal": "重试修复删除",
    "open-submission": "打开发起投稿",
    "open-publication": "打开发布详情",
    "open-article": "打开文章",
    "open-platform-settings": "去设置账号",
    "trash-article": "移入回收站",
    inspect: "核对详情",
    "retry-archive": "重试本地归档",
    "confirm-regular-accepted": "确认已接受",
    "confirm-regular-not-accepted": "确认未接受",
    "bind-paid-order-number": "补录订单号",
    "confirm-paid-order-absent": "确认没有订单",
    "resume-order-tracking": "恢复订单跟踪",
    "confirm-order-published": "确认已发布",
    "confirm-order-not-published": "确认未发布",
  };
  return labels[action] || action;
}

function defaultTargetLabel(item: ArticleAttentionItem): string {
  const platform = item.displayName || item.platformId || "未指定平台";
  return `${platform} / 账号未记录`;
}

function actionError(value: unknown): string {
  const error = value as {
    code?: unknown;
    message?: unknown;
    userMessage?: unknown;
  };
  const labels: Record<string, string> = {
    ARTICLE_ATTENTION_STALE: "状态已变化，请刷新后重新检查。",
    ARTICLE_ATTENTION_ACTION_NOT_ALLOWED: "当前状态不允许这个动作。",
    ARTICLE_ATTENTION_DOMAIN_UNAVAILABLE: "对应处理服务当前不可用。",
    CONTENT_SUBMISSION_TARGET_UNSUPPORTED: "当前平台不支持从统一入口发起投稿。",
    ARTICLE_NOT_RETRYABLE: "只有内容完整且仍存在的文章可以发起投稿。",
  };
  if (typeof error.code === "string" && labels[error.code])
    return labels[error.code];
  return typeof error.userMessage === "string"
    ? error.userMessage
    : typeof error.message === "string"
      ? error.message
      : "处理需处理项失败。";
}

interface ArticleAttentionPanelProps {
  snapshot: ArticleAttentionSnapshot;
  selectedAttentionId?: string | null;
  onRefresh: AttentionFeature["refresh"];
  onPreviewAction: AttentionFeature["previewAction"];
  onExecutePreview: AttentionFeature["executePreview"];
  onOpenPublication: (item: ArticleAttentionItem) => void;
  onOpenArticleLibrary?: (item: ArticleAttentionItem) => void;
  onInspect: (item: ArticleAttentionItem) => void;
  onOpenArticle: (item: ArticleAttentionItem) => void;
  onOpenPlatformSettings?: () => void;
  onAttentionAction?: (item: ArticleAttentionItem, action: string) => void;
  getTargetLabel?: (item: ArticleAttentionItem) => string;
  getClientLabel?: (item: ArticleAttentionItem) => string;
  getAdditionalActions?: (item: ArticleAttentionItem) => string[];
  onTrashArticle?: (item: ArticleAttentionItem) => void;
  extraActionBusy?: boolean;
  onRegenerate?: (attentionIds: string[]) => Promise<unknown>;
}

export default function ArticleAttentionPanel({
  snapshot,
  selectedAttentionId,
  onRefresh,
  onPreviewAction,
  onExecutePreview,
  onOpenPublication,
  onOpenArticleLibrary,
  onInspect,
  onOpenArticle,
  onOpenPlatformSettings,
  onAttentionAction,
  getTargetLabel,
  getClientLabel,
  getAdditionalActions,
  onTrashArticle,
  extraActionBusy = false,
  onRegenerate,
}: ArticleAttentionPanelProps) {
  const { confirm } = useConfirmation();
  const itemRefs = useRef(new Map<string, HTMLDivElement>());
  const [selectedAttentionIds, setSelectedAttentionIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [batchNotice, setBatchNotice] = useState("");
  const regenerationLock = useRef(false);
  const [regenerationBusy, setRegenerationBusy] = useState(false);
  const attentionItems = snapshot.items as ArticleAttentionItem[];
  const itemCapabilities = useMemo(
    () =>
      new Map(
        attentionItems.map((item) => [
          item.attentionId,
          deriveAttentionFailureCapabilities(item),
        ]),
      ),
    [attentionItems],
  );
  const selectedItems = useMemo(
    () =>
      attentionItems.filter((item) =>
        selectedAttentionIds.has(item.attentionId),
      ),
    [attentionItems, selectedAttentionIds],
  );
  const selectedCount = selectedItems.length;
  const regeneratableCount = selectedItems.filter(
    (item) => itemCapabilities.get(item.attentionId)?.canRegenerate,
  ).length;
  const repostableCount = selectedItems.filter(
    (item) =>
      itemCapabilities.get(item.attentionId)?.canRepostToAnotherPlatform,
  ).length;
  const allSelected =
    attentionItems.length > 0 &&
    attentionItems.every((item) => selectedAttentionIds.has(item.attentionId));
  const canBatchRegenerate =
    selectedCount > 0 &&
    selectedCount <= 100 &&
    regeneratableCount === selectedCount;
  const canBatchRepost = selectedCount > 0 && repostableCount === selectedCount;
  const selectionSummary =
    selectedCount === 0
      ? "尚未选择需处理项"
      : `已选 ${selectedCount} 项；其中 ${regeneratableCount} 项可重新生成，${repostableCount} 项可改投其他平台。`;
  const commandError =
    snapshot.commands.execute.error || snapshot.commands.preview.error;
  const actionBusy =
    snapshot.commands.preview.busy ||
    snapshot.commands.execute.busy ||
    regenerationBusy ||
    extraActionBusy;

  useEffect(() => {
    const currentIds = new Set(attentionItems.map((item) => item.attentionId));
    setSelectedAttentionIds((current) => {
      const next = new Set(
        [...current].filter((attentionId) => currentIds.has(attentionId)),
      );
      return next.size === current.size ? current : next;
    });
    setBatchNotice("");
  }, [attentionItems]);

  useEffect(() => {
    if (!selectedAttentionId) return;
    const element = itemRefs.current.get(selectedAttentionId);
    element?.scrollIntoView({ block: "nearest" });
    element?.focus();
  }, [attentionItems, selectedAttentionId]);

  function toggleSelection(attentionId: string) {
    setSelectedAttentionIds((current) => {
      const next = new Set(current);
      if (next.has(attentionId)) next.delete(attentionId);
      else next.add(attentionId);
      return next;
    });
    setBatchNotice("");
  }

  function toggleAll() {
    setSelectedAttentionIds(
      allSelected
        ? new Set()
        : new Set(attentionItems.map((item) => item.attentionId)),
    );
    setBatchNotice("");
  }

  function reserveBatchAction(label: string) {
    setBatchNotice(
      `已选择 ${selectedCount} 项；${label}将在后续阶段接入，本次未执行。`,
    );
  }

  async function regenerate() {
    if (!onRegenerate || !canBatchRegenerate || regenerationLock.current)
      return;
    regenerationLock.current = true;
    setRegenerationBusy(true);
    const ids = selectedItems.map((item) => item.attentionId);
    try {
      if (
        !(await confirm({
          title: "批量重新生成",
          message: `将创建 ${ids.length} 篇新文章，使用原文章所选资料、问题和模板的当前内容。原文章及投稿失败记录保留，原需处理事项不会自动关闭。不会自动投稿。`,
          confirmLabel: "确认生成新文章",
          tone: "warning",
        }))
      )
        return;
      const result = await onRegenerate(ids);
      if (result) {
        setSelectedAttentionIds(new Set());
        setBatchNotice(
          "生成任务已创建。可在下方查看进度；成功的新文章进入文章库，原失败事项保留。",
        );
      }
    } catch (error) {
      setBatchNotice(actionError(error));
    } finally {
      regenerationLock.current = false;
      setRegenerationBusy(false);
    }
  }

  async function resolve(item: ArticleAttentionItem, action: string) {
    if (action === "trash-article") {
      onTrashArticle?.(item);
      return;
    }
    if (action === "open-publication") {
      onOpenPublication(item);
      return;
    }
    if (action === "open-submission") {
      onOpenArticleLibrary?.(item);
      return;
    }
    if (action === "open-platform-settings") {
      onOpenPlatformSettings?.();
      return;
    }
    if (action === "inspect") {
      onInspect(item);
      return;
    }
    if (action === "open-article") {
      onOpenArticle(item);
      return;
    }
    if (
      onAttentionAction &&
      ["bind-paid-order-number", "confirm-paid-order-absent"].includes(action)
    ) {
      onAttentionAction(item, action);
      return;
    }
    try {
      const preview = await onPreviewAction({
        attentionId: item.attentionId,
        action,
      });
      if (!preview) return;
      if (
        preview.requiresConfirmation &&
        !(await confirm({
          title: "确认处理需处理项",
          message: confirmationMessage(item, action, preview.message),
          confirmLabel: actionLabel(action, item),
          tone: "warning",
        }))
      )
        return;
      await onExecutePreview(preview, {
        confirmed: preview.requiresConfirmation ? true : undefined,
      });
    } catch {
      reportRuntimeDiagnostic(
        "ARTICLE_ATTENTION_COMMAND_FAILED",
        "workspace-invalidation",
      );
    }
  }

  return (
    <section
      aria-label="需处理页面"
      className="rounded-md border border-amber-200 bg-amber-50/50 p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-amber-900">需处理</h3>
          <p className="mt-1 text-[11px] text-slate-500">
            投稿失败后在这里集中处理。
          </p>
        </div>
        <button
          type="button"
          onClick={() => void onRefresh("manual")}
          disabled={snapshot.query.loading}
          className="rounded border border-amber-300 bg-white px-2 py-1 text-xs text-amber-800 disabled:opacity-40"
        >
          {snapshot.query.loading ? "刷新中…" : "刷新"}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 rounded border border-amber-200 bg-white p-2">
        <Button
          size="sm"
          variant="ghost"
          disabled={!attentionItems.length}
          onClick={toggleAll}
        >
          {allSelected ? "取消全选" : "全选当前结果"}
        </Button>
        <span
          role="status"
          aria-live="polite"
          className="text-[11px] font-medium text-slate-600"
        >
          {selectionSummary}
        </span>
        <div className="ml-auto flex flex-wrap gap-1.5">
          <Button
            size="sm"
            disabled={!canBatchRegenerate || actionBusy || !onRegenerate}
            title="仅当选中项全部支持重新生成时可用，每批最多 100 项"
            onClick={() => void regenerate()}
          >
            批量重新生成（{selectedCount}）
          </Button>
          <Button
            size="sm"
            disabled={!canBatchRepost || actionBusy}
            title="仅当选中项全部支持改投其他平台时可用"
            onClick={() => reserveBatchAction("批量改投其他平台")}
          >
            批量改投其他平台
          </Button>
        </div>
      </div>

      {batchNotice && (
        <p
          role="status"
          className="mt-2 rounded border border-blue-200 bg-blue-50 p-2 text-[11px] text-blue-800"
        >
          {batchNotice}
        </p>
      )}

      {commandError && (
        <div
          role="alert"
          className="mt-2 rounded border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700"
        >
          {actionError(commandError)}
        </div>
      )}
      {snapshot.query.error && !commandError && (
        <div
          role="alert"
          className="mt-2 rounded border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700"
        >
          {actionError(snapshot.query.error)}
        </div>
      )}

      <div className="mt-3 grid gap-2">
        {attentionItems.map((item) => {
          const capability = itemCapabilities.get(item.attentionId);
          const title =
            item.titleSnapshot ||
            item.articleId ||
            item.transactionId ||
            "需处理项";
          const selected = selectedAttentionIds.has(item.attentionId);
          const focused = item.attentionId === selectedAttentionId;
          const targetLabel =
            getTargetLabel?.(item) || defaultTargetLabel(item);
          const actions = [
            ...(capability?.needsAccountSettings && onOpenPlatformSettings
              ? ["open-platform-settings"]
              : []),
            ...item.allowedActions,
            ...(getAdditionalActions?.(item) || []),
          ].filter((action, index, values) => values.indexOf(action) === index);

          return (
            <div
              key={item.attentionId}
              ref={(node) => {
                if (node) itemRefs.current.set(item.attentionId, node);
                else itemRefs.current.delete(item.attentionId);
              }}
              tabIndex={focused ? -1 : undefined}
              className={`rounded border bg-white p-2.5 outline-none ${
                focused
                  ? "border-blue-400 ring-2 ring-blue-100"
                  : selected
                    ? "border-blue-200"
                    : "border-amber-200"
              }`}
            >
              <div className="flex min-w-0 items-start gap-2.5">
                <input
                  type="checkbox"
                  aria-label={`选择 ${title}`}
                  checked={selected}
                  onChange={() => toggleSelection(item.attentionId)}
                  className="mt-0.5 h-4 w-4 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                    <h4 className="min-w-0 break-words text-sm font-semibold text-slate-800">
                      {title}
                    </h4>
                    {item.freeze.article && (
                      <span className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-800">
                        文章已冻结
                      </span>
                    )}
                  </div>

                  <dl className="mt-2 grid min-w-0 gap-x-5 gap-y-2 text-xs sm:grid-cols-2 xl:grid-cols-5">
                    <div className="min-w-0">
                      <dt className="text-slate-400">客户</dt>
                      <dd className="mt-0.5 break-words text-slate-700">
                        {getClientLabel?.(item) ||
                          item.clientId ||
                          "客户未记录"}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-slate-400">原平台</dt>
                      <dd className="mt-0.5 break-words text-slate-700">
                        {targetLabel}
                      </dd>
                    </div>
                    <div className="min-w-0 sm:col-span-2 xl:col-span-1">
                      <dt className="text-slate-400">失败原因</dt>
                      <dd className="mt-0.5 break-words text-slate-700">
                        {reasonCopy(item)}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-slate-400">最后执行</dt>
                      <dd className="mt-0.5 text-slate-700">
                        {formatBeijingTime(item.updatedAt)}
                      </dd>
                    </div>
                  </dl>

                  {capability && item.kind === "regular_platform_failed" && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span className="rounded bg-blue-50 px-2 py-1 text-blue-800">
                        {capability.nextStep}
                      </span>
                      {capability.canRegenerate && (
                        <span className="rounded bg-emerald-50 px-2 py-1 text-emerald-800">
                          可重新生成
                        </span>
                      )}
                      {capability.canRepostToAnotherPlatform && (
                        <span className="rounded bg-slate-100 px-2 py-1 text-slate-700">
                          可改投其他平台
                        </span>
                      )}
                    </div>
                  )}

                  <details className="mt-2 text-xs text-slate-600">
                    <summary className="cursor-pointer">技术详情</summary>
                    <dl className="mt-2 grid min-w-0 gap-2">
                      <div className="grid min-w-0 grid-cols-[6rem_minmax(0,1fr)] gap-2">
                        <dt className="text-slate-400">问题类型</dt>
                        <dd className="min-w-0 break-words text-slate-700">
                          {labelFor(item)}
                        </dd>
                      </div>
                      <div className="grid min-w-0 grid-cols-[6rem_minmax(0,1fr)] gap-2">
                        <dt className="text-slate-400">状态</dt>
                        <dd className="min-w-0 break-words text-slate-700">
                          {item.status || "未知"}
                        </dd>
                      </div>
                      {item.reasonCode && (
                        <div className="grid min-w-0 grid-cols-[6rem_minmax(0,1fr)] gap-2">
                          <dt className="text-slate-400">原因码</dt>
                          <dd className="min-w-0 break-all font-mono text-slate-700">
                            {item.reasonCode}
                          </dd>
                        </div>
                      )}
                      {(item.publicationId || item.attemptId) && (
                        <div className="grid min-w-0 grid-cols-[6rem_minmax(0,1fr)] gap-2">
                          <dt className="text-slate-400">发布记录</dt>
                          <dd className="min-w-0 break-all text-slate-700">
                            {[item.publicationId, item.attemptId]
                              .filter(Boolean)
                              .join(" / ")}
                          </dd>
                        </div>
                      )}
                      {item.targetKey && (
                        <div className="grid min-w-0 grid-cols-[6rem_minmax(0,1fr)] gap-2">
                          <dt className="text-slate-400">目标标识</dt>
                          <dd className="min-w-0 break-all font-mono text-slate-700">
                            {item.targetKey}
                          </dd>
                        </div>
                      )}
                    </dl>
                  </details>

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {actions.map((action) => (
                      <button
                        key={`${item.attentionId}:${action}`}
                        type="button"
                        disabled={actionBusy}
                        onClick={() => void resolve(item, action)}
                        className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-700 disabled:opacity-40"
                      >
                        {actionLabel(action, item)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {snapshot.query.loading && !attentionItems.length && (
          <div className="rounded border border-dashed border-amber-300 bg-white p-4 text-center text-xs text-amber-800">
            正在加载需处理项…
          </div>
        )}
        {!attentionItems.length &&
          !snapshot.query.loading &&
          !snapshot.query.error && (
            <div className="rounded border border-dashed border-amber-300 bg-white p-4 text-center text-xs text-amber-800">
              当前没有需处理项
            </div>
          )}
      </div>
    </section>
  );
}
