const {
  arrayField,
  defineContract,
  enumField,
  exactObject,
  integerField,
  literalField,
  multilineStringField,
  nullableField,
  optionalField,
  stringField,
} = require("./registry");

const id = stringField({ min: 1, max: 200, pattern: /^[A-Za-z0-9_.:-]+$/u });
const clientIdentity = stringField({
  max: 200,
  pattern: /^(?!\.{1,2}$)(?!.*[\\/])(?=\S)[^\x00-\x1f\x7f]*\S$/u,
});
const safeText = (max, min = 0) => stringField({ min, max, pattern: /^[^\x00-\x1f\x7f\\/]*$/u });
const contentText = (max, min = 0) => multilineStringField({ min, max });
const code = stringField({ min: 1, max: 128, pattern: /^[A-Z][A-Z0-9_]*$/u });
const count = integerField({ min: 0, max: 100000 });
const revision = integerField({ min: 0, max: Number.MAX_SAFE_INTEGER });
const emptyRequest = exactObject({});
const noArgs = () => ({});
const noLegacyInput = () => [undefined];
const directArgs = (args) => args[0] || {};
const directInput = (payload) => [payload];

const platform = exactObject({ id, displayName: safeText(200, 1), contentQueueImport: "boolean" });
const accountBinding = exactObject({ platformId: id, accountProfileId: id });
const batchItem = exactObject({
  itemId: optionalField(id),
  articleId: id,
  targetPlatformId: id,
  accountProfileId: optionalField(id),
  filename: optionalField(safeText(255, 1)),
  contentHash: optionalField(id),
  status: safeText(64, 1),
  revision: optionalField(revision),
  publicationId: optionalField(nullableField(id)),
  attemptId: optionalField(nullableField(id)),
  reasonCode: optionalField(nullableField(code)),
  reasonCodes: optionalField(arrayField(code, { max: 100 })),
  reasons: optionalField(arrayField(safeText(500, 1), { max: 100 })),
  cleanable: optionalField("boolean"),
  allowed: optionalField("boolean"),
  fingerprint: optionalField(id),
  repairAction: optionalField(nullableField(enumField(["cancel", "cleanup", "cleanupPublishedLocal", "cleanupCancelledLocal"]))),
  evaluationFingerprint: optionalField(nullableField(id)),
  action: optionalField(enumField(["cancel", "cleanup", "cleanupPublishedLocal", "cleanupCancelledLocal"])),
  resultStatus: optionalField(safeText(64, 1)),
});
const batch = exactObject({
  id,
  batchId: optionalField(id),
  clientId: nullableField(clientIdentity),
  status: safeText(64, 1),
  revision: optionalField(revision),
  createdAt: optionalField(safeText(64, 1)),
  updatedAt: optionalField(safeText(64, 1)),
  items: arrayField(batchItem, { max: 10000 }),
});
const batchPreview = exactObject({
  clientId: clientIdentity,
  articleIds: arrayField(id, { min: 1, max: 1000 }),
  targetPlatformIds: arrayField(id, { min: 1, max: 32 }),
  totalTaskCount: count,
  queueableTaskCount: count,
  idempotentCount: count,
  alreadyQueuedCount: optionalField(count),
  blockedPublishedCount: optionalField(count),
  blockedUncertainCount: optionalField(count),
  blockedContentCount: count,
  conflictCount: count,
  ineligibleArticleIds: optionalField(arrayField(id, { max: 1000 })),
  unreviewedArticleIds: optionalField(arrayField(id, { max: 1000 })),
  missingArticleIds: arrayField(id, { max: 1000 }),
  unsupportedPlatformIds: arrayField(id, { max: 32 }),
  items: arrayField(batchItem, { max: 32000 }),
});
const exportPreview = exactObject({
  filename: safeText(255, 1),
  targetPlatform: id,
  contentHash: id,
  markdown: contentText(1000000),
  status: enumField(["queueable", "idempotent", "conflict"]),
});
const exportResult = exactObject({
  filename: safeText(255, 1),
  targetPlatform: id,
  contentHash: id,
  markdown: contentText(1000000),
  status: enumField(["queueable", "idempotent"]),
  idempotent: "boolean",
});
const batchCreation = exactObject({
  batchId: id,
  clientId: clientIdentity,
  createdCount: count,
  idempotentCount: count,
  queueableTaskCount: count,
  alreadyQueuedCount: count,
  blockedContentCount: count,
  conflictCount: count,
  missingArticleIds: arrayField(id, { max: 1000 }),
  unsupportedPlatformIds: arrayField(id, { max: 32 }),
  items: arrayField(batchItem, { max: 32000 }),
});
const changedScopes = arrayField(safeText(64, 1), { max: 32 });
const cancelPreview = exactObject({ batchId: id, planId: id, allowedCount: count, blockedCount: count, items: arrayField(batchItem, { max: 10000 }) });
const cancelResult = exactObject({ batchId: id, planId: id, cancelledCount: count, idempotentCount: count, skippedCount: count, batchStatus: safeText(64, 1), changedScopes, blockedItems: optionalField(arrayField(batchItem, { max: 10000 })), items: arrayField(batchItem, { max: 10000 }) });
const cleanupPreview = exactObject({ batchId: id, cleanableCount: count, uncleanableCount: count, items: arrayField(batchItem, { max: 10000 }) });
const cleanupResult = exactObject({ batchId: id, cleanedCount: count, skippedCount: count, items: arrayField(batchItem, { max: 10000 }) });
const retryPreview = exactObject({
  publicationId: nullableField(id), requiresConfirmation: "boolean", eligible: optionalField("boolean"),
  reasonCode: optionalField(nullableField(code)), clientId: optionalField(clientIdentity), articleId: optionalField(id),
  targetPlatformId: optionalField(id), titleSnapshot: optionalField(safeText(500, 1)), failureCount: optionalField(count),
  message: optionalField(safeText(1000, 1)), queueableTaskCount: optionalField(count),
  idempotentCount: optionalField(count), conflictCount: optionalField(count),
});
const retryResult = exactObject({ batchId: id, publicationId: id, attemptId: nullableField(id), clientId: clientIdentity, articleId: id, targetPlatformId: id, changedScopes });
const residueItem = exactObject({
  itemId: optionalField(id), articleId: optionalField(id), publicationId: optionalField(id),
  targetPlatformId: optionalField(id), status: safeText(64, 1), reasonCode: nullableField(code),
  repairAction: optionalField(nullableField(enumField(["cancel", "cleanup", "cleanupPublishedLocal", "cleanupCancelledLocal"]))),
  evaluationFingerprint: optionalField(nullableField(id)), action: optionalField(enumField(["cancel", "cleanup", "cleanupPublishedLocal", "cleanupCancelledLocal"])),
  resultStatus: optionalField(safeText(64, 1)),
});
const residuePreview = exactObject({ items: arrayField(residueItem, { max: 10000 }), cleanableItems: arrayField(residueItem, { max: 10000 }), reportedItems: arrayField(residueItem, { max: 10000 }), cleanableCount: count, reportedCount: count });
const residueResult = exactObject({ status: enumField(["failed", "completed", "no-op"]), cleanedCount: count, failedCount: count, remainingCount: count, cleanableCount: count, reportedCount: count, items: arrayField(residueItem, { max: 10000 }), remainingItems: arrayField(residueItem, { max: 10000 }) });

const COMMON_ERRORS = Object.freeze({
  AUTH_REQUIRED: { category: "authentication", retryability: "never", userMessage: "请先完成登录后再继续。" },
  IPC_REQUEST_INVALID: { category: "validation", retryability: "never", userMessage: "投稿请求无效，请刷新后重试。" },
  IPC_RESULT_INVALID: { category: "internal", retryability: "manual-check", userMessage: "投稿结果未通过安全校验，请刷新后重试。" },
  IPC_INTERNAL: { category: "internal", retryability: "manual-check", userMessage: "投稿操作未能安全完成，请检查诊断信息。" },
  CONTENT_EXPORT_CONFIRMATION_REQUIRED: { category: "validation", retryability: "never", userMessage: "请确认导出后继续。" },
  CONTENT_EXPORT_TARGET_INVALID: { category: "validation", retryability: "never", userMessage: "投稿目标无效。" },
  CONTENT_EXPORT_NOT_READY: { category: "conflict", retryability: "manual-check", userMessage: "文章尚未满足投稿条件。" },
  CONTENT_EXPORT_CONFLICT: { category: "conflict", retryability: "manual-check", userMessage: "投稿队列中存在冲突副本。" },
  CONTENT_SUBMISSION_BATCH_INPUT_INVALID: { category: "validation", retryability: "never", userMessage: "投稿批次请求无效。" },
  CONTENT_SUBMISSION_INPUT_INVALID: { category: "validation", retryability: "never", userMessage: "投稿操作请求无效。" },
  CONTENT_SUBMISSION_CONFIRMATION_REQUIRED: { category: "validation", retryability: "never", userMessage: "请确认投稿操作后继续。" },
  ACCOUNT_PROFILE_REQUIRED: { category: "validation", retryability: "never", userMessage: "请为每个投稿平台选择账号。" },
  CONTENT_SUBMISSION_ARTICLE_NOT_FOUND: { category: "validation", retryability: "never", userMessage: "所选文章不存在。" },
  SUBMISSION_ACTION_PLAN_INVALID: { category: "conflict", retryability: "safe", userMessage: "操作预检已失效，请重新预检。" },
  SUBMISSION_ACTION_STALE: { category: "conflict", retryability: "safe", userMessage: "投稿状态已变化，请重新预检。" },
  PUBLICATION_RETRY_REQUIRES_WORKFLOW: { category: "conflict", retryability: "manual-check", userMessage: "请从失败投稿工作流发起重试。" },
  ARTICLE_ATTENTION_STALE: { category: "conflict", retryability: "safe", userMessage: "投稿状态已变化，请重新预检。" },
});
const errorCodes = Object.freeze(Object.keys(COMMON_ERRORS));
function contract(input) { return defineContract({ feature: "content", ...input, errorCodes, errors: COMMON_ERRORS }); }

function bindingsFromMap(value) {
  const map = value && value.accountProfiles;
  if (!map || typeof map !== "object" || Array.isArray(map)) return [];
  return Object.keys(map).map((platformId) => ({ platformId, accountProfileId: map[platformId] }));
}
function batchRequestFromArgs(args) {
  const value = args[0] || {};
  const output = { ...value, accountBindings: bindingsFromMap(value) };
  delete output.accountProfiles;
  return output;
}
function batchRequestToArgs(payload) {
  const output = { ...payload, accountProfiles: {} };
  for (const binding of payload.accountBindings || []) output.accountProfiles[binding.platformId] = binding.accountProfileId;
  delete output.accountBindings;
  return [output];
}
const batchSelectionFields = {
  clientId: clientIdentity,
  articleIds: arrayField(id, { min: 1, max: 1000 }),
  targetPlatformIds: arrayField(id, { min: 1, max: 32 }),
  accountBindings: arrayField(accountBinding, { min: 1, max: 32 }),
};
const exportRequest = exactObject({ clientId: clientIdentity, generatedArticleId: id, targetPlatform: id, mediaResourceId: optionalField(id), confirmed: literalField(true) });
const batchSelectionRequest = exactObject(batchSelectionFields);
const createBatchRequest = exactObject({ ...batchSelectionFields, confirmed: literalField(true) });
const listBatchesRequest = exactObject({ clientId: optionalField(clientIdentity) });

const submissionContracts = Object.freeze([
  contract({ capability: "content.previewExport", channel: "content:preview-export", kind: "query", request: exportRequest, success: exportPreview, fromArgs: directArgs, toArgs: directInput }),
  contract({ capability: "content.previewSubmissionBatch", channel: "content:preview-submission-batch", kind: "query", request: batchSelectionRequest, success: batchPreview, fromArgs: batchRequestFromArgs, toArgs: batchRequestToArgs }),
  contract({ capability: "content.listSubmissionPlatforms", channel: "content:list-submission-platforms", kind: "query", request: emptyRequest, success: exactObject({ platforms: arrayField(platform, { max: 32 }) }), fromArgs: noArgs, toArgs: noLegacyInput }),
  contract({ capability: "content.exportArticle", channel: "content:export-article", kind: "command", request: exportRequest, success: exportResult, fromArgs: directArgs, toArgs: directInput }),
  contract({ capability: "content.createSubmissionBatch", channel: "content:create-submission-batch", kind: "command", request: createBatchRequest, success: batchCreation, fromArgs: batchRequestFromArgs, toArgs: batchRequestToArgs }),
  contract({ capability: "content.cancelSubmissionBatch", channel: "content:cancel-submission-batch", kind: "command", request: exactObject({ batchId: id, planId: id, confirmed: literalField(true) }), success: cancelResult, fromArgs: directArgs, toArgs: directInput }),
  contract({ capability: "content.previewCleanupFailedSubmissionItems", channel: "content:preview-cleanup-failed-submission-items", kind: "query", request: exactObject({ batchId: id }), success: cleanupPreview, fromArgs: directArgs, toArgs: directInput }),
  contract({ capability: "content.cleanupFailedSubmissionItems", channel: "content:cleanup-failed-submission-items", kind: "command", request: exactObject({ batchId: id, confirmed: literalField(true) }), success: cleanupResult, fromArgs: directArgs, toArgs: directInput }),
  contract({ capability: "content.previewTrashedArticleQueueResidue", channel: "content:preview-trashed-article-queue-residue", kind: "query", request: emptyRequest, success: residuePreview, fromArgs: noArgs, toArgs: noLegacyInput }),
  contract({ capability: "content.cleanupTrashedArticleQueueResidue", channel: "content:cleanup-trashed-article-queue-residue", kind: "command", request: exactObject({ confirmed: literalField(true) }), success: residueResult, fromArgs: directArgs, toArgs: directInput }),
]);

function include(output, input, key) { if (input[key] !== undefined) output[key] = input[key]; }
function projectBatchItem(value) {
  const input = value || {};
  const output = {};
  for (const key of ["articleId", "targetPlatformId", "status"]) include(output, input, key);
  for (const key of ["itemId", "accountProfileId", "filename", "contentHash", "revision", "publicationId", "attemptId", "reasonCode", "reasonCodes", "reasons", "cleanable", "allowed", "fingerprint", "repairAction", "evaluationFingerprint", "action", "resultStatus"]) include(output, input, key);
  return output;
}
function projectBatch(value) {
  const input = value || {};
  const output = { id: input.id || input.batchId, clientId: input.clientId == null ? null : input.clientId, status: input.status, items: Array.isArray(input.items) ? input.items.map(projectBatchItem) : [] };
  for (const key of ["batchId", "revision", "createdAt", "updatedAt"]) include(output, input, key);
  return output;
}
function projectBatchPreview(value) {
  const input = value || {};
  const output = {
    clientId: input.clientId, articleIds: input.articleIds, targetPlatformIds: input.targetPlatformIds,
    totalTaskCount: input.totalTaskCount, queueableTaskCount: input.queueableTaskCount,
    idempotentCount: input.idempotentCount, blockedContentCount: input.blockedContentCount,
    conflictCount: input.conflictCount, missingArticleIds: input.missingArticleIds || [],
    unsupportedPlatformIds: input.unsupportedPlatformIds || [], items: Array.isArray(input.items) ? input.items.map(projectBatchItem) : [],
  };
  for (const key of ["alreadyQueuedCount", "blockedPublishedCount", "blockedUncertainCount", "ineligibleArticleIds", "unreviewedArticleIds"]) include(output, input, key);
  return output;
}
function projectResidueItem(value) {
  const input = value || {};
  const output = { status: input.status, reasonCode: input.reasonCode == null ? null : input.reasonCode };
  for (const key of ["itemId", "articleId", "publicationId", "targetPlatformId", "repairAction", "evaluationFingerprint", "action", "resultStatus"]) include(output, input, key);
  return output;
}
function projectSubmissionResult(channel, value) {
  if (channel === "content:preview-export") { const output = {}; for (const key of ["filename", "targetPlatform", "contentHash", "markdown", "status"]) include(output, value, key); return output; }
  if (channel === "content:preview-submission-batch") return projectBatchPreview(value);
  if (channel === "content:list-submission-platforms") return { platforms: (Array.isArray(value) ? value : []).map((item) => ({ id: item.id, displayName: item.displayName, contentQueueImport: item.contentQueueImport === true })) };
  if (channel === "content:export-article") return { filename: value.filename, targetPlatform: value.targetPlatform, contentHash: value.contentHash, markdown: value.markdown, status: value.status, idempotent: value.idempotent === true };
  if (channel === "content:create-submission-batch") return {
    batchId: value.batchId, clientId: value.clientId, createdCount: value.createdCount,
    idempotentCount: value.idempotentCount, queueableTaskCount: value.queueableTaskCount,
    alreadyQueuedCount: value.alreadyQueuedCount, blockedContentCount: value.blockedContentCount,
    conflictCount: value.conflictCount, missingArticleIds: value.missingArticleIds || [],
    unsupportedPlatformIds: value.unsupportedPlatformIds || [],
    items: Array.isArray(value.items) ? value.items.map(projectBatchItem) : [],
  };
  if (channel === "content:cancel-submission-batch") { const result = { batchId: value.batchId, planId: value.planId, cancelledCount: value.cancelledCount }; for (const key of ["idempotentCount", "skippedCount", "batchStatus", "changedScopes"]) include(result, value, key); if (Array.isArray(value.items)) result.items = value.items.map(projectBatchItem); if (Array.isArray(value.blockedItems)) result.blockedItems = value.blockedItems.map(projectBatchItem); return result; }
  if (channel === "content:preview-cleanup-failed-submission-items") return { batchId: value.batchId, cleanableCount: value.cleanableCount, uncleanableCount: value.uncleanableCount, items: (value.items || []).map(projectBatchItem) };
  if (channel === "content:cleanup-failed-submission-items") return { batchId: value.batchId, cleanedCount: value.cleanedCount, skippedCount: value.skippedCount, items: (value.items || []).map(projectBatchItem) };
  if (channel === "content:preview-trashed-article-queue-residue") { const result = { items: (value.items || []).map(projectResidueItem), cleanableCount: value.cleanableCount, reportedCount: value.reportedCount }; if (Array.isArray(value.cleanableItems)) result.cleanableItems = value.cleanableItems.map(projectResidueItem); if (Array.isArray(value.reportedItems)) result.reportedItems = value.reportedItems.map(projectResidueItem); return result; }
  if (channel === "content:cleanup-trashed-article-queue-residue") { const result = { status: value.status, cleanedCount: value.cleanedCount, failedCount: value.failedCount, remainingCount: value.remainingCount, items: (value.items || []).map(projectResidueItem) }; for (const key of ["cleanableCount", "reportedCount"]) include(result, value, key); if (Array.isArray(value.remainingItems)) result.remainingItems = value.remainingItems.map(projectResidueItem); return result; }
  return value;
}

const submissionContractFixtures = Object.freeze([
  { channel: "content:preview-export", owner: "content", productionCaller: "desktopConsole.content.previewExport", request: { clientId: "client-1", generatedArticleId: "article-1", targetPlatform: "media", confirmed: true }, result: { filename: "article.md", targetPlatform: "media", contentHash: "sha256.abc", markdown: "# Article", status: "queueable" } },
  { channel: "content:preview-submission-batch", owner: "content", productionCaller: "desktopConsole.content.previewSubmissionBatch", request: { clientId: "client-1", articleIds: ["article-1"], targetPlatformIds: ["toutiao"], accountBindings: [{ platformId: "toutiao", accountProfileId: "profile-1" }] }, result: { clientId: "client-1", articleIds: ["article-1"], targetPlatformIds: ["toutiao"], totalTaskCount: 1, queueableTaskCount: 1, idempotentCount: 0, blockedContentCount: 0, conflictCount: 0, missingArticleIds: [], unsupportedPlatformIds: [], items: [{ articleId: "article-1", targetPlatformId: "toutiao", status: "queueable" }] } },
  { channel: "content:list-submission-platforms", owner: "content", productionCaller: "desktopConsole.content.listSubmissionPlatforms", request: {}, result: { platforms: [{ id: "toutiao", displayName: "头条", contentQueueImport: true }] } },
  { channel: "content:export-article", owner: "content", productionCaller: "desktopConsole.content.exportArticle", request: { clientId: "client-1", generatedArticleId: "article-1", targetPlatform: "media", confirmed: true }, result: { filename: "article.md", targetPlatform: "media", contentHash: "sha256.abc", markdown: "# Article", status: "queueable", idempotent: false } },
  { channel: "content:create-submission-batch", owner: "content", productionCaller: "desktopConsole.content.createSubmissionBatch", request: { clientId: "client-1", articleIds: ["article-1"], targetPlatformIds: ["toutiao"], accountBindings: [{ platformId: "toutiao", accountProfileId: "profile-1" }], confirmed: true }, result: { batchId: "batch-1", clientId: "client-1", createdCount: 1, idempotentCount: 0, queueableTaskCount: 1, alreadyQueuedCount: 0, blockedContentCount: 0, conflictCount: 0, missingArticleIds: [], unsupportedPlatformIds: [], items: [{ articleId: "article-1", targetPlatformId: "toutiao", status: "queued" }] } },
  { channel: "content:cancel-submission-batch", owner: "content", productionCaller: "desktopConsole.content.cancelSubmissionBatch", request: { batchId: "batch-1", planId: "plan-1", confirmed: true }, result: { batchId: "batch-1", planId: "plan-1", cancelledCount: 1, idempotentCount: 0, skippedCount: 0, batchStatus: "cancelled", changedScopes: ["articleManagement"], items: [] } },
  { channel: "content:preview-cleanup-failed-submission-items", owner: "content", productionCaller: "desktopConsole.content.previewCleanupFailedSubmissionItems", request: { batchId: "batch-1" }, result: { batchId: "batch-1", cleanableCount: 1, uncleanableCount: 0, items: [{ articleId: "article-1", targetPlatformId: "toutiao", status: "failed", cleanable: true, reasonCode: null }] } },
  { channel: "content:cleanup-failed-submission-items", owner: "content", productionCaller: "desktopConsole.content.cleanupFailedSubmissionItems", request: { batchId: "batch-1", confirmed: true }, result: { batchId: "batch-1", cleanedCount: 1, skippedCount: 0, items: [{ articleId: "article-1", targetPlatformId: "toutiao", status: "failed-cleaned" }] } },
  { channel: "content:preview-trashed-article-queue-residue", owner: "content", productionCaller: "desktopConsole.content.previewTrashedArticleQueueResidue", request: {}, result: { items: [{ publicationId: "publication-1", targetPlatformId: "toutiao", status: "failed", reasonCode: "SOURCE_ARTICLE_TRASHED", repairAction: "cleanup", evaluationFingerprint: "fingerprint-1" }], cleanableItems: [{ publicationId: "publication-1", targetPlatformId: "toutiao", status: "failed", reasonCode: "SOURCE_ARTICLE_TRASHED", repairAction: "cleanup", evaluationFingerprint: "fingerprint-1" }], reportedItems: [], cleanableCount: 1, reportedCount: 0 } },
  { channel: "content:cleanup-trashed-article-queue-residue", owner: "content", productionCaller: "desktopConsole.content.cleanupTrashedArticleQueueResidue", request: { confirmed: true }, result: { status: "completed", cleanedCount: 1, failedCount: 0, remainingCount: 0, cleanableCount: 0, reportedCount: 0, items: [{ publicationId: "publication-1", targetPlatformId: "toutiao", status: "cleaned", reasonCode: null, action: "cleanup", resultStatus: "failed-cleaned" }], remainingItems: [] } },
]);

module.exports = {
  submissionContracts,
  submissionContractFixtures,
  projectSubmissionResult,
  projectBatchItem,
};
