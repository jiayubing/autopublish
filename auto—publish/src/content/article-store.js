const fs = require("node:fs");

const { fingerprintArticle } = require("./content-store");
const { createContentPathPolicy } = require("./content-path-policy");
const { createArticleFileTransaction } = require("./article-file-transaction");
const { createArticleLock } = require("./article-lock");
const {
  normalizeArticle,
  articleForPersistence,
  markdownFor,
  parseMarkdown,
  assertTombstone,
} = require("./article-serialization");

function storeError(code, message, cause) {
  const error = new Error(message || code);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

function createArticleStore(workspaceRoot, options) {
  const opts = options || {};
  const policy = opts.pathPolicy || createContentPathPolicy(workspaceRoot, { paths: opts.paths });
  const fsApi = opts.fs || fs;
  const articleLock = createArticleLock({
    fs: fsApi,
    fault: opts.internalArticleLockFault,
    error: storeError,
  });
  const transactions = createArticleFileTransaction({
    fs: fsApi,
    fault: opts.internalArticleFileFault,
    error: storeError,
  });

  function exists(filename) {
    try { fsApi.lstatSync(filename); return true; }
    catch (error) { if (error && error.code === "ENOENT") return false; throw error; }
  }

  function assertArticleFile(filename, directory) {
    policy.assertRegularFile(filename, {
      boundary: directory,
      code: "ARTICLE_PATH_OUT_OF_BOUNDS",
      label: "Article file",
    });
    transactions.assertRegularFile(filename);
  }

  function articlePaths(clientId, articleId, create) {
    const files = policy.articlePaths(clientId, articleId, create);
    if (!files.directory) throw storeError("ARTICLE_NOT_FOUND", "Article was not found");
    return files;
  }

  function readJson(filename, code, message, directory) {
    assertArticleFile(filename, directory);
    try { return JSON.parse(fsApi.readFileSync(filename, "utf8")); }
    catch (error) { throw storeError(code, message, error); }
  }

  function readArticle(clientId, articleId) {
    const files = articlePaths(clientId, articleId, false);
    const hasJson = exists(files.json);
    const hasMarkdown = exists(files.markdown);
    if (!hasJson && !hasMarkdown) throw storeError("ARTICLE_NOT_FOUND", "Article was not found");
    if (!hasJson || !hasMarkdown) throw storeError("ARTICLE_INVALID", "Article files are incomplete");
    assertArticleFile(files.json, files.directory);
    assertArticleFile(files.markdown, files.directory);
    const normalized = normalizeArticle(readJson(files.json, "ARTICLE_INVALID", "Article JSON is invalid", files.directory));
    if (normalized.id !== articleId || normalized.clientId !== clientId) throw storeError("ARTICLE_INVALID", "Article metadata does not match its path");
    let markdown;
    try { markdown = parseMarkdown(fsApi.readFileSync(files.markdown, "utf8")); }
    catch (error) { if (error && error.code === "ARTICLE_INVALID") throw error; throw storeError("ARTICLE_INVALID", "Article markdown is invalid", error); }
    if (markdown.title !== normalized.title || markdown.content !== normalized.content) throw storeError("ARTICLE_INVALID", "Article markdown does not match metadata");
    return normalized;
  }

  function saveArticle(article) {
    const normalized = normalizeArticle(article);
    const files = articlePaths(normalized.clientId, normalized.id, true);
    return articleLock.withLock(files, function () {
      transactions.recoverArticlePair(files);
      transactions.replaceArticlePair(
        files,
        JSON.stringify(articleForPersistence(normalized), null, 2) + "\n",
        markdownFor(normalized),
      );
      return normalized;
    });
  }

  function getArticle(clientId, articleId) {
    const files = articlePaths(clientId, articleId, false);
    if (!exists(files.directory)) throw storeError("ARTICLE_NOT_FOUND", "Article was not found");
    return articleLock.withLock(files, function () {
      transactions.recoverArticlePair(files);
      return readArticle(clientId, articleId);
    });
  }

  function listArticles(clientId) {
    const files = articlePaths(clientId, "list-probe", false);
    if (!exists(files.directory)) return [];
    const names = fsApi.readdirSync(files.directory, { withFileTypes: true })
      .filter(function (entry) { return entry.isFile() && !entry.isSymbolicLink() && entry.name.toLowerCase().endsWith(".json"); })
      .map(function (entry) { return entry.name.slice(0, -5); });
    return names.map(function (articleId) {
      const itemFiles = articlePaths(clientId, articleId, false);
      return articleLock.withLock(itemFiles, function () {
        transactions.recoverArticlePair(itemFiles);
        return readArticle(clientId, articleId);
      });
    }).sort(function (left, right) {
      const created = Date.parse(right.createdAt) - Date.parse(left.createdAt);
      return created || String(left.id).localeCompare(String(right.id));
    });
  }

  function reviewArticle(clientId, articleId, reviewedAt) {
    const article = getArticle(clientId, articleId);
    if (article.status === "saved") return article;
    if (article.status !== "generated") throw storeError("ARTICLE_NOT_GENERATED", "Article is not generated");
    return saveArticle(Object.assign({}, article, { status: "saved", reviewedAt: reviewedAt }));
  }

  function getTrashedPaths(clientId, articleId, create) {
    const files = policy.trashPaths(clientId, articleId, create);
    if (!files) throw storeError("ARTICLE_NOT_FOUND", "Trashed article was not found");
    return files;
  }

  function sourcePaths(clientId, articleId, create) {
    return articlePaths(clientId, articleId, create);
  }

  function recoverTrashTransaction(clientId, articleId, trash) {
    const source = sourcePaths(clientId, articleId, false);
    try { transactions.recoverTrashMove(source, trash); }
    catch (error) {
      if (error && error.code === "ARTICLE_NOT_FOUND") return;
      throw error;
    }
  }

  function getTrashedTombstoneUnlocked(clientId, articleId, files) {
    files = files || getTrashedPaths(clientId, articleId, false);
    if (!files || !files.directory || !exists(files.directory)) throw storeError("ARTICLE_NOT_FOUND", "Trashed article was not found");
    recoverTrashTransaction(clientId, articleId, files);
    if (!exists(files.tombstone)) throw storeError("ARTICLE_NOT_FOUND", "Trashed article was not found");
    return assertTombstone(readJson(files.tombstone, "ARTICLE_INVALID", "Article tombstone is invalid", files.directory), clientId, articleId);
  }

  function getTrashedTombstone(clientId, articleId) {
    const files = getTrashedPaths(clientId, articleId, false);
    if (!files || !files.directory || !exists(files.directory)) throw storeError("ARTICLE_NOT_FOUND", "Trashed article was not found");
    const lockFiles = sourcePaths(clientId, articleId, true);
    return articleLock.withLock(lockFiles, function () {
      return getTrashedTombstoneUnlocked(clientId, articleId, files);
    });
  }

  function assertTrashPair(files) {
    const present = [files.json, files.markdown, files.tombstone].map(exists);
    if (!present.every(Boolean)) {
      if (present.some(Boolean)) throw storeError("ARTICLE_INVALID", "Article trash files are incomplete");
      throw storeError("ARTICLE_NOT_FOUND", "Trashed article was not found");
    }
    present.forEach(function (_, index) { assertArticleFile([files.json, files.markdown, files.tombstone][index], files.directory); });
  }

  function readTrashedArticleUnlocked(clientId, articleId) {
    const files = getTrashedPaths(clientId, articleId, false);
    recoverTrashTransaction(clientId, articleId, files);
    const tombstone = getTrashedTombstoneUnlocked(clientId, articleId, files);
    if (tombstone.permanentlyDeleted === true) throw storeError("ARTICLE_PERMANENTLY_DELETED", "Article was permanently deleted");
    assertTrashPair(files);
    let markdown;
    try { markdown = parseMarkdown(fsApi.readFileSync(files.markdown, "utf8")); }
    catch (error) { throw error && error.code === "ARTICLE_INVALID" ? error : storeError("ARTICLE_INVALID", "Trashed article markdown is invalid", error); }
    const article = normalizeArticle(readJson(files.json, "ARTICLE_INVALID", "Trashed article JSON is invalid", files.directory));
    if (article.id !== articleId || article.clientId !== clientId || article.title !== markdown.title || article.content !== markdown.content || article.status !== tombstone.status) throw storeError("ARTICLE_INVALID", "Trashed article files do not match");
    return { article: article, tombstone: tombstone, files: files };
  }

  function moveArticleToTrash(clientId, articleId, tombstone, operationId, expectedFingerprint) {
    const source = sourcePaths(clientId, articleId, false);
    if (!exists(source.directory)) throw storeError("ARTICLE_NOT_FOUND", "Article was not found");
    return articleLock.withLock(source, function () {
      transactions.recoverArticlePair(source);
      const article = readArticle(clientId, articleId);
      const normalizedTombstone = assertTombstone(Object.assign({}, tombstone, operationId === undefined ? {} : { operationId: operationId }), clientId, articleId);
      if (expectedFingerprint !== undefined && (typeof expectedFingerprint !== "string" || !/^[a-f0-9]{64}$/.test(expectedFingerprint) || fingerprintArticle(article) !== expectedFingerprint || normalizedTombstone.contentFingerprint !== expectedFingerprint)) throw storeError("ARTICLE_REMOVAL_CONTENT_CHANGED", "Article content changed before it could be moved to trash");
      if (normalizedTombstone.status !== article.status) throw storeError("ARTICLE_INVALID", "Article tombstone status does not match article");
      const destination = getTrashedPaths(clientId, articleId, true);
      const destinationState = [destination.json, destination.markdown, destination.tombstone].map(exists);
      if (destinationState.some(Boolean)) {
        if (destinationState.every(Boolean) && !exists(source.json) && !exists(source.markdown)) {
          const existing = readJson(destination.tombstone, "ARTICLE_INVALID", "Article tombstone is invalid", destination.directory);
          if (operationId !== undefined && existing.operationId !== operationId) throw storeError("ARTICLE_TRASH_CONFLICT", "Trashed article operation does not match");
          return assertTombstone(existing, clientId, articleId);
        }
        throw storeError("ARTICLE_TRASH_CONFLICT", "Trashed article already exists or is incomplete");
      }
      transactions.moveToTrash({ source: source, destination: destination, operationId: operationId, tombstoneContents: JSON.stringify(normalizedTombstone, null, 2) + "\n" });
      return normalizedTombstone;
    });
  }

  function restoreTrashedArticle(clientId, articleId) {
    const destination = sourcePaths(clientId, articleId, true);
    return articleLock.withLock(destination, function () {
      const trashed = readTrashedArticleUnlocked(clientId, articleId);
      if (exists(destination.json) || exists(destination.markdown)) throw storeError("ARTICLE_RESTORE_CONFLICT", "An article with this id already exists");
      transactions.restoreFromTrash(trashed.files, destination);
      return trashed.article;
    });
  }

  function listTrashedArticles(clientId) {
    const probe = policy.trashPaths(clientId, "list-probe", false);
    if (!probe || !exists(probe.directory)) return [];
    const names = fsApi.readdirSync(probe.directory, { withFileTypes: true })
      .filter(function (entry) { return entry.isFile() && !entry.isSymbolicLink() && (entry.name.endsWith(".tombstone.json") || entry.name.endsWith(".json") || entry.name.endsWith(".md")); })
      .map(function (entry) { return entry.name.replace(/\.tombstone\.json$|\.json$|\.md$/, ""); });
    return Array.from(new Set(names)).map(function (articleId) {
      try {
        const lockFiles = sourcePaths(clientId, articleId, true);
        return articleLock.withLock(lockFiles, function () {
          const files = getTrashedPaths(clientId, articleId, false);
          const tombstone = getTrashedTombstoneUnlocked(clientId, articleId, files);
          if (tombstone.permanentlyDeleted === true) return null;
          return readTrashedArticleUnlocked(clientId, articleId).tombstone;
        });
      } catch (error) {
        if (error && error.code === "ARTICLE_NOT_FOUND") return null;
        throw error;
      }
    }).filter(Boolean).sort(function (left, right) { return String(right.deletedAt).localeCompare(String(left.deletedAt)); });
  }

  function permanentlyDeleteTrashedArticle(clientId, articleId, purgedAt) {
    const lockFiles = sourcePaths(clientId, articleId, true);
    return articleLock.withLock(lockFiles, function () {
      const tombstone = getTrashedTombstoneUnlocked(clientId, articleId);
      if (tombstone.permanentlyDeleted === true) return tombstone;
      const trashed = readTrashedArticleUnlocked(clientId, articleId);
      const terminal = assertTombstone(Object.assign({}, tombstone, { permanentlyDeleted: true, purgedAt: purgedAt || new Date().toISOString() }), clientId, articleId);
      transactions.permanentlyDelete(trashed.files, JSON.stringify(terminal, null, 2) + "\n");
      return terminal;
    });
  }

  function isArticleTrashed(clientId, articleId) {
    try { return getTrashedTombstone(clientId, articleId).permanentlyDeleted !== true; }
    catch (error) { if (error && error.code === "ARTICLE_NOT_FOUND") return false; throw error; }
  }

  function isArticleRemoved(clientId, articleId) {
    try { getTrashedTombstone(clientId, articleId); return true; }
    catch (error) { if (error && error.code === "ARTICLE_NOT_FOUND") return false; throw error; }
  }

  return {
    saveArticle,
    getArticle,
    listArticles,
    reviewArticle,
    moveArticleToTrash,
    restoreTrashedArticle,
    listTrashedArticles,
    getTrashedTombstone,
    permanentlyDeleteTrashedArticle,
    isArticleTrashed,
    isArticleRemoved,
    supportsIdempotentRemovalOperation: true,
  };
}

module.exports = { createArticleStore };
