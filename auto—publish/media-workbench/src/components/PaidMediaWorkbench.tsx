import React, { useState } from "react";
import {
  CirclePause,
  CirclePlay,
  LoaderCircle,
  RefreshCw,
  XCircle,
} from "lucide-react";
import type { ContentWorkbenchFeature } from "../features/content/use-content-workbench-feature";
import type { PaidMediaExecutionBatch } from "../types/publication";
import type { useSubmissionCenterFeature } from "../features/submission-center/use-submission-center-feature";
import { Button, StatusBadge, Surface } from "./ui/primitives";

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

function statusTone(
  batch: PaidMediaExecutionBatchView,
): "neutral" | "info" | "success" | "warning" {
  if (batch.status === "needs_attention") return "warning";
  if (batch.status === "completed") return "success";
  if (batch.runState === "in_flight") return "info";
  return "neutral";
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
  const canStartAll =
    clientId !== "" &&
    batches.some((batch) => batch.actions.canStart === true);
  const paidStartBusy =
    commandStates.startPaidMediaBatch?.busy === true ||
    commandStates.startAllPaidMediaBatches?.busy === true;

  const refresh = async () => {
    setActionError("");
    if (submissionCenter)
      await submissionCenter.feature.refresh("paid-manual");
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
      <Surface className="flex shrink-0 flex-wrap items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-slate-800">
            已确认付费批次
          </h2>
          <p className="mt-1 max-w-3xl text-[11px] leading-5 text-slate-500">
            这里只执行已经确认并冻结的批次；文章集合、报价和费用不会在此修改。
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {canStartAll && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setActionError("");
                void onStartAllPaidMediaBatches({ clientId })
                  .then((result) => {
                    if (result.executionStatus === "paid_execution_busy")
                      setActionError(
                        "已有付费投稿批次正在执行，请稍后重试。",
                      );
                  })
                  .catch((value) =>
                    setActionError(
                      messageOf(value, "一起开始付费投稿批次失败。"),
                    ),
                  );
              }}
              disabled={paidQuery.loading || paidStartBusy}
            >
              <CirclePlay className="h-3.5 w-3.5" />
              一起开始
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => void refresh()}
            disabled={paidQuery.loading}
            aria-label="刷新已确认付费批次"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${paidQuery.loading ? "animate-spin" : ""}`}
            />
            {paidQuery.loading ? "刷新中…" : "刷新批次"}
          </Button>
        </div>
      </Surface>

      {(queryError || actionError) && (
        <div
          role="alert"
          className="rounded-xl border border-rose-100 bg-rose-50 p-3 text-xs text-rose-700"
        >
          {actionError || queryError}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {batches.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white/80 p-8 text-center text-xs text-slate-500">
            暂无已确认付费批次。
          </p>
        ) : (
          <div className="grid gap-3 xl:grid-cols-2">
            {batches.map((batch) => {
              const canStart = batch.actions.canStart === true;
              const canPause = batch.actions.canPause === true;
              const canCancel = batch.actions.canCancelRemaining === true;
              return (
                <section
                  key={batch.batchId}
                  aria-label={`付费批次 ${batch.batchId}`}
                  className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3.5">
                    <div className="min-w-0">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <h3 className="max-w-lg truncate text-[13px] font-bold text-slate-800">
                          {batch.mediaName || batch.mediaResourceId}
                        </h3>
                        <StatusBadge tone={statusTone(batch)}>
                          {statusLabel(batch)}
                        </StatusBadge>
                      </div>
                      <p className="mt-1 break-all font-mono text-[10px] text-slate-400">
                        {batch.batchId}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {canStart && (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={async () => {
                            setActionError("");
                            try {
                              await onStartPaidMediaBatch({
                                batchId: batch.batchId,
                              });
                            } catch (value) {
                              setActionError(
                                messageOf(
                                  value,
                                  "启动付费投稿批次失败。",
                                ),
                              );
                            }
                          }}
                          disabled={paidStartBusy}
                        >
                          <CirclePlay className="h-3.5 w-3.5" />
                          继续执行
                        </Button>
                      )}
                      {canPause && (
                        <Button
                          size="sm"
                          onClick={() => {
                            setActionError("");
                            void onPausePaidMediaBatch({
                              batchId: batch.batchId,
                            }).catch((value) =>
                              setActionError(
                                messageOf(
                                  value,
                                  "暂停付费投稿批次失败。",
                                ),
                              ),
                            );
                          }}
                          disabled={commandStates.pausePaidMediaBatch?.busy}
                        >
                          <CirclePause className="h-3.5 w-3.5" />
                          暂停
                        </Button>
                      )}
                      {canCancel && (
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => {
                            setActionError("");
                            void onCancelRemainingPaidMediaBatchItems({
                              batchId: batch.batchId,
                            }).catch((value) =>
                              setActionError(
                                messageOf(
                                  value,
                                  "取消剩余未开始项失败。",
                                ),
                              ),
                            );
                          }}
                          disabled={
                            commandStates.cancelRemainingPaidMediaBatchItems
                              ?.busy
                          }
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          取消剩余项
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-2 border-b border-slate-100 bg-slate-50/55 px-4 py-3 text-[11px] sm:grid-cols-2 lg:grid-cols-3">
                    <div>
                      <span className="block text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                        报价
                      </span>
                      <span className="mt-0.5 block font-mono font-bold text-slate-700">
                        {money(batch.quotedPrice)}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                        预计费用
                      </span>
                      <span className="mt-0.5 block font-mono font-bold text-slate-700">
                        {money(batch.estimatedTotal)}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                        进度
                      </span>
                      <span className="mt-0.5 block font-medium text-slate-700">
                        已建订单 {batch.createdOrderCount ?? 0} / 文章 {batch.articleCount}
                      </span>
                    </div>
                    <div className="sm:col-span-2 lg:col-span-3">
                      <span className="text-slate-500">
                        剩余未开始 {batch.remainingCount ?? 0} · 运行状态 {batch.runState}
                      </span>
                    </div>
                  </div>

                  <div className="px-4 py-3">
                    {batch.pauseReason && (
                      <p className="mb-3 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                        暂停原因：{batch.pauseReason}
                      </p>
                    )}

                    <div className="rounded-lg border border-blue-100 bg-blue-50/65 px-3 py-2 text-[11px] text-blue-800">
                      <span className="font-semibold">当前项：</span>
                      {itemLabel(batch)}
                    </div>

                    {batch.items.length > 0 && (
                      <div className="mt-3 max-h-52 space-y-1 overflow-y-auto border-t border-slate-100 pt-3">
                        {batch.items.map((item, index) => (
                          <div
                            key={item.itemId}
                            className="flex min-w-0 items-center justify-between gap-3 rounded-md px-2 py-1.5 text-[11px] text-slate-600 hover:bg-slate-50"
                          >
                            <span className="min-w-0 flex-1 truncate">
                              <span className="mr-2 font-mono text-[9px] text-slate-400">
                                {index + 1}
                              </span>
                              {item.title || item.articleRef.articleId}
                            </span>
                            <span className="shrink-0 text-slate-400">
                              {item.status} · {item.phase}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
