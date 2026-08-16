"use strict";

const TYPED_PLATFORM_OUTCOMES = Object.freeze([
  "accepted",
  "article_rejected",
  "group_blocked",
  "uncertain",
]);
const PLATFORM_RESULT_STATUSES = Object.freeze([
  ...TYPED_PLATFORM_OUTCOMES,
  "failed",
  "skipped",
]);

function typedPlatformOutcome(value) {
  return typeof value === "string" && TYPED_PLATFORM_OUTCOMES.includes(value)
    ? value
    : null;
}

function safeErrorCode(value, fallback) {
  const candidate =
    typeof value === "string"
      ? value
      : value && typeof value.code === "string"
        ? value.code
        : null;
  return candidate && /^[A-Z0-9_.:-]{1,128}$/.test(candidate)
    ? candidate
    : fallback;
}

function projectTask(value) {
  const task = value || {};
  return {
    sourcePlatformId: String(task.sourcePlatformId || ""),
    filename: String(task.filename || ""),
    targetPlatformId: String(task.targetPlatformId || ""),
  };
}

function projectTerminalResult(value) {
  if (!value || typeof value !== "object") return null;
  return {
    ok: Number.isSafeInteger(value.ok) && value.ok >= 0 ? value.ok : 0,
    fail: Number.isSafeInteger(value.fail) && value.fail >= 0 ? value.fail : 0,
    skipped:
      Number.isSafeInteger(value.skipped) && value.skipped >= 0
        ? value.skipped
        : 0,
    uncertain:
      Number.isSafeInteger(value.uncertain) && value.uncertain >= 0
        ? value.uncertain
        : 0,
    results: (Array.isArray(value.results) ? value.results : []).map((item) => ({
      task: projectTask(item && item.task),
      status: String((item && item.status) || "failed"),
      publicationStatus:
        item && typeof item.publicationStatus === "string"
          ? item.publicationStatus
          : null,
      errorCode: safeErrorCode(item && item.error, null),
    })),
  };
}

function projectPlatformSnapshot(value) {
  const input = value || {};
  const integer = (candidate) =>
    Number.isSafeInteger(candidate) && candidate >= 0 ? candidate : 0;
  return {
    workspaceRuntimeId:
      typeof input.workspaceRuntimeId === "string" &&
      /^[A-Za-z0-9._:-]{1,256}$/.test(input.workspaceRuntimeId)
        ? input.workspaceRuntimeId
        : "runtime-unavailable",
    runId: typeof input.runId === "string" && input.runId ? input.runId : null,
    phase: typeof input.phase === "string" && input.phase ? input.phase : "idle",
    total: integer(input.total),
    processed: integer(input.processed),
    succeeded: integer(input.succeeded),
    failed: integer(input.failed),
    skipped: integer(input.skipped),
    uncertain: integer(input.uncertain),
    currentTask: input.currentTask ? projectTask(input.currentTask) : null,
    nextTask: input.nextTask ? projectTask(input.nextTask) : null,
    waitRemainingMs: integer(input.waitRemainingMs),
    startedAt: typeof input.startedAt === "string" ? input.startedAt : null,
    updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : null,
    terminalResult: projectTerminalResult(input.terminalResult),
    isBatchRunning: input.isBatchRunning === true,
    isStopPending: input.isStopPending === true,
    isPlatformRunning: input.isPlatformRunning === true,
    queueRevision:
      Number.isSafeInteger(input.queueRevision) && input.queueRevision >= 0
        ? input.queueRevision
        : null,
  };
}

function projectPlatformQueue(value) {
  const input = value || {};
  const result = {
    platforms: (Array.isArray(input.platforms) ? input.platforms : []).map(
      (platform) => ({
        id: String((platform && platform.id) || ""),
        displayName: String((platform && platform.displayName) || ""),
        loginAvailable: platform && platform.loginAvailable === true,
      }),
    ),
    queue: (Array.isArray(input.queue) ? input.queue : []).map((article) => ({
      filename: String((article && article.filename) || ""),
      title: String((article && article.title) || ""),
      platformId: String((article && article.platformId) || ""),
      sourcePlatformId: String((article && article.sourcePlatformId) || ""),
      sourceArticleState:
        article && typeof article.sourceArticleState === "string"
          ? article.sourceArticleState
          : null,
      reasonCode:
        article && typeof article.reasonCode === "string"
          ? article.reasonCode
          : null,
      accountProfileId: String((article && article.accountProfileId) || ""),
      archiveErrorCode:
        article && article.archiveError
          ? safeErrorCode(article.archiveError, "ARCHIVE_FAILED")
          : null,
      remoteStatus: typedPlatformOutcome(article && article.remoteStatus),
    })),
  };
  if (Number.isSafeInteger(input.revision) && input.revision >= 0)
    result.revision = input.revision;
  return result;
}

module.exports = {
  TYPED_PLATFORM_OUTCOMES,
  PLATFORM_RESULT_STATUSES,
  projectPlatformQueue,
  projectPlatformSnapshot,
};
