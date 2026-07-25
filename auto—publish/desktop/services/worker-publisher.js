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
  return Object.freeze({
    registerAttempt: function(attemptId, task) {
      if (typeof attemptId !== "string" || !attemptId || !task || typeof task !== "object") throw new Error("Worker publication task is invalid");
      if (tasksByAttempt.has(attemptId)) throw new Error("Worker publication attempt is already registered");
      tasksByAttempt.set(attemptId, Object.freeze(Object.assign({}, task)));
    },
    unregisterAttempt: function(attemptId) { tasksByAttempt.delete(attemptId); },
    inspectAccount: inspectRegisteredAccount,
    publish: async function(input) {
      if (typeof value.taskService.startPlatformSubmit !== "function")
        return { status: "uncertain", error: safeError("WORKER_PUBLISH_UNAVAILABLE", "internal", "manual-check", "投稿执行器不可用") };
      const task = taskForInput(input);
      const result = await value.taskService.startPlatformSubmit({ tasks: [task] });
      const item = result && result.ok && result.data && Array.isArray(result.data.results) ? result.data.results[0] : null;
      const raw = item && item.outcome;
      if (!raw) return { status: "uncertain", error: safeError("WORKER_RESULT_MISSING", "transport", "manual-check", "无法确认远端投稿结果") };
      if (raw.status === "failed") return { status: "failed", error: safeError(raw.errorCode || "PUBLISHER_REJECTED", "remote", "safe", "远端拒绝投稿") };
      if ((raw.status === "published" || raw.status === "submitted") && typeof raw.remoteId === "string" && raw.remoteId) {
        const target = { kind: "platform", platformId: task.targetPlatformId, accountProfileId: task.accountProfileId };
        const evidence = {
          articleId: input.articleId,
          attemptId: input.attemptId,
          targetKey: publicationTargetKey(target),
          accountProfileId: task.accountProfileId,
          remoteId: raw.remoteId,
          ...(raw.status === "published" && typeof raw.remoteUrl === "string" ? { remoteUrl: raw.remoteUrl } : {}),
        };
        try { return parsePublishOutcome({ status: raw.status, evidence }, Object.assign({}, input, { version: 1, target })); } catch (_) {}
      }
      return { status: "uncertain", error: safeError(raw.errorCode || "PUBLISHER_EVIDENCE_REQUIRED", "remote", "manual-check", "无法确认远端投稿结果") };
    },
  });
}

module.exports = { createWorkerPublisher };
