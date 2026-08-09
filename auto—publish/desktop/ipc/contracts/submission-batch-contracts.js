const {
  arrayField,
  enumField,
  exactObject,
  literalField,
  nullableField,
  optionalField,
} = require("./registry");
const {
  clientIdentity,
  code,
  count,
  directArgs,
  directInput,
  id,
  include,
  noArgs,
  noLegacyInput,
  revision,
  safeText,
  submissionContract,
  emptyRequest,
} = require("./submission-contract-shared");

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
  repairAction: optionalField(
    nullableField(enumField(["cancel", "cleanup"])),
  ),
  evaluationFingerprint: optionalField(nullableField(id)),
  action: optionalField(enumField(["cancel", "cleanup"])),
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
const changedScopes = arrayField(safeText(64, 1), { max: 32 });
const cancelPreview = exactObject({
  batchId: id,
  planId: id,
  allowedCount: count,
  blockedCount: count,
  items: arrayField(batchItem, { max: 10000 }),
});
const cancelResult = exactObject({
  batchId: id,
  planId: id,
  cancelledCount: count,
  idempotentCount: count,
  skippedCount: count,
  batchStatus: safeText(64, 1),
  changedScopes,
  blockedItems: optionalField(arrayField(batchItem, { max: 10000 })),
  items: arrayField(batchItem, { max: 10000 }),
});
const retryPreview = exactObject({
  publicationId: nullableField(id),
  requiresConfirmation: "boolean",
  eligible: optionalField("boolean"),
  reasonCode: optionalField(nullableField(code)),
  clientId: optionalField(clientIdentity),
  articleId: optionalField(id),
  targetPlatformId: optionalField(id),
  titleSnapshot: optionalField(safeText(500, 1)),
  failureCount: optionalField(count),
  message: optionalField(safeText(1000, 1)),
  queueableTaskCount: optionalField(count),
  idempotentCount: optionalField(count),
  conflictCount: optionalField(count),
});
const retryResult = exactObject({
  batchId: id,
  publicationId: id,
  attemptId: nullableField(id),
  clientId: clientIdentity,
  articleId: id,
  targetPlatformId: id,
  changedScopes,
});

const submissionBatchContracts = Object.freeze([
  submissionContract({
    capability: "content.cancelSubmissionBatch",
    channel: "content:cancel-submission-batch",
    kind: "command",
    request: exactObject({
      batchId: id,
      planId: id,
      confirmed: literalField(true),
    }),
    success: cancelResult,
    fromArgs: directArgs,
    toArgs: directInput,
  }),
]);

function projectBatchItem(value) {
  const input = value || {};
  const output = {};
  for (const key of ["articleId", "targetPlatformId", "status"])
    include(output, input, key);
  for (const key of [
    "itemId",
    "accountProfileId",
    "filename",
    "contentHash",
    "revision",
    "queueGroupId",
    "position",
    "publicationId",
    "attemptId",
    "reasonCode",
    "reasonCodes",
    "reasons",
    "cleanable",
    "allowed",
    "fingerprint",
    "repairAction",
    "evaluationFingerprint",
    "action",
  ])
    include(output, input, key);
  return output;
}
function projectBatch(value) {
  const input = value || {};
  const output = {
    id: input.id || input.batchId,
    clientId: input.clientId == null ? null : input.clientId,
    status: input.status,
    items: Array.isArray(input.items) ? input.items.map(projectBatchItem) : [],
  };
  for (const key of ["batchId", "revision", "createdAt", "updatedAt"])
    include(output, input, key);
  return output;
}

function projectSubmissionBatchResult(value) {
  const result = {
    batchId: value.batchId,
    planId: value.planId,
    cancelledCount: value.cancelledCount,
  };
  for (const key of [
    "idempotentCount",
    "skippedCount",
    "batchStatus",
    "changedScopes",
  ])
    include(result, value, key);
  if (Array.isArray(value.items))
    result.items = value.items.map(projectBatchItem);
  if (Array.isArray(value.blockedItems))
    result.blockedItems = value.blockedItems.map(projectBatchItem);
  return result;
}

const submissionBatchContractFixtures = Object.freeze([
  {
    channel: "content:cancel-submission-batch",
    owner: "content",
    productionCaller: "desktopConsole.content.cancelSubmissionBatch",
    request: { batchId: "batch-1", planId: "plan-1", confirmed: true },
    result: {
      batchId: "batch-1",
      planId: "plan-1",
      cancelledCount: 1,
      idempotentCount: 0,
      skippedCount: 0,
      batchStatus: "cancelled",
      changedScopes: ["articleManagement"],
      items: [],
    },
  },
]);

module.exports = {
  submissionBatchContracts,
  submissionBatchContractFixtures,
  projectSubmissionBatchResult,
};
