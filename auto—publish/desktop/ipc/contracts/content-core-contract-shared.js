const {
  defineContract,
  exactObject,
  nullableField,
  optionalField,
  stringField,
  multilineStringField,
} = require("./registry");

const emptyRequest = exactObject({});
const contentCoreErrors = Object.freeze({
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
const contentCoreErrorCodes = Object.freeze(Object.keys(contentCoreErrors));

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

function contentContract(input) {
  const event = input.kind === "event";
  return defineContract({
    ...input,
    errorCodes: event ? [] : contentCoreErrorCodes,
    errors: event ? {} : contentCoreErrors,
  });
}

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

const reference = exactObject({
  title: text(1000),
  url: text(4096),
  snippet: optionalField(multiline(10000)),
});

function projectReference(value) {
  const output = projectFields(value, ["title", "url", "snippet"]);
  if (own(output, "title")) output.title = boundSingleLine(output.title, 1000);
  if (own(output, "url")) output.url = boundSingleLine(output.url, 4096);
  if (own(output, "snippet")) {
    if (typeof output.snippet !== "string") delete output.snippet;
    else output.snippet = boundMultiline(output.snippet, 10000);
  }
  return output;
}

const directArgs = (args) => args[0] || {};
const directInput = (payload) => [payload];
const noArgs = () => ({});
const noInput = () => [undefined];

module.exports = {
  boolean,
  boundMultiline,
  boundSingleLine,
  contentContract,
  contentCoreErrorCodes,
  contentCoreErrors,
  directArgs,
  directInput,
  emptyRequest,
  id,
  multiline,
  noArgs,
  noInput,
  opaqueToken,
  optionalNullableText,
  own,
  projectFields,
  projectReference,
  reference,
  text,
  timestamp,
};
