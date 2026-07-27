const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { it } = require("node:test");

const root = path.resolve(__dirname, "..");
function read(relative) { return fs.readFileSync(path.join(root, relative), "utf8"); }

it("has exactly one desktop production ArticleStore composition owner", () => {
  const files = fs.readdirSync(path.join(root, "desktop"), { recursive: true }).filter((file) => String(file).endsWith(".js"));
  const references = files.filter((file) => read(path.join("desktop", file)).includes("createArticleStore"));
  assert.deepEqual(references, [path.join("composition", "content-lifecycle-composition.js")]);
});

it("does not let IPC assemble content stores or expose physical store APIs", () => {
  const ipcRoot = path.join(root, "desktop", "ipc");
  const files = fs.readdirSync(ipcRoot).filter((file) => file.endsWith(".js"));
  files.forEach((file) => { const source = fs.readFileSync(path.join(ipcRoot, file), "utf8"); assert.doesNotMatch(source, /article-store|content-store/); });
});

it("keeps closed identity cardinality and removes generation first-item fallbacks", () => {
  const runner = read("src/content/generation-batch-runner.js");
  const generation = read("desktop/services/content-generation-batch-service.js");
  assert.doesNotMatch(runner, /deps\.articleStore/);
  assert.doesNotMatch(runner, /injectedFinder|findByGenerationTaskId:\s*findExistingArticle/);
  assert.doesNotMatch(generation, /listArticles\([^)]*\)[\s\S]{0,180}generationTaskId/);
  assert.match(read("src/content/content-store.js"), /kind: "many"/);
  assert.match(read("desktop/services/generation-submission-handoff-service.js"), /HANDOFF_ARTICLE_IDENTITY_CONFLICT/);
});

it("keeps the ContentStore caller seam free of legacy ArticleStore injection", () => {
  const callers = [
    "desktop/services/ai-content-service.js",
    "desktop/services/content-generation-batch-service.js",
    "desktop/services/generation-submission-handoff-service.js",
    "desktop/services/operational-content-submission-service.js",
    "desktop/services/platform-workbench-service.js",
    "desktop/services/submission/submission-preparation.js",
    "src/content/article-removal-service.js",
    "src/content/article-review-service.js",
    "src/content/article-trash-service.js",
    "src/content/article-version-service.js"
  ];
  callers.forEach((file) => {
    const source = read(file);
    assert.doesNotMatch(source, /\b(?:opts|options|settings|value|deps)\.articleStore\b/);
    assert.doesNotMatch(source, /\barticleStore\s*:/);
  });
});

it("wires ArticleEditor to the tested authoritative session state machine", () => {
  const editor = read("media-workbench/src/components/ArticleEditor.tsx");
  assert.match(editor, /createArticleEditorSession/);
  assert.match(editor, /editorSession\.current\.save\(\)/);
  assert.match(editor, /editorSession\.current\??\.update\(/);
  assert.match(editor, /(?:editorSession\.current|session)\??\.subscribe\(/);
  assert.match(editor, /articleIdentity/);
  assert.match(editor, /mergeExternal/);
  assert.doesNotMatch(editor, /\}, \[activeArticle\]\);/);
  assert.match(editor, /void saveDraft\(\)\.catch/);
  assert.doesNotMatch(editor, /setIsSaving|setSaveError|setSaveSuccess/);
});

it("routes App draft and resource mutations through the revision-safe media feature", () => {
  const app = read("media-workbench/src/App.tsx");
  assert.match(app, /mediaFeature\.saveDraft/);
  assert.match(app, /mediaFeature\.toggleSelectedResource/);
  assert.doesNotMatch(app, /mediaFeature\.addSelectedResource/);
  assert.match(app, /mediaFeature\.removeSelectedResource/);
  assert.doesNotMatch(app, /app-draft-save-controller|setDraft\(/);
});

it("excludes one-shot content metadata and existing migration tools from installed resources", () => {
  const config = read("electron-builder.alpha.yml");
  for (const script of ["migrate-content-library-v2.js", "migrate-content-metadata-v1.js", "migrate-operational-store-v1.js"]) assert.match(config, new RegExp("!scripts/" + script.replaceAll(".", "\\.")));
});
