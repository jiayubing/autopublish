"use strict";
const { parsePublishOutcome } = require("../../src/domain/publisher-contract");
const { publicationTargetKey } = require("../../src/domain/publication-target");

function safeError(code, category, retryability, userMessage) {
  return { code, category, retryability, userMessage };
}

function createWorkerPublisher(options) {
  const value = options || {};
  if (!value.taskService || typeof value.inspectAccount !== "function")
    throw new Error("Worker publisher dependencies are required");
  const tasksByAttempt = new Map();
  let stopRequested = false;
  function taskForInput(input) {
    if (typeof value.taskForInput === "function") return value.taskForInput(input);
    const task = tasksByAttempt.get(input && input.attemptId);
    if (!task) throw new Error("Worker task is not registered for publication attempt");
    return task;
  }
  async function inspectRegisteredAccount() {
    if (tasksByAttempt.size !== 1) return { verified: false };
    const task = tasksByAttempt.values().next().value;
    try { return await value.inspectAccount(task); } catch (_) { return { verified: false }; }
  }
  function isStopRequested() {
    if (stopRequested) return true;
    if (typeof value.taskService.isStopRequested === "function")
      return value.taskService.isStopRequested() === true;
    if (typeof value.taskService.getState !== "function") return false;
    try {
      const state = value.taskService.getState() || {};
      if (state.isStopPending === true || ["stopping", "stopped"].includes(state.phase)) return true;
      const terminal = state.terminalResult;
      return Boolean(
        terminal &&
        Array.isArray(terminal.results) &&
        terminal.results.some((item) => item && item.error === "STOP_REQUESTED"),
      );
    } catch (_) {
      return false;
    }
  }
  return Object.freeze({
    registerAttempt: function(attemptId, task) {
      if (typeof attemptId !== "string" || !attemptId || !task || typeof task !== "object") throw new Error("Worker publication task is invalid");
      if (tasksByAttempt.has(attemptId)) throw new Error("Worker publication attempt is already registered");
      if (!tasksByAttempt.size) stopRequested = false;
      tasksByAttempt.set(attemptId, Object.freeze(Object.assign({}, task)));
    },
    unregisterAttempt: function(attemptId) { tasksByAttempt.delete(attemptId); },
    inspectAccount: inspectRegisteredAccount,
    isStopRequested,
    publish: async function(input) {
      if (typeof value.taskService.startPlatformSubmit !== "function")
        return { status: "uncertain", error: safeError("WORKER_PUBLISH_UNAVAILABLE", "internal", "manual-check", "投稿执行器不可用") };
      const task = taskForInput(input);
      const result = await value.taskService.startPlatformSubmit({ tasks: [task] });
      if (result && result.errorCode === "STOP_REQUESTED") stopRequested = true;
      const item = result && result.ok && result.data && Array.isArray(result.data.results) ? result.data.results[0] : null;
      const raw = item && item.outcome;
      if (raw && raw.errorCode === "STOP_REQUESTED") stopRequested = true;
      if (!raw) return { status: "uncertain", error: safeError("WORKER_RESULT_MISSING", "transport", "manual-check", "无法确认远端投稿结果") };
      if (raw.status === "accepted" && typeof raw.remoteId === "string" && raw.remoteId) {
        const target = { kind: "platform", platformId: task.targetPlatformId, accountProfileId: task.accountProfileId };
        const evidence = {
          articleId: input.articleId,
          attemptId: input.attemptId,
          targetKey: publicationTargetKey(target),
          accountProfileId: task.accountProfileId,
          remoteId: raw.remoteId,
          ...(typeof raw.remoteUrl === "string" ? { remoteUrl: raw.remoteUrl } : {}),
        };
        try { return parsePublishOutcome({ status: "accepted", evidence }, Object.assign({}, input, { version: 1, target })); } catch (_) {}
      }
      if (raw.status === "article_rejected" || raw.status === "group_blocked")
        return { status: raw.status, error: safeError(raw.errorCode || "PUBLISHER_REJECTED", "remote", "safe", "远端未接受投稿") };
      return { status: "uncertain", error: safeError(raw.errorCode || "PUBLISHER_EVIDENCE_REQUIRED", "remote", "manual-check", "无法确认远端投稿结果") };
    },
  });
}

module.exports = { createWorkerPublisher };
