const {
  arrayField,
  enumField,
  exactObject,
  integerField,
  nullableField,
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

const contentLibraryContracts = Object.freeze([
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
  projectClient,
  projectMaterial,
  projectResearch,
  projectTemplate,
  projectTemplateCatalog,
  research,
  template,
  templateCatalog,
};
