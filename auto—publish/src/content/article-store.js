const fs = require("fs");
const path = require("path");

const { getContentWorkspace } = require("../core/files");

const LEGACY_ARTICLE = Symbol("legacyArticle");

function storeError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function assertPathSegment(value, label) {
  const deviceName = typeof value === "string" && value.split(".")[0].replace(/[ .]+$/g, "").toUpperCase();
  if (typeof value !== "string" || !value || value === "." || value === ".." ||
      !value.trim() || value.endsWith(" ") || value.endsWith(".") || value.includes("/") || value.includes("\\") ||
      /[<>:"|?*\u0000-\u001F]/.test(value) || /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(deviceName) ||
      path.isAbsolute(value) || path.win32.isAbsolute(value)) {
    throw storeError("ARTICLE_PATH_OUT_OF_BOUNDS", "Invalid " + label);
  }
}

function assertNonEmptyString(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw storeError("ARTICLE_INVALID", "Article " + label + " is invalid");
  }
}

function normalizeResearchQueryIds(article) {
  const hasResearchQueryIds = article.researchQueryIds !== undefined;
  const hasLegacyResearchQueryId = article.researchQueryId !== undefined;
  const hasResearchSnapshots = article.researchSnapshots !== undefined;
  const normalizedLegacy = article[LEGACY_ARTICLE] === true;
  const isRoundtrippedLegacy = hasResearchQueryIds && hasLegacyResearchQueryId && !hasResearchSnapshots &&
    Array.isArray(article.researchQueryIds) && article.researchQueryIds.length === 1 &&
    article.researchQueryIds[0] === article.researchQueryId;
  if (!hasResearchQueryIds && hasResearchSnapshots) {
    throw storeError("ARTICLE_INVALID", "Legacy article cannot contain research snapshots");
  }
  if (hasResearchQueryIds && hasLegacyResearchQueryId && !normalizedLegacy && !isRoundtrippedLegacy) {
    throw storeError("ARTICLE_INVALID", "Article mixes legacy and new research metadata");
  }
  const legacy = !hasResearchQueryIds || normalizedLegacy || isRoundtrippedLegacy;
  const ids = legacy ? [article.researchQueryId] : article.researchQueryIds;
  if (legacy && hasResearchQueryIds && (!Array.isArray(article.researchQueryIds) || article.researchQueryIds.length !== 1 || article.researchQueryIds[0] !== article.researchQueryId)) {
    throw storeError("ARTICLE_INVALID", "Legacy article research ids are inconsistent");
  }
  if (legacy && hasResearchSnapshots) {
    throw storeError("ARTICLE_INVALID", "Legacy article cannot contain research snapshots");
  }
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 50) {
    throw storeError("ARTICLE_INVALID", "Article research query ids are invalid");
  }
  const seen = new Set();
  ids.forEach(function(id) {
    if (typeof id !== "string" || !id.trim() || seen.has(id)) {
      throw storeError("ARTICLE_INVALID", "Article research query ids are invalid");
    }
    seen.add(id);
  });
  return { ids: ids.slice(), legacy: legacy };
}

function normalizeResearchSnapshots(snapshots, ids) {
  if (!Array.isArray(snapshots) || snapshots.length !== ids.length) {
    throw storeError("ARTICLE_INVALID", "Article research snapshots do not match query ids");
  }
  return snapshots.map(function(snapshot, index) {
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot) ||
        snapshot.questionId !== ids[index] || typeof snapshot.question !== "string" || !snapshot.question.trim() ||
        typeof snapshot.answerText !== "string" || !snapshot.answerText.trim() ||
        !Array.isArray(snapshot.references) || typeof snapshot.collectedAt !== "string" || !snapshot.collectedAt.trim() ||
        typeof snapshot.collectionMethod !== "string" || !snapshot.collectionMethod.trim()) {
      throw storeError("ARTICLE_INVALID", "Article research snapshot is invalid");
    }
    return {
      questionId: snapshot.questionId,
      question: snapshot.question,
      answerText: snapshot.answerText,
      references: snapshot.references.map(function(reference) {
        if (!reference || typeof reference.title !== "string" || !reference.title.trim() ||
            typeof reference.url !== "string" || !reference.url.trim()) {
          throw storeError("ARTICLE_INVALID", "Article research snapshot reference is invalid");
        }
        const value = { title: reference.title, url: reference.url };
        if (Object.prototype.hasOwnProperty.call(reference, "snippet")) value.snippet = reference.snippet;
        return value;
      }),
      collectedAt: snapshot.collectedAt,
      collectionMethod: snapshot.collectionMethod
    };
  });
}

function normalizeMaterialSnapshots(snapshots) {
  if (snapshots === undefined) return undefined;
  if (!Array.isArray(snapshots) || snapshots.length < 1) {
    throw storeError("ARTICLE_INVALID", "Article material snapshots are invalid");
  }
  return snapshots.map(function(snapshot) {
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot) ||
        typeof snapshot.id !== "string" || !snapshot.id.trim() ||
        typeof snapshot.name !== "string" || !snapshot.name.trim() ||
        typeof snapshot.extension !== "string" || !snapshot.extension.trim() ||
        typeof snapshot.content !== "string" || !snapshot.content.trim() ||
        typeof snapshot.contentHash !== "string" || !snapshot.contentHash.trim() ||
        typeof snapshot.source !== "string" || !snapshot.source.trim()) {
      throw storeError("ARTICLE_INVALID", "Article material snapshot is invalid");
    }
    return {
      id: snapshot.id, name: snapshot.name, extension: snapshot.extension,
      content: snapshot.content, contentHash: snapshot.contentHash, source: snapshot.source
    };
  });
}

function normalizeTemplateSnapshot(snapshot) {
  if (snapshot === undefined) return undefined;
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot) ||
      typeof snapshot.platform !== "string" || !snapshot.platform.trim() ||
      typeof snapshot.id !== "string" || !snapshot.id.trim() ||
      typeof snapshot.name !== "string" || !snapshot.name.trim() ||
      typeof snapshot.scenario !== "string" || !snapshot.scenario.trim() ||
      typeof snapshot.body !== "string" || !snapshot.body.trim() ||
      typeof snapshot.bodyHash !== "string" || !snapshot.bodyHash.trim()) {
    throw storeError("ARTICLE_INVALID", "Article template snapshot is invalid");
  }
  return {
    platform: snapshot.platform, id: snapshot.id, name: snapshot.name,
    scenario: snapshot.scenario, body: snapshot.body, bodyHash: snapshot.bodyHash
  };
}

function normalizeOptionalProvenance(value, label) {
  if (value === undefined) return undefined;
  if (value !== null && (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value))) {
    throw storeError("ARTICLE_INVALID", "Article " + label + " is invalid");
  }
  return value;
}

function normalizeReviewedAt(value) {
  if (value === undefined) return undefined;
  if (value !== null && (typeof value !== "string" || !value.trim() || Number.isNaN(Date.parse(value)))) {
    throw storeError("ARTICLE_INVALID", "Article reviewedAt is invalid");
  }
  return value;
}

function normalizeArticle(article) {
  if (!article || typeof article !== "object" || Array.isArray(article)) {
    throw storeError("ARTICLE_INVALID", "Article is invalid");
  }
  assertPathSegment(article.id, "id");
  assertPathSegment(article.clientId, "client id");
  const researchIds = normalizeResearchQueryIds(article);
  ["platform", "scenario", "templateId", "title", "content", "status", "createdAt"].forEach(function(field) {
    assertNonEmptyString(article[field], field);
  });
  if (article.status !== "generated" && article.status !== "saved") {
    throw storeError("ARTICLE_INVALID", "Article status is invalid");
  }
  if (article.updatedAt !== undefined) assertNonEmptyString(article.updatedAt, "updatedAt");
  if (!article.source || typeof article.source !== "object" || Array.isArray(article.source)) {
    throw storeError("ARTICLE_INVALID", "Article source is invalid");
  }
  ["client_material", "doubao_answer", "references", "template"].forEach(function(field) {
    if (typeof article.source[field] !== "boolean") {
      throw storeError("ARTICLE_INVALID", "Article source is invalid");
    }
  });
  const normalized = Object.assign({}, article, {
    researchQueryIds: researchIds.ids,
    source: Object.assign({}, article.source)
  });
  const materialSnapshots = normalizeMaterialSnapshots(article.materialSnapshots);
  const templateSnapshot = normalizeTemplateSnapshot(article.templateSnapshot);
  const generationBatchId = normalizeOptionalProvenance(article.generationBatchId, "generationBatchId");
  const generationTaskId = normalizeOptionalProvenance(article.generationTaskId, "generationTaskId");
  const reviewedAt = normalizeReviewedAt(article.reviewedAt);
  if (materialSnapshots !== undefined) normalized.materialSnapshots = materialSnapshots;
  if (templateSnapshot !== undefined) normalized.templateSnapshot = templateSnapshot;
  if (generationBatchId !== undefined) normalized.generationBatchId = generationBatchId;
  if (generationTaskId !== undefined) normalized.generationTaskId = generationTaskId;
  if (reviewedAt !== undefined) normalized.reviewedAt = reviewedAt;
  if (researchIds.legacy) {
    assertNonEmptyString(article.researchQueryId, "researchQueryId");
    Object.defineProperty(normalized, LEGACY_ARTICLE, { value: true, enumerable: false });
  } else {
    normalized.researchSnapshots = normalizeResearchSnapshots(article.researchSnapshots, researchIds.ids);
  }
  return normalized;
}

function markdownFor(article) {
  return "---\ntitle: " + JSON.stringify(article.title) + "\n---\n\n" + article.content + "\n";
}

function parseMarkdown(markdown) {
  markdown = String(markdown).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
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

function createArticleStore(workspaceRoot, options) {
  const workspace = getContentWorkspace(workspaceRoot, options && options.paths);

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

  function transactionFiles(files) {
    return {
      journal: path.join(files.directory, path.basename(files.json, ".json") + ".journal"),
      jsonBackup: files.json + ".backup",
      markdownBackup: files.markdown + ".backup"
    };
  }

  function removeRegularFile(filename) {
    if (!fs.existsSync(filename)) return;
    assertRegularFile(filename);
    fs.unlinkSync(filename);
  }

  function validTemporaryName(name, target) {
    return typeof name === "string" && path.basename(name) === name && name.startsWith(path.basename(target) + ".tmp-");
  }

  function recoverArticle(files) {
    const transaction = transactionFiles(files);
    if (!fs.existsSync(transaction.journal)) return;
    assertRegularFile(transaction.journal);
    let journal;
    try {
      journal = JSON.parse(fs.readFileSync(transaction.journal, "utf8"));
    } catch (error) {
      throw storeError("ARTICLE_INVALID", "Article transaction journal is invalid");
    }
    if (!journal || journal.version !== 1 || !validTemporaryName(journal.temporaryJson, files.json) || !validTemporaryName(journal.temporaryMarkdown, files.markdown)) {
      throw storeError("ARTICLE_INVALID", "Article transaction journal is invalid");
    }
    const hasBackups = fs.existsSync(transaction.jsonBackup) && fs.existsSync(transaction.markdownBackup);
    if (hasBackups) {
      assertRegularFile(transaction.jsonBackup);
      assertRegularFile(transaction.markdownBackup);
      removeRegularFile(files.json);
      removeRegularFile(files.markdown);
      fs.renameSync(transaction.jsonBackup, files.json);
      fs.renameSync(transaction.markdownBackup, files.markdown);
    } else if (!fs.existsSync(files.json) || !fs.existsSync(files.markdown)) {
      const temporaryJson = path.join(files.directory, journal.temporaryJson);
      const temporaryMarkdown = path.join(files.directory, journal.temporaryMarkdown);
      if ((!fs.existsSync(temporaryJson) && !fs.existsSync(files.json)) || (!fs.existsSync(temporaryMarkdown) && !fs.existsSync(files.markdown))) {
        throw storeError("ARTICLE_INVALID", "Article files are incomplete");
      }
      if (fs.existsSync(temporaryJson)) {
        assertRegularFile(temporaryJson);
        removeRegularFile(files.json);
        fs.renameSync(temporaryJson, files.json);
      }
      if (fs.existsSync(temporaryMarkdown)) {
        assertRegularFile(temporaryMarkdown);
        removeRegularFile(files.markdown);
        fs.renameSync(temporaryMarkdown, files.markdown);
      }
    }
    const temporaryJson = path.join(files.directory, journal.temporaryJson);
    const temporaryMarkdown = path.join(files.directory, journal.temporaryMarkdown);
    removeRegularFile(temporaryJson);
    removeRegularFile(temporaryMarkdown);
    removeRegularFile(transaction.jsonBackup);
    removeRegularFile(transaction.markdownBackup);
    removeRegularFile(transaction.journal);
  }

  function replaceArticleFiles(files, article) {
    const temporaryMarkdown = writeTemporary(files.markdown, markdownFor(article));
    const temporaryJson = writeTemporary(files.json, JSON.stringify(article, null, 2) + "\n");
    const transaction = transactionFiles(files);
    try {
      fs.writeFileSync(transaction.journal, JSON.stringify({
        version: 1,
        temporaryJson: path.basename(temporaryJson),
        temporaryMarkdown: path.basename(temporaryMarkdown)
      }) + "\n", "utf8");
      if (fs.existsSync(files.markdown)) {
        assertRegularFile(files.markdown);
        fs.renameSync(files.markdown, transaction.markdownBackup);
      }
      if (fs.existsSync(files.json)) {
        assertRegularFile(files.json);
        fs.renameSync(files.json, transaction.jsonBackup);
      }
      fs.renameSync(temporaryMarkdown, files.markdown);
      fs.renameSync(temporaryJson, files.json);
      removeRegularFile(transaction.markdownBackup);
      removeRegularFile(transaction.jsonBackup);
      removeRegularFile(transaction.journal);
    } catch (error) {
      throw error;
    } finally {
      if (!fs.existsSync(transaction.journal)) {
        removeRegularFile(temporaryMarkdown);
        removeRegularFile(temporaryJson);
      }
    }
  }

  function saveArticle(article) {
    const normalized = normalizeArticle(article);
    const files = articlePaths(normalized.clientId, normalized.id, true);
    recoverArticle(files);
    const persisted = normalized[LEGACY_ARTICLE] ? Object.assign({}, normalized) : normalized;
    if (normalized[LEGACY_ARTICLE]) {
      delete persisted.researchQueryIds;
      delete persisted.researchSnapshots;
    }
    replaceArticleFiles(files, persisted);
    return normalized;
  }

  function getArticle(clientId, articleId) {
    const files = articlePaths(clientId, articleId, false);
    recoverArticle(files);
    return readArticle(clientId, articleId);
  }

  function listArticles(clientId) {
    const directory = clientDirectory(clientId, false);
    if (!fs.existsSync(directory)) return [];
    return fs.readdirSync(directory, { withFileTypes: true })
      .filter(function(entry) { return entry.isFile() && path.extname(entry.name).toLowerCase() === ".json"; })
      .map(function(entry) { return path.basename(entry.name, ".json"); })
      .map(function(articleId) {
        const files = articlePaths(clientId, articleId, false);
        recoverArticle(files);
        return readArticle(clientId, articleId);
      })
      .sort(function(a, b) { return (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt); });
  }

  function reviewArticle(clientId, articleId, reviewedAt) {
    const article = getArticle(clientId, articleId);
    if (article.status === "saved") return article;
    if (article.status !== "generated") throw storeError("ARTICLE_NOT_GENERATED", "Article is not generated");
    return saveArticle(Object.assign({}, article, { status: "saved", reviewedAt: reviewedAt }));
  }

  function safeDirectory(directory, label, create) {
    if (!fs.existsSync(directory)) {
      if (!create) return false;
      fs.mkdirSync(directory, { recursive: true });
    }
    const stats = fs.lstatSync(directory);
    if (!stats.isDirectory() || stats.isSymbolicLink()) {
      throw storeError("ARTICLE_PATH_OUT_OF_BOUNDS", label + " is unsafe");
    }
    return true;
  }

  function trashRootDirectory(create) {
    const autopublish = path.join(workspace.root, ".autopublish");
    const root = path.join(autopublish, "article-trash");
    if (!safeDirectory(autopublish, "Article state directory", create)) return null;
    if (!safeDirectory(root, "Article trash directory", create)) return null;
    return root;
  }

  function trashDirectory(clientId, create) {
    assertPathSegment(clientId, "client id");
    const root = trashRootDirectory(create);
    if (!root) return null;
    const directory = path.resolve(root, clientId);
    const relative = path.relative(root, directory);
    if (relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative)) {
      throw storeError("ARTICLE_PATH_OUT_OF_BOUNDS", "Trash client directory is unsafe");
    }
    safeDirectory(directory, "Trash client directory", create);
    return directory;
  }

  function trashPaths(clientId, articleId, create) {
    assertPathSegment(articleId, "article id");
    const directory = trashDirectory(clientId, create);
    return {
      directory: directory,
      json: path.join(directory, articleId + ".json"),
      markdown: path.join(directory, articleId + ".md"),
      tombstone: path.join(directory, articleId + ".tombstone.json"),
      journal: path.join(directory, articleId + ".trash.journal")
    };
  }

  function readJson(filename, code, message) {
    assertRegularFile(filename);
    try {
      return JSON.parse(fs.readFileSync(filename, "utf8"));
    } catch (error) {
      throw storeError(code, message);
    }
  }

  function assertTombstone(tombstone, clientId, articleId) {
    if (!tombstone || typeof tombstone !== "object" || Array.isArray(tombstone) || tombstone.version !== 1 ||
        typeof tombstone.deletedAt !== "string" || Number.isNaN(Date.parse(tombstone.deletedAt)) ||
        tombstone.clientId !== clientId || tombstone.articleId !== articleId ||
        (tombstone.status !== "generated" && tombstone.status !== "saved") || !Array.isArray(tombstone.references)) {
      throw storeError("ARTICLE_INVALID", "Article tombstone is invalid");
    }
    tombstone.references.forEach(function(reference) {
      if (!reference || typeof reference !== "object" || typeof reference.type !== "string" || !reference.type.trim() ||
          typeof reference.id !== "string" || !reference.id.trim() || reference.id.includes("/") || reference.id.includes("\\")) {
        throw storeError("ARTICLE_INVALID", "Article tombstone reference is invalid");
      }
    });
    return tombstone;
  }

  function assertTrashPair(files) {
    const exists = [files.json, files.markdown, files.tombstone].map(fs.existsSync);
    if (!exists.every(Boolean)) {
      if (exists.some(Boolean)) throw storeError("ARTICLE_INVALID", "Article trash files are incomplete");
      throw storeError("ARTICLE_NOT_FOUND", "Trashed article was not found");
    }
    assertRegularFile(files.json);
    assertRegularFile(files.markdown);
    assertRegularFile(files.tombstone);
  }

  function moveArticleToTrash(clientId, articleId, tombstone) {
    const article = getArticle(clientId, articleId);
    const normalizedTombstone = assertTombstone(Object.assign({}, tombstone), clientId, articleId);
    if (normalizedTombstone.status !== article.status) {
      throw storeError("ARTICLE_INVALID", "Article tombstone status does not match article");
    }
    const source = articlePaths(clientId, articleId, false);
    const destination = trashPaths(clientId, articleId, true);
    const destinationState = [destination.json, destination.markdown, destination.tombstone].map(fs.existsSync);
    if (destinationState.some(Boolean)) {
      if (destinationState.every(Boolean) && !fs.existsSync(source.json) && !fs.existsSync(source.markdown)) {
        return readJson(destination.tombstone, "ARTICLE_INVALID", "Article tombstone is invalid");
      }
      throw storeError("ARTICLE_TRASH_CONFLICT", "Trashed article already exists or is incomplete");
    }

    const temporaryTombstone = writeTemporary(destination.tombstone, JSON.stringify(normalizedTombstone, null, 2) + "\n");
    const moved = [];
    try {
      fs.renameSync(source.json, destination.json);
      moved.push([destination.json, source.json]);
      fs.renameSync(source.markdown, destination.markdown);
      moved.push([destination.markdown, source.markdown]);
      fs.renameSync(temporaryTombstone, destination.tombstone);
      return normalizedTombstone;
    } catch (error) {
      if (fs.existsSync(temporaryTombstone)) removeRegularFile(temporaryTombstone);
      if (fs.existsSync(destination.tombstone)) removeRegularFile(destination.tombstone);
      for (let index = moved.length - 1; index >= 0; index -= 1) {
        const pair = moved[index];
        if (fs.existsSync(pair[0]) && !fs.existsSync(pair[1])) fs.renameSync(pair[0], pair[1]);
      }
      throw error;
    }
  }

  function readTrashedArticle(clientId, articleId) {
    const files = trashPaths(clientId, articleId, false);
    assertTrashPair(files);
    const tombstone = assertTombstone(readJson(files.tombstone, "ARTICLE_INVALID", "Article tombstone is invalid"), clientId, articleId);
    const markdown = parseMarkdown(fs.readFileSync(files.markdown, "utf8"));
    const metadata = readJson(files.json, "ARTICLE_INVALID", "Trashed article JSON is invalid");
    const article = normalizeArticle(metadata);
    if (article.id !== articleId || article.clientId !== clientId || article.title !== markdown.title || article.content !== markdown.content || article.status !== tombstone.status) {
      throw storeError("ARTICLE_INVALID", "Trashed article files do not match");
    }
    return { article: article, tombstone: tombstone, files: files };
  }

  function restoreTrashedArticle(clientId, articleId) {
    const trashed = readTrashedArticle(clientId, articleId);
    const source = articlePaths(clientId, articleId, true);
    if (fs.existsSync(source.json) || fs.existsSync(source.markdown)) {
      throw storeError("ARTICLE_RESTORE_CONFLICT", "An article with this id already exists");
    }
    const moved = [];
    try {
      fs.renameSync(trashed.files.json, source.json);
      moved.push([source.json, trashed.files.json]);
      fs.renameSync(trashed.files.markdown, source.markdown);
      moved.push([source.markdown, trashed.files.markdown]);
      removeRegularFile(trashed.files.tombstone);
      return trashed.article;
    } catch (error) {
      for (let index = moved.length - 1; index >= 0; index -= 1) {
        const pair = moved[index];
        if (fs.existsSync(pair[0]) && !fs.existsSync(pair[1])) fs.renameSync(pair[0], pair[1]);
      }
      throw error;
    }
  }

  function listTrashedArticles(clientId) {
    const directory = trashDirectory(clientId, false);
    if (!directory || !fs.existsSync(directory)) return [];
    const names = fs.readdirSync(directory, { withFileTypes: true })
      .filter(function(entry) { return entry.isFile() && (entry.name.endsWith(".tombstone.json") || entry.name.endsWith(".json") || entry.name.endsWith(".md")); })
      .map(function(entry) { return entry.name.replace(/\.tombstone\.json$|\.json$|\.md$/, ""); });
    return Array.from(new Set(names)).map(function(articleId) {
      return readTrashedArticle(clientId, articleId).tombstone;
    }).sort(function(a, b) { return b.deletedAt.localeCompare(a.deletedAt); });
  }

  function permanentlyDeleteTrashedArticle(clientId, articleId) {
    const trashed = readTrashedArticle(clientId, articleId);
    const staging = path.join(trashed.files.directory, articleId + ".deleting-" + process.pid + "-" + Date.now());
    fs.mkdirSync(staging);
    const staged = [];
    try {
      [trashed.files.json, trashed.files.markdown, trashed.files.tombstone].forEach(function(filename) {
        const target = path.join(staging, path.basename(filename));
        fs.renameSync(filename, target);
        staged.push([target, filename]);
      });
      fs.rmSync(staging, { recursive: true, force: true });
      return trashed.tombstone;
    } catch (error) {
      if (fs.existsSync(staging)) {
        for (let index = staged.length - 1; index >= 0; index -= 1) {
          const pair = staged[index];
          if (fs.existsSync(pair[0]) && !fs.existsSync(pair[1])) fs.renameSync(pair[0], pair[1]);
        }
        if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true });
      }
      throw error;
    }
  }

  return { saveArticle, getArticle, listArticles, reviewArticle, moveArticleToTrash, restoreTrashedArticle, listTrashedArticles, permanentlyDeleteTrashedArticle };
}

module.exports = { createArticleStore };
