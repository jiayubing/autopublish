const {
  arrayField,
  customField,
  exactObject,
  enumField,
  integerField,
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
  publicationId: id,
  clientId: id,
  articleId: nullableField(id),
  targetKey: optionalField(text(500)),
  platformId: optionalField(nullableField(id)),
  mediaResourceId: optionalField(nullableField(id)),
  displayName: optionalField(nullableField(text(1000))),
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
const orderSummary = exactObject({
  status: text(80),
  label: optionalField(text(80)),
  records: integerField({ min: 0, max: 10000 }),
  active: integerField({ min: 0, max: 10000 }),
  published: integerField({ min: 0, max: 10000 }),
  attention: integerField({ min: 0, max: 10000 }),
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
    attentionCount: optionalField(integerField({ min: 0, max: 10000 })),
    orderStatus: optionalField(text(80)),
  }),
});
const workflow = exactObject({
  version: optionalField(integerField({ min: 1, max: 100 })),
  stage: enumField([
    "pending_submission",
    "needs_completion",
    "in_submission",
    "published",
    "trash",
  ]),
  label: optionalField(text(80)),
  primaryAction: text(80),
  allowedBulkActions: arrayField(text(80), { max: 32 }),
  reasonCodes: optionalField(arrayField(text(128), { max: 32 })),
  reasonMessage: optionalField(nullableField(text(1000))),
  locks: exactObject({
    canEdit: "boolean",
    canSubmit: "boolean",
    canCancel: "boolean",
    canTrash: "boolean",
  }),
  operations: exactObject({
    edit: operationDecision,
    submit: operationDecision,
    trash: operationDecision,
    restore: operationDecision,
    purge: operationDecision,
  }),
  attentionCount: integerField({ min: 0, max: 10000 }),
  orderSummary,
  publicationSummary,
  targetFacts: optionalField(arrayField(targetFact, { max: 1000 })),
});
const managementSnapshot = exactObject({
  clientId: id,
  revision: integerField({ min: 0 }),
  articles: arrayField(generatedArticle, { max: 10000 }),
  trash: arrayField(trashRecord, { max: 10000 }),
  publicationRecords: arrayField(publicationRecord, { max: 10000 }),
  publishedArchives: optionalField(
    arrayField(publishedArchive, { max: 10000 }),
  ),
  submissionPlatforms: arrayField(submissionPlatform, { max: 1000 }),
  workflowItems: arrayField(exactObject({ articleId: id, workflow }), {
    max: 10000,
  }),
  lifecycleVersion: optionalField(integerField({ min: 1, max: 100 })),
  lifecycleCounts: optionalField(
    exactObject({
      pending_submission: integerField({ min: 0, max: 10000 }),
      needs_completion: integerField({ min: 0, max: 10000 }),
      in_submission: integerField({ min: 0, max: 10000 }),
      published: integerField({ min: 0, max: 10000 }),
      trash: integerField({ min: 0, max: 10000 }),
      total: integerField({ min: 0, max: 10000 }),
    }),
  ),
});

const publicationLinkErrors = Object.freeze({
  PUBLICATION_LINK_INPUT_INVALID: Object.freeze({
    category: "validation",
    retryability: "never",
    userMessage: "发布链接请求无效，请刷新文章库后重试。",
  }),
  PUBLICATION_LINK_NOT_FOUND: Object.freeze({
    category: "validation",
    retryability: "never",
    userMessage: "未找到对应发布记录，请刷新文章库后重试。",
  }),
  PUBLICATION_LINK_URL_UNAVAILABLE: Object.freeze({
    category: "validation",
    retryability: "never",
    userMessage: "该发布记录没有可安全打开的发布链接。",
  }),
  PUBLICATION_LINK_OPEN_FAILED: Object.freeze({
    category: "internal",
    retryability: "safe",
    userMessage: "发布链接打开失败，请稍后重试。",
  }),
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
  contentContract(
    {
      capability: "content.openPublicationUrl",
      channel: "content:open-publication-url",
      feature: "content",
      kind: "command",
      request: exactObject({ publicationId: id }),
      success: exactObject({ completed: "boolean" }),
      fromArgs: directArgs,
      toArgs: directInput,
    },
    publicationLinkErrors,
  ),
]);

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
    "publicationId",
    "clientId",
    "articleId",
    "targetKey",
    "platformId",
    "mediaResourceId",
    "displayName",
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
    "canSubmit",
    "canCancel",
    "canTrash",
  ]);
  if (output.locks.canSubmit === undefined)
    output.locks.canSubmit = Boolean(value && value.locks && value.locks.canQueue);
  output.attentionCount = Number.isInteger(value && value.attentionCount)
    ? value.attentionCount
    : 0;
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
      "attentionCount",
      "orderStatus",
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
    submit: projectOperation(
      value &&
        value.operations &&
        (value.operations.submit || value.operations.queue),
      output.locks.canSubmit,
    ),
    trash: projectOperation(
      value && value.operations && value.operations.trash,
      output.locks.canTrash,
    ),
    restore: projectOperation(
      value && value.operations && value.operations.restore,
      false,
    ),
    purge: projectOperation(
      value && value.operations && value.operations.purge,
      false,
    ),
  };
  output.orderSummary = projectFields(value && value.orderSummary, [
    "status",
    "label",
    "records",
    "active",
    "published",
    "attention",
  ]);
  if (output.orderSummary.status === undefined) {
    output.orderSummary = {
      status: "none",
      label: "无订单",
      records: 0,
      active: 0,
      published: 0,
      attention: 0,
    };
  }
  if (Number.isInteger(value && value.attentionCount))
    output.attentionCount = value.attentionCount;
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
    submissionPlatforms: Array.isArray(snapshot.submissionPlatforms)
      ? snapshot.submissionPlatforms.map((item) =>
          projectFields(item, ["id", "displayName", "contentQueueImport"]),
        )
      : [],
    workflowItems: Object.entries(snapshot.workflowByArticle || {}).map(
      ([articleId, value]) => ({ articleId, workflow: projectWorkflow(value) }),
    ),
    ...(snapshot.lifecycleVersion === undefined
      ? {}
      : { lifecycleVersion: snapshot.lifecycleVersion }),
    ...(snapshot.lifecycleCounts === undefined
      ? {}
      : {
          lifecycleCounts: projectFields(snapshot.lifecycleCounts, [
            "pending_submission",
            "needs_completion",
            "in_submission",
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
