const {
  defineContract,
  exactObject,
  stringField,
  integerField,
  optionalField,
  nullableField,
  arrayField,
  literalField,
  multilineStringField,
  enumField,
  oneOf,
} = require("./registry");
const {
  projectArticleAttentionItem,
  projectArticleAttentionList,
  projectArticleAttentionPreview,
  projectArticleAttentionResolution,
  projectArticleRemovalTransaction,
} = require("./content-core-projections");

const empty = exactObject({});
const errors = Object.freeze({
  AUTH_REQUIRED: Object.freeze({
    category: "authentication",
    retryability: "never",
    userMessage: "请先登录后继续。",
  }),
  IPC_REQUEST_INVALID: Object.freeze({
    category: "validation",
    retryability: "never",
    userMessage: "内容请求无效，请刷新后重试。",
  }),
  IPC_RESULT_INVALID: Object.freeze({
    category: "internal",
    retryability: "manual-check",
    userMessage: "内容结果未通过安全校验，请刷新后重试。",
  }),
  IPC_INTERNAL: Object.freeze({
    category: "internal",
    retryability: "manual-check",
    userMessage: "内容操作未能安全完成，请稍后重试。",
  }),
  CONTENT_INPUT_INVALID: Object.freeze({
    category: "validation",
    retryability: "never",
    userMessage: "内容请求参数无效，请检查后重试。",
  }),
  ARTICLE_EDIT_CONFLICT: Object.freeze({
    category: "conflict",
    retryability: "safe",
    userMessage: "文章已被其他编辑会话修改，请刷新后重试。",
  }),
  ARTICLE_EDIT_FINGERPRINT_REQUIRED: Object.freeze({
    category: "validation",
    retryability: "never",
    userMessage: "文章编辑会话已失效，请重新打开文章。",
  }),
  ARTICLE_MUTATION_BUSY: Object.freeze({
    category: "conflict",
    retryability: "safe",
    userMessage: "文章正在被其他操作修改，请稍后重试。",
  }),
  ARTICLE_MUTATION_RESULT_UNCERTAIN: Object.freeze({
    category: "storage",
    retryability: "manual-check",
    userMessage: "文章操作结果需要人工核对，请勿自动重试。",
  }),
  ARTICLE_IDENTITY_UNRESOLVED: Object.freeze({
    category: "validation",
    retryability: "manual-check",
    userMessage: "文章身份无法安全解析，需要人工核对。",
  }),
  ARTICLE_IDENTITY_CONFLICT: Object.freeze({
    category: "conflict",
    retryability: "manual-check",
    userMessage: "文章身份存在冲突，需要人工核对。",
  }),
  ARTICLE_ACTIVE_TARGET_CONFLICT: Object.freeze({
    category: "conflict",
    retryability: "safe",
    userMessage: "文章已有活动投稿目标，请刷新后重试。",
  }),
  ARTICLE_CONTENT_INCOMPLETE: Object.freeze({
    category: "validation",
    retryability: "never",
    userMessage: "文章标题和正文必须完整。",
  }),
  ARTICLE_PUBLISHED_IMMUTABLE: Object.freeze({
    category: "conflict",
    retryability: "never",
    userMessage: "已发布文章永久只读。",
  }),
  ARTICLE_OPERATION_FROZEN: Object.freeze({
    category: "conflict",
    retryability: "safe",
    userMessage: "文章当前处于冻结阶段。",
  }),
  ARTICLE_IN_TRASH: Object.freeze({
    category: "conflict",
    retryability: "never",
    userMessage: "回收站文章不能执行此操作。",
  }),
  ARTICLE_RETARGET_NO_TARGET: Object.freeze({
    category: "validation",
    retryability: "never",
    userMessage: "文章没有可改投的既有目标。",
  }),
});
const errorCodes = Object.freeze(Object.keys(errors));
const id = stringField({
  max: 200,
  pattern: /^(?!\.{1,2}$)(?!.*[\\/])(?=\S)[^\x00-\x1f\x7f]*\S$/u,
});
const opaqueToken = stringField({ max: 200 });
const text = (max) =>
  stringField({ min: 0, max, pattern: /^[^\x00-\x1f\x7f]*$/u });
const optionalNullableText = (max) => optionalField(nullableField(text(max)));
const multiline = (max) => multilineStringField({ min: 0, max });
const boolean = "boolean";
const timestamp = text(64);
const ids = (max = 1000) => arrayField(id, { max });

const materialError = exactObject({
  code: optionalField(text(128)),
  message: optionalField(text(200)),
});
const contentMaterial = exactObject({
  id: optionalField(id),
  name: text(500),
  extension: optionalField(text(32)),
  status: optionalField(text(80)),
  content: multiline(2000000),
  characterCount: optionalField(integerField({ min: 0, max: 2000000 })),
  error: optionalField(nullableField(materialError)),
  contentHash: optionalField(text(256)),
  source: optionalField(text(80)),
});
const contentClient = exactObject({
  id,
  name: text(500),
  searchQuery: optionalField(multiline(10000)),
  knowledgeFiles: arrayField(contentMaterial, { max: 10000 }),
});
const reference = exactObject({
  title: text(1000),
  url: text(4096),
  snippet: optionalField(multiline(10000)),
});
const research = exactObject({
  id,
  clientId: id,
  question: optionalField(multiline(10000)),
  answerText: optionalField(multiline(2000000)),
  references: arrayField(reference, { max: 1000 }),
  collectionMethod: enumField(["automatic", "manual", "legacy"]),
  collectedAt: optionalField(timestamp),
  updatedAt: optionalField(timestamp),
  createdAt: optionalField(timestamp),
  isAnswerComplete: optionalField(boolean),
});
const template = exactObject({
  id,
  templateId: optionalField(id),
  platform: id,
  platformId: optionalField(id),
  scenario: text(1000),
  name: text(1000),
  displayName: optionalField(text(1000)),
  description: optionalField(multiline(10000)),
  order: optionalField(integerField({ min: -100000, max: 100000 })),
  enabled: optionalField(boolean),
  body: multiline(2000000),
  source: optionalField(enumField(["builtin", "custom"])),
  readOnly: optionalField(boolean),
  bodyHash: optionalField(text(256)),
  revision: optionalField(text(256)),
});
const templatePlatform = exactObject({
  id,
  displayName: text(1000),
  description: text(10000),
  order: integerField({ min: -100000, max: 100000 }),
  source: optionalField(enumField(["builtin", "custom"])),
});
const templateDiagnostic = exactObject({
  code: text(128),
  message: text(2000),
  platformId: optionalField(id),
  templateId: optionalField(id),
  source: optionalField(enumField(["builtin", "custom"])),
});
const templateCatalog = exactObject({
  revision: text(256),
  platforms: arrayField(templatePlatform, { max: 1000 }),
  templates: arrayField(template, { max: 10000 }),
  diagnostics: arrayField(templateDiagnostic, { max: 10000 }),
});
const articleSource = exactObject({
  client_material: boolean,
  doubao_answer: boolean,
  references: boolean,
  template: boolean,
});
const researchSnapshot = exactObject({
  questionId: id,
  question: optionalField(multiline(10000)),
  answerText: multiline(2000000),
  references: arrayField(reference, { max: 1000 }),
  collectedAt: optionalField(timestamp),
  collectionMethod: enumField(["automatic", "manual", "legacy"]),
});
const materialSnapshot = exactObject({
  id,
  name: text(500),
  extension: text(32),
  content: multiline(2000000),
  contentHash: text(256),
  source: text(80),
});
const templateSnapshot = exactObject({
  platform: id,
  id,
  name: text(1000),
  scenario: text(1000),
  body: multiline(2000000),
  bodyHash: text(256),
  source: optionalField(enumField(["builtin", "custom"])),
});
const generatedArticle = exactObject({
  id,
  clientId: id,
  materialIds: optionalField(ids(1000)),
  researchQueryIds: optionalField(ids(1000)),
  researchQueryId: optionalField(id),
  researchSnapshots: optionalField(arrayField(researchSnapshot, { max: 1000 })),
  platform: optionalField(id),
  scenario: optionalField(text(1000)),
  templateId: optionalField(id),
  title: multiline(10000),
  content: multiline(5000000),
  status: text(80),
  source: optionalField(articleSource),
  createdAt: timestamp,
  updatedAt: optionalField(timestamp),
  materialSnapshots: optionalField(arrayField(materialSnapshot, { max: 1000 })),
  templateSnapshot: optionalField(templateSnapshot),
  generationBatchId: optionalField(nullableField(id)),
  generationTaskId: optionalField(nullableField(id)),
  sourceArticleId: optionalField(nullableField(id)),
  version: optionalField(integerField({ min: 1, max: 1000000 })),
});
const articleEditor = exactObject({
  article: generatedArticle,
  editFingerprint: opaqueToken,
});
const savedArticleResult = exactObject({
  outcome: literalField("saved"),
  article: generatedArticle,
  editFingerprint: opaqueToken,
});
const editConflictResult = exactObject({
  outcome: literalField("conflict"),
  code: literalField("ARTICLE_EDIT_CONFLICT"),
  articleId: id,
  refreshRequired: literalField(true),
});
const uncertainArticleResult = exactObject({
  outcome: literalField("result-uncertain"),
  code: literalField("ARTICLE_MUTATION_RESULT_UNCERTAIN"),
  articleId: id,
  refreshRequired: literalField(true),
});
const saveArticleResult = oneOf([
  savedArticleResult,
  editConflictResult,
  uncertainArticleResult,
]);
const selection = exactObject({ clientId: id, articleId: id });
const trashReference = exactObject({ type: text(80), id });
const trashRecord = exactObject({
  version: literalField(1),
  deletedAt: timestamp,
  clientId: id,
  articleId: id,
  status: text(80),
  references: arrayField(trashReference, { max: 1000 }),
  titleSnapshot: optionalField(nullableField(multiline(1000))),
});
const impactItem = exactObject({
  clientId: optionalField(id),
  articleId: optionalField(id),
  batchId: optionalNullableText(200),
  publicationId: optionalNullableText(200),
  attemptId: optionalNullableText(200),
  itemId: optionalNullableText(200),
  platformId: optionalNullableText(200),
  targetPlatformId: optionalNullableText(200),
  displayName: optionalNullableText(1000),
  reasonCode: optionalNullableText(128),
  status: optionalNullableText(80),
  action: optionalNullableText(80),
  titleSnapshot: optionalNullableText(1000),
  state: optionalField(text(80)),
});
const impactPreview = exactObject({
  token: optionalField(opaqueToken),
  articleCount: integerField({ min: 0, max: 10000 }),
  queuedToCancel: arrayField(impactItem, { max: 10000 }),
  failedToClean: arrayField(impactItem, { max: 10000 }),
  publishedToClean: optionalField(arrayField(impactItem, { max: 10000 })),
  cancelledToClean: optionalField(arrayField(impactItem, { max: 10000 })),
  terminalCleanupCount: optionalField(integerField({ min: 0, max: 10000 })),
  blockedItems: arrayField(impactItem, { max: 10000 }),
  canCommit: boolean,
  selections: optionalField(arrayField(selection, { max: 10000 })),
  expiresAt: optionalField(timestamp),
  legacy: optionalField(boolean),
  transactionId: optionalNullableText(200),
  openTransactionId: optionalNullableText(200),
});

const articleAttentionItem = exactObject({
  attentionId: id,
  kind: stringField({ max: 80 }),
  articleId: optionalNullableText(200),
  titleSnapshot: optionalNullableText(1000),
  clientId: optionalNullableText(200),
  platformId: optionalNullableText(100),
  displayName: optionalNullableText(200),
  batchId: optionalNullableText(200),
  publicationId: optionalNullableText(200),
  attemptId: optionalNullableText(200),
  transactionId: optionalNullableText(200),
  status: optionalNullableText(80),
  reasonCode: optionalNullableText(128),
  pairState: optionalNullableText(80),
  recommendedAction: optionalNullableText(80),
  allowedActions: arrayField(stringField({ max: 80 }), { max: 32 }),
  updatedAt: optionalNullableText(64),
  message: optionalNullableText(1000),
});
const articleAttentionList = exactObject({
  revision: integerField({ min: 0 }),
  items: arrayField(articleAttentionItem, { max: 10000 }),
  counts: exactObject({
    total: integerField({ min: 0 }),
    actionable: integerField({ min: 0 }),
  }),
});
const articleRemovalTransaction = exactObject({
  id: optionalField(id),
  transactionId: optionalField(id),
  status: stringField({ max: 80 }),
  phase: optionalNullableText(80),
  errorCode: optionalNullableText(128),
  reasonCode: optionalNullableText(128),
  createdAt: optionalNullableText(64),
  updatedAt: optionalNullableText(64),
  articleCount: optionalField(integerField({ min: 0, max: 100000 })),
  queueCursor: optionalField(integerField({ min: 0, max: 100000 })),
  articleCursor: optionalField(integerField({ min: 0, max: 100000 })),
  revision: optionalField(integerField({ min: 0 })),
  changedScopes: optionalField(
    arrayField(stringField({ max: 80 }), { max: 32 }),
  ),
});
const trashCommitResult = exactObject({
  moved: optionalField(arrayField(trashRecord, { max: 10000 })),
  skipped: optionalField(arrayField(trashRecord, { max: 10000 })),
  rejected: optionalField(
    arrayField(exactObject({ clientId: id, articleId: id, code: text(128) }), {
      max: 10000,
    }),
  ),
  transactionId: optionalField(id),
  status: optionalField(text(80)),
  articleCount: optionalField(integerField({ min: 0, max: 10000 })),
  queueActions: optionalField(arrayField(impactItem, { max: 10000 })),
  errorCode: optionalNullableText(128),
  reasonCode: optionalNullableText(128),
  phase: optionalNullableText(80),
  transaction: optionalField(nullableField(articleRemovalTransaction)),
});
const permanentDeleteConfirmation = exactObject({
  token: opaqueToken,
  clientId: id,
  articleId: id,
  deletedAt: timestamp,
  status: text(80),
  version: optionalField(integerField({ min: 1, max: 1000 })),
  fingerprint: optionalField(text(256)),
  issuedAt: optionalField(timestamp),
  expiresAt: optionalField(timestamp),
  permanentlyDeleted: optionalField(boolean),
});
const permanentDeleteResult = exactObject({
  clientId: id,
  articleId: id,
  deleted: literalField(true),
  deletedAt: timestamp,
});

function own(value, key) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.prototype.hasOwnProperty.call(value, key)
  );
}
function projectFields(value, fields) {
  const output = {};
  for (const field of fields) {
    if (own(value, field) && value[field] !== undefined)
      output[field] = value[field];
  }
  return output;
}
function projectMaterial(value) {
  const output = projectFields(value, [
    "id",
    "name",
    "extension",
    "status",
    "content",
    "characterCount",
    "contentHash",
    "source",
  ]);
  if (own(value, "error")) {
    output.error =
      value.error === null
        ? null
        : value.error
          ? {
              ...(typeof value.error.code === "string"
                ? { code: value.error.code }
                : {}),
              message: "资料处理失败，请重试。",
            }
          : value.error;
  }
  return output;
}
function projectClient(value) {
  const output = projectFields(value, ["id", "name", "searchQuery"]);
  output.knowledgeFiles = Array.isArray(value && value.knowledgeFiles)
    ? value.knowledgeFiles.map(projectMaterial)
    : [];
  return output;
}
function boundSingleLine(value, max) {
  return typeof value === "string"
    ? value.replace(/[\x00-\x1f\x7f]/g, "").slice(0, max)
    : value;
}
function boundMultiline(value, max) {
  return typeof value === "string"
    ? value
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
        .slice(0, max)
    : value;
}
function projectReference(value) {
  const output = projectFields(value, ["title", "url", "snippet"]);
  if (own(output, "title")) output.title = boundSingleLine(output.title, 1000);
  if (own(output, "url")) output.url = boundSingleLine(output.url, 4096);
  if (own(output, "snippet")) {
    if (typeof output.snippet !== "string")
      delete output.snippet;
    else output.snippet = boundMultiline(output.snippet, 10000);
  }
  return output;
}
function projectResearch(value) {
  const output = projectFields(value, [
    "id",
    "clientId",
    "question",
    "answerText",
    "collectionMethod",
    "collectedAt",
    "updatedAt",
    "createdAt",
    "isAnswerComplete",
  ]);
  output.references = Array.isArray(value && value.references)
    ? value.references.map(projectReference)
    : [];
  return output;
}
function projectTemplate(value) {
  return projectFields(value, [
    "id",
    "templateId",
    "platform",
    "platformId",
    "scenario",
    "name",
    "displayName",
    "description",
    "order",
    "enabled",
    "body",
    "source",
    "readOnly",
    "bodyHash",
    "revision",
  ]);
}
function projectTemplateCatalog(value) {
  return {
    revision: value && value.revision,
    platforms: Array.isArray(value && value.platforms)
      ? value.platforms.map((item) =>
          projectFields(item, [
            "id",
            "displayName",
            "description",
            "order",
            "source",
          ]),
        )
      : [],
    templates: Array.isArray(value && value.templates)
      ? value.templates.map(projectTemplate)
      : [],
    diagnostics: Array.isArray(value && value.diagnostics)
      ? value.diagnostics.map((item) =>
          projectFields(item, [
            "code",
            "message",
            "platformId",
            "templateId",
            "source",
          ]),
        )
      : [],
  };
}
function projectArticle(value) {
  const output = projectFields(value, [
    "id",
    "clientId",
    "materialIds",
    "researchQueryIds",
    "researchQueryId",
    "platform",
    "scenario",
    "templateId",
    "title",
    "content",
    "status",
    "source",
    "createdAt",
    "updatedAt",
    "generationBatchId",
    "generationTaskId",
    "sourceArticleId",
    "version",
  ]);
  if (own(value, "researchSnapshots"))
    output.researchSnapshots = Array.isArray(value.researchSnapshots)
      ? value.researchSnapshots.map((item) => {
          const projected = projectFields(item, [
            "questionId",
            "question",
            "answerText",
            "collectedAt",
            "collectionMethod",
          ]);
          if (!own(projected, "collectionMethod"))
            projected.collectionMethod = "legacy";
          return {
            ...projected,
            references: Array.isArray(item.references)
              ? item.references.map(projectReference)
              : [],
          };
        })
      : value.researchSnapshots;
  if (own(value, "materialSnapshots"))
    output.materialSnapshots = Array.isArray(value.materialSnapshots)
      ? value.materialSnapshots.map((item) =>
          projectFields(item, [
            "id",
            "name",
            "extension",
            "content",
            "contentHash",
            "source",
          ]),
        )
      : value.materialSnapshots;
  if (own(value, "templateSnapshot"))
    output.templateSnapshot = projectFields(value.templateSnapshot, [
      "platform",
      "id",
      "name",
      "scenario",
      "body",
      "bodyHash",
      "source",
    ]);
  return output;
}
function projectTrashRecord(value) {
  const output = projectFields(value, [
    "version",
    "deletedAt",
    "clientId",
    "articleId",
    "status",
    "titleSnapshot",
  ]);
  output.references = Array.isArray(value && value.references)
    ? value.references.map((item) => projectFields(item, ["type", "id"]))
    : [];
  return output;
}
function projectImpactItem(value) {
  return projectFields(value, [
    "clientId",
    "articleId",
    "batchId",
    "publicationId",
    "attemptId",
    "itemId",
    "platformId",
    "targetPlatformId",
    "displayName",
    "reasonCode",
    "status",
    "action",
    "titleSnapshot",
    "state",
  ]);
}
function projectImpactPreview(value) {
  const output = projectFields(value, [
    "token",
    "articleCount",
    "terminalCleanupCount",
    "canCommit",
    "expiresAt",
    "legacy",
    "transactionId",
    "openTransactionId",
  ]);
  for (const field of [
    "queuedToCancel",
    "failedToClean",
    "publishedToClean",
    "cancelledToClean",
    "blockedItems",
  ]) {
    if (
      own(value, field) ||
      ["queuedToCancel", "failedToClean", "blockedItems"].includes(field)
    )
      output[field] = Array.isArray(value && value[field])
        ? value[field].map(projectImpactItem)
        : [];
  }
  if (own(value, "selections"))
    output.selections = Array.isArray(value.selections)
      ? value.selections.map((item) =>
          projectFields(item, ["clientId", "articleId"]),
        )
      : value.selections;
  return output;
}
function projectTrashCommitResult(value) {
  const output = projectFields(value, [
    "transactionId",
    "status",
    "articleCount",
    "errorCode",
    "reasonCode",
    "phase",
  ]);
  if (own(value, "moved"))
    output.moved = Array.isArray(value.moved)
      ? value.moved.map(projectTrashRecord)
      : value.moved;
  if (own(value, "skipped"))
    output.skipped = Array.isArray(value.skipped)
      ? value.skipped.map(projectTrashRecord)
      : value.skipped;
  if (own(value, "rejected"))
    output.rejected = Array.isArray(value.rejected)
      ? value.rejected.map((item) =>
          projectFields(item, ["clientId", "articleId", "code"]),
        )
      : value.rejected;
  if (own(value, "queueActions"))
    output.queueActions = Array.isArray(value.queueActions)
      ? value.queueActions.map(projectImpactItem)
      : value.queueActions;
  if (own(value, "transaction"))
    output.transaction =
      value.transaction === null
        ? null
        : projectArticleRemovalTransaction(value.transaction);
  return output;
}
function projectPermanentDeleteConfirmation(value) {
  return projectFields(value, [
    "token",
    "clientId",
    "articleId",
    "deletedAt",
    "status",
    "version",
    "fingerprint",
    "issuedAt",
    "expiresAt",
    "permanentlyDeleted",
  ]);
}
function projectPermanentDeleteResult(value) {
  return projectFields(value, [
    "clientId",
    "articleId",
    "deleted",
    "deletedAt",
  ]);
}
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
  position: optionalField(integerField({ min: 1, max: Number.MAX_SAFE_INTEGER })),
  publicationStatus: optionalNullableText(80),
  allowed: optionalField(boolean),
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
  allowed: boolean,
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
  titleSnapshot: optionalField(nullableField(multiline(1000))),
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
const submissionPlatform = exactObject({
  id,
  displayName: text(1000),
  contentQueueImport: optionalField(boolean),
});
const publicationSummary = exactObject({
  status: text(80),
  label: optionalField(text(80)),
  records: integerField({ min: 0, max: 10000 }),
  published: integerField({ min: 0, max: 10000 }),
  uncertain: boolean,
});
const targetFact = exactObject({
  targetKey: text(500),
  status: text(80),
  canCancel: boolean,
  publicationId: optionalNullableText(200),
  displayName: optionalNullableText(1000),
  batchId: optionalNullableText(200),
});
const operationDecision = exactObject({
  allowed: boolean,
  reasonCodes: arrayField(text(128), { max: 32 }),
  safeMetadata: exactObject({
    articleId: optionalField(id),
    stage: optionalField(text(80)),
    targetKeys: optionalField(arrayField(text(500), { max: 1000 })),
    hasPublished: optionalField(boolean),
    hasActiveTarget: optionalField(boolean),
    hasUncertain: optionalField(boolean),
    isTrash: optionalField(boolean),
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
    canEdit: boolean,
    canQueue: boolean,
    canCancel: boolean,
    canTrash: boolean,
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
  lifecycleCounts: optionalField(exactObject({
    pending_submission: integerField({ min: 0, max: 10000 }),
    queued: integerField({ min: 0, max: 10000 }),
    paid_processing: integerField({ min: 0, max: 10000 }),
    failed: integerField({ min: 0, max: 10000 }),
    published: integerField({ min: 0, max: 10000 }),
    trash: integerField({ min: 0, max: 10000 }),
    total: integerField({ min: 0, max: 10000 }),
  })),
});

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
  return projectFields(value, ["status", "label", "records", "published", "uncertain"]);
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
  if (Array.isArray(value && value.reasonCodes)) output.reasonCodes = value.reasonCodes.map((item) => String(item));
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
      allowed: source.allowed === undefined ? fallbackAllowed === true : source.allowed === true,
      reasonCodes: Array.isArray(source.reasonCodes) ? source.reasonCodes.map((item) => String(item)) : [],
      safeMetadata: metadata,
    };
  };
  output.operations = {
    edit: projectOperation(value && value.operations && value.operations.edit, output.locks.canEdit),
    queue: projectOperation(value && value.operations && value.operations.queue, output.locks.canQueue),
    retarget: projectOperation(value && value.operations && value.operations.retarget, false),
    trash: projectOperation(value && value.operations && value.operations.trash, output.locks.canTrash),
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
      : { lifecycleCounts: projectFields(snapshot.lifecycleCounts, [
          "pending_submission",
          "queued",
          "paid_processing",
          "failed",
          "published",
          "trash",
          "total",
        ]) }),
  };
}
const generationRequest = exactObject({
  clientId: id,
  materialIds: arrayField(id, { min: 1, max: 50 }),
  researchQueryIds: arrayField(id, { min: 1, max: 50 }),
  platform: id,
  templateId: id,
  templateCatalogRevision: optionalField(text(256)),
});
const articleEditorRequest = exactObject({ clientId: id, articleId: id });
const articleSelectionList = arrayField(selection, { min: 1, max: 10000 });
const removalPreviewRequest = exactObject({
  selections: optionalField(articleSelectionList),
  articles: optionalField(articleSelectionList),
});
const removalCommitRequest = exactObject({
  selections: optionalField(articleSelectionList),
  articles: optionalField(articleSelectionList),
  token: optionalField(opaqueToken),
  legacy: optionalField(boolean),
  confirmed: literalField(true),
});

function coreContract(channel, kind) {
  const base = {
    capability: channel
      .replace(":", ".")
      .replace(/-([a-z])/g, (_, value) => value.toUpperCase()),
    channel,
    feature: "content",
    kind,
    errorCodes,
    errors,
  };
  const direct = (args) => args[0] || {};
  const directInput = (payload) => [payload];
  const noArgs = () => ({});
  const noInput = () => [undefined];
  const definitions = {
    "content:list-clients": {
      request: empty,
      success: exactObject({
        clients: arrayField(contentClient, { max: 10000 }),
      }),
      fromArgs: noArgs,
      toArgs: noInput,
    },
    "content:list-research": {
      request: exactObject({ clientId: id }),
      success: exactObject({ research: arrayField(research, { max: 10000 }) }),
      fromArgs: (args) => ({ clientId: args[0] }),
      toArgs: (payload) => [payload.clientId],
    },
    "content:list-template-catalog": {
      request: empty,
      success: templateCatalog,
      fromArgs: noArgs,
      toArgs: noInput,
    },
    "content:retry-material": {
      request: exactObject({ clientId: id, materialId: id }),
      success: exactObject({ material: contentMaterial }),
      fromArgs: direct,
      toArgs: directInput,
    },
    "content:generate-article": {
      request: generationRequest,
      success: exactObject({ article: generatedArticle }),
      fromArgs: direct,
      toArgs: directInput,
    },
    "content:save-article": {
      request: exactObject({
        article: generatedArticle,
        expectedFingerprint: opaqueToken,
      }),
      success: saveArticleResult,
      fromArgs: (args) => args[0] || {},
      toArgs: (payload) => [payload],
    },
    "content:get-article-editor": {
      request: articleEditorRequest,
      success: articleEditor,
      fromArgs: direct,
      toArgs: directInput,
    },
    "content:preview-article-removal-impact": {
      request: removalPreviewRequest,
      success: impactPreview,
      fromArgs: direct,
      toArgs: directInput,
    },
    "content:trash-articles": {
      request: removalCommitRequest,
      success: trashCommitResult,
      fromArgs: direct,
      toArgs: directInput,
    },
    "content:restore-article": {
      request: selection,
      success: exactObject({
        article: generatedArticle,
        restored: boolean,
        queueRestored: boolean,
        message: text(1000),
      }),
      fromArgs: direct,
      toArgs: directInput,
    },
    "content:prepare-permanent-delete-article": {
      request: selection,
      success: permanentDeleteConfirmation,
      fromArgs: direct,
      toArgs: directInput,
    },
    "content:permanently-delete-article": {
      request: exactObject({ clientId: id, articleId: id, token: opaqueToken }),
      success: permanentDeleteResult,
      fromArgs: direct,
      toArgs: directInput,
    },
    "content:get-article-management-snapshot": {
      request: exactObject({ clientId: id }),
      success: managementSnapshot,
      fromArgs: direct,
      toArgs: directInput,
    },
  };
  return defineContract({ ...base, ...definitions[channel] });
}

function articleAttentionListContract() {
  return defineContract({
    capability: "attention.listArticleAttention",
    channel: "content:list-article-attention",
    feature: "attention",
    kind: "query",
    request: exactObject({ clientId: optionalField(id) }),
    success: articleAttentionList,
    fromArgs: (args) => args[0] || {},
    toArgs: (payload) => [payload],
    errorCodes,
    errors,
  });
}

function articleAttentionPreviewContract() {
  return defineContract({
    capability: "attention.previewArticleAttention",
    channel: "content:preview-article-attention",
    feature: "attention",
    kind: "query",
    request: exactObject({
      attentionId: id,
      action: stringField({ max: 80 }),
      clientId: optionalField(id),
    }),
    success: exactObject({
      attentionId: id,
      revision: integerField({ min: 0 }),
      action: stringField({ max: 80 }),
      requiresConfirmation: "boolean",
      message: text(1000),
      changedScopes: arrayField(stringField({ max: 80 }), { max: 32 }),
    }),
    fromArgs: (args) => args[0] || {},
    toArgs: (payload) => [payload],
    errorCodes,
    errors,
  });
}

function articleAttentionResolveContract() {
  return defineContract({
    capability: "attention.resolveArticleAttention",
    channel: "content:resolve-article-attention",
    feature: "attention",
    kind: "command",
    request: exactObject({
      attentionId: id,
      action: stringField({ max: 80 }),
      expectedRevision: integerField({ min: 0 }),
      confirmed: optionalField("boolean"),
      clientId: optionalField(id),
    }),
    success: exactObject({
      outcome: stringField({ max: 80 }),
      attentionId: id,
      changedScopes: arrayField(stringField({ max: 80 }), { max: 32 }),
    }),
    fromArgs: (args) => args[0] || {},
    toArgs: (payload) => [payload],
    errorCodes,
    errors,
  });
}

function articleRemovalContract(channel, kind) {
  const retry = channel === "content:retry-article-removal-transaction";
  return defineContract({
    capability: retry
      ? "content.retryArticleRemovalTransaction"
      : "content.getArticleRemovalTransaction",
    channel,
    feature: "content",
    kind,
    request: exactObject({
      transactionId: id,
      ...(retry ? { confirmed: literalField(true) } : {}),
    }),
    success: exactObject({ transaction: articleRemovalTransaction }),
    fromArgs: (args) => args[0] || {},
    toArgs: (payload) => [payload],
    errorCodes,
    errors,
  });
}

const invokeChannels = [
  ["content:list-clients", "query"],
  ["content:list-research", "query"],
  ["content:list-template-catalog", "query"],
  ["content:retry-material", "command"],
  ["content:generate-article", "command"],
  ["content:save-article", "command"],
  ["content:get-article-editor", "query"],
  ["content:preview-article-removal-impact", "query"],
  ["content:trash-articles", "command"],
  ["content:restore-article", "command"],
  ["content:prepare-permanent-delete-article", "command"],
  ["content:permanently-delete-article", "command"],
  ["content:get-article-removal-transaction", "query"],
  ["content:retry-article-removal-transaction", "command"],
  ["content:get-article-management-snapshot", "query"],
  ["content:list-article-attention", "query"],
  ["content:preview-article-attention", "query"],
  ["content:resolve-article-attention", "command"],
];

const contentCoreContracts = Object.freeze([
  ...invokeChannels.map(([channel, kind]) =>
    channel === "content:list-article-attention"
      ? articleAttentionListContract()
      : channel === "content:preview-article-attention"
          ? articleAttentionPreviewContract()
          : channel === "content:resolve-article-attention"
            ? articleAttentionResolveContract()
            : [
                  "content:get-article-removal-transaction",
                  "content:retry-article-removal-transaction",
                ].includes(channel)
              ? articleRemovalContract(channel, kind)
              : coreContract(channel, kind),
  ),
  defineContract({
    capability: "content.articleRemovalTransactionChanged",
    channel: "content:article-removal-transaction",
    feature: "content",
    kind: "event",
    event: articleRemovalTransaction,
    errorCodes: [],
  }),
]);

module.exports = {
  contentCoreContracts,
  contentCoreErrors: errors,
  projectArticle: projectArticle,
  projectClient: projectClient,
  projectImpactPreview: projectImpactPreview,
  projectManagementSnapshot: projectManagementSnapshot,
  projectMaterial: projectMaterial,
  projectPermanentDeleteConfirmation: projectPermanentDeleteConfirmation,
  projectPermanentDeleteResult: projectPermanentDeleteResult,
  projectResearch: projectResearch,
  projectTemplate: projectTemplate,
  projectTemplateCatalog: projectTemplateCatalog,
  projectTrashCommitResult: projectTrashCommitResult,
  projectTrashRecord: projectTrashRecord,
  projectArticleAttentionItem,
  projectArticleAttentionList,
  projectArticleAttentionPreview,
  projectArticleAttentionResolution,
  projectArticleRemovalTransaction,
};
