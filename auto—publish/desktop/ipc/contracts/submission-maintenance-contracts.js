const {
  arrayField,
  enumField,
  exactObject,
  literalField,
  nullableField,
  optionalField,
} = require("./registry");
const {
  code,
  count,
  directArgs,
  directInput,
  emptyRequest,
  include,
  id,
  noArgs,
  noLegacyInput,
  safeText,
  submissionContract,
} = require("./submission-contract-shared");

const residueItem = exactObject({
  itemId: optionalField(id),
  articleId: optionalField(id),
  publicationId: optionalField(id),
  targetPlatformId: optionalField(id),
  status: safeText(64, 1),
  reasonCode: nullableField(code),
  repairAction: optionalField(
    nullableField(enumField(["cancel", "cleanup"])),
  ),
  evaluationFingerprint: optionalField(nullableField(id)),
  action: optionalField(enumField(["cancel", "cleanup"])),
});
const residuePreview = exactObject({
  items: arrayField(residueItem, { max: 10000 }),
  cleanableItems: arrayField(residueItem, { max: 10000 }),
  reportedItems: arrayField(residueItem, { max: 10000 }),
  cleanableCount: count,
  reportedCount: count,
});
const residueResult = exactObject({
  status: enumField(["failed", "completed", "no-op"]),
  cleanedCount: count,
  failedCount: count,
  remainingCount: count,
  cleanableCount: count,
  reportedCount: count,
  items: arrayField(residueItem, { max: 10000 }),
  remainingItems: arrayField(residueItem, { max: 10000 }),
});

const submissionMaintenanceContracts = Object.freeze([
  submissionContract({
    capability: "content.previewTrashedArticleQueueResidue",
    channel: "content:preview-trashed-article-queue-residue",
    kind: "query",
    request: emptyRequest,
    success: residuePreview,
    fromArgs: noArgs,
    toArgs: noLegacyInput,
  }),
  submissionContract({
    capability: "content.cleanupTrashedArticleQueueResidue",
    channel: "content:cleanup-trashed-article-queue-residue",
    kind: "command",
    request: exactObject({ confirmed: literalField(true) }),
    success: residueResult,
    fromArgs: directArgs,
    toArgs: directInput,
  }),
]);

function projectResidueItem(value) {
  const input = value || {};
  const output = {
    status: input.status,
    reasonCode: input.reasonCode == null ? null : input.reasonCode,
  };
  for (const key of [
    "itemId",
    "articleId",
    "publicationId",
    "targetPlatformId",
    "repairAction",
    "evaluationFingerprint",
    "action",
  ])
    include(output, input, key);
  return output;
}

function projectSubmissionResiduePreview(value) {
  const result = {
    items: (value.items || []).map(projectResidueItem),
    cleanableCount: value.cleanableCount,
    reportedCount: value.reportedCount,
  };
  if (Array.isArray(value.cleanableItems))
    result.cleanableItems = value.cleanableItems.map(projectResidueItem);
  if (Array.isArray(value.reportedItems))
    result.reportedItems = value.reportedItems.map(projectResidueItem);
  return result;
}

function projectSubmissionResidueResult(value) {
  const result = {
    status: value.status,
    cleanedCount: value.cleanedCount,
    failedCount: value.failedCount,
    remainingCount: value.remainingCount,
    items: (value.items || []).map(projectResidueItem),
  };
  for (const key of ["cleanableCount", "reportedCount"])
    include(result, value, key);
  if (Array.isArray(value.remainingItems))
    result.remainingItems = value.remainingItems.map(projectResidueItem);
  return result;
}

const submissionMaintenanceContractFixtures = Object.freeze([
  {
    channel: "content:preview-trashed-article-queue-residue",
    owner: "content",
    productionCaller:
      "desktopConsole.content.previewTrashedArticleQueueResidue",
    request: {},
    result: {
      items: [
        {
          publicationId: "publication-1",
          targetPlatformId: "toutiao",
          status: "failed",
          reasonCode: "SOURCE_ARTICLE_TRASHED",
          repairAction: "cleanup",
          evaluationFingerprint: "fingerprint-1",
        },
      ],
      cleanableItems: [
        {
          publicationId: "publication-1",
          targetPlatformId: "toutiao",
          status: "failed",
          reasonCode: "SOURCE_ARTICLE_TRASHED",
          repairAction: "cleanup",
          evaluationFingerprint: "fingerprint-1",
        },
      ],
      reportedItems: [],
      cleanableCount: 1,
      reportedCount: 0,
    },
  },
  {
    channel: "content:cleanup-trashed-article-queue-residue",
    owner: "content",
    productionCaller:
      "desktopConsole.content.cleanupTrashedArticleQueueResidue",
    request: { confirmed: true },
    result: {
      status: "completed",
      cleanedCount: 1,
      failedCount: 0,
      remainingCount: 0,
      cleanableCount: 0,
      reportedCount: 0,
      items: [
        {
          publicationId: "publication-1",
          targetPlatformId: "toutiao",
          status: "cleaned",
          reasonCode: null,
          action: "cleanup",
        },
      ],
      remainingItems: [],
    },
  },
]);

module.exports = {
  submissionMaintenanceContracts,
  submissionMaintenanceContractFixtures,
  projectSubmissionResiduePreview,
  projectSubmissionResidueResult,
};
