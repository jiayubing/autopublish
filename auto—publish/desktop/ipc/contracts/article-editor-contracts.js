const {
  arrayField,
  enumField,
  exactObject,
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
const generationRequest = exactObject({
  clientId: id,
  materialIds: arrayField(id, { min: 1, max: 50 }),
  researchQueryIds: arrayField(id, { min: 1, max: 50 }),
  platform: id,
  templateId: id,
  templateCatalogRevision: optionalField(text(256)),
});
const articleEditorRequest = exactObject({ clientId: id, articleId: id });

const articleEditorContracts = Object.freeze([
  contentContract({
    capability: "content.generateArticle",
    channel: "content:generate-article",
    feature: "content",
    kind: "command",
    request: generationRequest,
    success: exactObject({ article: generatedArticle }),
    fromArgs: directArgs,
    toArgs: directInput,
  }),
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
  generatedArticle,
  projectArticle,
};
