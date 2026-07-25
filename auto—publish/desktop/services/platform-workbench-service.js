const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const mammoth = require("mammoth");

const {
  resolveArticleIdentity,
} = require("../../src/publication/article-identity");
const { createArticleStore } = require("../../src/content/article-store");

const ARTICLE_EXTENSIONS = [".md", ".txt", ".docx"];
const SAFE_ID = /^[^<>:"/\\|?*\x00-\x1f]+$/;

function firstTitle(raw, fallback) {
  var lines = String(raw || "").split(/\n/);
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].replace(/^#+\s*/, "").trim();
    if (line) return line;
  }
  return fallback;
}

function submissionInputError(code, message) {
  var error = new Error(message || "Invalid submission input");
  error.code = code || "SUBMISSION_INPUT_INVALID";
  return error;
}

function isSafeToken(value) {
  return (
    typeof value === "string" &&
    value.trim() !== "" &&
    value.trim() !== "." &&
    value.trim() !== ".." &&
    SAFE_ID.test(value.trim())
  );
}

function isTemporaryQueueArtifact(name) {
  return (
    name === ".gitkeep" ||
    name.indexOf("~$") === 0 ||
    /\.meta\.json$/i.test(name) ||
    /\.submission\.json$/i.test(name) ||
    /(?:\.tmp-|\.stage(?:$|\.)|\.deleting-|\.autopublish-archive-)/i.test(name)
  );
}

function isPrimaryArticle(name) {
  return ARTICLE_EXTENSIONS.indexOf(path.extname(name).toLowerCase()) !== -1;
}

function hashFile(filename) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(filename))
    .digest("hex");
}

function readSubmissionMetadata(filePath, strict) {
  var sidecarPath = filePath + ".submission.json";
  if (!fs.existsSync(sidecarPath))
    return { path: null, data: null, valid: true };

  var data;
  try {
    var stat = fs.lstatSync(sidecarPath);
    if (stat.isSymbolicLink() || !stat.isFile())
      throw new Error("sidecar is not a file");
    data = JSON.parse(fs.readFileSync(sidecarPath, "utf8"));
  } catch (_) {
    return {
      path: sidecarPath,
      data: null,
      valid: false,
      reason: "SUBMISSION_SIDECAR_INVALID",
    };
  }

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return {
      path: sidecarPath,
      data: data,
      valid: false,
      reason: "SUBMISSION_SIDECAR_INVALID",
    };
  }

  // Legacy sidecars remain readable. Once a version is declared, it must be v2
  // and the sidecar must prove that it belongs to the scanned main file.
  if (data.version === undefined)
    return { path: sidecarPath, data: data, valid: true, legacy: true };
  if (
    data.version !== 2 ||
    typeof data.contentHash !== "string" ||
    !/^[a-f0-9]{64}$/.test(data.contentHash)
  ) {
    return {
      path: sidecarPath,
      data: data,
      valid: false,
      reason: "SUBMISSION_SIDECAR_VERSION_INVALID",
    };
  }
  if (
    data.filename !== undefined &&
    data.filename !== path.basename(filePath)
  ) {
    return {
      path: sidecarPath,
      data: data,
      valid: false,
      reason: "SUBMISSION_SIDECAR_FILE_MISMATCH",
    };
  }
  if (data.contentHash !== hashFile(filePath)) {
    return {
      path: sidecarPath,
      data: data,
      valid: false,
      reason: "SUBMISSION_SIDECAR_CONTENT_MISMATCH",
    };
  }
  if (
    !isSafeToken(data.clientId) ||
    (!isSafeToken(data.generatedArticleId) &&
      !isSafeToken(data.articleId) &&
      !isSafeToken(data.articleKey))
  ) {
    return {
      path: sidecarPath,
      data: data,
      valid: false,
      reason: "SUBMISSION_SIDECAR_IDENTITY_INVALID",
    };
  }
  if (
    (data.publicationId !== undefined && !isSafeToken(data.publicationId)) ||
    (data.attemptId !== undefined && !isSafeToken(data.attemptId))
  ) {
    return {
      path: sidecarPath,
      data: data,
      valid: false,
      reason: "SUBMISSION_SIDECAR_PUBLICATION_INVALID",
    };
  }
  if ((data.publicationId === undefined) !== (data.attemptId === undefined)) {
    return {
      path: sidecarPath,
      data: data,
      valid: false,
      reason: "SUBMISSION_SIDECAR_PUBLICATION_INVALID",
    };
  }
  return { path: sidecarPath, data: data, valid: true, version: 2 };
}

function resolvePlatformSubmissionFile(
  inputRoot,
  platforms,
  sourcePlatformId,
  filename,
  validateSidecar,
) {
  if (
    typeof sourcePlatformId !== "string" ||
    !sourcePlatformId ||
    typeof filename !== "string" ||
    !filename ||
    filename.trim() !== filename ||
    path.basename(filename) !== filename ||
    path.isAbsolute(filename) ||
    filename.indexOf("/") !== -1 ||
    filename.indexOf("\\") !== -1 ||
    !isPrimaryArticle(filename) ||
    isTemporaryQueueArtifact(filename)
  ) {
    throw submissionInputError();
  }
  var source = platforms.filter(function (platform) {
    return platform.id === sourcePlatformId;
  })[0];
  if (!source) throw submissionInputError();
  var inputDir = path.resolve(inputRoot, source.scanDir || source.id);
  var filePath = path.resolve(inputDir, filename);
  if (path.dirname(filePath) !== inputDir) throw submissionInputError();
  var stat;
  try {
    stat = fs.lstatSync(filePath);
  } catch (_) {
    throw submissionInputError();
  }
  if (!stat.isFile() || stat.isSymbolicLink()) throw submissionInputError();
  if (validateSidecar) {
    var metadata = readSubmissionMetadata(filePath, true);
    if (!metadata.valid)
      throw submissionInputError(
        metadata.reason,
        "Submission sidecar is invalid",
      );
  }
  return filePath;
}

function safeTask(task) {
  if (!task || typeof task !== "object") throw submissionInputError();
  if (
    !isSafeToken(task.sourcePlatformId) ||
    !isSafeToken(task.filename) ||
    !isSafeToken(task.targetPlatformId) ||
    path.basename(task.filename) !== task.filename ||
    path.isAbsolute(task.filename) ||
    task.filename.indexOf("/") !== -1 ||
    task.filename.indexOf("\\") !== -1
  ) {
    throw submissionInputError();
  }
  return {
    sourcePlatformId: task.sourcePlatformId,
    filename: task.filename,
    targetPlatformId: task.targetPlatformId,
    ...(typeof task.accountProfileId === "string"
      ? { accountProfileId: task.accountProfileId }
      : {}),
  };
}

function taskKey(task) {
  var value = safeTask(task);
  return (
    value.sourcePlatformId +
    "\u0000" +
    value.filename +
    "\u0000" +
    value.targetPlatformId
  );
}

function createPlatformWorkbenchService(opts) {
  var options = opts || {};
  var rootDir = options.rootDir || path.resolve(__dirname, "..", "..");
  var inputRoot =
    options.paths && typeof options.paths.input === "string"
      ? path.resolve(options.paths.input)
      : path.join(rootDir, "input");
  var platforms = options.platforms || [];
  var adapters = options.adapters || {};
  var articleStore =
    options.articleStore ||
    createArticleStore(rootDir, { paths: options.paths });

  function sourceArticleState(metadata) {
    var data = metadata && metadata.data;
    var clientId = data && data.clientId;
    var articleId = data && (data.generatedArticleId || data.articleId);
    if (
      !clientId ||
      !articleId ||
      !articleStore ||
      (typeof articleStore.isArticleTrashed !== "function" &&
        typeof articleStore.isArticleRemoved !== "function")
    )
      return { sourceArticleState: "active", reasonCode: null };
    try {
      var removed =
        typeof articleStore.isArticleRemoved === "function"
          ? articleStore.isArticleRemoved(clientId, articleId)
          : articleStore.isArticleTrashed(clientId, articleId);
      if (removed)
        return {
          sourceArticleState: "trashed",
          reasonCode: "SOURCE_ARTICLE_TRASHED",
        };
    } catch (_) {}
    return { sourceArticleState: "active", reasonCode: null };
  }

  function scanQueue() {
    return platforms
      .filter(function (platform) {
        return platform.id !== "media";
      })
      .map(function (platform) {
        var platformId = platform.id;
        var scanDir = platform.scanDir || platform.id;
        var inputDir = path.join(inputRoot, scanDir);
        var articles = [];
        if (fs.existsSync(inputDir)) {
          articles = fs
            .readdirSync(inputDir)
            .filter(function (name) {
              if (isTemporaryQueueArtifact(name) || !isPrimaryArticle(name))
                return false;
              var stat;
              try {
                stat = fs.lstatSync(path.join(inputDir, name));
              } catch (_) {
                return false;
              }
              if (!stat.isFile() || stat.isSymbolicLink()) return false;
              var metadata = readSubmissionMetadata(
                path.join(inputDir, name),
                true,
              );
              return metadata.valid;
            })
            .map(function (filename) {
              var filePath = path.join(inputDir, filename);
              var metadata = readSubmissionMetadata(filePath, true);
              var state = sourceArticleState(metadata);
              var title = path.basename(filename, path.extname(filename));
              if (filename.endsWith(".txt") || filename.endsWith(".md")) {
                title = firstTitle(fs.readFileSync(filePath, "utf-8"), title);
              }
              return {
                filename: filename,
                filePath: filePath,
                file: filePath,
                sourceFile: filePath,
                fileBaseName: path.basename(filename, path.extname(filename)),
                title: title,
                sourceArticleState: state.sourceArticleState,
                reasonCode: state.reasonCode,
                accountProfileId:
                  metadata &&
                  metadata.data &&
                  typeof metadata.data.accountProfileId === "string"
                    ? metadata.data.accountProfileId
                    : "",
                archiveError: null,
              };
            });
        }
        return { platformId: platformId, scanDir: scanDir, articles: articles };
      });
  }

  function resolveSelectedFilePath(article, validateSidecar) {
    return resolvePlatformSubmissionFile(
      inputRoot,
      platforms,
      article.sourcePlatformId,
      article.filename,
      validateSidecar !== false,
    );
  }

  function validateTargetPlatformIds(targetPlatformIds) {
    if (!Array.isArray(targetPlatformIds) || targetPlatformIds.length === 0)
      throw submissionInputError();
    for (
      var targetIndex = 0;
      targetIndex < targetPlatformIds.length;
      targetIndex++
    ) {
      if (
        typeof targetPlatformIds[targetIndex] !== "string" ||
        !targetPlatformIds[targetIndex] ||
        (!platforms.some(function (platform) {
          return (
            platform.id === targetPlatformIds[targetIndex] &&
            platform.id !== "media"
          );
        }) &&
          !adapters[targetPlatformIds[targetIndex]])
      )
        throw submissionInputError();
    }
    return targetPlatformIds.slice();
  }

  function buildSelectedArticleTasks(selectedArticle, targetPlatformIds) {
    var selected = safeTask({
      sourcePlatformId: selectedArticle.sourcePlatformId,
      filename: selectedArticle.filename,
      targetPlatformId: targetPlatformIds[0],
    });
    var filePath = resolveSelectedFilePath(selectedArticle);
    var sourceMetadata = readSubmissionMetadata(filePath, true);
    var durableAccountProfileId =
      sourceMetadata &&
      sourceMetadata.data &&
      sourceMetadata.data.accountProfileId;
    if (
      typeof durableAccountProfileId !== "string" ||
      !durableAccountProfileId
    ) {
      throw submissionInputError(
        "LEGACY_UNKNOWN_ACCOUNT",
        "The queued publication must be manually bound to an account profile",
      );
    }
    var state = sourceArticleState(sourceMetadata);
    if (state.sourceArticleState === "trashed")
      throw submissionInputError(
        state.reasonCode,
        "Source article is in the trash",
      );
    var tasks = [];
    for (var j = 0; j < targetPlatformIds.length; j++) {
      var targetPlatformId = targetPlatformIds[j];
      var rendererAccountProfileId =
        selectedArticle.accountProfiles &&
        selectedArticle.accountProfiles[targetPlatformId];
      var durableTargetPlatformId =
        sourceMetadata &&
        sourceMetadata.data &&
        (sourceMetadata.data.targetPlatformId ||
          sourceMetadata.data.targetPlatform);
      if (
        typeof durableTargetPlatformId === "string" &&
        durableTargetPlatformId &&
        durableTargetPlatformId !== targetPlatformId
      ) {
        throw submissionInputError(
          "PUBLICATION_TARGET_MISMATCH",
          "The selected target does not match the queued publication",
        );
      }
      if (rendererAccountProfileId !== durableAccountProfileId) {
        throw submissionInputError(
          "ACCOUNT_PROFILE_MISMATCH",
          "The selected account does not match the queued publication",
        );
      }
      tasks.push({
        sourcePlatformId: selected.sourcePlatformId,
        filename: selected.filename,
        filePath: filePath,
        sourceArticle: Object.assign({}, selectedArticle, {
          file: filePath,
          filePath: filePath,
          sourceFile: filePath,
          fileBaseName: path.basename(
            selected.filename,
            path.extname(selected.filename),
          ),
        }),
        targetPlatformId: targetPlatformId,
        accountProfileId: durableAccountProfileId,
      });
    }
    return tasks;
  }

  function buildSelectedPlan(input) {
    var selectedArticles = input.selectedArticles || [];
    if (!Array.isArray(selectedArticles)) throw submissionInputError();
    var targetPlatformIds = validateTargetPlatformIds(
      input.targetPlatformIds || [],
    );
    var tasks = [];
    for (var i = 0; i < selectedArticles.length; i++) {
      tasks = tasks.concat(
        buildSelectedArticleTasks(selectedArticles[i], targetPlatformIds),
      );
    }
    return { taskCount: tasks.length, tasks: tasks };
  }

  function buildSelectedSubmissionsPlan(submissions) {
    if (!Array.isArray(submissions) || !submissions.length)
      throw submissionInputError();
    var tasks = [];
    for (var i = 0; i < submissions.length; i++) {
      var submission = submissions[i];
      if (
        !submission ||
        typeof submission !== "object" ||
        Array.isArray(submission)
      )
        throw submissionInputError();
      var targetPlatformIds = validateTargetPlatformIds(
        submission.targetPlatformIds || [],
      );
      tasks = tasks.concat(
        buildSelectedArticleTasks(submission, targetPlatformIds),
      );
    }
    return { taskCount: tasks.length, tasks: tasks };
  }

  function toWorkerPlan(plan) {
    var tasks = plan && Array.isArray(plan.tasks) ? plan.tasks : [];
    return { taskCount: tasks.length, tasks: tasks.map(safeTask) };
  }

  function captureTaskIdentities(plan) {
    var identities = new Map();
    var tasks = plan && Array.isArray(plan.tasks) ? plan.tasks : [];
    tasks.forEach(function (rawTask) {
      var task = safeTask(rawTask);
      var identity = {
        clientId: null,
        articleId: null,
        reasonCode: "IDENTITY_MISSING",
      };
      try {
        var filePath = resolveSelectedFilePath(task, true);
        var metadata = readSubmissionMetadata(filePath, true);
        var data = metadata && metadata.data;
        var articleId = data && (data.generatedArticleId || data.articleId);
        if (
          metadata &&
          metadata.valid === true &&
          isSafeToken(data && data.clientId) &&
          isSafeToken(articleId)
        ) {
          identity = Object.freeze({
            clientId: data.clientId,
            articleId: articleId,
          });
        }
      } catch (_) {
        // A publish can still be reported as successful when the local identity
        // is unavailable. Only the post-publish local removal is blocked.
      }
      identities.set(taskKey(task), identity);
    });
    return identities;
  }

  async function preparePublicationCommand(rawTask) {
    const task = safeTask(rawTask);
    if (typeof task.accountProfileId !== "string" || !task.accountProfileId)
      throw submissionInputError(
        "ACCOUNT_PROFILE_REQUIRED",
        "A platform account profile is required",
      );
    const adapter = adapters[task.targetPlatformId];
    if (!adapter)
      throw submissionInputError(
        "SUBMISSION_ADAPTER_MISSING",
        "Missing adapter",
      );
    const filePath = resolveSelectedFilePath(task, true);
    const metadata = readSubmissionMetadata(filePath, true);
    const durableAccountProfileId =
      metadata && metadata.data && metadata.data.accountProfileId;
    if (typeof durableAccountProfileId !== "string" || !durableAccountProfileId)
      throw submissionInputError(
        "LEGACY_UNKNOWN_ACCOUNT",
        "The queued publication must be manually bound to an account profile",
      );
    if (durableAccountProfileId !== task.accountProfileId)
      throw submissionInputError(
        "ACCOUNT_PROFILE_MISMATCH",
        "The selected account does not match the queued publication",
      );
    const durableTargetPlatformId =
      metadata &&
      metadata.data &&
      (metadata.data.targetPlatformId || metadata.data.targetPlatform);
    if (
      typeof durableTargetPlatformId === "string" &&
      durableTargetPlatformId &&
      durableTargetPlatformId !== task.targetPlatformId
    )
      throw submissionInputError(
        "PUBLICATION_TARGET_MISMATCH",
        "The selected target does not match the queued publication",
      );
    const source = {
      file: filePath,
      filePath: filePath,
      sourceFile: filePath,
      filename: task.filename,
      fileBaseName: path.basename(task.filename, path.extname(task.filename)),
    };
    const parsed = adapter.parseArticleFiles
      ? await adapter.parseArticleFiles([source])
      : [await fallbackParseArticle(source, filePath)];
    if (!parsed.length)
      throw submissionInputError(
        "ARTICLE_PARSE_FAILED",
        "Article parse returned no publishable article",
      );
    const article = parsed[0];
    const identity = articleIdentity(article, metadata, filePath);
    const submissionBatchId =
      metadata && metadata.data && metadata.data.submissionBatchId;
    if (typeof submissionBatchId !== "string" || !submissionBatchId)
      throw submissionInputError(
        "SUBMISSION_BATCH_MISSING",
        "The queued publication has no durable batch identity",
      );
    let body = typeof article.body === "string" ? article.body : "";
    if (!body.trim()) {
      try {
        const fallback = await fallbackParseArticle(source, filePath);
        if (fallback && typeof fallback.body === "string") body = fallback.body;
      } catch (_) {
        body = "";
      }
    }
    if (!body.trim())
      throw submissionInputError(
        "ARTICLE_BODY_REQUIRED",
        "The queued article has no publishable body",
      );
    return Object.freeze({
      articleId: identity.articleId || identity.articleKey,
      target: {
        kind: "platform",
        platformId: task.targetPlatformId,
        accountProfileId: task.accountProfileId,
      },
      title:
        article.title ||
        path.basename(task.filename, path.extname(task.filename)),
      body,
      postProcessingPayload: {
        sourcePlatformId: task.sourcePlatformId,
        filename: task.filename,
        batchId: submissionBatchId,
      },
      workerTask: task,
    });
  }

  async function prepareMediaPublicationCommands(articles) {
    const commands = [];
    for (const article of articles || []) {
      // Media drafts pre-date normal-platform sidecars; their immutable
      // identity is derived from converted content below, so do not treat a
      // missing normal submission sidecar as a publication fact source.
      const filePath = resolveSelectedFilePath(
        { sourcePlatformId: "media", filename: article.filename },
        false,
      );
      const parsed = await fallbackParseArticle(
        {
          filename: article.filename,
          fileBaseName: path.basename(
            article.filename,
            path.extname(article.filename),
          ),
        },
        filePath,
      );
      const body =
        typeof parsed.body === "string" && parsed.body.trim()
          ? parsed.body
          : "媒体稿件内容";
      const articleId =
        "media-" +
        crypto
          .createHash("sha256")
          .update(String(parsed.title || article.filename) + "\u0000" + body)
          .digest("hex")
          .slice(0, 48);
      for (const resource of article.selectedResources || []) {
        if (
          !resource ||
          typeof resource.resourceId !== "string" ||
          !resource.resourceId
        )
          throw submissionInputError();
        commands.push(
          Object.freeze({
            articleId,
            target: { kind: "media", mediaResourceId: resource.resourceId },
            title: parsed.title || article.filename,
            body,
            postProcessingPayload: {
              sourcePlatformId: "media",
              filename: article.filename,
            },
          }),
        );
      }
    }
    return commands;
  }

  function fallbackParseArticle(sourceArticle, filePath) {
    var article = {
      sourceFile: filePath,
      file: filePath,
      filePath: filePath,
      filename: sourceArticle.filename,
      title:
        sourceArticle.title ||
        sourceArticle.fileBaseName ||
        path.basename(filePath, path.extname(filePath)),
    };
    var ext = path.extname(filePath).toLowerCase();
    if (ext === ".txt" || ext === ".md") {
      var raw = fs.readFileSync(filePath, "utf8");
      var lines = raw.split(/\n/);
      var first = 0;
      for (var i = 0; i < lines.length; i++) {
        if (lines[i].replace(/^#+\s*/, "").trim()) {
          first = i;
          break;
        }
      }
      article.title =
        article.title || lines[first].replace(/^#+\s*/, "").trim();
      article.body = lines
        .slice(first + 1)
        .join("\n")
        .trim();
    } else if (ext === ".docx") {
      return mammoth
        .extractRawText({ buffer: fs.readFileSync(filePath) })
        .then(function (result) {
          var fullText = String((result && result.value) || "");
          var breakAt = fullText.indexOf("\n\n");
          article.body =
            breakAt > 0 ? fullText.substring(breakAt + 2).trim() : fullText;
          article.title = article.title || firstTitle(fullText, article.title);
          return article;
        });
    }
    return article;
  }

  function articleIdentity(article, metadata, filePath) {
    var sidecar = metadata.data || {};
    var clientId =
      sidecar.clientId || article.clientId || "legacy-platform-queue";
    var generatedArticleId =
      sidecar.generatedArticleId || sidecar.articleId || article.articleId;
    if (generatedArticleId) {
      return resolveArticleIdentity({
        clientId: clientId,
        articleId: generatedArticleId,
      });
    }
    var content = typeof article.body === "string" ? article.body : "";
    if (!content) {
      content = fs.readFileSync(filePath, "utf8");
    }
    return resolveArticleIdentity({
      clientId: clientId,
      title: article.title || path.basename(filePath, path.extname(filePath)),
      content: content,
    });
  }

  return {
    scanQueue: scanQueue,
    buildSelectedPlan: buildSelectedPlan,
    buildSelectedSubmissionsPlan: buildSelectedSubmissionsPlan,
    preparePublicationCommand: preparePublicationCommand,
    prepareMediaPublicationCommands: prepareMediaPublicationCommands,
    taskKey: taskKey,
    resolveSubmissionFile: function (sourcePlatformId, filename) {
      return resolvePlatformSubmissionFile(
        inputRoot,
        platforms,
        sourcePlatformId,
        filename,
        false,
      );
    },
    readSubmissionMetadata: function (sourcePlatformId, filename) {
      var filePath = resolvePlatformSubmissionFile(
        inputRoot,
        platforms,
        sourcePlatformId,
        filename,
        false,
      );
      return readSubmissionMetadata(filePath, true);
    },
  };
}

module.exports = {
  createPlatformWorkbenchService,
  readSubmissionMetadata,
  resolvePlatformSubmissionFile,
  taskKey,
};
