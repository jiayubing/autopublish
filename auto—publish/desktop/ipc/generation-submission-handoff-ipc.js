const { createArticleStore } = require("../../src/content/article-store");
const { createGenerationSubmissionHandoffService } = require("../services/generation-submission-handoff-service");
const { wrap } = require("../services/ipc-response");

const SAFE_MESSAGES = Object.freeze({
  HANDOFF_INPUT_INVALID: "批次投稿交接输入无效",
  HANDOFF_TARGET_REQUIRED: "请至少选择一个投稿目标",
  HANDOFF_BATCH_NOT_TERMINAL: "生成批次尚未结束，暂不能交接投稿",
  HANDOFF_TARGET_UNSUPPORTED: "所选投稿目标不支持队列导入",
  HANDOFF_PREVIEW_STALE: "投稿交接预检已过期，请重新检查",
  HANDOFF_CONFIRMATION_REQUIRED: "需要确认投稿交接",
  HANDOFF_ARTICLE_IDENTITY_CONFLICT: "生成文章身份冲突",
  HANDOFF_SERVICE_INVALID: "投稿交接服务不可用"
});

function input(value, commit) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Object.assign(new Error(SAFE_MESSAGES.HANDOFF_INPUT_INVALID), { code: "HANDOFF_INPUT_INVALID" });
  const allowed = commit ? ["generationBatchId", "targetPlatformIds", "previewToken", "confirmed"] : ["generationBatchId", "targetPlatformIds"];
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw Object.assign(new Error(SAFE_MESSAGES.HANDOFF_INPUT_INVALID), { code: "HANDOFF_INPUT_INVALID" });
  const safeId = (candidate) => typeof candidate === "string" && /^[A-Za-z0-9_.:-]{1,200}$/.test(candidate);
  if (!safeId(value.generationBatchId) || !Array.isArray(value.targetPlatformIds) || value.targetPlatformIds.some((target) => !safeId(target))) {
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

function registerGenerationSubmissionHandoffIpc(deps) {
  const values = deps || {};
  const ipcMain = values.ipcMain;
  const service = values.generationSubmissionHandoffService || createGenerationSubmissionHandoffService({
    generationBatchService: values.contentGenerationBatchService,
    contentSubmissionService: values.contentSubmissionService,
    articleStore: values.articleStore || createArticleStore(values.rootDir, { paths: values.paths })
  });
  if (!ipcMain || typeof ipcMain.handle !== "function" || !service) throw new Error("Generation submission handoff IPC dependencies are required");
  ipcMain.handle("content:preview-generation-submission-handoff", function(event, value) { return invoke(function() { return service.preview(input(value, false)); }); });
  ipcMain.handle("content:commit-generation-submission-handoff", function(event, value) { return invoke(function() {
    const result = service.commit(input(value, true));
    if (typeof values.invalidateData === "function" && result && Array.isArray(result.changedScopes)) values.invalidateData(result.changedScopes, "GENERATION_SUBMISSION_HANDOFF_COMMITTED");
    return result;
  }); });
  return { service };
}

module.exports = { registerGenerationSubmissionHandoffIpc, SAFE_MESSAGES };
