import React, { useState } from "react";
import { LoaderCircle, RefreshCw } from "lucide-react";
import type { ContentWorkbenchFeature } from "../features/content/use-content-workbench-feature";
import type { PaidMediaExecutionBatch } from "../types/publication";
import type { useSubmissionCenterFeature } from "../features/submission-center/use-submission-center-feature";

export interface PaidMediaWorkbenchProps {
  content: ContentWorkbenchFeature;
  onStartPaidMediaBatch: ContentWorkbenchFeature["commands"]["startPaidMediaBatch"];
  onStartAllPaidMediaBatches: ContentWorkbenchFeature["commands"]["startAllPaidMediaBatches"];
  onPausePaidMediaBatch: ContentWorkbenchFeature["commands"]["pausePaidMediaBatch"];
  onCancelRemainingPaidMediaBatchItems: ContentWorkbenchFeature["commands"]["cancelRemainingPaidMediaBatchItems"];
  submissionCenter?: ReturnType<typeof useSubmissionCenterFeature>;
}

function messageOf(value: unknown, fallback: string): string {
  return value instanceof Error && value.message ? value.message : fallback;
}

function money(value: number): string {
  return `¥${value.toFixed(2)}`;
}

type PaidMediaExecutionBatchView = Omit<
  PaidMediaExecutionBatch,
  "paused" | "mediaRemarks"
>;

function statusLabel(batch: PaidMediaExecutionBatchView): string {
  if (batch.status === "needs_attention") return "需人工核对";
  if (batch.status === "completed") return "已完成";
  if (batch.runState === "in_flight") return "执行中";
  if (batch.runState === "paused") return "已暂停";
  return "待执行";
}

function itemLabel(batch: PaidMediaExecutionBatchView): string {
  const item = batch.currentItem;
  if (!item) return "暂无在途或待执行文章";
  return `${item.title || item.articleRef.articleId} · ${item.status}`;
}

export default function PaidMediaWorkbench({
  content,
  onStartPaidMediaBatch,
  onStartAllPaidMediaBatches,
  onPausePaidMediaBatch,
  onCancelRemainingPaidMediaBatchItems,
  submissionCenter,
}: PaidMediaWorkbenchProps) {
  const { paidMediaExecution, scope } = content.snapshot;
  const [actionError, setActionError] = useState("");
  const commandStates = content.snapshot.commands;
  const batches: PaidMediaExecutionBatchView[] = submissionCenter
    ? submissionCenter.snapshot.data.paid.batches
    : Array.isArray(paidMediaExecution.items)
      ? paidMediaExecution.items
      : [];
  const paidQuery = submissionCenter?.snapshot.query || paidMediaExecution.query;
  const queryError = paidQuery.error?.userMessage;
  const clientId = content.snapshot.selectedClientId || "";
  const canStartAll = clientId !== "" && batches.some(
    (batch) => batch.actions.canStart === true,
  );
  const paidStartBusy =
    commandStates.startPaidMediaBatch?.busy === true ||
    commandStates.startAllPaidMediaBatches?.busy === true;

  const refresh = async () => {
    setActionError("");
    if (submissionCenter) await submissionCenter.feature.refresh("paid-manual");
    else await content.refreshPaidMediaBatches("paid-manual");
  };

  if (!scope || (paidQuery.loading && batches.length === 0))
    return (
      <div className="flex h-full items-center justify-center text-slate-500">
        <LoaderCircle className="mr-2 h-5 w-5 animate-spin" />
        加载已确认付费批次
      </div>
    );

  return (
    <div
      data-testid="paid-media-workbench"
      className="flex h-full min-h-0 flex-col gap-3 overflow-hidden"
    >
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-800">
            已确认付费批次工作台
          </h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            这里只展示已确认并冻结的批次；文章集合、报价和费用不会在此修改。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canStartAll && (
            <button
              type="button"
              onClick={() => {
                setActionError("");
                void onStartAllPaidMediaBatches({ clientId })
                  .then((result) => {
                    if (result.executionStatus === "paid_execution_busy")
                      setActionError("已有付费投稿批次正在执行，请稍后重试。");
                  })
                  .catch((value) =>
                    setActionError(
                      messageOf(value, "一起开始付费投稿批次失败。"),
                    ),
                  );
              }}
              disabled={paidQuery.loading || paidStartBusy}
              className="rounded bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
            >
              一起开始
            </button>
          )}
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={paidQuery.loading}
            aria-label="刷新已确认付费批次"
            className="inline-flex h-9 items-center gap-1 rounded-md border border-slate-300 px-2 text-xs text-slate-600 disabled:opacity-50"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${paidQuery.loading ? "animate-spin" : ""}`}
            />
            {paidQuery.loading ? "刷新中…" : "刷新批次"}
          </button>
        </div>
      </div>

      {(queryError || actionError) && (
        <div
          role="alert"
          className="rounded border border-rose-100 bg-rose-50 p-2 text-xs text-rose-700"
        >
          {actionError || queryError}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-slate-200 bg-white p-4">
        {batches.length === 0 ? (
          <p className="rounded border border-dashed border-slate-300 p-6 text-center text-xs text-slate-500">
            暂无已确认付费批次。
          </p>
        ) : (
          <div className="space-y-3">
            {batches.map((batch) => {
              const canStart = batch.actions.canStart === true;
              const canPause = batch.actions.canPause === true;
              const canCancel = batch.actions.canCancelRemaining === true;
              return (
                <section
                  key={batch.batchId}
                  aria-label={`付费批次 ${batch.batchId}`}
                  className="rounded-md border border-slate-200 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold text-slate-800">
                        {batch.mediaName || batch.mediaResourceId}
                      </h3>
                      <p className="mt-1 break-all text-[11px] text-slate-500">
                        批次 {batch.batchId} · {statusLabel(batch)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {canStart && (
                        <button
                          type="button"
                          onClick={async () => {
                            setActionError("");
                            try {
                              await onStartPaidMediaBatch({
                                batchId: batch.batchId,
                              });
                            } catch (value) {
                              setActionError(
                                messageOf(value, "启动付费投稿批次失败。"),
                              );
                            }
                          }}
                          disabled={paidStartBusy}
                          className="rounded bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
                        >
                          继续执行
                        </button>
                      )}
                      {canPause && (
                        <button
                          type="button"
                          onClick={() => {
                            setActionError("");
                            void onPausePaidMediaBatch({ batchId: batch.batchId })
                              .catch((value) =>
                                setActionError(
                                  messageOf(value, "暂停付费投稿批次失败。"),
                                ),
                              );
                          }}
                          disabled={commandStates.pausePaidMediaBatch?.busy}
                          className="rounded border border-slate-300 px-3 py-2 text-xs text-slate-700 disabled:opacity-40"
                        >
                          暂停批次
                        </button>
                      )}
                      {canCancel && (
                        <button
                          type="button"
                          onClick={() => {
                            setActionError("");
                            void onCancelRemainingPaidMediaBatchItems({
                              batchId: batch.batchId,
                            })
                              .catch((value) =>
                                setActionError(
                                  messageOf(value, "取消剩余未开始项失败。"),
                                ),
                              );
                          }}
                          disabled={
                            commandStates.cancelRemainingPaidMediaBatchItems?.busy
                          }
                          className="rounded border border-rose-300 px-3 py-2 text-xs text-rose-700 disabled:opacity-40"
                        >
                          取消全部剩余未开始项
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2 lg:grid-cols-4">
                    <div>报价：{money(batch.quotedPrice)}</div>
                    <div>预计费用：{money(batch.estimatedTotal)}</div>
                    <div>文章总数：{batch.articleCount}</div>
                    <div>已创建订单：{batch.createdOrderCount ?? 0}</div>
                    <div>剩余未开始：{batch.remainingCount ?? 0}</div>
                    <div>运行状态：{batch.runState}</div>
                  </div>

                  {batch.pauseReason && (
                    <p className="mt-3 rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      暂停原因：{batch.pauseReason}
                    </p>
                  )}

                  <div className="mt-3 rounded bg-slate-50 px-3 py-2 text-xs text-slate-700">
                    <span className="font-medium">当前项：</span>
                    {itemLabel(batch)}
                  </div>

                  {batch.items.length > 0 && (
                    <div className="mt-3 space-y-1 border-t border-slate-100 pt-3">
                      {batch.items.map((item) => (
                        <div
                          key={item.itemId}
                          className="flex flex-wrap justify-between gap-2 text-xs text-slate-600"
                        >
                          <span className="min-w-0 truncate">
                            {item.title || item.articleRef.articleId}
                          </span>
                          <span>
                            {item.status} · {item.phase}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
