const fs = require("fs");
const path = require("path");

const { getContentWorkspace } = require("../core/files");

function storeError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function assertPathSegment(value, label) {
  if (typeof value !== "string" || !value || value === "." || value === ".." ||
      !value.trim() || value.endsWith(" ") || value.endsWith(".") || value.includes("/") || value.includes("\\") ||
      /[<>:"|?*\u0000-\u001F]/.test(value) || path.isAbsolute(value) || path.win32.isAbsolute(value)) {
    throw storeError("ARTICLE_PATH_OUT_OF_BOUNDS", "Invalid " + label);
  }
}

function assertNonEmptyString(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw storeError("ARTICLE_INVALID", "Article " + label + " is invalid");
  }
}

function normalizeArticle(article) {
  if (!article || typeof article !== "object" || Array.isArray(article)) {
    throw storeError("ARTICLE_INVALID", "Article is invalid");
  }
  assertPathSegment(article.id, "id");
  assertPathSegment(article.clientId, "client id");
  ["researchQueryId", "platform", "scenario", "templateId", "title", "content", "status", "createdAt"].forEach(function(field) {
    assertNonEmptyString(article[field], field);
  });
  if (article.updatedAt !== undefined) assertNonEmptyString(article.updatedAt, "updatedAt");
  if (!article.source || typeof article.source !== "object" || Array.isArray(article.source)) {
    throw storeError("ARTICLE_INVALID", "Article source is invalid");
  }
  ["client_material", "doubao_answer", "references", "template"].forEach(function(field) {
    if (typeof article.source[field] !== "boolean") {
      throw storeError("ARTICLE_INVALID", "Article source is invalid");
    }
  });
  return Object.assign({}, article, { source: Object.assign({}, article.source) });
}

function markdownFor(article) {
  return "---\ntitle: " + JSON.stringify(article.title) + "\n---\n\n" + article.content + "\n";
}

function parseMarkdown(markdown) {
  const match = /^---\r?\ntitle: (.+)\r?\n---\r?\n\r?\n([\s\S]*)$/.exec(markdown);
  if (!match) throw storeError("ARTICLE_INVALID", "Article markdown is invalid");
  let title;
  try {
    title = JSON.parse(match[1]);
  } catch (error) {
    throw storeError("ARTICLE_INVALID", "Article markdown is invalid");
  }
  const content = match[2].endsWith("\n") ? match[2].slice(0, -1) : match[2];
  if (typeof title !== "string" || typeof content !== "string") {
    throw storeError("ARTICLE_INVALID", "Article markdown is invalid");
  }
  return { title: title, content: content };
}

function createArticleStore(workspaceRoot) {
  const workspace = getContentWorkspace(workspaceRoot);

  function generatedDirectory() {
    fs.mkdirSync(workspace.generated, { recursive: true });
    const stats = fs.lstatSync(workspace.generated);
    if (!stats.isDirectory() || stats.isSymbolicLink()) {
      throw storeError("ARTICLE_PATH_OUT_OF_BOUNDS", "Generated directory is unsafe");
    }
    return workspace.generated;
  }

  function clientDirectory(clientId, create) {
    assertPathSegment(clientId, "client id");
    const generated = generatedDirectory();
    const directory = path.resolve(generated, clientId);
    const relative = path.relative(generated, directory);
    if (relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative)) {
      throw storeError("ARTICLE_PATH_OUT_OF_BOUNDS", "Client directory is unsafe");
    }
    if (!fs.existsSync(directory) && create) fs.mkdirSync(directory, { recursive: true });
    if (fs.existsSync(directory)) {
      const stats = fs.lstatSync(directory);
      if (!stats.isDirectory() || stats.isSymbolicLink()) {
        throw storeError("ARTICLE_PATH_OUT_OF_BOUNDS", "Client directory is unsafe");
      }
    }
    return directory;
  }

  function articlePaths(clientId, articleId, create) {
    assertPathSegment(articleId, "article id");
    const directory = clientDirectory(clientId, create);
    return { directory: directory, json: path.join(directory, articleId + ".json"), markdown: path.join(directory, articleId + ".md") };
  }

  function assertRegularFile(filename) {
    const stats = fs.lstatSync(filename);
    if (!stats.isFile() || stats.isSymbolicLink()) {
      throw storeError("ARTICLE_PATH_OUT_OF_BOUNDS", "Article file is unsafe");
    }
  }

  function readArticle(clientId, articleId) {
    const files = articlePaths(clientId, articleId, false);
    const hasJson = fs.existsSync(files.json);
    const hasMarkdown = fs.existsSync(files.markdown);
    if (!hasJson && !hasMarkdown) throw storeError("ARTICLE_NOT_FOUND", "Article was not found");
    if (!hasJson || !hasMarkdown) throw storeError("ARTICLE_INVALID", "Article files are incomplete");
    assertRegularFile(files.json);
    assertRegularFile(files.markdown);
    let article;
    try {
      article = JSON.parse(fs.readFileSync(files.json, "utf8"));
    } catch (error) {
      throw storeError("ARTICLE_INVALID", "Article JSON is invalid");
    }
    const normalized = normalizeArticle(article);
    if (normalized.id !== articleId || normalized.clientId !== clientId) {
      throw storeError("ARTICLE_INVALID", "Article metadata does not match its path");
    }
    const markdown = parseMarkdown(fs.readFileSync(files.markdown, "utf8"));
    if (markdown.title !== normalized.title || markdown.content !== normalized.content) {
      throw storeError("ARTICLE_INVALID", "Article markdown does not match metadata");
    }
    return normalized;
  }

  function writeTemporary(filename, contents) {
    const temporary = filename + ".tmp-" + process.pid + "-" + Date.now() + "-" + Math.random().toString(16).slice(2);
    fs.writeFileSync(temporary, contents, "utf8");
    return temporary;
  }

  function replaceArticleFiles(files, article) {
    const temporaryMarkdown = writeTemporary(files.markdown, markdownFor(article));
    const temporaryJson = writeTemporary(files.json, JSON.stringify(article, null, 2) + "\n");
    const markdownBackup = files.markdown + ".bak-" + process.pid + "-" + Date.now();
    const jsonBackup = files.json + ".bak-" + process.pid + "-" + Date.now();
    let backedUpMarkdown = false;
    let backedUpJson = false;
    let wroteMarkdown = false;
    let wroteJson = false;
    try {
      if (fs.existsSync(files.markdown)) {
        assertRegularFile(files.markdown);
        fs.renameSync(files.markdown, markdownBackup);
        backedUpMarkdown = true;
      }
      if (fs.existsSync(files.json)) {
        assertRegularFile(files.json);
        fs.renameSync(files.json, jsonBackup);
        backedUpJson = true;
      }
      fs.renameSync(temporaryMarkdown, files.markdown);
      wroteMarkdown = true;
      fs.renameSync(temporaryJson, files.json);
      wroteJson = true;
      if (backedUpMarkdown) fs.unlinkSync(markdownBackup);
      if (backedUpJson) fs.unlinkSync(jsonBackup);
    } catch (error) {
      if (wroteMarkdown && fs.existsSync(files.markdown)) fs.unlinkSync(files.markdown);
      if (wroteJson && fs.existsSync(files.json)) fs.unlinkSync(files.json);
      if (backedUpMarkdown && fs.existsSync(markdownBackup)) fs.renameSync(markdownBackup, files.markdown);
      if (backedUpJson && fs.existsSync(jsonBackup)) fs.renameSync(jsonBackup, files.json);
      throw error;
    } finally {
      if (fs.existsSync(temporaryMarkdown)) fs.unlinkSync(temporaryMarkdown);
      if (fs.existsSync(temporaryJson)) fs.unlinkSync(temporaryJson);
    }
  }

  function saveArticle(article) {
    const normalized = normalizeArticle(article);
    const files = articlePaths(normalized.clientId, normalized.id, true);
    replaceArticleFiles(files, normalized);
    return normalized;
  }

  function getArticle(clientId, articleId) {
    return readArticle(clientId, articleId);
  }

  function listArticles(clientId) {
    const directory = clientDirectory(clientId, false);
    if (!fs.existsSync(directory)) return [];
    return fs.readdirSync(directory, { withFileTypes: true })
      .filter(function(entry) { return entry.isFile() && path.extname(entry.name).toLowerCase() === ".json"; })
      .map(function(entry) { return readArticle(clientId, path.basename(entry.name, ".json")); })
      .sort(function(a, b) { return (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt); });
  }

  return { saveArticle, getArticle, listArticles };
}

module.exports = { createArticleStore };
