const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const { getContentWorkspace } = require("../core/files");
const { fingerprintArticle } = require("./content-store");

const LEGACY_ARTICLE = Symbol("legacyArticle");

function storeError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function assertPathSegment(value, label) {
  const deviceName =
    typeof value === "string" &&
    value
      .split(".")[0]
      .replace(/[ .]+$/g, "")
      .toUpperCase();
  if (
    typeof value !== "string" ||
    !value ||
    value === "." ||
    value === ".." ||
    !value.trim() ||
    value.endsWith(" ") ||
    value.endsWith(".") ||
    value.includes("/") ||
    value.includes("\\") ||
    /[<>:"|?*\u0000-\u001F]/.test(value) ||
    /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(deviceName) ||
    path.isAbsolute(value) ||
    path.win32.isAbsolute(value)
  ) {
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
  const isRoundtrippedLegacy =
    hasResearchQueryIds &&
    hasLegacyResearchQueryId &&
    !hasResearchSnapshots &&
    Array.isArray(article.researchQueryIds) &&
    article.researchQueryIds.length === 1 &&
    article.researchQueryIds[0] === article.researchQueryId;
  if (!hasResearchQueryIds && hasResearchSnapshots) {
    throw storeError(
      "ARTICLE_INVALID",
      "Legacy article cannot contain research snapshots",
    );
  }
  if (
    hasResearchQueryIds &&
    hasLegacyResearchQueryId &&
    !normalizedLegacy &&
    !isRoundtrippedLegacy
  ) {
    throw storeError(
      "ARTICLE_INVALID",
      "Article mixes legacy and new research metadata",
    );
  }
  const legacy =
    !hasResearchQueryIds || normalizedLegacy || isRoundtrippedLegacy;
  const ids = legacy ? [article.researchQueryId] : article.researchQueryIds;
  if (
    legacy &&
    hasResearchQueryIds &&
    (!Array.isArray(article.researchQueryIds) ||
      article.researchQueryIds.length !== 1 ||
      article.researchQueryIds[0] !== article.researchQueryId)
  ) {
    throw storeError(
      "ARTICLE_INVALID",
      "Legacy article research ids are inconsistent",
    );
  }
  if (legacy && hasResearchSnapshots) {
    throw storeError(
      "ARTICLE_INVALID",
      "Legacy article cannot contain research snapshots",
    );
  }
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 50) {
    throw storeError(
      "ARTICLE_INVALID",
      "Article research query ids are invalid",
    );
  }
  const seen = new Set();
  ids.forEach(function (id) {
    if (typeof id !== "string" || !id.trim() || seen.has(id)) {
      throw storeError(
        "ARTICLE_INVALID",
        "Article research query ids are invalid",
      );
    }
    seen.add(id);
  });
  return { ids: ids.slice(), legacy: legacy };
}

function normalizeResearchSnapshots(snapshots, ids) {
  if (!Array.isArray(snapshots) || snapshots.length !== ids.length) {
    throw storeError(
      "ARTICLE_INVALID",
      "Article research snapshots do not match query ids",
    );
  }
  return snapshots.map(function (snapshot, index) {
    if (
      !snapshot ||
      typeof snapshot !== "object" ||
      Array.isArray(snapshot) ||
      snapshot.questionId !== ids[index] ||
      typeof snapshot.question !== "string" ||
      !snapshot.question.trim() ||
      typeof snapshot.answerText !== "string" ||
      !snapshot.answerText.trim() ||
      !Array.isArray(snapshot.references) ||
      typeof snapshot.collectedAt !== "string" ||
      !snapshot.collectedAt.trim() ||
      typeof snapshot.collectionMethod !== "string" ||
      !snapshot.collectionMethod.trim()
    ) {
      throw storeError(
        "ARTICLE_INVALID",
        "Article research snapshot is invalid",
      );
    }
    return {
      questionId: snapshot.questionId,
      question: snapshot.question,
      answerText: snapshot.answerText,
      references: snapshot.references.map(function (reference) {
        if (
          !reference ||
          typeof reference.title !== "string" ||
          !reference.title.trim() ||
          typeof reference.url !== "string" ||
          !reference.url.trim()
        ) {
          throw storeError(
            "ARTICLE_INVALID",
            "Article research snapshot reference is invalid",
          );
        }
        const value = { title: reference.title, url: reference.url };
        if (Object.prototype.hasOwnProperty.call(reference, "snippet"))
          value.snippet = reference.snippet;
        return value;
      }),
      collectedAt: snapshot.collectedAt,
      collectionMethod: snapshot.collectionMethod,
    };
  });
}

function normalizeMaterialSnapshots(snapshots) {
  if (snapshots === undefined) return undefined;
  if (!Array.isArray(snapshots) || snapshots.length < 1) {
    throw storeError(
      "ARTICLE_INVALID",
      "Article material snapshots are invalid",
    );
  }
  return snapshots.map(function (snapshot) {
    if (
      !snapshot ||
      typeof snapshot !== "object" ||
      Array.isArray(snapshot) ||
      typeof snapshot.id !== "string" ||
      !snapshot.id.trim() ||
      typeof snapshot.name !== "string" ||
      !snapshot.name.trim() ||
      typeof snapshot.extension !== "string" ||
      !snapshot.extension.trim() ||
      typeof snapshot.content !== "string" ||
      !snapshot.content.trim() ||
      typeof snapshot.contentHash !== "string" ||
      !snapshot.contentHash.trim() ||
      typeof snapshot.source !== "string" ||
      !snapshot.source.trim()
    ) {
      throw storeError(
        "ARTICLE_INVALID",
        "Article material snapshot is invalid",
      );
    }
    return {
      id: snapshot.id,
      name: snapshot.name,
      extension: snapshot.extension,
      content: snapshot.content,
      contentHash: snapshot.contentHash,
      source: snapshot.source,
    };
  });
}

function normalizeTemplateSnapshot(snapshot) {
  if (snapshot === undefined) return undefined;
  if (
    !snapshot ||
    typeof snapshot !== "object" ||
    Array.isArray(snapshot) ||
    typeof snapshot.platform !== "string" ||
    !snapshot.platform.trim() ||
    typeof snapshot.id !== "string" ||
    !snapshot.id.trim() ||
    typeof snapshot.name !== "string" ||
    !snapshot.name.trim() ||
    typeof snapshot.scenario !== "string" ||
    !snapshot.scenario.trim() ||
    typeof snapshot.body !== "string" ||
    !snapshot.body.trim() ||
    typeof snapshot.bodyHash !== "string" ||
    !snapshot.bodyHash.trim()
  ) {
    throw storeError("ARTICLE_INVALID", "Article template snapshot is invalid");
  }
  return {
    platform: snapshot.platform,
    id: snapshot.id,
    name: snapshot.name,
    scenario: snapshot.scenario,
    body: snapshot.body,
    bodyHash: snapshot.bodyHash,
  };
}

function normalizeOptionalProvenance(value, label) {
  if (value === undefined) return undefined;
  if (
    value !== null &&
    (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value))
  ) {
    throw storeError("ARTICLE_INVALID", "Article " + label + " is invalid");
  }
  return value;
}

function normalizeReviewedAt(value) {
  if (value === undefined) return undefined;
  if (
    value !== null &&
    (typeof value !== "string" ||
      !value.trim() ||
      Number.isNaN(Date.parse(value)))
  ) {
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
  [
    "platform",
    "scenario",
    "templateId",
    "title",
    "content",
    "status",
    "createdAt",
  ].forEach(function (field) {
    assertNonEmptyString(article[field], field);
  });
  if (Number.isNaN(Date.parse(article.createdAt))) {
    throw storeError("ARTICLE_INVALID", "Article createdAt is invalid");
  }
  if (article.status !== "generated" && article.status !== "saved") {
    throw storeError("ARTICLE_INVALID", "Article status is invalid");
  }
  if (article.updatedAt !== undefined)
    assertNonEmptyString(article.updatedAt, "updatedAt");
  if (
    !article.source ||
    typeof article.source !== "object" ||
    Array.isArray(article.source)
  ) {
    throw storeError("ARTICLE_INVALID", "Article source is invalid");
  }
  ["client_material", "doubao_answer", "references", "template"].forEach(
    function (field) {
      if (typeof article.source[field] !== "boolean") {
        throw storeError("ARTICLE_INVALID", "Article source is invalid");
      }
    },
  );
  const normalized = Object.assign({}, article, {
    researchQueryIds: researchIds.ids,
    source: Object.assign({}, article.source),
  });
  const materialSnapshots = normalizeMaterialSnapshots(
    article.materialSnapshots,
  );
  const templateSnapshot = normalizeTemplateSnapshot(article.templateSnapshot);
  const generationBatchId = normalizeOptionalProvenance(
    article.generationBatchId,
    "generationBatchId",
  );
  const generationTaskId = normalizeOptionalProvenance(
    article.generationTaskId,
    "generationTaskId",
  );
  const reviewedAt = normalizeReviewedAt(article.reviewedAt);
  if (materialSnapshots !== undefined)
    normalized.materialSnapshots = materialSnapshots;
  if (templateSnapshot !== undefined)
    normalized.templateSnapshot = templateSnapshot;
  if (generationBatchId !== undefined)
    normalized.generationBatchId = generationBatchId;
  if (generationTaskId !== undefined)
    normalized.generationTaskId = generationTaskId;
  if (reviewedAt !== undefined) normalized.reviewedAt = reviewedAt;
  if (researchIds.legacy) {
    assertNonEmptyString(article.researchQueryId, "researchQueryId");
    Object.defineProperty(normalized, LEGACY_ARTICLE, {
      value: true,
      enumerable: false,
    });
  } else {
    normalized.researchSnapshots = normalizeResearchSnapshots(
      article.researchSnapshots,
      researchIds.ids,
    );
  }
  return normalized;
}

function markdownFor(article) {
  return (
    "---\ntitle: " +
    JSON.stringify(article.title) +
    "\n---\n\n" +
    article.content +
    "\n"
  );
}

function parseMarkdown(markdown) {
  markdown = String(markdown).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const match = /^---\r?\ntitle: (.+)\r?\n---\r?\n\r?\n([\s\S]*)$/.exec(
    markdown,
  );
  if (!match)
    throw storeError("ARTICLE_INVALID", "Article markdown is invalid");
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
  const workspace = getContentWorkspace(
    workspaceRoot,
    options && options.paths,
  );

  function generatedDirectory() {
    fs.mkdirSync(workspace.generated, { recursive: true });
    const stats = fs.lstatSync(workspace.generated);
    if (!stats.isDirectory() || stats.isSymbolicLink()) {
      throw storeError(
        "ARTICLE_PATH_OUT_OF_BOUNDS",
        "Generated directory is unsafe",
      );
    }
    return workspace.generated;
  }

  function clientDirectory(clientId, create) {
    assertPathSegment(clientId, "client id");
    const generated = generatedDirectory();
    const directory = path.resolve(generated, clientId);
    const relative = path.relative(generated, directory);
    if (
      relative === ".." ||
      relative.startsWith(".." + path.sep) ||
      path.isAbsolute(relative)
    ) {
      throw storeError(
        "ARTICLE_PATH_OUT_OF_BOUNDS",
        "Client directory is unsafe",
      );
    }
    if (!fs.existsSync(directory) && create)
      fs.mkdirSync(directory, { recursive: true });
    if (fs.existsSync(directory)) {
      const stats = fs.lstatSync(directory);
      if (!stats.isDirectory() || stats.isSymbolicLink()) {
        throw storeError(
          "ARTICLE_PATH_OUT_OF_BOUNDS",
          "Client directory is unsafe",
        );
      }
    }
    return directory;
  }

  function articlePaths(clientId, articleId, create) {
    assertPathSegment(articleId, "article id");
    const directory = clientDirectory(clientId, create);
    return {
      directory: directory,
      json: path.join(directory, articleId + ".json"),
      markdown: path.join(directory, articleId + ".md"),
    };
  }

  function articleLock(files) {
    const directory = path.join(
      files.directory,
      path.basename(files.json, ".json") + ".article-lock",
    );
    return { directory: directory, owner: path.join(directory, "owner.json") };
  }

  function articleLockFault(point, details) {
    if (options && typeof options.internalArticleLockFault === "function") {
      options.internalArticleLockFault(point, details);
    }
  }

  function readLockOwner(lock) {
    const directoryStat = fs.lstatSync(lock.directory);
    if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
      throw storeError(
        "ARTICLE_LOCK_INVALID",
        "Article lock directory is unsafe",
      );
    }
    const entries = fs.readdirSync(lock.directory);
    if (entries.length !== 1 || entries[0] !== "owner.json") {
      throw storeError(
        "ARTICLE_LOCK_INVALID",
        "Article lock ownership is unknown",
      );
    }
    assertRegularFile(lock.owner);
    let owner;
    try {
      owner = JSON.parse(fs.readFileSync(lock.owner, "utf8"));
    } catch (_) {
      throw storeError(
        "ARTICLE_LOCK_INVALID",
        "Article lock ownership is unknown",
      );
    }
    if (
      !owner ||
      owner.version !== 1 ||
      typeof owner.token !== "string" ||
      !/^[a-f0-9-]{36}$/.test(owner.token) ||
      !Number.isSafeInteger(owner.pid) ||
      owner.pid < 1 ||
      typeof owner.createdAt !== "string" ||
      Number.isNaN(Date.parse(owner.createdAt))
    ) {
      throw storeError(
        "ARTICLE_LOCK_INVALID",
        "Article lock ownership is unknown",
      );
    }
    return owner;
  }

  function processIsLive(pid) {
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      if (error && error.code === "ESRCH") return false;
      if (error && error.code === "EPERM") return true;
      throw storeError(
        "ARTICLE_LOCK_INVALID",
        "Article lock owner state is unknown",
      );
    }
  }

  function removeStaleLock(lock, expectedOwner) {
    const quarantine = lock.directory + ".stale-" + crypto.randomUUID();
    try {
      fs.renameSync(lock.directory, quarantine);
    } catch (error) {
      if (error && ["ENOENT", "EEXIST"].includes(error.code)) return false;
      throw storeError(
        "ARTICLE_LOCK_INVALID",
        "Stale article lock could not be isolated",
      );
    }
    const captured = {
      directory: quarantine,
      owner: path.join(quarantine, "owner.json"),
    };
    const actualOwner = readLockOwner(captured);
    if (actualOwner.token !== expectedOwner.token) {
      if (!fs.existsSync(lock.directory))
        fs.renameSync(quarantine, lock.directory);
      throw storeError(
        "ARTICLE_LOCK_INVALID",
        "Article lock ownership changed unexpectedly",
      );
    }
    removeRegularFile(captured.owner);
    fs.rmdirSync(captured.directory);
    return true;
  }

  function acquireArticleLock(files) {
    const lock = articleLock(files);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const owner = {
        version: 1,
        token: crypto.randomUUID(),
        pid: process.pid,
        createdAt: new Date().toISOString(),
      };
      const candidateDirectory = lock.directory + ".acquire-" + owner.token;
      const candidate = {
        directory: candidateDirectory,
        owner: path.join(candidateDirectory, "owner.json"),
      };
      try {
        fs.mkdirSync(candidate.directory);
        articleLockFault("after-candidate-directory", {
          files: files,
          owner: owner,
        });
        fs.writeFileSync(candidate.owner, JSON.stringify(owner) + "\n", {
          encoding: "utf8",
          flag: "wx",
        });
        articleLockFault("after-candidate-owner", {
          files: files,
          owner: owner,
        });
        fs.renameSync(candidate.directory, lock.directory);
        articleLockFault("after-acquire-rename", {
          files: files,
          owner: owner,
        });
        return { lock: lock, owner: owner };
      } catch (error) {
        if (fs.existsSync(candidate.owner)) removeRegularFile(candidate.owner);
        if (fs.existsSync(candidate.directory))
          fs.rmdirSync(candidate.directory);
        if (!fs.existsSync(lock.directory)) throw error;
      }
      const existing = readLockOwner(lock);
      if (processIsLive(existing.pid))
        throw storeError(
          "ARTICLE_STORE_BUSY",
          "Article is being changed by another process",
        );
      if (!removeStaleLock(lock, existing)) continue;
    }
    throw storeError(
      "ARTICLE_STORE_BUSY",
      "Article lock could not be acquired",
    );
  }

  function releaseArticleLock(held) {
    const current = readLockOwner(held.lock);
    if (current.token !== held.owner.token)
      throw storeError(
        "ARTICLE_LOCK_INVALID",
        "Article lock ownership was lost",
      );
    const releasedDirectory =
      held.lock.directory + ".release-" + held.owner.token;
    const released = {
      directory: releasedDirectory,
      owner: path.join(releasedDirectory, "owner.json"),
    };
    fs.renameSync(held.lock.directory, released.directory);
    articleLockFault("after-release-rename", { owner: held.owner });
    const captured = readLockOwner(released);
    if (captured.token !== held.owner.token)
      throw storeError(
        "ARTICLE_LOCK_INVALID",
        "Article lock ownership was lost",
      );
    removeRegularFile(released.owner);
    fs.rmdirSync(released.directory);
  }

  function withArticleLock(files, operation) {
    const held = acquireArticleLock(files);
    try {
      return operation();
    } finally {
      releaseArticleLock(held);
    }
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
    if (!hasJson && !hasMarkdown)
      throw storeError("ARTICLE_NOT_FOUND", "Article was not found");
    if (!hasJson || !hasMarkdown)
      throw storeError("ARTICLE_INVALID", "Article files are incomplete");
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
      throw storeError(
        "ARTICLE_INVALID",
        "Article metadata does not match its path",
      );
    }
    const markdown = parseMarkdown(fs.readFileSync(files.markdown, "utf8"));
    if (
      markdown.title !== normalized.title ||
      markdown.content !== normalized.content
    ) {
      throw storeError(
        "ARTICLE_INVALID",
        "Article markdown does not match metadata",
      );
    }
    return normalized;
  }

  function writeTemporary(filename, contents) {
    const temporary =
      filename +
      ".tmp-" +
      process.pid +
      "-" +
      Date.now() +
      "-" +
      Math.random().toString(16).slice(2);
    fs.writeFileSync(temporary, contents, "utf8");
    return temporary;
  }

  function transactionFiles(files) {
    return {
      journal: path.join(
        files.directory,
        path.basename(files.json, ".json") + ".journal",
      ),
      jsonBackup: files.json + ".backup",
      markdownBackup: files.markdown + ".backup",
    };
  }

  function removeRegularFile(filename) {
    if (!fs.existsSync(filename)) return;
    assertRegularFile(filename);
    fs.unlinkSync(filename);
  }

  function validTemporaryName(name, target) {
    return (
      typeof name === "string" &&
      path.basename(name) === name &&
      name.startsWith(path.basename(target) + ".tmp-")
    );
  }

  function recoverArticle(files) {
    const transaction = transactionFiles(files);
    if (!fs.existsSync(transaction.journal)) return;
    assertRegularFile(transaction.journal);
    let journal;
    try {
      journal = JSON.parse(fs.readFileSync(transaction.journal, "utf8"));
    } catch (error) {
      throw storeError(
        "ARTICLE_INVALID",
        "Article transaction journal is invalid",
      );
    }
    if (
      !journal ||
      journal.version !== 1 ||
      !validTemporaryName(journal.temporaryJson, files.json) ||
      !validTemporaryName(journal.temporaryMarkdown, files.markdown)
    ) {
      throw storeError(
        "ARTICLE_INVALID",
        "Article transaction journal is invalid",
      );
    }
    const hasBackups =
      fs.existsSync(transaction.jsonBackup) &&
      fs.existsSync(transaction.markdownBackup);
    if (hasBackups) {
      assertRegularFile(transaction.jsonBackup);
      assertRegularFile(transaction.markdownBackup);
      removeRegularFile(files.json);
      removeRegularFile(files.markdown);
      fs.renameSync(transaction.jsonBackup, files.json);
      fs.renameSync(transaction.markdownBackup, files.markdown);
    } else if (!fs.existsSync(files.json) || !fs.existsSync(files.markdown)) {
      const temporaryJson = path.join(files.directory, journal.temporaryJson);
      const temporaryMarkdown = path.join(
        files.directory,
        journal.temporaryMarkdown,
      );
      if (
        (!fs.existsSync(temporaryJson) && !fs.existsSync(files.json)) ||
        (!fs.existsSync(temporaryMarkdown) && !fs.existsSync(files.markdown))
      ) {
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
    const temporaryMarkdown = path.join(
      files.directory,
      journal.temporaryMarkdown,
    );
    removeRegularFile(temporaryJson);
    removeRegularFile(temporaryMarkdown);
    removeRegularFile(transaction.jsonBackup);
    removeRegularFile(transaction.markdownBackup);
    removeRegularFile(transaction.journal);
  }

  function replaceArticleFiles(files, article) {
    const temporaryMarkdown = writeTemporary(
      files.markdown,
      markdownFor(article),
    );
    const temporaryJson = writeTemporary(
      files.json,
      JSON.stringify(article, null, 2) + "\n",
    );
    const transaction = transactionFiles(files);
    try {
      fs.writeFileSync(
        transaction.journal,
        JSON.stringify({
          version: 1,
          temporaryJson: path.basename(temporaryJson),
          temporaryMarkdown: path.basename(temporaryMarkdown),
        }) + "\n",
        "utf8",
      );
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
    return withArticleLock(files, function () {
      recoverArticle(files);
      const persisted = normalized[LEGACY_ARTICLE]
        ? Object.assign({}, normalized)
        : normalized;
      if (normalized[LEGACY_ARTICLE]) {
        delete persisted.researchQueryIds;
        delete persisted.researchSnapshots;
      }
      replaceArticleFiles(files, persisted);
      return normalized;
    });
  }

  function getArticle(clientId, articleId) {
    const files = articlePaths(clientId, articleId, false);
    if (!fs.existsSync(files.directory))
      throw storeError("ARTICLE_NOT_FOUND", "Article was not found");
    return withArticleLock(files, function () {
      recoverArticle(files);
      return readArticle(clientId, articleId);
    });
  }

  function listArticles(clientId) {
    const directory = clientDirectory(clientId, false);
    if (!fs.existsSync(directory)) return [];
    return (
      fs
        .readdirSync(directory, { withFileTypes: true })
        .filter(function (entry) {
          return (
            entry.isFile() && path.extname(entry.name).toLowerCase() === ".json"
          );
        })
        .map(function (entry) {
          return path.basename(entry.name, ".json");
        })
        .map(function (articleId) {
          const files = articlePaths(clientId, articleId, false);
          return withArticleLock(files, function () {
            recoverArticle(files);
            return readArticle(clientId, articleId);
          });
        })
        // History is a creation-history view.  Compare instants, not timestamp
        // spellings: offsets such as +08:00 and Z must sort by their epoch.
        // Editing or reviewing an older article must not change this order.
        .sort(function (a, b) {
          const created = Date.parse(b.createdAt) - Date.parse(a.createdAt);
          return created || String(a.id).localeCompare(String(b.id));
        })
    );
  }

  function reviewArticle(clientId, articleId, reviewedAt) {
    const article = getArticle(clientId, articleId);
    if (article.status === "saved") return article;
    if (article.status !== "generated")
      throw storeError("ARTICLE_NOT_GENERATED", "Article is not generated");
    return saveArticle(
      Object.assign({}, article, { status: "saved", reviewedAt: reviewedAt }),
    );
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
    if (!safeDirectory(autopublish, "Article state directory", create))
      return null;
    if (!safeDirectory(root, "Article trash directory", create)) return null;
    return root;
  }

  function trashDirectory(clientId, create) {
    assertPathSegment(clientId, "client id");
    const root = trashRootDirectory(create);
    if (!root) return null;
    const directory = path.resolve(root, clientId);
    const relative = path.relative(root, directory);
    if (
      relative === ".." ||
      relative.startsWith(".." + path.sep) ||
      path.isAbsolute(relative)
    ) {
      throw storeError(
        "ARTICLE_PATH_OUT_OF_BOUNDS",
        "Trash client directory is unsafe",
      );
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
      journal: path.join(directory, articleId + ".trash.journal"),
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
    const allowedFields = [
      "version",
      "deletedAt",
      "clientId",
      "articleId",
      "status",
      "references",
      "titleSnapshot",
      "contentFingerprint",
      "operationId",
      "permanentlyDeleted",
      "purgedAt",
    ];
    if (
      !tombstone ||
      typeof tombstone !== "object" ||
      Array.isArray(tombstone) ||
      Object.keys(tombstone).some(function (field) {
        return !allowedFields.includes(field);
      }) ||
      tombstone.version !== 1 ||
      typeof tombstone.deletedAt !== "string" ||
      Number.isNaN(Date.parse(tombstone.deletedAt)) ||
      tombstone.clientId !== clientId ||
      tombstone.articleId !== articleId ||
      (tombstone.contentFingerprint !== undefined &&
        (typeof tombstone.contentFingerprint !== "string" ||
          !/^[a-f0-9]{64}$/.test(tombstone.contentFingerprint))) ||
      (tombstone.operationId !== undefined &&
        (typeof tombstone.operationId !== "string" ||
          !/^[A-Za-z0-9:_-]{1,200}$/.test(tombstone.operationId))) ||
      (tombstone.status !== "generated" && tombstone.status !== "saved") ||
      !Array.isArray(tombstone.references) ||
      (tombstone.permanentlyDeleted === true &&
        (typeof tombstone.purgedAt !== "string" ||
          Number.isNaN(Date.parse(tombstone.purgedAt)))) ||
      (tombstone.permanentlyDeleted !== undefined &&
        tombstone.permanentlyDeleted !== true) ||
      (tombstone.purgedAt !== undefined &&
        tombstone.permanentlyDeleted !== true) ||
      (tombstone.titleSnapshot !== undefined &&
        tombstone.titleSnapshot !== null &&
        (typeof tombstone.titleSnapshot !== "string" ||
          !tombstone.titleSnapshot.trim() ||
          tombstone.titleSnapshot.length > 200))
    ) {
      throw storeError("ARTICLE_INVALID", "Article tombstone is invalid");
    }
    tombstone.references.forEach(function (reference) {
      if (
        !reference ||
        typeof reference !== "object" ||
        typeof reference.type !== "string" ||
        !reference.type.trim() ||
        typeof reference.id !== "string" ||
        !reference.id.trim() ||
        reference.id.includes("/") ||
        reference.id.includes("\\")
      ) {
        throw storeError(
          "ARTICLE_INVALID",
          "Article tombstone reference is invalid",
        );
      }
    });
    return tombstone;
  }

  function getTrashedTombstone(clientId, articleId) {
    assertPathSegment(clientId, "client id");
    assertPathSegment(articleId, "article id");
    const directory = trashDirectory(clientId, false);
    if (!directory || !fs.existsSync(directory))
      throw storeError("ARTICLE_NOT_FOUND", "Trashed article was not found");
    const filename = path.join(directory, articleId + ".tombstone.json");
    if (!fs.existsSync(filename))
      throw storeError("ARTICLE_NOT_FOUND", "Trashed article was not found");
    return assertTombstone(
      readJson(filename, "ARTICLE_INVALID", "Article tombstone is invalid"),
      clientId,
      articleId,
    );
  }

  function assertTrashPair(files) {
    const exists = [files.json, files.markdown, files.tombstone].map(
      fs.existsSync,
    );
    if (!exists.every(Boolean)) {
      if (exists.some(Boolean))
        throw storeError(
          "ARTICLE_INVALID",
          "Article trash files are incomplete",
        );
      throw storeError("ARTICLE_NOT_FOUND", "Trashed article was not found");
    }
    assertRegularFile(files.json);
    assertRegularFile(files.markdown);
    assertRegularFile(files.tombstone);
  }

  function moveArticleToTrash(
    clientId,
    articleId,
    tombstone,
    operationId,
    expectedFingerprint,
  ) {
    const source = articlePaths(clientId, articleId, false);
    if (!fs.existsSync(source.directory))
      throw storeError("ARTICLE_NOT_FOUND", "Article was not found");
    return withArticleLock(source, function () {
      recoverArticle(source);
      const article = readArticle(clientId, articleId);
      const normalizedTombstone = assertTombstone(
        Object.assign(
          {},
          tombstone,
          operationId === undefined ? {} : { operationId },
        ),
        clientId,
        articleId,
      );
      if (
        expectedFingerprint !== undefined &&
        (typeof expectedFingerprint !== "string" ||
          !/^[a-f0-9]{64}$/.test(expectedFingerprint) ||
          fingerprintArticle(article) !== expectedFingerprint ||
          normalizedTombstone.contentFingerprint !== expectedFingerprint)
      ) {
        throw storeError(
          "ARTICLE_REMOVAL_CONTENT_CHANGED",
          "Article content changed before it could be moved to trash",
        );
      }
      if (normalizedTombstone.status !== article.status) {
        throw storeError(
          "ARTICLE_INVALID",
          "Article tombstone status does not match article",
        );
      }
      const destination = trashPaths(clientId, articleId, true);
      const destinationState = [
        destination.json,
        destination.markdown,
        destination.tombstone,
      ].map(fs.existsSync);
      if (destinationState.some(Boolean)) {
        if (
          destinationState.every(Boolean) &&
          !fs.existsSync(source.json) &&
          !fs.existsSync(source.markdown)
        ) {
          const existing = readJson(
            destination.tombstone,
            "ARTICLE_INVALID",
            "Article tombstone is invalid",
          );
          if (operationId !== undefined && existing.operationId !== operationId)
            throw storeError(
              "ARTICLE_TRASH_CONFLICT",
              "Trashed article operation does not match",
            );
          return assertTombstone(existing, clientId, articleId);
        }
        throw storeError(
          "ARTICLE_TRASH_CONFLICT",
          "Trashed article already exists or is incomplete",
        );
      }

      const temporaryTombstone = writeTemporary(
        destination.tombstone,
        JSON.stringify(normalizedTombstone, null, 2) + "\n",
      );
      const moved = [];
      try {
        fs.renameSync(source.json, destination.json);
        moved.push([destination.json, source.json]);
        fs.renameSync(source.markdown, destination.markdown);
        moved.push([destination.markdown, source.markdown]);
        fs.renameSync(temporaryTombstone, destination.tombstone);
        return normalizedTombstone;
      } catch (error) {
        if (fs.existsSync(temporaryTombstone))
          removeRegularFile(temporaryTombstone);
        if (fs.existsSync(destination.tombstone))
          removeRegularFile(destination.tombstone);
        for (let index = moved.length - 1; index >= 0; index -= 1) {
          const pair = moved[index];
          if (fs.existsSync(pair[0]) && !fs.existsSync(pair[1]))
            fs.renameSync(pair[0], pair[1]);
        }
        throw error;
      }
    });
  }

  function readTrashedArticle(clientId, articleId) {
    const files = trashPaths(clientId, articleId, false);
    const tombstone = getTrashedTombstone(clientId, articleId);
    if (tombstone.permanentlyDeleted === true)
      throw storeError(
        "ARTICLE_PERMANENTLY_DELETED",
        "Article was permanently deleted",
      );
    assertTrashPair(files);
    const markdown = parseMarkdown(fs.readFileSync(files.markdown, "utf8"));
    const metadata = readJson(
      files.json,
      "ARTICLE_INVALID",
      "Trashed article JSON is invalid",
    );
    const article = normalizeArticle(metadata);
    if (
      article.id !== articleId ||
      article.clientId !== clientId ||
      article.title !== markdown.title ||
      article.content !== markdown.content ||
      article.status !== tombstone.status
    ) {
      throw storeError("ARTICLE_INVALID", "Trashed article files do not match");
    }
    return { article: article, tombstone: tombstone, files: files };
  }

  function restoreTrashedArticle(clientId, articleId) {
    const source = articlePaths(clientId, articleId, true);
    return withArticleLock(source, function () {
      const trashed = readTrashedArticle(clientId, articleId);
      if (fs.existsSync(source.json) || fs.existsSync(source.markdown)) {
        throw storeError(
          "ARTICLE_RESTORE_CONFLICT",
          "An article with this id already exists",
        );
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
          if (fs.existsSync(pair[0]) && !fs.existsSync(pair[1]))
            fs.renameSync(pair[0], pair[1]);
        }
        throw error;
      }
    });
  }

  function listTrashedArticles(clientId) {
    const directory = trashDirectory(clientId, false);
    if (!directory || !fs.existsSync(directory)) return [];
    const names = fs
      .readdirSync(directory, { withFileTypes: true })
      .filter(function (entry) {
        return (
          entry.isFile() &&
          (entry.name.endsWith(".tombstone.json") ||
            entry.name.endsWith(".json") ||
            entry.name.endsWith(".md"))
        );
      })
      .map(function (entry) {
        return entry.name.replace(/\.tombstone\.json$|\.json$|\.md$/, "");
      });
    return Array.from(new Set(names))
      .map(function (articleId) {
        const tombstone = getTrashedTombstone(clientId, articleId);
        if (tombstone.permanentlyDeleted === true) return null;
        return readTrashedArticle(clientId, articleId).tombstone;
      })
      .filter(Boolean)
      .sort(function (a, b) {
        return b.deletedAt.localeCompare(a.deletedAt);
      });
  }

  function writeTerminalTombstone(files, tombstone) {
    const temporary = writeTemporary(
      files.tombstone,
      JSON.stringify(tombstone, null, 2) + "\n",
    );
    const backup =
      files.tombstone + ".backup-" + process.pid + "-" + Date.now();
    let backedUp = false;
    let installed = false;
    try {
      fs.renameSync(files.tombstone, backup);
      backedUp = true;
      fs.renameSync(temporary, files.tombstone);
      installed = true;
      removeRegularFile(backup);
    } catch (error) {
      if (installed && fs.existsSync(files.tombstone))
        removeRegularFile(files.tombstone);
      if (backedUp && fs.existsSync(backup) && !fs.existsSync(files.tombstone))
        fs.renameSync(backup, files.tombstone);
      if (fs.existsSync(temporary)) removeRegularFile(temporary);
      throw error;
    }
  }

  function permanentlyDeleteTrashedArticle(clientId, articleId, purgedAt) {
    const tombstone = getTrashedTombstone(clientId, articleId);
    if (tombstone.permanentlyDeleted === true) return tombstone;
    const trashed = readTrashedArticle(clientId, articleId);
    const staging = path.join(
      trashed.files.directory,
      articleId + ".deleting-" + process.pid + "-" + Date.now(),
    );
    fs.mkdirSync(staging);
    const staged = [];
    let terminalWritten = false;
    try {
      [
        trashed.files.json,
        trashed.files.markdown,
        trashed.files.tombstone,
      ].forEach(function (filename) {
        if (filename === trashed.files.tombstone) return;
        const target = path.join(staging, path.basename(filename));
        fs.renameSync(filename, target);
        staged.push([target, filename]);
      });
      const terminal = Object.assign({}, tombstone, {
        permanentlyDeleted: true,
        purgedAt: purgedAt || new Date().toISOString(),
      });
      assertTombstone(terminal, clientId, articleId);
      writeTerminalTombstone(trashed.files, terminal);
      terminalWritten = true;
      fs.rmSync(staging, { recursive: true, force: true });
      return terminal;
    } catch (error) {
      if (!terminalWritten && fs.existsSync(staging)) {
        for (let index = staged.length - 1; index >= 0; index -= 1) {
          const pair = staged[index];
          if (fs.existsSync(pair[0]) && !fs.existsSync(pair[1]))
            fs.renameSync(pair[0], pair[1]);
        }
        if (fs.existsSync(staging))
          fs.rmSync(staging, { recursive: true, force: true });
      }
      throw error;
    }
  }

  function isArticleTrashed(clientId, articleId) {
    try {
      const tombstone = getTrashedTombstone(clientId, articleId);
      return tombstone.permanentlyDeleted !== true;
    } catch (error) {
      if (error && error.code === "ARTICLE_NOT_FOUND") return false;
      throw error;
    }
  }

  function isArticleRemoved(clientId, articleId) {
    try {
      getTrashedTombstone(clientId, articleId);
      return true;
    } catch (error) {
      if (error && error.code === "ARTICLE_NOT_FOUND") return false;
      throw error;
    }
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
