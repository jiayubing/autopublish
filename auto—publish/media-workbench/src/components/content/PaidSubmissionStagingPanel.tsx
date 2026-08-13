import React, { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { GeneratedContentArticle } from "../../types/generation";
import type { MediaResource } from "../../types/media";
import type {
  ArticleSelection,
  PaidMediaConfirmationInput,
  PaidMediaExecutionBatch,
  PaidMediaPreflight,
  PaidMediaPreflightInput,
  PaidSubmissionStagingItem,
} from "../../types/publication";

interface PaidStagingQuery {
  loading: boolean;
  error?: { userMessage?: string } | null;
}

interface PaidStagingCommandState {
  busy: boolean;
  error?: { userMessage?: string } | null;
}

export interface PaidMediaPoolSnapshot {
  items: MediaResource[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasPrev: boolean;
  hasNext: boolean;
  loading: boolean;
  error?: { userMessage?: string } | null;
  loadPage: (page: number) => void | Promise<unknown>;
}

export interface PaidSubmissionStagingPanelProps {
  currentClientId: string;
  currentClientName?: string;
  items: PaidSubmissionStagingItem[];
  articles: GeneratedContentArticle[];
  query: PaidStagingQuery;
  removeCommand: PaidStagingCommandState;
  setMediaCommand: PaidStagingCommandState;
  preflightCommand: PaidStagingCommandState;
  confirmCommand: PaidStagingCommandState;
  startCommand: PaidStagingCommandState;
  pauseCommand: PaidStagingCommandState;
  paidMediaPool: PaidMediaPoolSnapshot;
  paidMediaBatches: PaidMediaExecutionBatch[];
  paidMediaBatchesQuery: PaidStagingQuery;
  onRemove: (articleRef: ArticleSelection) => Promise<unknown>;
  onSetMedia: (
    articleRefs: ArticleSelection[],
    mediaResourceId: string | null,
  ) => Promise<unknown>;
  onPreflight: (input: PaidMediaPreflightInput) => Promise<PaidMediaPreflight>;
  onConfirm: (input: PaidMediaConfirmationInput) => Promise<unknown>;
  onStart: (input: { batchId: string }) => Promise<unknown>;
  onPause: (input: { batchId: string }) => Promise<unknown>;
  onRefreshPaidMediaBatches: () => Promise<unknown>;
}

function stagingItemKey(item: PaidSubmissionStagingItem): string {
  return `${item.articleRef.clientId}:${item.articleRef.articleId}`;
}

function errorMessage(value: unknown, fallback: string): string {
  return value instanceof Error && value.message ? value.message : fallback;
}

function formatMoney(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value)
    ? `¥${value.toFixed(2)}`
    : "未提供";
}

function isStaleResult(value: unknown): boolean {
  return Boolean(
    value && typeof value === "object" && (value as { stale?: unknown }).stale,
  );
}

function batchBelongsToClient(
  batch: PaidMediaExecutionBatch,
  clientId: string,
): boolean {
  return Array.isArray(batch.items)
    ? batch.items.some((item) => item?.articleRef?.clientId === clientId)
    : false;
}

function canStartPaidBatch(batch: PaidMediaExecutionBatch): boolean {
  return (
    batch.status === "queued" && batch.paused && batch.runState === "paused"
  );
}

function canPausePaidBatch(batch: PaidMediaExecutionBatch): boolean {
  return (
    batch.status === "queued" &&
    !batch.paused &&
    (batch.runState === "running" || batch.runState === "in_flight")
  );
}

export default function PaidSubmissionStagingPanel({
  currentClientId,
  currentClientName,
  items,
  articles,
  query,
  removeCommand,
  setMediaCommand,
  preflightCommand,
  confirmCommand,
  startCommand,
  pauseCommand,
  paidMediaPool,
  paidMediaBatches,
  paidMediaBatchesQuery,
  onRemove,
  onSetMedia,
  onPreflight,
  onConfirm,
  onStart,
  onPause,
  onRefreshPaidMediaBatches,
}: PaidSubmissionStagingPanelProps) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [actionError, setActionError] = useState("");
  const [pickerResourceId, setPickerResourceId] = useState<string | null>(null);
  const [pickerClientId, setPickerClientId] = useState<string | null>(null);
  const [preflightState, setPreflightState] = useState<{
    model: PaidMediaPreflight;
    selectionKey: string;
  } | null>(null);
  const [preflightError, setPreflightError] = useState("");
  const [batchRefreshError, setBatchRefreshError] = useState("");
  const articleById = useMemo(
    () => new Map(articles.map((article) => [article.id, article])),
    [articles],
  );
  const visibleItems = useMemo(
    () => items.filter((item) => item.articleRef.clientId === currentClientId),
    [currentClientId, items],
  );

  useEffect(() => {
    setSelected(new Set());
    setPickerResourceId(null);
    setPickerClientId(null);
    setActionError("");
    setPreflightState(null);
    setPreflightError("");
    setBatchRefreshError("");
  }, [currentClientId]);

  const visiblePoolItems = Array.isArray(paidMediaPool.items)
    ? paidMediaPool.items
    : [];
  const selectedItems = visibleItems.filter((item) =>
    selected.has(stagingItemKey(item)),
  );
  const selectedMediaIds: string[] = [
    ...new Set<string>(
      selectedItems
        .map((item) => item.selectedMediaResourceId)
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const selectedHasMissingMedia = selectedItems.some(
    (item) => !item.selectedMediaResourceId,
  );
  const selectedHasMixedMedia = selectedMediaIds.length > 1;
  const selectedMediaResourceId =
    selectedItems.length > 0 &&
    !selectedHasMissingMedia &&
    selectedMediaIds.length === 1
      ? selectedMediaIds[0]
      : null;
  const selectionKey = selectedItems
    .map(
      (item) =>
        `${stagingItemKey(item)}:${item.selectedMediaResourceId || "none"}`,
    )
    .sort()
    .join("|");
  const canPreflight = Boolean(selectedItems.length && selectedMediaResourceId);
  const nonExecutionBusy =
    removeCommand.busy ||
    setMediaCommand.busy ||
    preflightCommand.busy ||
    confirmCommand.busy;
  const activePaidBatches = (
    Array.isArray(paidMediaBatches) ? paidMediaBatches : []
  ).filter(
    (batch) =>
      batch.status !== "completed" &&
      batchBelongsToClient(batch, currentClientId),
  );

  useEffect(() => {
    if (!preflightState || preflightState.selectionKey === selectionKey) return;
    setPreflightState(null);
    setPreflightError("费用预检已因选中文章或媒体变化失效，请重新预检。");
  }, [preflightState, selectionKey]);

  const removeOne = async (item: PaidSubmissionStagingItem) => {
    setActionError("");
    try {
      const result = await onRemove(item.articleRef);
      if (
        !result ||
        typeof result !== "object" ||
        (result as { stale?: boolean }).stale !== true
      ) {
        setSelected((current) => {
          const next = new Set(current);
          next.delete(stagingItemKey(item));
          return next;
        });
      }
    } catch (value) {
      setActionError(errorMessage(value, "移出付费媒体投稿队列失败。"));
    }
  };

  const setMediaForItems = async (
    targetItems: PaidSubmissionStagingItem[],
    mediaResourceId: string | null,
  ) => {
    if (!targetItems.length || nonExecutionBusy) return;
    setActionError("");
    try {
      const result = await onSetMedia(
        targetItems.map((item) => item.articleRef),
        mediaResourceId,
      );
      if (
        !result ||
        typeof result !== "object" ||
        (result as { stale?: boolean }).stale !== true
      ) {
        if (mediaResourceId === null) {
          setPickerResourceId(null);
          setPickerClientId(null);
        }
        setSelected(new Set());
      }
    } catch (value) {
      setActionError(errorMessage(value, "更新付费媒体失败。"));
    }
  };

  const chooseMedia = async (resource: MediaResource) => {
    if (!selectedItems.length) {
      setActionError("请先勾选一篇或多篇付费媒体投稿文章。");
      return;
    }
    setPickerClientId(currentClientId);
    setPickerResourceId(resource.resourceId);
    await setMediaForItems(selectedItems, resource.resourceId);
  };

  const clearSelectedMedia = async () => {
    await setMediaForItems(selectedItems, null);
  };

  const clearOneMedia = async (item: PaidSubmissionStagingItem) => {
    await setMediaForItems([item], null);
  };

  const selectionMessage = !selectedItems.length
    ? "请先勾选文章进行费用预检。"
    : selectedHasMixedMedia
      ? "请选择同一媒体的文章进行费用预检"
      : selectedHasMissingMedia
        ? "请先为所有选中文章选择媒体进行费用预检。"
        : `已选择 ${selectedItems.length} 篇同一媒体文章，可以进行费用预检。`;

  const preflightSelectedArticles = selectedItems.map(
    (item) => item.articleRef,
  );

  const runPreflight = async () => {
    if (nonExecutionBusy) return;
    if (!canPreflight || !selectedMediaResourceId) {
      setPreflightState(null);
      setPreflightError(selectionMessage);
      return;
    }
    setPreflightState(null);
    setPreflightError("");
    try {
      const result = await onPreflight({
        articleRefs: preflightSelectedArticles,
        mediaResourceId: selectedMediaResourceId,
      });
      if (isStaleResult(result)) return;
      setPreflightState({ model: result, selectionKey });
    } catch (value) {
      setPreflightError(
        errorMessage(value, "费用预检失败，付费投稿队列仍保留。"),
      );
    }
  };

  const confirmPreflight = async () => {
    const model = preflightState?.model;
    if (
      !model ||
      model.canConfirm !== true ||
      !model.confirmationToken ||
      nonExecutionBusy
    )
      return;
    setPreflightError("");
    setBatchRefreshError("");
    let confirmed = false;
    try {
      const result = await onConfirm({
        confirmationToken: model.confirmationToken,
      });
      if (isStaleResult(result)) return;
      confirmed = true;
      const refreshed = await onRefreshPaidMediaBatches();
      setPreflightState(null);
      setSelected(new Set());
      if (refreshed === false)
        setBatchRefreshError(
          "费用已确认，但付费批次列表刷新失败，请重新刷新批次列表。",
        );
    } catch (value) {
      if (confirmed) {
        setPreflightState(null);
        setSelected(new Set());
        setBatchRefreshError(
          "费用已确认，但付费批次列表刷新失败，请重新刷新批次列表。",
        );
        return;
      }
      setPreflightState(null);
      setPreflightError(
        errorMessage(value, "费用确认失败，付费投稿队列仍保留，可重新预检。"),
      );
    }
  };

  const startPaidBatch = async (batchId: string) => {
    if (startCommand.busy) return;
    setActionError("");
    try {
      const result = await onStart({ batchId });
      if (isStaleResult(result)) return;
    } catch (value) {
      setActionError(errorMessage(value, "开始创建订单失败。"));
    }
  };

  const pausePaidBatch = async (batchId: string) => {
    if (pauseCommand.busy) return;
    setActionError("");
    try {
      const result = await onPause({ batchId });
      if (isStaleResult(result)) return;
    } catch (value) {
      setActionError(errorMessage(value, "暂停后续订单失败。"));
    }
  };

  const refreshPaidBatches = async () => {
    setBatchRefreshError("");
    try {
      const refreshed = await onRefreshPaidMediaBatches();
      if (refreshed === false)
        setBatchRefreshError("付费批次刷新失败，请稍后重试。");
    } catch (value) {
      setBatchRefreshError(
        errorMessage(value, "付费批次刷新失败，请稍后重试。"),
      );
    }
  };

  const queryError = query.error?.userMessage || "";
  const visibleError =
    actionError ||
    queryError ||
    paidMediaPool.error?.userMessage ||
    removeCommand.error?.userMessage ||
    setMediaCommand.error?.userMessage ||
    startCommand.error?.userMessage ||
    pauseCommand.error?.userMessage ||
    "";
  const clientLabel = currentClientName || currentClientId || "未知客户";
  const currentPage = paidMediaPool.page > 0 ? paidMediaPool.page : 1;
  const totalPages =
    paidMediaPool.totalPages > 0 ? paidMediaPool.totalPages : 1;
  const hasPoolPagination =
    paidMediaPool.hasPrev || paidMediaPool.hasNext || totalPages > 1;

  return (
    <section
      aria-label="付费媒体投稿队列"
      className="grid min-w-0 gap-3 rounded-md border border-amber-200 bg-amber-50/60 p-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-amber-950">
            付费媒体投稿队列
          </h2>
          <p className="mt-1 text-xs leading-5 text-amber-900/70">
            当前客户：{clientLabel}
            。仅可从当前收藏媒体池选择媒体，不会在此创建订单。
          </p>
        </div>
        {query.loading && (
          <span role="status" className="text-xs text-amber-800">
            加载中…
          </span>
        )}
      </div>

      {visibleError && (
        <div
          role="alert"
          className="rounded border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700"
        >
          {visibleError}
        </div>
      )}

      {visibleItems.length > 0 ? (
        <>
          <div className="divide-y divide-amber-100 rounded border border-amber-200 bg-white">
            {visibleItems.map((item) => {
              const article = articleById.get(item.articleRef.articleId);
              const title = article?.title || item.articleRef.articleId;
              const key = stagingItemKey(item);
              return (
                <div
                  key={key}
                  className="flex min-w-0 flex-wrap items-center gap-3 p-3 text-xs text-slate-700"
                >
                  <input
                    type="checkbox"
                    aria-label={`选择付费媒体投稿 ${title}`}
                    checked={selected.has(key)}
                    onChange={() =>
                      setSelected((current) => {
                        const next = new Set(current);
                        if (next.has(key)) next.delete(key);
                        else next.add(key);
                        return next;
                      })
                    }
                    className="shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold" title={title}>
                      {title}
                    </div>
                    <div className="mt-1 flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-slate-500">
                      <span>
                        客户：
                        {item.articleRef.clientId === currentClientId
                          ? clientLabel
                          : item.articleRef.clientId}
                      </span>
                      <span>
                        媒体：
                        {item.selectedMediaResourceId
                          ? `已选 ${item.selectedMediaResourceId}`
                          : "未选择"}
                      </span>
                    </div>
                  </div>
                  {item.selectedMediaResourceId && (
                    <button
                      type="button"
                      aria-label={`清除已选媒体 ${title}`}
                      onClick={() => void clearOneMedia(item)}
                      disabled={nonExecutionBusy}
                      className="shrink-0 rounded border border-slate-300 px-2 py-1.5 font-semibold text-slate-700 disabled:opacity-40"
                    >
                      清除媒体
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label={`移出付费媒体投稿队列 ${title}`}
                    onClick={() => void removeOne(item)}
                    disabled={nonExecutionBusy}
                    className="shrink-0 rounded border border-amber-300 px-2 py-1.5 font-semibold text-amber-800 disabled:opacity-40"
                  >
                    移出
                  </button>
                </div>
              );
            })}
          </div>

          <div
            role="region"
            aria-label="收藏媒体选择器"
            className="grid gap-3 rounded border border-blue-200 bg-blue-50/50 p-3"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="text-xs font-semibold text-blue-950">
                  从收藏媒体池选择
                </h3>
                <p className="mt-1 text-[11px] leading-5 text-blue-900/70">
                  先勾选文章，再选择一项媒体；同一项可批量指定给多篇文章。
                </p>
              </div>
              {selectedItems.length > 0 && (
                <button
                  type="button"
                  aria-label="清除所选文章媒体"
                  onClick={() => void clearSelectedMedia()}
                  disabled={nonExecutionBusy}
                  className="rounded border border-slate-300 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-700 disabled:opacity-40"
                >
                  清除所选媒体（{selectedItems.length}）
                </button>
              )}
            </div>

            {paidMediaPool.loading && (
              <span role="status" className="text-[11px] text-blue-800">
                收藏媒体加载中…
              </span>
            )}
            {!paidMediaPool.loading && visiblePoolItems.length === 0 ? (
              <div className="rounded border border-dashed border-blue-200 bg-white/70 p-3 text-center text-[11px] text-blue-900/70">
                当前收藏媒体池暂无已加载媒体。
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {visiblePoolItems.map((resource) => (
                  <button
                    type="button"
                    key={resource.resourceId}
                    aria-label={`选择收藏媒体 ${resource.name}`}
                    title="资源编码只读，媒体来自当前收藏池分页"
                    onClick={() => void chooseMedia(resource)}
                    disabled={nonExecutionBusy || paidMediaPool.loading}
                    className={`grid min-w-0 gap-1 rounded border bg-white p-2 text-left text-[11px] transition-colors disabled:opacity-50 ${
                      pickerResourceId === resource.resourceId &&
                      pickerClientId === currentClientId
                        ? "border-blue-500 ring-1 ring-blue-300"
                        : "border-blue-100 hover:border-blue-300"
                    }`}
                  >
                    <span className="truncate font-semibold text-slate-800">
                      媒体名称：{resource.name || "未命名媒体"}
                    </span>
                    <span className="text-slate-600">
                      缓存价格：
                      {typeof resource.price === "number"
                        ? `¥${resource.price.toFixed(2)}`
                        : "未记录"}
                    </span>
                    <span className="truncate font-mono text-slate-500">
                      资源编码：{resource.resourceId}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {hasPoolPagination && (
              <div className="flex items-center justify-between border-t border-blue-100 pt-2 text-[11px] text-blue-900/70">
                <span>
                  收藏媒体第 <b>{currentPage}</b> / <b>{totalPages}</b> 页（共{" "}
                  {paidMediaPool.total || 0} 项）
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label="上一页收藏媒体"
                    onClick={() =>
                      void paidMediaPool.loadPage(Math.max(currentPage - 1, 1))
                    }
                    disabled={
                      nonExecutionBusy ||
                      paidMediaPool.loading ||
                      !paidMediaPool.hasPrev
                    }
                    className="rounded border border-blue-200 bg-white p-1 text-blue-800 disabled:opacity-40"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="下一页收藏媒体"
                    onClick={() => void paidMediaPool.loadPage(currentPage + 1)}
                    disabled={
                      nonExecutionBusy ||
                      paidMediaPool.loading ||
                      !paidMediaPool.hasNext
                    }
                    className="rounded border border-blue-200 bg-white p-1 text-blue-800 disabled:opacity-40"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}

            <div
              role="region"
              aria-label="付费费用预检"
              className="grid gap-2 rounded border border-violet-200 bg-violet-50/60 p-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-xs font-semibold text-violet-950">
                    费用预检与确认
                  </h3>
                  <p className="mt-1 text-[11px] leading-5 text-violet-900/70">
                    预检会重新读取当前媒体报价与接单状态；缓存价格仅用于选择参考。
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={preflightState ? "重新费用预检" : "费用预检"}
                  onClick={() => void runPreflight()}
                  disabled={!canPreflight || nonExecutionBusy}
                  className="rounded bg-violet-700 px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-40"
                >
                  {preflightCommand.busy ? "预检中…" : "费用预检"}
                </button>
              </div>
              <p role="status" className="text-[11px] text-violet-900/80">
                {selectionMessage}
              </p>
              {preflightError && (
                <div
                  role="alert"
                  className="rounded border border-rose-200 bg-rose-50 p-2 text-[11px] text-rose-700"
                >
                  {preflightError}
                </div>
              )}

              {preflightState && (
                <div className="grid gap-3 rounded border border-violet-200 bg-white p-3 text-[11px] text-slate-700">
                  <div className="grid gap-1 sm:grid-cols-2">
                    <span>
                      媒体名称：{preflightState.model.mediaName || "未提供"}
                    </span>
                    <span>
                      媒体备注：{preflightState.model.mediaRemarks || "无备注"}
                    </span>
                    <span>
                      最新单价（预检）：
                      {formatMoney(preflightState.model.quotedPrice)}
                    </span>
                    <span>文章数：{preflightState.model.articleCount}</span>
                    <span>
                      预计总费用：
                      {formatMoney(preflightState.model.estimatedTotal)}
                    </span>
                    <span>
                      系统投稿标识：
                      {preflightState.model.systemSubmissionCode || "未配置"}
                    </span>
                  </div>

                  <div>
                    <div className="font-semibold text-slate-800">文章风险</div>
                    <ul className="mt-1 grid gap-1 pl-4">
                      {preflightState.model.articles.map((article) => (
                        <li
                          key={`${article.articleRef.clientId}:${article.articleId}`}
                        >
                          <span className="font-medium">
                            {article.title || article.articleId}
                          </span>
                          ：
                          {article.riskCodes.length
                            ? article.riskCodes.join("、")
                            : "无风险提示"}
                          {article.reasonCodes.length
                            ? `；阻断：${article.reasonCodes.join("、")}`
                            : ""}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <div className="font-semibold text-slate-800">风险提示</div>
                    {preflightState.model.risks.length ? (
                      <ul className="mt-1 grid gap-1 pl-4">
                        {preflightState.model.risks.map((risk) => (
                          <li key={risk.code}>
                            {risk.message}（{risk.code}，{risk.count} 次）
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1">无风险提示</p>
                    )}
                  </div>

                  <div>
                    <div className="font-semibold text-slate-800">阻断项</div>
                    <p className="mt-1">
                      {preflightState.model.blockers.length
                        ? preflightState.model.blockers.join("、")
                        : "无"}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-violet-100 pt-2">
                    <span>
                      {preflightState.model.canConfirm
                        ? "报价和风险已读取，请明确确认后创建暂停批次。"
                        : "当前预检存在阻断项，不能确认付费批次。"}
                    </span>
                    <button
                      type="button"
                      aria-label="确认费用并创建暂停付费批次"
                      onClick={() => void confirmPreflight()}
                      disabled={
                        !preflightState.model.canConfirm || nonExecutionBusy
                      }
                      className="rounded bg-emerald-700 px-3 py-1.5 font-semibold text-white disabled:opacity-40"
                    >
                      {confirmCommand.busy
                        ? "确认中…"
                        : "确认费用并创建暂停付费批次"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="rounded border border-dashed border-amber-300 bg-white/70 p-4 text-center text-xs text-amber-900/70">
          当前客户暂无付费媒体投稿文章。
        </div>
      )}

      {(activePaidBatches.length > 0 ||
        paidMediaBatchesQuery.loading ||
        paidMediaBatchesQuery.error ||
        batchRefreshError) && (
        <section
          role="region"
          aria-label="当前客户付费批次"
          className="grid gap-2 rounded border border-emerald-200 bg-emerald-50/60 p-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-semibold text-emerald-950">
              当前客户已确认付费批次
            </h3>
            <button
              type="button"
              aria-label="刷新付费批次"
              onClick={() => void refreshPaidBatches()}
              disabled={paidMediaBatchesQuery.loading}
              className="rounded border border-emerald-300 bg-white px-2 py-1 text-[11px] font-semibold text-emerald-800 disabled:opacity-40"
            >
              刷新
            </button>
          </div>
          {paidMediaBatchesQuery.loading && (
            <span role="status" className="text-[11px] text-emerald-800">
              付费批次加载中…
            </span>
          )}
          {(paidMediaBatchesQuery.error || batchRefreshError) && (
            <div role="alert" className="text-[11px] text-rose-700">
              {batchRefreshError || paidMediaBatchesQuery.error?.userMessage}
            </div>
          )}
          {activePaidBatches.length > 0 && (
            <div className="grid gap-2">
              {activePaidBatches.map((batch) => (
                <div
                  key={batch.batchId}
                  className="grid gap-1 rounded border border-emerald-100 bg-white p-2 text-[11px] text-slate-700 sm:grid-cols-2"
                >
                  <span className="font-semibold text-slate-800">
                    批次：{batch.batchId}
                  </span>
                  <span>媒体资源：{batch.mediaResourceId}</span>
                  <span>文章数：{batch.articleCount}</span>
                  <span>预计总费用：{formatMoney(batch.estimatedTotal)}</span>
                  <span className="text-emerald-800 sm:col-span-2">
                    {batch.status === "needs_attention"
                      ? "需要人工处理，禁止直接开始"
                      : batch.paused && batch.runState === "paused"
                        ? "已暂停，等待用户开始投稿"
                        : `批次状态：${batch.status}`}
                  </span>
                  {canStartPaidBatch(batch) && (
                    <button
                      type="button"
                      aria-label="开始创建订单"
                      onClick={() => void startPaidBatch(batch.batchId)}
                      disabled={startCommand.busy}
                      className="rounded bg-emerald-700 px-2 py-1.5 font-semibold text-white disabled:opacity-40"
                    >
                      {startCommand.busy ? "开始中…" : "开始创建订单"}
                    </button>
                  )}
                  {canPausePaidBatch(batch) && (
                    <button
                      type="button"
                      aria-label="暂停后续订单"
                      onClick={() => void pausePaidBatch(batch.batchId)}
                      disabled={pauseCommand.busy}
                      className="rounded border border-amber-300 px-2 py-1.5 font-semibold text-amber-800 disabled:opacity-40"
                    >
                      {pauseCommand.busy ? "暂停中…" : "暂停后续订单"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </section>
  );
}
