const fs = require("node:fs");
const { randomUUID } = require("node:crypto");
const { projectArticleSummary } = require("./article-summary");
const { reportDiagnostic } = require("../diagnostics/diagnostic-producer");

const { fingerprintArticle } = require("./content-store");
const { createContentPathPolicy } = require("./content-path-policy");
const { createArticleFileTransaction } = require("./article-file-transaction");
const { createArticleLock } = require("./article-lock");
const {
  canonicalArticleRefKey,
  canonicalArticleRefs,
  normalizeArticleRef,
} = require("./article-ref");
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
  const summaries = new Map();
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

  function readArticle(clientId, articleId, providedFiles) {
    const files = providedFiles || articlePaths(clientId, articleId, false);
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

  function saveArticlePairUnlocked(files, normalized) {
    transactions.recoverArticlePair(files);
    transactions.replaceArticlePair(
      files,
      JSON.stringify(articleForPersistence(normalized), null, 2) + "\n",
      markdownFor(normalized),
    );
    try { rememberSummary(files, projectArticleSummary(normalized), readVersion(files, true)); }
    catch (error) {
      reportDiagnostic({ code: "ARTICLE_SUMMARY_CACHE_WRITE_FAILED", module: "article-store",
        category: "storage", operationId: "article-summary", metadata: { outcome: "uncached" } });
    }
    return normalized;
  }

  function saveArticle(article) {
    const normalized = normalizeArticle(article);
    const files = articlePaths(normalized.clientId, normalized.id, true);
    return articleLock.withLock(files, function () {
      return saveArticlePairUnlocked(files, normalized);
    });
  }

  function createArticle(article) {
    const normalized = normalizeArticle(article);
    const files = articlePaths(normalized.clientId, normalized.id, true);
    return articleLock.withLock(files, function () {
      transactions.recoverArticlePair(files);
      if (exists(files.json) || exists(files.markdown)) {
        throw storeError("ARTICLE_ID_CONFLICT", "Article identity already exists");
      }
      return saveArticlePairUnlocked(files, normalized);
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

  function listArticleIds(clientId, files = articlePaths(clientId, "list-probe", false)) {
    if (!exists(files.directory)) return [];
    const names = [...new Set(fsApi.readdirSync(files.directory, { withFileTypes: true })
      .filter(function (entry) { return entry.isFile() && !entry.isSymbolicLink() && (entry.name.toLowerCase().endsWith(".json") || (entry.name.endsWith(".journal") && !entry.name.endsWith(".trash.journal"))); })
      .map(function (entry) { return entry.name.slice(0, entry.name.endsWith(".journal") ? -8 : -5); }))];
    return names;
  }

  function listArticles(clientId) {
    const scope = policy.articleReadScope(clientId);
    return listArticleIds(clientId, scope).map(articleId => readListedArticle(clientId, articleId, scope.filesFor(articleId))).sort(function (left, right) {
      const created = Date.parse(right.createdAt) - Date.parse(left.createdAt);
      return created || String(left.id).localeCompare(String(right.id));
    });
  }

  function readListedArticle(clientId, articleId, itemFiles) {
      // A stable pair can be read without creating a write lock. Any concurrent
      // replacement or recovery marker falls back to the existing locked read.
      const before = readVersion(itemFiles);
      if (before !== null) {
        let article, readError;
        try { article = readArticle(clientId, articleId, itemFiles); }
        catch (error) { readError = error; }
        if (readVersion(itemFiles) === before) {
          if (readError) throw readError;
          return article;
        }
      }
      return articleLock.withLock(itemFiles, function () {
        transactions.recoverArticlePair(itemFiles);
        return readArticle(clientId, articleId);
      });
  }

  function readVersion(files, locked = false) {
    const stem = files.json.slice(0, -5);
    if ((!locked && exists(stem + ".article-lock")) || exists(stem + ".journal")) return null;
    try {
      const version = [files.json, files.markdown].map(function (filename) {
        const stat = fsApi.lstatSync(filename, { bigint: true });
        if (!stat.isFile() || stat.isSymbolicLink() || typeof stat.mtimeNs !== "bigint") return null;
        return [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(":");
      });
      if (version.includes(null) || (!locked && exists(stem + ".article-lock")) || exists(stem + ".journal")) return null;
      return version.join("|");
    } catch (error) {
      if (error && error.code === "ENOENT") return null;
      throw error;
    }
  }

  function getArticleSummary(clientId, articleId) {
    return readArticleSummary(clientId, articleId, articlePaths(clientId, articleId, false));
  }

  function readArticleSummary(clientId, articleId, files) {
    const version = readVersion(files);
    const cacheFile = files.json.slice(0, -5) + ".summary";
    if (version === null) {
      summaries.delete(cacheFile);
      return projectArticleSummary(getArticle(clientId, articleId));
    }
    let cached = summaries.get(cacheFile);
    if (!cached || cached.version !== version) {
      cached = null;
      try {
        if (policy.assertRegularFile(cacheFile, { boundary: files.directory,
          allowMissing: true, code: "ARTICLE_PATH_OUT_OF_BOUNDS", label: "Article summary" })) {
          cached = JSON.parse(fsApi.readFileSync(cacheFile, "utf8"));
          const value = cached && cached.summary;
          if (!value || value.summaryVersion !== 1 || typeof value.hasContent !== "boolean" ||
            value.id !== articleId || value.clientId !== clientId || typeof value.title !== "string" ||
            JSON.stringify(projectArticleSummary(value)) !== JSON.stringify(value)) cached = null;
        }
      } catch (error) {
        // A missing, damaged or unreadable derived cache never hides source errors.
        reportDiagnostic({ code: "ARTICLE_SUMMARY_CACHE_READ_FAILED", module: "article-store",
          category: "storage", operationId: "article-summary", metadata: { outcome: "rebuild" } });
        cached = null;
      }
    }
    if (cached && cached.version === version && readVersion(files) === version) {
      summaries.set(cacheFile, cached);
      return projectArticleSummary(cached.summary);
    }
    let article;
    try { article = readArticle(clientId, articleId, files); }
    catch (error) {
      if (readVersion(files) === version) throw error;
      return projectArticleSummary(getArticle(clientId, articleId));
    }
    const summary = projectArticleSummary(article);
    if (readVersion(files) !== version) return projectArticleSummary(getArticle(clientId, articleId));
    rememberSummary(files, summary, version);
    return projectArticleSummary(summary);
  }

  function rememberSummary(files, summary, version) {
    if (version === null) return;
    const cacheFile = files.json.slice(0, -5) + ".summary";
    const cached = { version, summary };
    summaries.set(cacheFile, cached);
    const temporary = cacheFile + "." + randomUUID() + ".tmp";
    try {
      fsApi.writeFileSync(temporary, JSON.stringify(cached), { encoding: "utf8", flag: "wx" });
      fsApi.renameSync(temporary, cacheFile);
    } catch (error) {
      reportDiagnostic({ code: "ARTICLE_SUMMARY_CACHE_WRITE_FAILED", module: "article-store",
        category: "storage", operationId: "article-summary", metadata: { outcome: "uncached" } });
    } finally {
      try { fsApi.unlinkSync(temporary); }
      catch (error) {
        if (!error || error.code !== "ENOENT") reportDiagnostic({ code: "ARTICLE_SUMMARY_CACHE_CLEANUP_FAILED",
          module: "article-store", category: "storage", operationId: "article-summary", metadata: { outcome: "best-effort" } });
      }
    }
  }

  function listArticleSummaries(clientId) {
    const scope = policy.articleReadScope(clientId);
    return listArticleIds(clientId, scope).map(id => readArticleSummary(clientId, id, scope.filesFor(id))).sort(function(left, right) {
      return Date.parse(right.createdAt) - Date.parse(left.createdAt) || String(left.id).localeCompare(String(right.id));
    });
  }

  async function searchArticleIds(clientId, query, options = {}) {
    const term = String(query || "").trim().toLowerCase();
    const scope = policy.articleReadScope(clientId);
    const ids = listArticleIds(clientId, scope);
    if (!term) return ids;
    const matches = [];
    let deadline = performance.now() + 8;
    for (const id of ids) {
      if (options.signal && options.signal.aborted) throw storeError("ARTICLE_SEARCH_SUPERSEDED");
      const article = readListedArticle(clientId, id, scope.filesFor(id));
      const text = [article.title, article.content, article.platform, article.templateId,
        article.templateSnapshot?.name || "", article.templateSnapshot?.scenario || "", article.templateSnapshot?.body || ""].join(" ");
      if (!term || text.toLowerCase().includes(term)) matches.push(id);
      if (performance.now() >= deadline) {
        await new Promise(resolve => setImmediate(resolve));
        deadline = performance.now() + 8;
      }
    }
    return matches;
  }

  async function listArticleSummariesAsync(clientId) {
    const scope = policy.articleReadScope(clientId);
    const result = [];
    let deadline = performance.now() + 8;
    for (const id of listArticleIds(clientId, scope)) {
      result.push(readArticleSummary(clientId, id, scope.filesFor(id)));
      if (performance.now() >= deadline) {
        await new Promise(resolve => setImmediate(resolve));
        deadline = performance.now() + 8;
      }
    }
    return result.sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt) || String(left.id).localeCompare(String(right.id)));
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

  function moveArticleToTrashUnlocked(clientId, articleId, tombstone, operationId, expectedFingerprint, source) {
    source = source || sourcePaths(clientId, articleId, false);
    if (!exists(source.directory)) throw storeError("ARTICLE_NOT_FOUND", "Article was not found");
    transactions.recoverArticlePair(source);
    const article = readArticle(clientId, articleId, source);
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
  }

  function moveArticleToTrash(clientId, articleId, tombstone, operationId, expectedFingerprint) {
    const source = sourcePaths(clientId, articleId, false);
    if (!exists(source.directory)) throw storeError("ARTICLE_NOT_FOUND", "Article was not found");
    return articleLock.withLock(source, function () {
      return moveArticleToTrashUnlocked(clientId, articleId, tombstone, operationId, expectedFingerprint, source);
    });
  }

  // This is intentionally a narrow internal seam for the article mutation
  // coordinator. Callers receive a session, never a lock or callback seam.
  function openMutationSession(refs) {
    const ordered = canonicalArticleRefs(refs);
    const entries = ordered.map(function (ref) {
      const files = articlePaths(ref.clientId, ref.articleId, true);
      return { ref: ref, files: files, held: null };
    });
    const byKey = new Map(entries.map(function (entry) {
      return [canonicalArticleRefKey(entry.ref), entry];
    }));
    try {
      entries.forEach(function (entry) {
        entry.held = articleLock.acquire(entry.files);
      });
    } catch (error) {
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        if (!entries[index].held) continue;
        try { articleLock.release(entries[index].held); }
        catch (error) {
          reportDiagnostic({
            code: "ARTICLE_STORE_LOCK_RELEASE_FAILED",
            module: "article-store",
            category: "storage",
            operationId: "article-mutation-session-acquire",
            metadata: {
              operation: "held-lock-release",
              phase: "cleanup",
              outcome: "secondary-failure",
              errorCode: error && /^[A-Z][A-Z0-9_]{1,127}$/.test(error.code || "")
                ? error.code
                : "ARTICLE_LOCK_RELEASE_FAILED"
            }
          });
        }
      }
      throw error;
    }
    let released = false;
    function entryFor(ref) {
      const normalized = normalizeArticleRef(ref);
      const key = canonicalArticleRefKey(normalized);
      const entry = byKey.get(key);
      if (!entry) throw storeError("ARTICLE_IDENTITY_INVALID", "Article identity is outside the mutation set");
      return entry;
    }
    function assertOpen() {
      if (released) throw storeError("ARTICLE_MUTATION_SESSION_CLOSED", "Article mutation session is closed");
    }
    function read(ref) {
      assertOpen();
      const entry = entryFor(ref);
      transactions.recoverArticlePair(entry.files);
      return readArticle(entry.ref.clientId, entry.ref.articleId, entry.files);
    }
    function replace(ref, article, expectedFingerprint) {
      assertOpen();
      const entry = entryFor(ref);
      const normalized = normalizeArticle(article);
      if (normalized.clientId !== entry.ref.clientId || normalized.id !== entry.ref.articleId) {
        throw storeError("ARTICLE_IDENTITY_CONFLICT", "Article identity cannot change");
      }
      const current = read(entry.ref);
      if (expectedFingerprint !== undefined && fingerprintArticle(current) !== expectedFingerprint) {
        throw storeError("ARTICLE_EDIT_CONFLICT", "Article changed before it could be saved");
      }
      return saveArticlePairUnlocked(entry.files, normalized);
    }
    function move(ref, tombstone, operationId, expectedFingerprint) {
      assertOpen();
      const entry = entryFor(ref);
      return moveArticleToTrashUnlocked(entry.ref.clientId, entry.ref.articleId, tombstone, operationId, expectedFingerprint, entry.files);
    }
    function trashed(ref) {
      assertOpen();
      const entry = entryFor(ref);
      try {
        return getTrashedTombstoneUnlocked(entry.ref.clientId, entry.ref.articleId).permanentlyDeleted !== true;
      } catch (error) {
        if (error && error.code === "ARTICLE_NOT_FOUND") return false;
        throw error;
      }
    }
    function trashedTombstone(ref) {
      assertOpen();
      const entry = entryFor(ref);
      return getTrashedTombstoneUnlocked(entry.ref.clientId, entry.ref.articleId);
    }
    function release() {
      if (released) return;
      released = true;
      let firstError = null;
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        if (!entries[index].held) continue;
        try { articleLock.release(entries[index].held); }
        catch (error) { if (!firstError) firstError = error; }
      }
      if (firstError) throw firstError;
    }
    return Object.freeze({
      refs: Object.freeze(entries.map(function (entry) { return entry.ref; })),
      readArticle: read,
      replaceArticle: replace,
      moveArticleToTrash: move,
      isArticleTrashed: trashed,
      getTrashedTombstone: trashedTombstone,
      restoreTrashedArticle: function (ref) {
        assertOpen();
        const entry = entryFor(ref);
        return restoreTrashedArticleUnlocked(entry.ref.clientId, entry.ref.articleId);
      },
      permanentlyDeleteTrashedArticle: function (ref, purgedAt) {
        assertOpen();
        const entry = entryFor(ref);
        return permanentlyDeleteTrashedArticleUnlocked(entry.ref.clientId, entry.ref.articleId, purgedAt);
      },
      release: release,
    });
  }

  function restoreTrashedArticleUnlocked(clientId, articleId) {
    const destination = sourcePaths(clientId, articleId, true);
    const trashed = readTrashedArticleUnlocked(clientId, articleId);
    if (exists(destination.json) || exists(destination.markdown)) throw storeError("ARTICLE_RESTORE_CONFLICT", "An article with this id already exists");
    transactions.restoreFromTrash(trashed.files, destination);
    return trashed.article;
  }

  function restoreTrashedArticle(clientId, articleId) {
    const destination = sourcePaths(clientId, articleId, true);
    return articleLock.withLock(destination, function () {
      return restoreTrashedArticleUnlocked(clientId, articleId);
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

  function permanentlyDeleteTrashedArticleUnlocked(clientId, articleId, purgedAt) {
    const tombstone = getTrashedTombstoneUnlocked(clientId, articleId);
    if (tombstone.permanentlyDeleted === true) return tombstone;
    const trashed = readTrashedArticleUnlocked(clientId, articleId);
    const terminal = assertTombstone(Object.assign({}, tombstone, { permanentlyDeleted: true, purgedAt: purgedAt || new Date().toISOString() }), clientId, articleId);
    transactions.permanentlyDelete(trashed.files, JSON.stringify(terminal, null, 2) + "\n");
    const cacheFile = sourcePaths(clientId, articleId, false).json.slice(0, -5) + ".summary";
    summaries.delete(cacheFile);
    try { fsApi.unlinkSync(cacheFile); }
    catch (error) {
      if (!error || error.code !== "ENOENT") reportDiagnostic({ code: "ARTICLE_SUMMARY_CACHE_CLEANUP_FAILED",
        module: "article-store", category: "storage", operationId: "article-summary", metadata: { outcome: "best-effort" } });
    }
    return terminal;
  }

  function permanentlyDeleteTrashedArticle(clientId, articleId, purgedAt) {
    const lockFiles = sourcePaths(clientId, articleId, true);
    return articleLock.withLock(lockFiles, function () {
      return permanentlyDeleteTrashedArticleUnlocked(clientId, articleId, purgedAt);
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
    createArticle,
    openMutationSession,
    getArticle,
    listArticles,
    getArticleSummary,
    listArticleSummaries,
    listArticleSummariesAsync,
    searchArticleIds,
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
