"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ARTICLE_EXTENSIONS = Object.freeze([".md", ".txt", ".docx"]);
const SAFE_ID = /^[^<>:"/\\|?*\x00-\x1f]+$/;

function submissionInputError(code, message) {
  const error = new Error(message || "Invalid submission input");
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
  return ARTICLE_EXTENSIONS.includes(path.extname(name).toLowerCase());
}

function hashFile(filename) {
  return require("node:crypto")
    .createHash("sha256")
    .update(fs.readFileSync(filename))
    .digest("hex");
}

function firstTitle(raw, fallback) {
  const lines = String(raw || "").split(/\n/);
  for (const line of lines) {
    const title = line.replace(/^#+\s*/, "").trim();
    if (title) return title;
  }
  return fallback;
}

function readSubmissionMetadata(filePath) {
  const sidecarPath = filePath + ".submission.json";
  if (!fs.existsSync(sidecarPath))
    return { path: null, data: null, valid: true };

  let data;
  try {
    const stat = fs.lstatSync(sidecarPath);
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

  if (!data || typeof data !== "object" || Array.isArray(data))
    return {
      path: sidecarPath,
      data,
      valid: false,
      reason: "SUBMISSION_SIDECAR_INVALID",
    };

  // Sidecars without a version are still accepted for the supported queue
  // migration boundary. Versioned sidecars must prove their file identity and
  // content before they can participate in a publish command.
  if (data.version === undefined)
    return { path: sidecarPath, data, valid: true, legacy: true };
  if (
    data.version !== 2 ||
    typeof data.contentHash !== "string" ||
    !/^[a-f0-9]{64}$/.test(data.contentHash)
  )
    return {
      path: sidecarPath,
      data,
      valid: false,
      reason: "SUBMISSION_SIDECAR_VERSION_INVALID",
    };
  if (data.filename !== undefined && data.filename !== path.basename(filePath))
    return {
      path: sidecarPath,
      data,
      valid: false,
      reason: "SUBMISSION_SIDECAR_FILE_MISMATCH",
    };
  if (data.contentHash !== hashFile(filePath))
    return {
      path: sidecarPath,
      data,
      valid: false,
      reason: "SUBMISSION_SIDECAR_CONTENT_MISMATCH",
    };
  if (
    !isSafeToken(data.clientId) ||
    (!isSafeToken(data.generatedArticleId) &&
      !isSafeToken(data.articleId) &&
      !isSafeToken(data.articleKey))
  )
    return {
      path: sidecarPath,
      data,
      valid: false,
      reason: "SUBMISSION_SIDECAR_IDENTITY_INVALID",
    };
  if (
    (data.publicationId !== undefined && !isSafeToken(data.publicationId)) ||
    (data.attemptId !== undefined && !isSafeToken(data.attemptId))
  )
    return {
      path: sidecarPath,
      data,
      valid: false,
      reason: "SUBMISSION_SIDECAR_PUBLICATION_INVALID",
    };
  if ((data.publicationId === undefined) !== (data.attemptId === undefined))
    return {
      path: sidecarPath,
      data,
      valid: false,
      reason: "SUBMISSION_SIDECAR_PUBLICATION_INVALID",
    };
  return { path: sidecarPath, data, valid: true, version: 2 };
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
    filename.includes("/") ||
    filename.includes("\\") ||
    !isPrimaryArticle(filename) ||
    isTemporaryQueueArtifact(filename)
  )
    throw submissionInputError();
  const source = platforms.find((platform) => platform.id === sourcePlatformId);
  if (!source) throw submissionInputError();
  const inputDir = path.resolve(inputRoot, source.scanDir || source.id);
  const filePath = path.resolve(inputDir, filename);
  if (path.dirname(filePath) !== inputDir) throw submissionInputError();
  let stat;
  try {
    stat = fs.lstatSync(filePath);
  } catch (_) {
    throw submissionInputError();
  }
  if (!stat.isFile() || stat.isSymbolicLink()) throw submissionInputError();
  if (validateSidecar) {
    const metadata = readSubmissionMetadata(filePath);
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
    task.filename.includes("/") ||
    task.filename.includes("\\")
  )
    throw submissionInputError();
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
  const value = safeTask(task);
  return [value.sourcePlatformId, value.filename, value.targetPlatformId].join(
    "\u0000",
  );
}

function createPlatformQueueReader(options) {
  const value = options || {};
  const inputRoot = path.resolve(
    value.inputRoot || path.join(process.cwd(), "input"),
  );
  const platforms = Array.isArray(value.platforms) ? value.platforms : [];
  const contentStore = value.contentStore || {};

  function sourceArticleState(metadata) {
    const data = metadata && metadata.data;
    const clientId = data && data.clientId;
    const articleId = data && (data.generatedArticleId || data.articleId);
    if (
      !clientId ||
      !articleId ||
      (typeof contentStore.isArticleTrashed !== "function" &&
        typeof contentStore.isArticleRemoved !== "function")
    )
      return { sourceArticleState: "active", reasonCode: null };
    try {
      const removed =
        typeof contentStore.isArticleRemoved === "function"
          ? contentStore.isArticleRemoved(clientId, articleId)
          : contentStore.isArticleTrashed(clientId, articleId);
      if (removed)
        return {
          sourceArticleState: "trashed",
          reasonCode: "SOURCE_ARTICLE_TRASHED",
        };
    } catch (_) {}
    return { sourceArticleState: "active", reasonCode: null };
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

  function scanQueue() {
    return platforms
      .filter((platform) => platform.id !== "media")
      .map((platform) => {
        const platformId = platform.id;
        const scanDir = platform.scanDir || platform.id;
        const inputDir = path.join(inputRoot, scanDir);
        let articles = [];
        if (fs.existsSync(inputDir)) {
          articles = fs
            .readdirSync(inputDir)
            .filter((name) => {
              if (isTemporaryQueueArtifact(name) || !isPrimaryArticle(name))
                return false;
              let stat;
              try {
                stat = fs.lstatSync(path.join(inputDir, name));
              } catch (_) {
                return false;
              }
              if (!stat.isFile() || stat.isSymbolicLink()) return false;
              return readSubmissionMetadata(path.join(inputDir, name)).valid;
            })
            .map((filename) => {
              const filePath = path.join(inputDir, filename);
              const metadata = readSubmissionMetadata(filePath);
              const state = sourceArticleState(metadata);
              let title = path.basename(filename, path.extname(filename));
              if (filename.endsWith(".txt") || filename.endsWith(".md"))
                title = firstTitle(fs.readFileSync(filePath, "utf8"), title);
              return {
                filename,
                filePath,
                file: filePath,
                sourceFile: filePath,
                fileBaseName: path.basename(filename, path.extname(filename)),
                title,
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
        return { platformId, scanDir, articles };
      });
  }

  return Object.freeze({
    scanQueue,
    sourceArticleState,
    resolveSelectedFilePath,
    resolveSubmissionFile: (sourcePlatformId, filename) =>
      resolvePlatformSubmissionFile(
        inputRoot,
        platforms,
        sourcePlatformId,
        filename,
        false,
      ),
    readSubmissionMetadata: (sourcePlatformId, filename) =>
      readSubmissionMetadata(
        resolvePlatformSubmissionFile(
          inputRoot,
          platforms,
          sourcePlatformId,
          filename,
          false,
        ),
      ),
    safeTask,
    taskKey,
  });
}

module.exports = {
  ARTICLE_EXTENSIONS,
  createPlatformQueueReader,
  isPrimaryArticle,
  isSafeToken,
  isTemporaryQueueArtifact,
  readSubmissionMetadata,
  resolvePlatformSubmissionFile,
  safeTask,
  submissionInputError,
  taskKey,
};
