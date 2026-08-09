const {
  defineContract,
  exactObject,
  integerField,
  multilineStringField,
  stringField,
} = require("./registry");

const id = stringField({ min: 1, max: 200, pattern: /^[A-Za-z0-9_.:-]+$/u });
const clientIdentity = stringField({
  max: 200,
  pattern: /^(?!\.{1,2}$)(?!.*[\\/])(?=\S)[^\x00-\x1f\x7f]*\S$/u,
});
const safeText = (max, min = 0) =>
  stringField({ min, max, pattern: /^[^\x00-\x1f\x7f\\/]*$/u });
const contentText = (max, min = 0) => multilineStringField({ min, max });
const code = stringField({ min: 1, max: 128, pattern: /^[A-Z][A-Z0-9_]*$/u });
const count = integerField({ min: 0, max: 100000 });
const revision = integerField({ min: 0, max: Number.MAX_SAFE_INTEGER });
const emptyRequest = exactObject({});
const noArgs = () => ({});
const noLegacyInput = () => [undefined];
const directArgs = (args) => args[0] || {};
const directInput = (payload) => [payload];

const articleRef = exactObject({ clientId: clientIdentity, articleId: id });

const COMMON_ERRORS = Object.freeze({
  AUTH_REQUIRED: {
    category: "authentication",
    retryability: "never",
    userMessage: "请先完成登录后再继续。",
  },
  IPC_REQUEST_INVALID: {
    category: "validation",
    retryability: "never",
    userMessage: "投稿请求无效，请刷新后重试。",
  },
  IPC_RESULT_INVALID: {
    category: "internal",
    retryability: "manual-check",
    userMessage: "投稿结果未通过安全校验，请刷新后重试。",
  },
  IPC_INTERNAL: {
    category: "internal",
    retryability: "manual-check",
    userMessage: "投稿操作未能安全完成，请检查诊断信息。",
  },
  CONTENT_EXPORT_CONFIRMATION_REQUIRED: {
    category: "validation",
    retryability: "never",
    userMessage: "请确认导出后继续。",
  },
  CONTENT_EXPORT_TARGET_INVALID: {
    category: "validation",
    retryability: "never",
    userMessage: "投稿目标无效。",
  },
  CONTENT_EXPORT_NOT_READY: {
    category: "conflict",
    retryability: "manual-check",
    userMessage: "文章尚未满足投稿条件。",
  },
  CONTENT_EXPORT_CONFLICT: {
    category: "conflict",
    retryability: "manual-check",
    userMessage: "投稿队列中存在冲突。",
  },
  CONTENT_SUBMISSION_BATCH_INPUT_INVALID: {
    category: "validation",
    retryability: "never",
    userMessage: "投稿批次请求无效。",
  },
  CONTENT_SUBMISSION_INPUT_INVALID: {
    category: "validation",
    retryability: "never",
    userMessage: "投稿操作请求无效。",
  },
  CONTENT_SUBMISSION_CONFIRMATION_REQUIRED: {
    category: "validation",
    retryability: "never",
    userMessage: "请确认投稿操作后继续。",
  },
  ACCOUNT_PROFILE_REQUIRED: {
    category: "validation",
    retryability: "never",
    userMessage: "请为每个投稿平台选择账号。",
  },
  CONTENT_SUBMISSION_ARTICLE_NOT_FOUND: {
    category: "validation",
    retryability: "never",
    userMessage: "所选文章不存在。",
  },
  SUBMISSION_ACTION_PLAN_INVALID: {
    category: "conflict",
    retryability: "safe",
    userMessage: "操作预检已失效，请重新预检。",
  },
  SUBMISSION_ACTION_STALE: {
    category: "conflict",
    retryability: "safe",
    userMessage: "投稿状态已变化，请重新预检。",
  },
  PUBLICATION_RETRY_REQUIRES_WORKFLOW: {
    category: "conflict",
    retryability: "manual-check",
    userMessage: "请从失败投稿工作流发起重试。",
  },
  ARTICLE_ATTENTION_STALE: {
    category: "conflict",
    retryability: "safe",
    userMessage: "投稿状态已变化，请重新预检。",
  },
  REGULAR_QUEUE_INPUT_INVALID: {
    category: "validation",
    retryability: "never",
    userMessage: "普通平台队列请求无效。",
  },
  REGULAR_QUEUE_CONFIRMATION_REQUIRED: {
    category: "validation",
    retryability: "never",
    userMessage: "请确认加入或移除普通平台队列。",
  },
  REGULAR_QUEUE_SINGLE_TARGET_REQUIRED: {
    category: "validation",
    retryability: "never",
    userMessage: "一次只能选择一个普通平台和账号。",
  },
  REGULAR_QUEUE_PLATFORM_REQUIRED: {
    category: "validation",
    retryability: "never",
    userMessage: "请选择普通平台，不支持网站媒体目标。",
  },
  REGULAR_QUEUE_PLATFORM_UNSUPPORTED: {
    category: "validation",
    retryability: "never",
    userMessage: "该平台当前不支持普通队列。",
  },
  REGULAR_QUEUE_TARGET_INVALID: {
    category: "validation",
    retryability: "never",
    userMessage: "普通平台目标无效。",
  },
  REGULAR_QUEUE_CONFIG_INVALID: {
    category: "validation",
    retryability: "never",
    userMessage: "普通平台队列配置无效。",
  },
  REGULAR_QUEUE_ARTICLES_REQUIRED: {
    category: "validation",
    retryability: "never",
    userMessage: "请选择至少一篇文章。",
  },
  REGULAR_QUEUE_ARTICLE_IDENTITY_INVALID: {
    category: "validation",
    retryability: "manual-check",
    userMessage: "文章身份无法安全解析。",
  },
  REGULAR_QUEUE_ITEMS_REQUIRED: {
    category: "validation",
    retryability: "never",
    userMessage: "请选择至少一个待执行队列项。",
  },
  REGULAR_QUEUE_ITEM_INVALID: {
    category: "validation",
    retryability: "never",
    userMessage: "普通平台队列项无效。",
  },
  REGULAR_QUEUE_ITEM_NOT_FOUND: {
    category: "conflict",
    retryability: "safe",
    userMessage: "队列项已不存在，请刷新后重试。",
  },
  REGULAR_QUEUE_ITEM_NOT_REMOVABLE: {
    category: "conflict",
    retryability: "never",
    userMessage: "该队列项已经开始或结果需要核对，不能本地移除。",
  },
  REGULAR_QUEUE_FACT_CONFLICT: {
    category: "conflict",
    retryability: "manual-check",
    userMessage: "普通平台队列事实不一致，需要刷新或人工核对。",
  },
  REGULAR_QUEUE_TRANSITION_UNAVAILABLE: {
    category: "internal",
    retryability: "manual-check",
    userMessage: "普通平台队列事务当前不可用。",
  },
  REGULAR_QUEUE_SNAPSHOT_INVALID: {
    category: "internal",
    retryability: "manual-check",
    userMessage: "投稿快照未通过安全校验。",
  },
  REGULAR_QUEUE_ADMISSION_INVALID: {
    category: "validation",
    retryability: "never",
    userMessage: "普通平台入队事实无效。",
  },
  REGULAR_QUEUE_BATCH_CONFLICT: {
    category: "conflict",
    retryability: "safe",
    userMessage: "普通平台入队批次已变化，请刷新后重试。",
  },
  REGULAR_QUEUE_ITEM_CONFLICT: {
    category: "conflict",
    retryability: "safe",
    userMessage: "普通平台队列项发生冲突，请刷新后重试。",
  },
  ACCOUNT_PROFILE_NOT_FOUND: {
    category: "validation",
    retryability: "never",
    userMessage: "平台账号档案不存在。",
  },
  ACCOUNT_PROFILE_PLATFORM_MISMATCH: {
    category: "validation",
    retryability: "never",
    userMessage: "平台账号档案与普通平台不匹配。",
  },
  ARTICLE_ACTIVE_TARGET_CONFLICT: {
    category: "conflict",
    retryability: "safe",
    userMessage: "文章已有活动投稿目标，请刷新后重试。",
  },
  ARTICLE_OPERATION_FROZEN: {
    category: "conflict",
    retryability: "safe",
    userMessage: "文章当前处于冻结阶段。",
  },
  ARTICLE_CONTENT_INCOMPLETE: {
    category: "validation",
    retryability: "never",
    userMessage: "文章标题和正文必须完整。",
  },
  ARTICLE_NOT_FOUND: {
    category: "validation",
    retryability: "never",
    userMessage: "所选文章不存在。",
  },
  PUBLICATION_UNCERTAIN: {
    category: "conflict",
    retryability: "manual-check",
    userMessage: "投稿结果不确定，需要人工核对。",
  },
  PUBLICATION_CANCELLED: {
    category: "conflict",
    retryability: "never",
    userMessage: "该投稿事实已终止，不能继续写入远端结果。",
  },
  REGULAR_QUEUE_SINGLE_CLIENT_REQUIRED: {
    category: "validation",
    retryability: "never",
    userMessage: "一次普通平台入队只能包含同一客户的文章。",
  },
  PAID_MEDIA_ARTICLES_REQUIRED: {
    category: "validation",
    retryability: "never",
    userMessage: "请至少选择一篇文章进行付费预检。",
  },
  PAID_MEDIA_ARTICLE_IDENTITY_INVALID: {
    category: "validation",
    retryability: "never",
    userMessage: "付费投稿文章身份无效。",
  },
  PAID_MEDIA_ARTICLE_NOT_FOUND: {
    category: "validation",
    retryability: "never",
    userMessage: "所选付费文章不存在。",
  },
  PAID_MEDIA_RESOURCE_REQUIRED: {
    category: "validation",
    retryability: "never",
    userMessage: "请选择一个媒体资源。",
  },
  PAID_MEDIA_RESOURCE_QUERY_FAILED: {
    category: "transport",
    retryability: "safe",
    userMessage: "媒体资源状态读取失败，请重新预检。",
  },
  PAID_MEDIA_RESOURCE_RECHECK_FAILED: {
    category: "transport",
    retryability: "safe",
    userMessage: "媒体资源复核失败，请重新预检。",
  },
  PAID_MEDIA_RESOURCE_UNAVAILABLE: {
    category: "conflict",
    retryability: "safe",
    userMessage: "媒体资源当前不可接单，请重新选择资源。",
  },
  PAID_MEDIA_RESOURCE_PRICE_INVALID: {
    category: "validation",
    retryability: "never",
    userMessage: "媒体资源报价无效，无法确认费用。",
  },
  PAID_MEDIA_ARTICLE_CONTENT_REQUIRED: {
    category: "validation",
    retryability: "never",
    userMessage: "文章标题和正文必须完整。",
  },
  PAID_MEDIA_TITLE_TOO_LONG: {
    category: "validation",
    retryability: "never",
    userMessage: "网站媒体标题不能超过 30 个字符。",
  },
  PAID_MEDIA_SYSTEM_SUBMISSION_CODE_REQUIRED: {
    category: "validation",
    retryability: "never",
    userMessage: "请先配置系统投稿标识码。",
  },
  PAID_MEDIA_SYSTEM_SUBMISSION_CODE_CHANGED: {
    category: "conflict",
    retryability: "safe",
    userMessage: "系统投稿标识码已变化，请重新预检。",
  },
  PAID_MEDIA_CONFIRMATION_REQUIRED: {
    category: "validation",
    retryability: "never",
    userMessage: "请先完成付费费用预检。",
  },
  PAID_MEDIA_CONFIRMATION_BLOCKED: {
    category: "validation",
    retryability: "never",
    userMessage: "当前内容或媒体资源不满足付费确认条件。",
  },
  PAID_MEDIA_CONFIRMATION_STALE: {
    category: "conflict",
    retryability: "safe",
    userMessage: "付费确认已过期，请重新预检。",
  },
  PAID_MEDIA_CUSTOMER_SNAPSHOT_INVALID: {
    category: "conflict",
    retryability: "never",
    userMessage: "客户身份快照不可用，未创建付费批次。",
  },
  PAID_MEDIA_CUSTOMER_SNAPSHOT_RESOLVER_REQUIRED: {
    category: "internal",
    retryability: "manual-check",
    userMessage: "客户身份读取能力不可用，未创建付费批次。",
  },
  PAID_ADMISSION_CUSTOMER_SNAPSHOT_INVALID: {
    category: "conflict",
    retryability: "never",
    userMessage: "客户身份快照无效，未创建付费批次。",
  },
  PAID_ADMISSION_TRANSITION_UNAVAILABLE: {
    category: "internal",
    retryability: "manual-check",
    userMessage: "付费批次事务当前不可用。",
  },
  PAID_ADMISSION_CONFIRMATION_FINGERPRINT_REQUIRED: {
    category: "validation",
    retryability: "never",
    userMessage: "付费确认指纹缺失，请重新预检。",
  },
  PAID_ADMISSION_CONFIRMATION_INVALID: {
    category: "validation",
    retryability: "never",
    userMessage: "付费确认快照无效，请重新预检。",
  },
  PAID_ADMISSION_TARGET_INVALID: {
    category: "validation",
    retryability: "never",
    userMessage: "付费媒体资源目标无效。",
  },
  PAID_ADMISSION_MEDIA_REQUIRED: {
    category: "validation",
    retryability: "never",
    userMessage: "付费批次必须绑定一个媒体资源。",
  },
  PAID_ADMISSION_ARTICLES_REQUIRED: {
    category: "validation",
    retryability: "never",
    userMessage: "付费批次至少需要一篇文章。",
  },
  PAID_ADMISSION_ARTICLE_INVALID: {
    category: "validation",
    retryability: "never",
    userMessage: "付费批次文章身份无效。",
  },
  PAID_ADMISSION_ITEM_INVALID: {
    category: "validation",
    retryability: "never",
    userMessage: "付费批次项无效，请重新预检。",
  },
  PAID_ADMISSION_SNAPSHOT_INVALID: {
    category: "validation",
    retryability: "never",
    userMessage: "付费文章快照无效，请重新预检。",
  },
  PAID_ADMISSION_ARTICLE_DUPLICATE: {
    category: "validation",
    retryability: "never",
    userMessage: "同一付费批次不能重复选择文章。",
  },
  PAID_ADMISSION_ARTICLE_COUNT_INVALID: {
    category: "validation",
    retryability: "never",
    userMessage: "付费批次文章数量已变化，请重新预检。",
  },
  PAID_ADMISSION_PRICE_INVALID: {
    category: "validation",
    retryability: "never",
    userMessage: "付费确认金额无效，请重新预检。",
  },
  PAID_ADMISSION_BATCH_CONFLICT: {
    category: "conflict",
    retryability: "safe",
    userMessage: "付费批次已发生变化，请刷新后重新预检。",
  },
  PAID_ADMISSION_TRANSACTION_FAILED: {
    category: "storage",
    retryability: "safe",
    userMessage: "付费批次事务已回滚，请重试确认。",
  },
  PAID_ADMISSION_FAILED: {
    category: "internal",
    retryability: "manual-check",
    userMessage: "付费批次未能安全建立，请检查诊断信息。",
  },
  PAID_EXECUTION_BATCH_INVALID: {
    category: "validation",
    retryability: "never",
    userMessage: "付费批次身份无效。",
  },
  PAID_EXECUTION_BATCH_NOT_FOUND: {
    category: "conflict",
    retryability: "safe",
    userMessage: "付费批次已不存在，请刷新后重试。",
  },
  PAID_EXECUTION_MANUAL_RESOLUTION_REQUIRED: {
    category: "conflict",
    retryability: "manual-check",
    userMessage: "该付费批次需要先完成人工核对，不能继续创建订单。",
  },
  PAID_MEDIA_EXECUTION_UNAVAILABLE: {
    category: "internal",
    retryability: "manual-check",
    userMessage: "付费批次执行当前不可用。",
  },
  OPERATIONAL_SYSTEM_SUBMISSION_CODE_REQUIRED: {
    category: "validation",
    retryability: "never",
    userMessage: "请先配置系统投稿标识码。",
  },
  PUBLICATION_DUPLICATE: {
    category: "conflict",
    retryability: "safe",
    userMessage: "文章已有该媒体资源的发布记录。",
  },
  PUBLICATION_TARGET_CONFLICT: {
    category: "conflict",
    retryability: "safe",
    userMessage: "文章已有其他活动投稿目标。",
  },
  ARTICLE_MUTATION_BUSY: {
    category: "conflict",
    retryability: "safe",
    userMessage: "文章正在被其他操作修改，请稍后重试。",
  },
  ARTICLE_MUTATION_RESULT_UNCERTAIN: {
    category: "conflict",
    retryability: "manual-check",
    userMessage: "付费文章状态需要人工核对。",
  },
  PAID_MEDIA_PREFLIGHT_UNAVAILABLE: {
    category: "internal",
    retryability: "manual-check",
    userMessage: "付费媒体预检当前不可用。",
  },
});

const errorCodes = Object.freeze(Object.keys(COMMON_ERRORS));
function submissionContract(input) {
  return defineContract({
    feature: "content",
    ...input,
    errorCodes,
    errors: COMMON_ERRORS,
  });
}

function include(output, input, key) {
  if (input[key] !== undefined) output[key] = input[key];
}

function projectArticleRef(value) {
  const input = value || {};
  return { clientId: input.clientId, articleId: input.articleId };
}

module.exports = {
  id,
  clientIdentity,
  safeText,
  code,
  count,
  revision,
  emptyRequest,
  noArgs,
  noLegacyInput,
  directArgs,
  directInput,
  articleRef,
  submissionContract,
  submissionErrorCodes: errorCodes,
  submissionErrors: COMMON_ERRORS,
  include,
  projectArticleRef,
};
