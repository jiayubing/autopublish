const {
  arrayField,
  enumField,
  exactObject,
  integerField,
  literalField,
  nullableField,
  oneOf,
  optionalField,
} = require("./registry");
const {
  boolean,
  contentContract,
  directArgs,
  directInput,
  id,
  multiline,
  opaqueToken,
  own,
  projectFields,
  projectReference,
  reference,
  text,
  timestamp,
} = require("./content-core-contract-shared");

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
  materialIds: optionalField(arrayField(id, { max: 1000 })),
  researchQueryIds: optionalField(arrayField(id, { max: 1000 })),
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
  generationOperationId: optionalField(nullableField(id)),
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

// Single-generation failures cross the same authenticated content seam as
// article data. Keep their stable codes and safe user messages here; otherwise
// the typed transport collapses a useful provider/storage error into IPC_INTERNAL.
const singleGenerationErrors = Object.freeze({
  AI_CONFIG_INVALID: { category: "validation", retryability: "never", userMessage: "AI 配置无效，请检查设置后重试。" },
  AI_CONFIG_NOT_SET: { category: "validation", retryability: "never", userMessage: "尚未配置 AI，请先在设置中完成配置。" },
  AI_CONFIG_BUSY: { category: "conflict", retryability: "safe", userMessage: "AI 配置正在使用，请稍后重试。" },
  AI_CONFIG_ENV_OVERRIDE: { category: "validation", retryability: "never", userMessage: "AI 配置由环境变量管理，无法在此修改。" },
  AI_TIMEOUT: { category: "transport", retryability: "manual-check", userMessage: "AI 请求超时，结果需要人工核对后再继续。" },
  AI_ABORTED: { category: "conflict", retryability: "safe", userMessage: "AI 请求已中止，请重新发起生成。" },
  AI_UNAUTHORIZED: { category: "authentication", retryability: "never", userMessage: "AI 凭据无效，请检查配置后重试。" },
  AI_FORBIDDEN: { category: "authentication", retryability: "never", userMessage: "AI 服务拒绝了当前凭据，请检查权限。" },
  AI_MODEL_NOT_FOUND: { category: "validation", retryability: "never", userMessage: "AI 模型不存在，请检查模型配置。" },
  AI_RATE_LIMITED: { category: "remote", retryability: "safe", userMessage: "AI 请求过于频繁，请稍后重试。" },
  AI_REQUEST_FAILED: { category: "remote", retryability: "manual-check", userMessage: "AI 请求失败，请检查诊断信息后再继续。" },
  AI_EMPTY_RESPONSE: { category: "remote", retryability: "safe", userMessage: "AI 未返回有效内容，请稍后重试。" },
  CLIENT_NOT_FOUND: { category: "validation", retryability: "never", userMessage: "当前客户不存在，请刷新客户列表。" },
  CLIENT_MATERIAL_REQUIRED: { category: "validation", retryability: "never", userMessage: "请至少选择一份有效客户资料。" },
  CLIENT_MATERIAL_INVALID: { category: "validation", retryability: "never", userMessage: "所选客户资料不可用，请刷新后重新选择。" },
  GEO_RESEARCH_REQUIRED: { category: "validation", retryability: "never", userMessage: "请至少选择一条有效调研回答。" },
  RESEARCH_EMPTY_ANSWER: { category: "validation", retryability: "never", userMessage: "所选调研回答为空，请重新采集或选择其他回答。" },
  TEMPLATE_CATALOG_STALE: { category: "conflict", retryability: "safe", userMessage: "模板目录已变化，请刷新后重新选择模板。" },
  TEMPLATE_NOT_FOUND: { category: "validation", retryability: "never", userMessage: "写作模板不存在，请刷新模板目录。" },
  CONTENT_GENERATION_BUSY: { category: "conflict", retryability: "safe", userMessage: "已有一篇文章正在生成，请稍后再试。" },
  CONTENT_GENERATION_ID_CONFLICT: { category: "conflict", retryability: "manual-check", userMessage: "生成操作身份存在冲突，请刷新后重新发起。" },
  CONTENT_GENERATION_INVALID: { category: "internal", retryability: "manual-check", userMessage: "AI 返回的文章格式无效，请检查诊断信息。" },
  CONTENT_STORE_REQUIRED: { category: "storage", retryability: "manual-check", userMessage: "文章存储不可用，请检查工作区和诊断信息。" },
  CONTENT_RUNTIME_DISPOSED: { category: "conflict", retryability: "safe", userMessage: "工作区正在切换，请稍后重试。" },
});
const generationRequest = exactObject({
  generationOperationId: optionalField(id),
  articleCount: optionalField(integerField({ min: 1, max: 100 })),
  clientId: id,
  materialIds: arrayField(id, { min: 1, max: 50 }),
  researchQueryIds: arrayField(id, { min: 1, max: 50 }),
  platform: id,
  templateId: id,
  templateCatalogRevision: optionalField(text(256)),
});
const generationOperationItem = exactObject({
  index: integerField({ min: 0, max: 99 }),
  article: generatedArticle,
});
const generationOperationFailure = exactObject({
  index: integerField({ min: 0, max: 99 }),
  code: text(128, 1),
});
const generationOperation = exactObject({
  operationId: id,
  articleCount: integerField({ min: 1, max: 100 }),
  status: enumField(["completed", "partial", "failed"]),
  articles: arrayField(generationOperationItem, { max: 100 }),
  failures: arrayField(generationOperationFailure, { max: 100 }),
});
const articleEditorRequest = exactObject({ clientId: id, articleId: id });

const articleEditorContracts = Object.freeze([
  contentContract({
    capability: "content.generateArticle",
    channel: "content:generate-article",
    feature: "content",
    kind: "command",
    request: generationRequest,
    success: exactObject({ article: oneOf([generatedArticle, generationOperation]) }),
    fromArgs: directArgs,
    toArgs: directInput,
  }, singleGenerationErrors),
  contentContract({
    capability: "content.saveArticle",
    channel: "content:save-article",
    feature: "content",
    kind: "command",
    request: exactObject({
      article: generatedArticle,
      expectedFingerprint: opaqueToken,
    }),
    success: saveArticleResult,
    fromArgs: directArgs,
    toArgs: directInput,
  }),
  contentContract({
    capability: "content.getArticleEditor",
    channel: "content:get-article-editor",
    feature: "content",
    kind: "query",
    request: articleEditorRequest,
    success: articleEditor,
    fromArgs: directArgs,
    toArgs: directInput,
  }),
]);

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
    "generationOperationId",
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

module.exports = {
  articleEditorContracts,
  singleGenerationErrors,
  generatedArticle,
  projectArticle,
};
