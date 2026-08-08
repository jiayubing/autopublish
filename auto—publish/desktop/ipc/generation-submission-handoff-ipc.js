const { createGenerationSubmissionHandoffService } = require("../services/generation-submission-handoff-service");
const { wrap } = require("../services/ipc-response");

const SAFE_MESSAGES = Object.freeze({
  HANDOFF_INPUT_INVALID: "批次投稿交接输入无效",
  HANDOFF_TARGET_REQUIRED: "请先选择一个投稿目标",
  ACCOUNT_PROFILE_REQUIRED: "请先选择平台账号档案",
  HANDOFF_BATCH_NOT_TERMINAL: "生成批次尚未结束，暂不能交接投稿",
  HANDOFF_TARGET_UNSUPPORTED: "所选投稿目标不支持队列导入",
  HANDOFF_PREVIEW_STALE: "投稿交接预检已过期，请重新检查",
  HANDOFF_CONFIRMATION_REQUIRED: "需要确认投稿交接",
  HANDOFF_ARTICLE_IDENTITY_CONFLICT: "生成文章身份冲突",
  HANDOFF_SERVICE_INVALID: "投稿交接服务不可用"
});

function input(value, commit) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Object.assign(new Error(SAFE_MESSAGES.HANDOFF_INPUT_INVALID), { code: "HANDOFF_INPUT_INVALID" });
  const allowed = commit ? ["generationBatchId", "platformId", "accountProfileId", "previewToken", "confirmed"] : ["generationBatchId", "platformId", "accountProfileId"];
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw Object.assign(new Error(SAFE_MESSAGES.HANDOFF_INPUT_INVALID), { code: "HANDOFF_INPUT_INVALID" });
  const safeId = (candidate) => typeof candidate === "string" && /^[A-Za-z0-9_.:-]{1,200}$/.test(candidate);
  if (!safeId(value.generationBatchId) || !safeId(value.platformId) || !safeId(value.accountProfileId)) {
    throw Object.assign(new Error(SAFE_MESSAGES.HANDOFF_INPUT_INVALID), { code: "HANDOFF_INPUT_INVALID" });
  }
  if (commit && (!safeId(value.previewToken) || value.confirmed !== true)) {
    throw Object.assign(new Error(SAFE_MESSAGES.HANDOFF_INPUT_INVALID), { code: "HANDOFF_INPUT_INVALID" });
  }
  return Object.assign({}, value);
}

function invoke(handler) {
  return wrap(handler).then((result) => {
    if (result.ok) return result;
    const code = result.error && SAFE_MESSAGES[result.error.code] ? result.error.code : "HANDOFF_INPUT_INVALID";
    return { ok: false, error: { code, message: SAFE_MESSAGES[code] } };
  });
}

function safePreview(value) {
  const input = value || {};
  return {
    generationBatchId: input.generationBatchId,
    ...(input.batchRevision !== undefined ? { batchRevision: input.batchRevision } : {}),
    previewToken: input.previewToken,
    articleCount: input.articleCount,
    clientCount: input.clientCount,
    platformId: input.platformId,
    accountProfileId: input.accountProfileId,
    estimatedTaskCount: input.estimatedTaskCount,
    queueableTaskCount: input.queueableTaskCount,
    idempotentCount: input.idempotentCount,
    blockedPublishedCount: input.blockedPublishedCount,
    blockedUncertainCount: input.blockedUncertainCount,
    blockedContentCount: input.blockedContentCount,
    conflictCount: input.conflictCount,
    unavailableArticleCount: input.unavailableArticleCount,
    invalidArticles: Array.isArray(input.invalidArticles) ? input.invalidArticles.map((item) => ({
      clientId: item.clientId,
      ...(item.articleId !== undefined ? { articleId: item.articleId } : {}),
      taskId: item.taskId,
      reasonCode: item.reasonCode,
    })) : [],
    clientGroups: Array.isArray(input.clientGroups) ? input.clientGroups.map((group) => ({
      clientId: group.clientId,
      articleCount: group.articleCount,
      queueableTaskCount: group.queueableTaskCount,
      idempotentCount: group.idempotentCount,
      blockedPublishedCount: group.blockedPublishedCount,
      blockedUncertainCount: group.blockedUncertainCount,
      blockedContentCount: group.blockedContentCount,
      conflictCount: group.conflictCount,
      items: Array.isArray(group.items) ? group.items.map((item) => ({
        articleId: item.articleId,
        targetPlatformId: item.targetPlatformId,
        status: item.status,
        ...(item.reasonCode !== undefined ? { reasonCode: item.reasonCode } : {}),
      })) : [],
    })) : [],
  };
}

function safeResult(value) {
  const input = value || {};
  const result = {
    generationBatchId: input.generationBatchId,
    createdCount: input.createdCount,
    idempotentCount: input.idempotentCount,
    blockedCount: input.blockedCount,
    conflictCount: input.conflictCount,
    failedClientGroups: Array.isArray(input.failedClientGroups) ? input.failedClientGroups.map((item) => ({ clientId: item.clientId, code: item.code })) : [],
    completedClientGroups: Array.isArray(input.completedClientGroups) ? input.completedClientGroups.slice() : [],
    clientGroups: Array.isArray(input.clientGroups) ? input.clientGroups.map((item) => ({
      clientId: item.clientId,
      articleCount: item.articleCount,
      queueableTaskCount: item.queueableTaskCount,
      idempotentCount: item.idempotentCount,
    })) : [],
  };
  if (Array.isArray(input.changedScopes)) result.changedScopes = input.changedScopes.slice();
  return result;
}

function registerGenerationSubmissionHandoffIpc(deps) {
  const values = deps || {};
  const ipcMain = values.ipcMain;
  const service = values.generationSubmissionHandoffService;
  if (!ipcMain || typeof ipcMain.handle !== "function" || !service) throw new Error("Generation submission handoff IPC dependencies are required");
  ipcMain.handle("content:preview-generation-submission-handoff", function(event, value) { return invoke(function() { return safePreview(service.preview(input(value, false))); }); });
  ipcMain.handle("content:commit-generation-submission-handoff", function(event, value) { return invoke(function() {
    const result = service.commit(input(value, true));
    if (typeof values.invalidateData === "function" && result) values.invalidateData("GENERATION_SUBMISSION_HANDOFF_COMMITTED");
    return safeResult(result);
  }); });
  return { service };
}

module.exports = { registerGenerationSubmissionHandoffIpc, SAFE_MESSAGES, safePreview, safeResult };
