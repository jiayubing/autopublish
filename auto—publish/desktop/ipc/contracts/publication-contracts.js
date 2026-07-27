const {
  arrayField,
  defineContract,
  enumField,
  exactObject,
  integerField,
  literalField,
  nullableField,
  optionalField,
  stringField,
} = require("./registry");

const id = stringField({
  min: 1,
  max: 200,
  pattern: /^[A-Za-z0-9_.:-]+$/u,
});
const articleId = stringField({
  min: 1,
  max: 200,
  pattern: /^[A-Za-z0-9_.-]+$/u,
});
const code = stringField({
  min: 1,
  max: 128,
  pattern: /^[A-Z0-9][A-Z0-9_.:-]*$/u,
});
const safeText = (max, min = 0) =>
  stringField({ min, max, pattern: /^[^\x00-\x1f\x7f\\]*$/u });
const timestamp = safeText(64, 1);
const remoteUrl = stringField({
  min: 1,
  max: 2048,
  pattern: /^https?:\/\/[^\s\\]+$/u,
});
const status = enumField([
  "queued",
  "submitting",
  "submitted",
  "published",
  "uncertain",
  "failed",
  "cancelled",
]);

const attempt = exactObject({
  attemptId: nullableField(id),
  status: nullableField(status),
  createdAt: nullableField(timestamp),
  updatedAt: nullableField(timestamp),
  startedAt: nullableField(timestamp),
  finishedAt: nullableField(timestamp),
  remoteId: nullableField(safeText(512, 1)),
  remoteUrl: nullableField(remoteUrl),
  errorCode: nullableField(code),
  reasonCode: nullableField(code),
});
const record = exactObject({
  version: optionalField(integerField({ min: 1, max: 100 })),
  publicationId: id,
  clientId: articleId,
  articleId: nullableField(articleId),
  articleKey: id,
  targetKey: id,
  platformId: nullableField(id),
  mediaResourceId: nullableField(id),
  displayName: nullableField(safeText(256, 1)),
  status,
  createdAt: timestamp,
  updatedAt: timestamp,
  attempts: arrayField(attempt, { max: 1000 }),
  attemptId: nullableField(id),
  remoteId: nullableField(safeText(512, 1)),
  remoteUrl: nullableField(remoteUrl),
  errorCode: nullableField(code),
  reasonCode: nullableField(code),
});

const COMMON_ERRORS = {
  AUTH_REQUIRED: {
    category: "authentication",
    retryability: "never",
    userMessage: "请先完成登录后再继续。",
  },
  IPC_REQUEST_INVALID: {
    category: "validation",
    retryability: "never",
    userMessage: "发布记录请求无效，请刷新页面后重试。",
  },
  IPC_RESULT_INVALID: {
    category: "internal",
    retryability: "manual-check",
    userMessage: "发布记录结果未通过安全校验，请刷新后重试。",
  },
  IPC_INTERNAL: {
    category: "internal",
    retryability: "manual-check",
    userMessage: "发布记录操作未能安全完成，请检查诊断信息。",
  },
};
const OWNED_ERRORS = {
  PUBLICATION_HISTORY_INPUT_INVALID: "发布记录查询输入无效。",
  PUBLICATION_ARTICLE_ID_INVALID: "客户或文章标识无效。",
  PUBLICATION_ARTICLE_IDS_INVALID: "文章标识列表无效。",
  PUBLICATION_RECONCILE_INVALID: "发布核对输入无效。",
  PUBLICATION_RECONCILE_CONFIRMATION_REQUIRED: "发布核对需要明确确认。",
  PUBLICATION_ID_INVALID: "发布记录标识无效。",
  PUBLICATION_RECONCILE_EVIDENCE_REQUIRED: "发布核对缺少可靠远端证据。",
};
const errors = Object.freeze({
  ...COMMON_ERRORS,
  ...Object.fromEntries(
    Object.entries(OWNED_ERRORS).map(([errorCode, userMessage]) => [
      errorCode,
      { category: "validation", retryability: "never", userMessage },
    ]),
  ),
});
const errorCodes = Object.freeze(Object.keys(errors));
const directArgs = (args) => args[0] || {};
const directInput = (payload) => [payload];

const publicationContracts = Object.freeze([
  defineContract({
    capability: "publication.listForArticles",
    channel: "publication:list-for-articles",
    feature: "content",
    kind: "query",
    request: exactObject({
      clientId: articleId,
      articleIds: arrayField(articleId, { max: 2000 }),
    }),
    success: exactObject({ records: arrayField(record, { max: 2000 }) }),
    fromArgs: directArgs,
    toArgs: directInput,
    errors,
    errorCodes,
  }),
  defineContract({
    capability: "publication.reconcile",
    channel: "publication:reconcile",
    feature: "content",
    kind: "command",
    request: exactObject({
      publicationId: id,
      status: enumField(["published", "failed"]),
      reasonCode: code,
      confirmed: literalField(true),
    }),
    success: exactObject({ record }),
    fromArgs: directArgs,
    toArgs: directInput,
    errors,
    errorCodes,
  }),
]);

module.exports = { publicationContracts };
