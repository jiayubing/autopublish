const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("production content views render the content read model without query bridge ownership", () => {
  const workbench = read("media-workbench/src/components/ContentWorkbench.tsx");
  const questions = read(
    "media-workbench/src/components/content/QuestionCollectionView.tsx",
  );
  const generation = read(
    "media-workbench/src/components/content/ArticleGenerationView.tsx",
  );
  const batch = read(
    "media-workbench/src/components/content/BatchGenerationView.tsx",
  );
  const history = read(
    "media-workbench/src/components/content/GeneratedArticlesView.tsx",
  );
  const productionViews = [
    workbench,
    questions,
    generation,
    batch,
    history,
  ].join("\n");

  for (const query of [
    "listContentQuestions",
    "listContentResearch",
    "listContentTemplateCatalog",
    "listContentSubmissionPlatforms",
    "getArticleManagementSnapshot",
  ])
    assert.equal(productionViews.includes(query), false, query);

  assert.doesNotMatch(
    workbench,
    /articleRefreshToken|batchRefreshToken|useWorkspaceScope\('articleManagement'/,
  );
  assert.doesNotMatch(
    productionViews,
    /\brefreshToken\b|\bbatchRefreshToken\b|onRefreshArticles|onRefreshBatchState/,
  );
  assert.doesNotMatch(history, /loadSnapshot:\s*getArticleManagementSnapshot/);
});

test("production content views call named ordinary content commands", () => {
  const files = [
    "media-workbench/src/components/ContentWorkbench.tsx",
    "media-workbench/src/components/content/QuestionCollectionView.tsx",
    "media-workbench/src/components/content/ArticleGenerationView.tsx",
    "media-workbench/src/components/content/BatchGenerationView.tsx",
    "media-workbench/src/components/content/GeneratedArticlesView.tsx",
  ];
  const productionViews = files.map(read).join("\n");
  for (const bridgeCall of [
    "createContentQuestion",
    "updateContentQuestion",
    "saveManualResearch",
    "retryContentMaterial",
    "saveContentArticle",
  ])
    assert.doesNotMatch(
      productionViews,
      new RegExp(`(?<![.\\w])${bridgeCall}\\s*\\(`),
      bridgeCall,
    );
  for (const command of [
    "commands.createQuestion",
    "commands.updateQuestion",
    "commands.saveManualResearch",
    "commands.retryMaterial",
    "commands.saveArticle",
    "commands.prepareRegularUncertainResolution",
    "commands.confirmRegularAccepted",
    "commands.confirmRegularNotAccepted",
  ])
    assert.equal(productionViews.includes(command), true, command);
  assert.equal(productionViews.includes("commands.copyArticleVersion"), false);
});

test("article management destructive commands and removal events stay behind the content feature seam", () => {
  const source = read(
    "media-workbench/src/components/content/GeneratedArticlesView.tsx",
  );
  const feature = read(
    "media-workbench/src/features/content/article-management-feature.js",
  );
  assert.match(source, /commands\.preparePermanentDeleteContentArticle/);
  assert.match(source, /commands\.permanentlyDeleteContentArticle/);
  assert.match(source, /watchRemovalTransaction/);
  assert.match(source, /removal/);
  assert.match(feature, /subscribeRemovalTransaction/);
  assert.match(feature, /removalIdentity/);
  assert.doesNotMatch(source, /bridge\/content|article-management-controller/);
});

test("article management renders query failures instead of presenting an empty history", () => {
  const source = read(
    "media-workbench/src/components/content/GeneratedArticlesView.tsx",
  );
  assert.match(source, /query\.error\?\.userMessage/);
  assert.match(source, /role=["']alert["']/);
});
