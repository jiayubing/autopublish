const {
  arrayField,
  customField,
  literalField,
  exactObject,
  enumField,
  integerField,
  multilineStringField,
  nullableField,
  optionalField,
} = require("./registry");
const {
  parsePublicationEvidenceV1,
} = require("../../../src/domain/publication-evidence-contract");
const {
  parseTerminalTargetV1,
} = require("../../../src/domain/article-lifecycle-terminal-contract");
const {
  articleAttentionList,
  projectArticleAttentionList,
} = require("./article-attention-contracts");
const {
  generatedArticle,
  projectArticle,
} = require("./article-editor-contracts");
const {
  projectTrashRecord,
  trashRecord,
} = require("./article-removal-contracts");
const {
  contentContract,
  directArgs,
  directInput,
  id,
  optionalNullableText,
  own,
  projectFields,
  text,
  timestamp,
} = require("./content-core-contract-shared");

const submissionItem = exactObject({
  id: optionalField(id),
  itemId: optionalField(id),
  articleId: id,
  targetPlatformId: optionalField(id),
  platformId: optionalField(id),
  status: text(80),
  contentHash: optionalField(text(256)),
  filename: optionalField(text(500)),
  publicationId: optionalNullableText(200),
  attemptId: optionalNullableText(200),
  articleKey: optionalField(text(500)),
  targetKey: optionalField(text(500)),
  queueGroupId: optionalField(id),
  position: optionalField(
    integerField({ min: 1, max: Number.MAX_SAFE_INTEGER }),
  ),
  publicationStatus: optionalNullableText(80),
  allowed: optionalField("boolean"),
});
const submissionBatch = exactObject({
  id,
  clientId: optionalField(id),
  status: text(80),
  items: arrayField(submissionItem, { max: 10000 }),
});
const cancellationPlanItem = exactObject({
  articleId: id,
  targetPlatformId: id,
  publicationId: optionalNullableText(200),
  attemptId: optionalNullableText(200),
  action: literalField("cancel"),
  allowed: "boolean",
  reasonCode: optionalNullableText(128),
  reasonMessage: optionalNullableText(1000),
  fingerprint: optionalNullableText(256),
});
const cancellationPlan = exactObject({
  batchId: id,
  clientId: id,
  action: literalField("cancel"),
  planId: id,
  fingerprint: text(256),
  allowedCount: integerField({ min: 0, max: 10000 }),
  blockedCount: integerField({ min: 0, max: 10000 }),
  items: arrayField(cancellationPlanItem, { max: 10000 }),
});
const publicationAttempt = exactObject({
  attemptId: nullableField(id),
  status: nullableField(text(80)),
  createdAt: nullableField(timestamp),
  updatedAt: nullableField(timestamp),
  startedAt: nullableField(timestamp),
  finishedAt: nullableField(timestamp),
  remoteId: nullableField(text(500)),
  remoteUrl: nullableField(text(4096)),
  errorCode: nullableField(text(128)),
  reasonCode: nullableField(text(128)),
});
const publicationRecord = exactObject({
  version: optionalField(integerField({ min: 1, max: 1000 })),
  publicationId: id,
  clientId: id,
  articleId: nullableField(id),
  articleKey: optionalField(text(500)),
  targetKey: optionalField(text(500)),
  platformId: optionalField(nullableField(id)),
  mediaResourceId: optionalField(nullableField(id)),
  displayName: optionalField(nullableField(text(1000))),
  titleSnapshot: optionalField(
    nullableField(multilineStringField({ min: 0, max: 1000 })),
  ),
  status: text(80),
  createdAt: optionalField(timestamp),
  updatedAt: optionalField(timestamp),
  attempts: arrayField(publicationAttempt, { max: 1000 }),
  attemptId: optionalField(nullableField(id)),
  remoteId: optionalField(nullableField(text(500))),
  remoteUrl: optionalField(nullableField(text(4096))),
  errorCode: optionalField(nullableField(text(128))),
  reasonCode: optionalField(nullableField(text(128))),
});
const publicationEvidenceField = customField(function (value) {
  return parsePublicationEvidenceV1(value, { allowLegacy: true });
});
const terminalTargetField = customField(function (value) {
  return parseTerminalTargetV1(value);
});
const publishedArchive = exactObject({
  publicationId: id,
  attemptId: id,
  publicationEvidenceV1: publicationEvidenceField,
  terminalTargetV1: terminalTargetField,
});
const submissionPlatform = exactObject({
  id,
  displayName: text(1000),
  contentQueueImport: optionalField("boolean"),
});
const publicationSummary = exactObject({
  status: text(80),
  label: optionalField(text(80)),
  records: integerField({ min: 0, max: 10000 }),
  published: integerField({ min: 0, max: 10000 }),
  uncertain: "boolean",
});
const targetFact = exactObject({
  targetKey: text(500),
  status: text(80),
  canCancel: "boolean",
  publicationId: optionalNullableText(200),
  displayName: optionalNullableText(1000),
  batchId: optionalNullableText(200),
});
const operationDecision = exactObject({
  allowed: "boolean",
  reasonCodes: arrayField(text(128), { max: 32 }),
  safeMetadata: exactObject({
    articleId: optionalField(id),
    stage: optionalField(text(80)),
    targetKeys: optionalField(arrayField(text(500), { max: 1000 })),
    hasPublished: optionalField("boolean"),
    hasActiveTarget: optionalField("boolean"),
    hasUncertain: optionalField("boolean"),
    isTrash: optionalField("boolean"),
  }),
});
const workflow = exactObject({
  version: optionalField(integerField({ min: 1, max: 100 })),
  stage: enumField([
    "pending_submission",
    "queued",
    "paid_processing",
    "published",
    "failed",
    "trash",
  ]),
  label: optionalField(text(80)),
  primaryAction: text(80),
  allowedBulkActions: arrayField(text(80), { max: 32 }),
  reasonCodes: optionalField(arrayField(text(128), { max: 32 })),
  reasonMessage: optionalField(nullableField(text(1000))),
  locks: exactObject({
    canEdit: "boolean",
    canQueue: "boolean",
    canCancel: "boolean",
    canTrash: "boolean",
  }),
  operations: exactObject({
    edit: operationDecision,
    queue: operationDecision,
    retarget: operationDecision,
    trash: operationDecision,
  }),
  publicationSummary,
  targetFacts: optionalField(arrayField(targetFact, { max: 1000 })),
});
const managementSnapshot = exactObject({
  clientId: id,
  revision: integerField({ min: 0 }),
  articles: arrayField(generatedArticle, { max: 10000 }),
  trash: arrayField(trashRecord, { max: 10000 }),
  submissionBatches: arrayField(submissionBatch, { max: 10000 }),
  cancellationPlans: arrayField(cancellationPlan, { max: 10000 }),
  publicationRecords: arrayField(publicationRecord, { max: 10000 }),
  publishedArchives: optionalField(
    arrayField(publishedArchive, { max: 10000 }),
  ),
  attention: articleAttentionList,
  submissionPlatforms: arrayField(submissionPlatform, { max: 1000 }),
  workflowItems: arrayField(exactObject({ articleId: id, workflow }), {
    max: 10000,
  }),
  publicationSummaryItems: arrayField(
    exactObject({ articleId: id, summary: publicationSummary }),
    { max: 10000 },
  ),
  lifecycleVersion: optionalField(integerField({ min: 1, max: 100 })),
  lifecycleCounts: optionalField(
    exactObject({
      pending_submission: integerField({ min: 0, max: 10000 }),
      queued: integerField({ min: 0, max: 10000 }),
      paid_processing: integerField({ min: 0, max: 10000 }),
      failed: integerField({ min: 0, max: 10000 }),
      published: integerField({ min: 0, max: 10000 }),
      trash: integerField({ min: 0, max: 10000 }),
      total: integerField({ min: 0, max: 10000 }),
    }),
  ),
});

const articleManagementContracts = Object.freeze([
  contentContract({
    capability: "content.getArticleManagementSnapshot",
    channel: "content:get-article-management-snapshot",
    feature: "content",
    kind: "query",
    request: exactObject({ clientId: id }),
    success: managementSnapshot,
    fromArgs: directArgs,
    toArgs: directInput,
  }),
]);

function projectSubmissionItem(value) {
  return projectFields(value, [
    "id",
    "itemId",
    "articleId",
    "targetPlatformId",
    "platformId",
    "status",
    "contentHash",
    "filename",
    "publicationId",
    "attemptId",
    "articleKey",
    "targetKey",
    "queueGroupId",
    "position",
    "publicationStatus",
    "allowed",
  ]);
}

function projectSubmissionBatch(value) {
  return {
    ...projectFields(value, ["id", "clientId", "status"]),
    items: Array.isArray(value && value.items)
      ? value.items.map(projectSubmissionItem)
      : [],
  };
}

function projectCancellationPlan(value) {
  return {
    ...projectFields(value, [
      "batchId",
      "clientId",
      "action",
      "planId",
      "fingerprint",
      "allowedCount",
      "blockedCount",
    ]),
    items: Array.isArray(value && value.items)
      ? value.items.map((item) =>
          projectFields(item, [
            "articleId",
            "targetPlatformId",
            "publicationId",
            "attemptId",
            "action",
            "allowed",
            "reasonCode",
            "reasonMessage",
            "fingerprint",
          ]),
        )
      : [],
  };
}

function projectPublicationSummary(value) {
  return projectFields(value, [
    "status",
    "label",
    "records",
    "published",
    "uncertain",
  ]);
}

function projectPublicationRecord(value) {
  const output = projectFields(value, [
    "version",
    "publicationId",
    "clientId",
    "articleId",
    "articleKey",
    "targetKey",
    "platformId",
    "mediaResourceId",
    "displayName",
    "titleSnapshot",
    "status",
    "createdAt",
    "updatedAt",
    "attemptId",
    "remoteId",
    "remoteUrl",
    "errorCode",
    "reasonCode",
  ]);
  output.attempts = Array.isArray(value && value.attempts)
    ? value.attempts.map((item) =>
        projectFields(item, [
          "attemptId",
          "status",
          "createdAt",
          "updatedAt",
          "startedAt",
          "finishedAt",
          "remoteId",
          "remoteUrl",
          "errorCode",
          "reasonCode",
        ]),
      )
    : [];
  return output;
}

function projectPublishedArchive(value) {
  return projectFields(value, [
    "publicationId",
    "attemptId",
    "publicationEvidenceV1",
    "terminalTargetV1",
  ]);
}

function projectWorkflow(value) {
  const output = projectFields(value, [
    "version",
    "stage",
    "label",
    "primaryAction",
    "allowedBulkActions",
    "reasonCodes",
    "reasonMessage",
  ]);
  if (Array.isArray(value && value.reasonCodes))
    output.reasonCodes = value.reasonCodes.map((item) => String(item));
  output.locks = projectFields(value && value.locks, [
    "canEdit",
    "canQueue",
    "canCancel",
    "canTrash",
  ]);
  const projectOperation = function (operation, fallbackAllowed) {
    const source = operation && typeof operation === "object" ? operation : {};
    const metadata = projectFields(source.safeMetadata, [
      "articleId",
      "stage",
      "targetKeys",
      "hasPublished",
      "hasActiveTarget",
      "hasUncertain",
      "isTrash",
    ]);
    return {
      allowed:
        source.allowed === undefined
          ? fallbackAllowed === true
          : source.allowed === true,
      reasonCodes: Array.isArray(source.reasonCodes)
        ? source.reasonCodes.map((item) => String(item))
        : [],
      safeMetadata: metadata,
    };
  };
  output.operations = {
    edit: projectOperation(
      value && value.operations && value.operations.edit,
      output.locks.canEdit,
    ),
    queue: projectOperation(
      value && value.operations && value.operations.queue,
      output.locks.canQueue,
    ),
    retarget: projectOperation(
      value && value.operations && value.operations.retarget,
      false,
    ),
    trash: projectOperation(
      value && value.operations && value.operations.trash,
      output.locks.canTrash,
    ),
  };
  output.publicationSummary = projectPublicationSummary(
    value && value.publicationSummary,
  );
  if (
    value &&
    value.targetFacts &&
    typeof value.targetFacts === "object" &&
    !Array.isArray(value.targetFacts)
  ) {
    output.targetFacts = Object.values(value.targetFacts).map((item) =>
      projectFields(item, [
        "targetKey",
        "status",
        "canCancel",
        "publicationId",
        "displayName",
        "batchId",
      ]),
    );
  }
  return output;
}

function projectManagementSnapshot(value) {
  const snapshot =
    value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    clientId: snapshot.clientId,
    revision: snapshot.revision,
    articles: Array.isArray(snapshot.articles)
      ? snapshot.articles.map(projectArticle)
      : [],
    trash: Array.isArray(snapshot.trash)
      ? snapshot.trash.map(projectTrashRecord)
      : [],
    submissionBatches: Array.isArray(snapshot.submissionBatches)
      ? snapshot.submissionBatches.map(projectSubmissionBatch)
      : [],
    cancellationPlans: Array.isArray(snapshot.cancellationPlans)
      ? snapshot.cancellationPlans.map(projectCancellationPlan)
      : [],
    publicationRecords: Array.isArray(snapshot.publicationRecords)
      ? snapshot.publicationRecords.map(projectPublicationRecord)
      : [],
    ...(Array.isArray(snapshot.publishedArchives)
      ? {
          publishedArchives: snapshot.publishedArchives.map(
            projectPublishedArchive,
          ),
        }
      : {}),
    attention: projectArticleAttentionList(
      snapshot.attention || {
        revision: snapshot.revision || 0,
        items: [],
        counts: { total: 0, actionable: 0 },
      },
    ),
    submissionPlatforms: Array.isArray(snapshot.submissionPlatforms)
      ? snapshot.submissionPlatforms.map((item) =>
          projectFields(item, ["id", "displayName", "contentQueueImport"]),
        )
      : [],
    workflowItems: Object.entries(snapshot.workflowByArticle || {}).map(
      ([articleId, value]) => ({ articleId, workflow: projectWorkflow(value) }),
    ),
    publicationSummaryItems: Object.entries(
      snapshot.publicationSummaries || {},
    ).map(([articleId, value]) => ({
      articleId,
      summary: projectPublicationSummary(value),
    })),
    ...(snapshot.lifecycleVersion === undefined
      ? {}
      : { lifecycleVersion: snapshot.lifecycleVersion }),
    ...(snapshot.lifecycleCounts === undefined
      ? {}
      : {
          lifecycleCounts: projectFields(snapshot.lifecycleCounts, [
            "pending_submission",
            "queued",
            "paid_processing",
            "failed",
            "published",
            "trash",
            "total",
          ]),
        }),
  };
}

module.exports = {
  articleManagementContracts,
  projectManagementSnapshot,
};
