import React, { useEffect, useMemo, useRef } from "react";
import { useConfirmation } from "../../confirmation";
import type { createAttentionFeature } from "../../features/attention/attention-feature.js";
import type { ArticleAttentionItem } from "../../types/publication";
import { formatBeijingTime } from "../../time-format";
import { reportRuntimeDiagnostic } from "../../features/workspace/runtime-diagnostic-sink";

type AttentionFeature = ReturnType<typeof createAttentionFeature>;
type ArticleAttentionSnapshot = ReturnType<AttentionFeature["getSnapshot"]>;

function labelFor(item: ArticleAttentionItem): string {
  if (item.kind === "removal_needs_repair") return "删除事务需要修复";
  if (item.kind === "regular_platform_failed") return "投稿未被平台接受";
  if (item.kind === "regular_platform_uncertain") return "远端投稿结果待确认";
  if (item.kind === "paid_order_creation_uncertain") return "付费订单创建待确认";
  if (item.kind === "order_status_anomaly") return "订单状态异常";
  if (item.kind === "published_archive_failed")
    return "远端成功，本地归档待处理";
  return "需处理项需要核对";
}

function happenedCopy(item: ArticleAttentionItem): string {
  if (item.kind === "regular_platform_failed")
    return (
      item.reasonSummary ||
      "投稿未被平台接受，请检查投稿信息后从统一投稿入口重新发起。"
    );
  if (item.kind === "regular_platform_uncertain")
    return "投稿请求已发出，但远端结果尚未确认，远端可能已经接受。";
  return item.message || "当前状态需要进一步处理。";
}

function nextStepCopy(item: ArticleAttentionItem): string {
  if (item.kind === "regular_platform_failed")
    return "可查看文章和发布详情；重新投稿请通过统一投稿入口发起。";
  if (item.kind === "regular_platform_uncertain")
    return "请人工核对远端结果后，选择“确认已接受”或“确认未接受”。";
  return "请根据下方允许操作继续处理。";
}

function completionCopy(item: ArticleAttentionItem): string {
  if (item.kind === "regular_platform_failed")
    return "打开统一投稿入口不会重试原请求；它会开始一次新的投稿流程。";
  if (item.kind === "regular_platform_uncertain")
    return "确认已接受会永久标记文章已发布；确认未接受会按最终事实解除当前待确认事项。";
  return "处理完成后会刷新权威结果；已解决事项将自动消失。";
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
  return fallback || `${item.titleSnapshot || item.attentionId} 需要确认后才能继续。`;
}

function actionLabel(action: string): string {
  const labels: Record<string, string> = {
    "retry-removal": "重试修复删除",
    "open-submission": "打开发起投稿",
    "open-publication": "打开发布详情",
    "open-article": "打开文章",
    "trash-article": "移入回收站",
    inspect: "查看差异",
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

function attentionGroupKey(item: ArticleAttentionItem): string {
  if (item.articleId)
    return `article:${item.clientId || ""}:${item.articleId}`;
  return `attention:${item.attentionId}`;
}

interface AttentionCard {
  key: string;
  items: ArticleAttentionItem[];
}

function groupAttentionItems(items: ArticleAttentionItem[]): AttentionCard[] {
  const grouped = new Map<string, ArticleAttentionItem[]>();
  items.forEach((item) => {
    const key = attentionGroupKey(item);
    grouped.set(key, [...(grouped.get(key) || []), item]);
  });
  return [...grouped.entries()].map(([key, groupedItems]) => ({
    key,
    items: groupedItems,
  }));
}

function defaultTargetLabel(item: ArticleAttentionItem): string {
  const platform = item.displayName || item.platformId || "未指定平台";
  return `${platform} / 账号未记录`;
}

const ARTICLE_NAVIGATION_ACTIONS = new Set([
  "open-submission",
  "open-publication",
  "open-article",
  "trash-article",
]);

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
  onAttentionAction?: (item: ArticleAttentionItem, action: string) => void;
  getTargetLabel?: (item: ArticleAttentionItem) => string;
  clientLabel?: string;
  getAdditionalActions?: (item: ArticleAttentionItem) => string[];
  onTrashArticle?: (item: ArticleAttentionItem) => void;
  extraActionBusy?: boolean;
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
  onAttentionAction,
  getTargetLabel,
  clientLabel,
  getAdditionalActions,
  onTrashArticle,
  extraActionBusy = false,
}: ArticleAttentionPanelProps) {
  const { confirm } = useConfirmation();
  const itemRefs = useRef(new Map<string, HTMLDivElement>());
  const attentionCards = useMemo(
    () => groupAttentionItems(snapshot.items as ArticleAttentionItem[]),
    [snapshot.items],
  );

  useEffect(() => {
    if (!selectedAttentionId) return;
    const card = attentionCards.find(({ items }) =>
      items.some((item) => item.attentionId === selectedAttentionId),
    );
    const element = card ? itemRefs.current.get(card.key) : undefined;
    element?.scrollIntoView({ block: "nearest" });
    element?.focus();
  }, [attentionCards, selectedAttentionId]);

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
      [
        "bind-paid-order-number",
        "confirm-paid-order-absent",
      ].includes(action)
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
          confirmLabel: actionLabel(action),
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

  const commandError =
    snapshot.commands.execute.error || snapshot.commands.preview.error;
  const actionBusy =
    snapshot.commands.preview.busy ||
    snapshot.commands.execute.busy ||
    extraActionBusy;

  return (
    <section
      aria-label="需处理页面"
      className="rounded-md border border-amber-200 bg-amber-50/50 p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-amber-900">需处理</h3>
          <p className="mt-1 text-xs text-amber-800">
            按文章展示问题原因、投稿目标和当前允许的处理动作。
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
        {attentionCards.map((card) => {
          const selected = card.items.some(
            (item) => item.attentionId === selectedAttentionId,
          );
          const title =
            card.items.find((item) => item.titleSnapshot)?.titleSnapshot ||
            card.items.find((item) => item.articleId)?.articleId ||
            card.items[0]?.transactionId ||
            "需处理项";
          const status =
            card.items.find((item) => item.status === "uncertain")?.status ||
            card.items[0]?.status ||
            "待处理";
          const targetLabels = [
            ...new Set(
              card.items.map(
                (item) => getTargetLabel?.(item) || defaultTargetLabel(item),
              ),
            ),
          ];
          const updatedAtValues = card.items
            .map((item) => item.updatedAt)
            .filter((value): value is string => Boolean(value))
            .sort();
          const navigationActions = new Set<string>();
          const actions = card.items.flatMap((item) => {
            const itemActions = [
              ...item.allowedActions,
              ...(getAdditionalActions?.(item) || []),
            ];
            return [...new Set(itemActions)].flatMap((action) => {
              if (ARTICLE_NAVIGATION_ACTIONS.has(action)) {
                if (navigationActions.has(action)) return [];
                navigationActions.add(action);
              }
              return [{
                action,
                item,
                label:
                  card.items.length > 1 && !ARTICLE_NAVIGATION_ACTIONS.has(action)
                    ? `${actionLabel(action)} · ${labelFor(item)}`
                    : actionLabel(action),
              }];
            });
          });
          return (
            <div
              key={card.key}
              ref={(node) => {
                if (node) itemRefs.current.set(card.key, node);
                else itemRefs.current.delete(card.key);
              }}
              tabIndex={selected ? -1 : undefined}
              className={`rounded border bg-white p-2 outline-none ${selected ? "border-blue-400 ring-2 ring-blue-100" : "border-amber-200"}`}
            >
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <h4 className="break-words text-sm font-semibold text-slate-800">
                  {title}
                </h4>
              </div>
              <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                {status}
              </span>
            </div>
            <dl className="mt-3 grid min-w-0 gap-2 text-xs">
              <div className="grid min-w-0 grid-cols-[6rem_minmax(0,1fr)] gap-2">
                <dt className="text-slate-400">客户</dt>
                <dd className="min-w-0 break-words text-slate-700">
                  {clientLabel || card.items[0]?.clientId || "当前客户未记录"}
                </dd>
              </div>
              <div className="grid min-w-0 grid-cols-[6rem_minmax(0,1fr)] gap-2">
                <dt className="text-slate-400">投稿目标</dt>
                <dd className="min-w-0 break-words text-slate-700">
                  {targetLabels.map((label) => (
                    <div key={label}>{label}</div>
                  ))}
                </dd>
              </div>
              <div className="grid min-w-0 grid-cols-[6rem_minmax(0,1fr)] gap-2">
                <dt className="text-slate-400">问题类型</dt>
                <dd className="min-w-0 break-words text-slate-700">
                  {card.items.map((item) => (
                    <div key={item.attentionId}>
                      {labelFor(item)}
                    </div>
                  ))}
                </dd>
              </div>
              <div className="grid min-w-0 grid-cols-[6rem_minmax(0,1fr)] gap-2">
                <dt className="text-slate-400">文章冻结</dt>
                <dd className="min-w-0 break-words text-slate-700">
                  {card.items.some((item) => item.freeze.article)
                    ? "是，仅允许当前事项动作"
                    : "否"}
                </dd>
              </div>
              <div className="grid min-w-0 grid-cols-[6rem_minmax(0,1fr)] gap-2">
                <dt className="text-slate-400">最近一次执行</dt>
                <dd className="min-w-0 break-words text-slate-700">
                  {formatBeijingTime(
                    updatedAtValues[updatedAtValues.length - 1],
                  )}
                </dd>
              </div>
            </dl>
            <div className="mt-3 rounded border border-amber-100 bg-amber-50/60 p-2 text-xs leading-5 text-amber-900">
              <div className="font-semibold">发生了什么</div>
              {card.items.map((item) => (
                <p key={item.attentionId} className="mt-1 break-words">
                  {happenedCopy(item)}
                </p>
              ))}
            </div>
            <div className="mt-2 rounded border border-slate-100 bg-slate-50 p-2 text-xs leading-5 text-slate-700">
              <div className="font-semibold">下一步</div>
              {card.items.map((item) => (
                <p key={item.attentionId} className="mt-1 break-words">
                  {nextStepCopy(item)}
                </p>
              ))}
            </div>
            <div className="mt-2 rounded border border-slate-100 bg-white p-2 text-xs leading-5 text-slate-600">
              <div className="font-semibold">处理完成后</div>
              {card.items.map((item) => (
                <p key={item.attentionId} className="mt-1 break-words">
                  {completionCopy(item)}
                </p>
              ))}
            </div>
            {card.items.some((item) => item.reasonCode) && (
              <details className="mt-2 rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">
                <summary className="cursor-pointer font-semibold">核对详情</summary>
                {card.items.map((item) =>
                  item.reasonCode ? (
                    <p key={item.attentionId} className="mt-1 break-all font-mono">
                      原因码：{item.reasonCode}
                    </p>
                  ) : null,
                )}
              </details>
            )}
            <div className="mt-3">
              <div className="text-xs font-semibold text-slate-700">允许操作</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {actions.map(({ action, item, label }) => (
                  <button
                    key={`${item.attentionId}:${action}`}
                    type="button"
                    disabled={actionBusy}
                    onClick={() => void resolve(item, action)}
                    className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-700 disabled:opacity-40"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            </div>
          );
        })}
        {snapshot.query.loading && !attentionCards.length && (
          <div className="rounded border border-dashed border-amber-300 bg-white p-4 text-center text-xs text-amber-800">
            正在加载需处理项…
          </div>
        )}
        {!snapshot.items.length &&
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

