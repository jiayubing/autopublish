const {
  arrayField,
  enumField,
  exactObject,
  integerField,
  nullableField,
  literalField,
  oneOf,
  optionalField,
} = require("./registry");
const {
  boolean,
  contentContract,
  directArgs,
  directInput,
  emptyRequest,
  id,
  multiline,
  noArgs,
  noInput,
  own,
  projectFields,
  projectReference,
  reference,
  text,
  timestamp,
} = require("./content-core-contract-shared");

const materialError = exactObject({
  code: optionalField(text(128)),
  message: optionalField(text(200)),
});
const contentMaterial = exactObject({
  id: optionalField(id),
  name: text(500),
  extension: optionalField(text(32)),
  status: optionalField(text(80)),
  content: optionalField(multiline(2000000)),
  characterCount: optionalField(integerField({ min: 0, max: 2000000 })),
  error: optionalField(nullableField(materialError)),
  contentHash: optionalField(text(256)),
  source: optionalField(text(80)),
});
const liejuPublicationProfile = exactObject({
  city: text(100),
  contact: text(100),
  phone: text(50),
});
const publicationProfiles = exactObject({
  lieju: liejuPublicationProfile,
});
const contentClient = exactObject({
  id,
  name: text(500),
  searchQuery: optionalField(multiline(10000)),
  publicationProfiles,
  knowledgeFiles: arrayField(contentMaterial, { max: 10000 }),
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
const researchMetadata = exactObject({
  id,
  clientId: id,
  question: optionalField(multiline(10000)),
  collectionMethod: enumField(["automatic", "manual", "legacy"]),
  collectedAt: optionalField(timestamp),
  updatedAt: optionalField(timestamp),
  isAnswerComplete: optionalField(boolean),
  answerLength: optionalField(integerField({ min: 0, max: 2000000 })),
  referenceCount: optionalField(integerField({ min: 0, max: 1000 })),
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

const clientGroupCatalog = exactObject({
  revision: integerField({ min: 0 }),
  groups: arrayField(exactObject({ id, name: text(40) }), { max: 200 }),
  memberships: arrayField(exactObject({ clientId: id, groupId: id }), { max: 10000 }),
});
const groupRevision = integerField({ min: 0 });
const clientGroupErrors = Object.freeze({
  CLIENT_GROUP_INPUT_INVALID: { category: "validation", retryability: "never", userMessage: "分组名称须为 1–40 个字符，不能使用“全部客户”或“未分组”；请检查操作内容。" },
  CLIENT_GROUP_NAME_EXISTS: { category: "conflict", retryability: "never", userMessage: "已有同名客户分组，请换一个名称。" },
  CLIENT_GROUP_NOT_FOUND: { category: "conflict", retryability: "safe", userMessage: "客户分组已变化，请刷新后重新选择。" },
  CLIENT_GROUP_CLIENT_NOT_FOUND: { category: "conflict", retryability: "safe", userMessage: "部分客户已不存在，请刷新客户列表后重新选择。" },
  CLIENT_GROUP_CONFLICT: { category: "conflict", retryability: "safe", userMessage: "分组已被更新，请根据最新分组重新操作。" },
  CLIENT_GROUP_LIMIT: { category: "validation", retryability: "never", userMessage: "客户分组数量或成员数量已达上限。" },
  CLIENT_GROUP_DATA_INVALID: { category: "storage", retryability: "manual-check", userMessage: "客户分组文件无法读取，原文件已保留；请检查内容库后重试。" },
  CLIENT_GROUP_STORAGE_FAILED: { category: "storage", retryability: "manual-check", userMessage: "客户分组读写失败，请检查内容库并刷新分组后再操作。" },
  CLIENT_GROUP_UNAVAILABLE: { category: "conflict", retryability: "safe", userMessage: "客户分组暂不可用，请重新打开内容库。" },
});

const contentLibraryContracts = Object.freeze([
  contentContract({
    capability: "content.getClientGroups",
    channel: "content:get-client-groups",
    feature: "content",
    kind: "query",
    request: emptyRequest,
    success: clientGroupCatalog,
    fromArgs: noArgs,
    toArgs: noInput,
  }, clientGroupErrors),
  contentContract({
    capability: "content.updateClientGroups",
    channel: "content:update-client-groups",
    feature: "content",
    kind: "command",
    request: exactObject({ change: oneOf([
      exactObject({ action: literalField("create"), revision: groupRevision, name: text(40) }),
      exactObject({ action: literalField("rename"), revision: groupRevision, groupId: id, name: text(40) }),
      exactObject({ action: literalField("delete"), revision: groupRevision, groupId: id }),
      exactObject({ action: literalField("assign"), revision: groupRevision, groupId: nullableField(id), clientIds: arrayField(id, { min: 1, max: 10000 }) }),
    ]) }),
    success: clientGroupCatalog,
    fromArgs: (args) => ({ change: args[0] }),
    toArgs: (payload) => [payload.change],
  }, clientGroupErrors),
  contentContract({
    capability: "content.saveClientLiejuPublicationProfile",
    channel: "content:save-client-lieju-publication-profile",
    feature: "content",
    kind: "command",
    request: exactObject({ clientId: id, profile: liejuPublicationProfile }),
    success: exactObject({ profile: liejuPublicationProfile }),
    fromArgs: directArgs,
    toArgs: directInput,
  }),
  contentContract({
    capability: "content.getClientDetails",
    channel: "content:get-client-details",
    feature: "content",
    kind: "query",
    request: exactObject({ clientId: id }),
    success: exactObject({ client: contentClient, research: arrayField(research, { max: 10000 }) }),
    fromArgs: (args) => ({ clientId: args[0] }),
    toArgs: (payload) => [payload.clientId],
  }),
  contentContract({
    capability: "content.listClients",
    channel: "content:list-clients",
    feature: "content",
    kind: "query",
    request: emptyRequest,
    success: exactObject({
      clients: arrayField(contentClient, { max: 10000 }),
    }),
    fromArgs: noArgs,
    toArgs: noInput,
  }),
  contentContract({
    capability: "content.listResearchMetadata",
    channel: "content:list-research-metadata",
    feature: "content",
    kind: "query",
    request: exactObject({ clientId: id }),
    success: exactObject({ research: arrayField(researchMetadata, { max: 10000 }) }),
    fromArgs: (args) => ({ clientId: args[0] }),
    toArgs: (payload) => [payload.clientId],
  }),
  contentContract({
    capability: "content.listResearch",
    channel: "content:list-research",
    feature: "content",
    kind: "query",
    request: exactObject({ clientId: id }),
    success: exactObject({ research: arrayField(research, { max: 10000 }) }),
    fromArgs: (args) => ({ clientId: args[0] }),
    toArgs: (payload) => [payload.clientId],
  }),
  contentContract({
    capability: "content.listTemplateCatalog",
    channel: "content:list-template-catalog",
    feature: "content",
    kind: "query",
    request: emptyRequest,
    success: templateCatalog,
    fromArgs: noArgs,
    toArgs: noInput,
  }),
  contentContract({
    capability: "content.retryMaterial",
    channel: "content:retry-material",
    feature: "content",
    kind: "command",
    request: exactObject({ clientId: id, materialId: id }),
    success: exactObject({ material: contentMaterial }),
    fromArgs: directArgs,
    toArgs: directInput,
  }),
]);

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
  const lieju = value && value.publicationProfiles && value.publicationProfiles.lieju || {};
  output.publicationProfiles = {
    lieju: {
      city: typeof lieju.city === "string" ? lieju.city : "",
      contact: typeof lieju.contact === "string" ? lieju.contact : "",
      phone: typeof lieju.phone === "string" ? lieju.phone : "",
    },
  };
  output.knowledgeFiles = Array.isArray(value && value.knowledgeFiles)
    ? value.knowledgeFiles.map(projectMaterial)
    : [];
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

function projectResearchMetadata(value) {
  return projectFields(value, [
    "id", "clientId", "question", "collectionMethod", "collectedAt", "updatedAt",
    "isAnswerComplete", "answerLength", "referenceCount",
  ]);
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

module.exports = {
  contentClient,
  contentLibraryContracts,
  contentMaterial,
  liejuPublicationProfile,
  projectClient,
  projectMaterial,
  projectResearch,
  projectResearchMetadata,
  projectTemplate,
  projectTemplateCatalog,
  research,
  template,
  templateCatalog,
};
