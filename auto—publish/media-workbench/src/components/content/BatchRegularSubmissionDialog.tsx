import React, { useEffect, useMemo, useState } from "react";
import type { ContentClient } from "../../types/content";
import type { GenerationBatch, GenerationBatchTask } from "../../types/generation";
import type { ContentSubmissionPlatform } from "../../types/publication";
import {
  admitRegularQueueItems,
  previewRegularQueueAdmission,
} from "../../bridge/content";
import { useConfirmation } from "../../confirmation";
import { usePlatformFeature } from "../../features/platform/platform-feature-context";
import {
  admitBatchRegularSubmission,
  previewBatchRegularSubmission,
} from "../../features/submission/batch-regular-submission-coordinator.js";
import AccountProfileSelector from "./AccountProfileSelector";

const REGULAR_TARGET_PREFERENCE_KEY =
  "auto-publish:regular-submission-target";

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

function loadTargetPreference() {
  if (typeof localStorage === "undefined")
    return { platformId: "", accountProfileId: "" };
  try {
    const value = JSON.parse(
      localStorage.getItem(REGULAR_TARGET_PREFERENCE_KEY) || "null",
    ) as { platformId?: unknown; accountProfileId?: unknown } | null;
    return {
      platformId:
        typeof value?.platformId === "string" ? value.platformId : "",
      accountProfileId:
        typeof value?.accountProfileId === "string"
          ? value.accountProfileId
          : "",
    };
  } catch (_) {
    return { platformId: "", accountProfileId: "" };
  }
}

function saveTargetPreference(platformId: string, accountProfileId: string) {
  if (typeof localStorage === "undefined") return;
  try {
    if (!platformId) {
      localStorage.removeItem(REGULAR_TARGET_PREFERENCE_KEY);
      return;
    }
    localStorage.setItem(
      REGULAR_TARGET_PREFERENCE_KEY,
      JSON.stringify({ platformId, accountProfileId }),
    );
  } catch (_) {
    // Target memory is optional; admission remains available.
  }
}

function messageOf(value: unknown, fallback: string) {
  return value instanceof Error && value.message ? value.message : fallback;
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
  const [platformId, setPlatformId] = useState("");
  const [accountProfileId, setAccountProfileId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    if (!open) return;
    const preference = loadTargetPreference();
    setSelectedTaskIds(new Set(candidates.map((task) => task.id)));
    setPlatformId(preference.platformId);
    setAccountProfileId(preference.accountProfileId);
    setBusy(false);
    setError("");
    setFeedback("");
    void feature.refreshQueue("batch-submission-open").catch(() => undefined);
    void feature
      .refreshAccountProfiles("batch-submission-open")
      .catch(() => undefined);
  }, [batch.id, candidates, feature, open]);

  useEffect(() => {
    if (!open) return;
    const valid = submissionPlatforms.some(
      (platform) => platform.id === platformId,
    );
    if (valid) return;
    if (submissionPlatforms.length === 1) {
      const onlyPlatformId = submissionPlatforms[0].id;
      setPlatformId(onlyPlatformId);
      setAccountProfileId("");
      saveTargetPreference(onlyPlatformId, "");
      return;
    }
    if (platformId || accountProfileId) {
      setPlatformId("");
      setAccountProfileId("");
      saveTargetPreference("", "");
    }
  }, [
    accountProfileId,
    open,
    platformId,
    submissionPlatforms,
  ]);

  if (!open) return null;

  const selectedCandidates = candidates.filter((task) =>
    selectedTaskIds.has(task.id),
  );
  const selectedClientCount = new Set(
    selectedCandidates.map((task) => task.clientId),
  ).size;

  function toggleTask(taskId: string, checked: boolean) {
    setSelectedTaskIds((current) => {
      const next = new Set(current);
      if (checked) next.add(taskId);
      else next.delete(taskId);
      return next;
    });
    setError("");
    setFeedback("");
  }

  function changePlatform(nextPlatformId: string) {
    setPlatformId(nextPlatformId);
    setAccountProfileId("");
    saveTargetPreference(nextPlatformId, "");
    setError("");
    setFeedback("");
  }

  function changeAccount(nextAccountProfileId: string) {
    setAccountProfileId(nextAccountProfileId);
    saveTargetPreference(platformId, nextAccountProfileId);
    setError("");
    setFeedback("");
  }

  async function submit() {
    if (
      busy ||
      !selectedCandidates.length ||
      !platformId ||
      !accountProfileId
    )
      return;
    const articleRefs = selectedCandidates.map((task) => ({
      clientId: task.clientId,
      articleId: task.articleId,
    }));
    setBusy(true);
    setError("");
    setFeedback("");
    try {
      const preview = await previewBatchRegularSubmission(
        { articleRefs, platformId, accountProfileId },
        { previewRegularQueueAdmission },
      );
      if (!preview.queueableCount && !preview.idempotentCount)
        throw new Error("所选文章没有可加入普通投稿队列的项目。");
      const accepted = await confirm({
        title: "确认批量投稿",
        message:
          `将对 ${preview.clientCount} 个客户的 ${preview.articleCount} 篇文章发起投稿：新增 ${preview.queueableCount} 项，已存在跳过 ${preview.idempotentCount} 项，缺失 ${preview.missingCount} 项，冲突 ${preview.conflictCount} 项。系统会按客户自动拆分提交并请求自动开始；已手动暂停的已有队列不会被恢复。`,
        confirmLabel: "确认批量投稿",
      });
      if (!accepted) return;

      const result = await admitBatchRegularSubmission(
        { articleRefs, platformId, accountProfileId },
        { admitRegularQueueItems },
      );
      void feature
        .refreshRegularQueueGroups("batch-submission-commit")
        .catch(() => undefined);
      void feature.refreshQueue("batch-submission-commit").catch(() => undefined);

      if (result.failures.length) {
        const failedClients = new Set(result.failedClientIds);
        setSelectedTaskIds(
          new Set(
            selectedCandidates
              .filter((task) => failedClients.has(task.clientId))
              .map((task) => task.id),
          ),
        );
        setFeedback(
          `已成功处理 ${result.succeededClientIds.length} 个客户，加入 ${result.admittedCount} 项，已存在跳过 ${result.idempotentCount} 项。`,
        );
        setError(
          `${result.failures.length} 个客户提交失败，已仅保留这些客户的文章勾选，可直接重试。首个错误：${result.failures[0].message}`,
        );
        return;
      }

      onCommitted?.({
        admittedCount: result.admittedCount,
        idempotentCount: result.idempotentCount,
        clientCount: result.succeededClientIds.length,
      });
      onClose();
    } catch (value) {
      setError(messageOf(value, "批量投稿失败"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="批量投稿本批次文章"
        className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-5">
          <div>
            <h3 className="text-base font-semibold text-slate-800">
              批量投稿本批次文章
            </h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              成功文章默认全选；可取消不想投稿的文章。提交时会自动按客户拆分，不会把跨客户文章塞进同一个 admission。
            </p>
          </div>
          <button
            type="button"
            aria-label="关闭批量投稿"
            onClick={onClose}
            disabled={busy}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-40"
          >
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
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
                disabled={busy || selectedCandidates.length === candidates.length}
                className="rounded border border-slate-300 px-2 py-1 text-xs disabled:opacity-40"
              >
                全选
              </button>
              <button
                type="button"
                onClick={() => setSelectedTaskIds(new Set())}
                disabled={busy || !selectedCandidates.length}
                className="rounded border border-slate-300 px-2 py-1 text-xs disabled:opacity-40"
              >
                全不选
              </button>
            </div>
          </div>

          <div className="mt-3 max-h-72 space-y-1 overflow-y-auto rounded border border-slate-200 p-2">
            {candidates.map((task) => {
              const clientName = clientNames.get(task.clientId) || task.clientId;
              return (
                <label
                  key={task.id}
                  className="flex cursor-pointer items-start gap-3 rounded px-2 py-2 text-xs hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    aria-label={`选择投稿 ${clientName} ${task.articleId}`}
                    checked={selectedTaskIds.has(task.id)}
                    onChange={(event) =>
                      toggleTask(task.id, event.target.checked)
                    }
                    disabled={busy}
                    className="mt-0.5"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-slate-700">
                      {clientName}
                    </span>
                    <span className="mt-0.5 block truncate text-slate-500">
                      {task.platform} · {task.templateId}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-slate-400">
                      文章 {task.articleId}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>

          <div className="mt-4 grid gap-3">
            <label className="grid gap-1 text-xs text-slate-600">
              投稿平台
              <select
                aria-label="批量投稿平台"
                value={platformId}
                onChange={(event) => changePlatform(event.target.value)}
                disabled={busy}
                className="h-9 rounded border border-slate-300 px-2 text-sm"
              >
                <option value="">请选择平台</option>
                {submissionPlatforms.map((platform) => (
                  <option key={platform.id} value={platform.id}>
                    {platform.displayName || platform.id}
                  </option>
                ))}
              </select>
            </label>
            <AccountProfileSelector
              platforms={submissionPlatforms}
              platformId={platformId}
              value={accountProfileId}
              onChange={changeAccount}
            />
          </div>

          {feedback && (
            <div
              role="status"
              className="mt-4 rounded border border-emerald-100 bg-emerald-50 p-2 text-xs text-emerald-700"
            >
              {feedback}
            </div>
          )}
          {error && (
            <div
              role="alert"
              className="mt-3 rounded border border-rose-100 bg-rose-50 p-2 text-xs text-rose-700"
            >
              {error}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4">
          <p className="text-[11px] text-slate-500">
            登录和账号绑定仍统一在“设置 → 平台账号”维护。
          </p>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={
              busy ||
              !selectedCandidates.length ||
              !platformId ||
              !accountProfileId
            }
            className="rounded bg-blue-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40"
          >
            {busy ? "处理中…" : `检查并投稿（${selectedCandidates.length}）`}
          </button>
        </div>
      </div>
    </div>
  );
}
