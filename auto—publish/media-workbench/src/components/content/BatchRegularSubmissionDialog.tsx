import React, { useEffect, useMemo, useState } from "react";
import type { ContentClient } from "../../types/content";
import type {
  GenerationBatch,
  GenerationBatchTask,
} from "../../types/generation";
import type {
  ContentSubmissionPlatform,
  PaidMediaAdmissionResult,
  RegularQueueAdmissionResult,
} from "../../types/publication";
import {
  admitRegularQueueItems,
  confirmPaidMediaBatch,
  previewPaidMediaPreflight,
  previewRegularQueueAdmission,
} from "../../bridge/content";
import { useConfirmation } from "../../confirmation";
import { usePlatformFeature } from "../../features/platform/platform-feature-context";
import SubmissionIntakeDialog from "./SubmissionIntakeDialog";
import { useSubmissionIntakeSession } from "./use-submission-intake-session";
import type { FavoriteMediaPage } from "./GeneratedArticlesView.types";

const EMPTY_FAVORITE_MEDIA_PAGE: FavoriteMediaPage = {
  items: [],
  total: 0,
  page: 1,
  totalPages: 0,
  hasPrev: false,
  hasNext: false,
  loading: false,
};
const EMPTY_COMMAND_STATES: Record<string, { busy: boolean }> = {};

type BatchCandidate = GenerationBatchTask & { articleId: string };
type BatchSubmissionSummary = {
  admittedCount: number;
  idempotentCount: number;
  clientCount: number;
};

interface BatchRegularSubmissionDialogProps {
  open: boolean;
  batch: GenerationBatch;
  clients: ContentClient[];
  onClose: () => void;
  onCommitted?: (summary: BatchSubmissionSummary) => void;
}

function articleRefKey(ref: { clientId: string; articleId: string }) {
  return `${ref.clientId}:${ref.articleId}`;
}

function regularResultIssueText(result: RegularQueueAdmissionResult): string {
  const failedCount = result.items.filter((item) => item.status === "failed").length;
  const uncertainCount = result.items.filter(
    (item) => item.status === "uncertain",
  ).length;
  const notProcessedCount = result.items.filter(
    (item) => item.status === "not_processed",
  ).length;
  const parts = [
    `新增 ${result.admittedCount || 0} 项`,
    `已存在 ${result.idempotentCount || 0} 项`,
  ];
  if (result.missingCount) parts.push(`缺失 ${result.missingCount} 项`);
  if (result.conflictCount) parts.push(`冲突 ${result.conflictCount} 项`);
  if (failedCount) parts.push(`明确失败 ${failedCount} 项`);
  if (uncertainCount) parts.push(`结果不确定 ${uncertainCount} 项`);
  if (notProcessedCount) parts.push(`未处理 ${notProcessedCount} 项`);
  return `${parts.join("，")}。${
    uncertainCount
      ? "不确定结果不会自动重试；请先核验投稿中心中的当前事实。明确失败和未处理文章仍可重新检查。"
      : "明确失败和未处理文章保留为可重新检查项。"
  }`;
}

function hasRegularIssues(result: RegularQueueAdmissionResult): boolean {
  return Boolean(
    result.missingCount ||
      result.conflictCount ||
      result.items.some((item) =>
        ["failed", "uncertain", "not_processed"].includes(item.status),
      ),
  );
}

export default function BatchRegularSubmissionDialog({
  open,
  batch,
  clients,
  onClose,
  onCommitted,
}: BatchRegularSubmissionDialogProps) {
  const { confirm } = useConfirmation();
  const { snapshot, feature } = usePlatformFeature();
  const candidates = useMemo(
    () =>
      batch.tasks.filter(
        (task): task is BatchCandidate =>
          task.status === "succeeded" &&
          typeof task.articleId === "string" &&
          Boolean(task.articleId),
      ),
    [batch.tasks],
  );
  const clientNames = useMemo(
    () => new Map(clients.map((client) => [client.id, client.name])),
    [clients],
  );
  const queuePlatforms = snapshot.queue.platforms as ContentSubmissionPlatform[];
  const submissionPlatforms = useMemo(() => {
    const explicit = queuePlatforms.filter(
      (platform) => platform.contentQueueImport === true,
    );
    return explicit.length
      ? explicit
      : queuePlatforms.filter(
          (platform) => platform.contentQueueImport !== false,
        );
  }, [queuePlatforms]);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [issueFeedback, setIssueFeedback] = useState("");
  const selectedCandidates = useMemo(
    () => candidates.filter((task) => selectedTaskIds.has(task.id)),
    [candidates, selectedTaskIds],
  );
  const articleRefs = useMemo(
    () =>
      selectedCandidates.map((task) => ({
        clientId: task.clientId,
        articleId: task.articleId,
      })),
    [selectedCandidates],
  );

  function handleCommitted(
    result: RegularQueueAdmissionResult | PaidMediaAdmissionResult,
  ) {
    if (!("admittedCount" in result) || !("items" in result)) return;
    if (hasRegularIssues(result)) {
      const retryableKeys = new Set(
        result.items
          .filter(
            (item) => item.status === "failed" || item.status === "not_processed",
          )
          .map((item) => articleRefKey(item.articleRef)),
      );
      setSelectedTaskIds(
        new Set(
          candidates
            .filter((task) =>
              retryableKeys.has(
                articleRefKey({
                  clientId: task.clientId,
                  articleId: task.articleId,
                }),
              ),
            )
            .map((task) => task.id),
        ),
      );
      setIssueFeedback(regularResultIssueText(result));
      return;
    }
    onCommitted?.({
      admittedCount: result.admittedCount,
      idempotentCount: result.idempotentCount,
      clientCount: new Set(result.articleRefs.map((ref) => ref.clientId)).size,
    });
    onClose();
  }

  const session = useSubmissionIntakeSession({
    scopeKey: `generation-batch:${batch.id}`,
    availableArticleRefs: articleRefs,
    previewRegularQueueAdmission,
    admitRegularQueueItems,
    previewPaidMediaPreflight,
    confirmPaidMediaBatch,
    commandStates: EMPTY_COMMAND_STATES,
    confirm,
    onCommitted: handleCommitted,
  });

  useEffect(() => {
    if (!open) return;
    setSelectedTaskIds(new Set(candidates.map((task) => task.id)));
    setIssueFeedback("");
    void feature.refreshQueue("batch-submission-open").catch(() => undefined);
    void feature
      .refreshAccountProfiles("batch-submission-open")
      .catch(() => undefined);
  }, [batch.id, candidates, feature, open]);

  useEffect(() => {
    if (open || !session.snapshot.open) return;
    session.intents.close();
  }, [open, session.intents, session.snapshot.open]);

  if (!open) return null;

  const selectedClientCount = new Set(
    selectedCandidates.map((task) => task.clientId),
  ).size;
  const sharedIntents = {
    ...session.intents,
    close: () => {
      session.intents.close();
      onClose();
    },
  };

  return (
    <>
      {!session.snapshot.open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4"
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="选择本批次投稿文章"
            className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-white shadow-xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-5">
              <div>
                <h3 className="text-base font-semibold text-slate-800">
                  选择本批次投稿文章
                </h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  成功生成的文章默认全选。下一步统一进入现有投稿会话，由后台按客户分别复核并入队。
                </p>
              </div>
              <button
                type="button"
                aria-label="关闭批量投稿"
                onClick={onClose}
                className="rounded p-1 text-slate-400 hover:bg-slate-100"
              >
                ×
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {issueFeedback && (
                <div
                  role="alert"
                  className="mb-3 rounded border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900"
                >
                  {issueFeedback}
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-slate-600">
                  已选 {selectedCandidates.length} / {candidates.length} 篇 · {selectedClientCount} 个客户
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedTaskIds(new Set(candidates.map((task) => task.id)))
                    }
                    disabled={selectedCandidates.length === candidates.length}
                    className="rounded border border-slate-300 px-2 py-1 text-xs disabled:opacity-40"
                  >
                    全选
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedTaskIds(new Set())}
                    disabled={!selectedCandidates.length}
                    className="rounded border border-slate-300 px-2 py-1 text-xs disabled:opacity-40"
                  >
                    全不选
                  </button>
                </div>
              </div>
              <div className="mt-3 max-h-80 space-y-1 overflow-y-auto rounded border border-slate-200 p-2">
                {candidates.map((task) => {
                  const clientName = clientNames.get(task.clientId) || task.clientId;
                  return (
                    <label
                      key={task.id}
                      className="flex cursor-pointer items-start gap-3 rounded px-2 py-2 text-xs hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        aria-label={`选择投稿 ${clientName} ${task.articleTitle || task.articleId}`}
                        checked={selectedTaskIds.has(task.id)}
                        onChange={(event) => {
                          const checked = event.target.checked;
                          setSelectedTaskIds((current) => {
                            const next = new Set(current);
                            if (checked) next.add(task.id);
                            else next.delete(task.id);
                            return next;
                          });
                          setIssueFeedback("");
                        }}
                        className="mt-0.5"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-slate-700">
                          {clientName}
                        </span>
                        <span className="mt-0.5 block truncate text-slate-700">
                          {task.articleTitle || `文章 ${task.articleId}`}
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] text-slate-400">
                          {task.platform} · {task.templateId}
                        </span>
                      </span>
                    </label>
                  );
                })}
                {!candidates.length && (
                  <p className="p-3 text-xs text-slate-500">
                    本批次还没有成功生成且可进入投稿选择的文章。
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-slate-200 p-4">
              <p className="text-[11px] text-slate-400">
                不确定结果不会被自动加入重试集合。
              </p>
              <button
                type="button"
                onClick={() => {
                  setIssueFeedback("");
                  session.intents.open(articleRefs);
                }}
                disabled={!articleRefs.length}
                className="rounded bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
              >
                下一步：选择投稿目标
              </button>
            </div>
          </div>
        </div>
      )}
      <SubmissionIntakeDialog
        snapshot={session.snapshot}
        intents={sharedIntents}
        submissionPlatforms={submissionPlatforms}
        favoriteMediaPage={EMPTY_FAVORITE_MEDIA_PAGE}
        availableModes={["regular"]}
      />
    </>
  );
}
