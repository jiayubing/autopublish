"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const {
  articleMarkdown,
  writePairAtomic,
} = require("./submission-file-helpers");

function fail(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

function createSubmissionMediaExport(options) {
  const value = options || {};
  if (!value.contentStore || !value.targetCatalog || !value.preflight)
    throw fail("CONTENT_EXPORT_PORT_REQUIRED");
  if (
    !value.batchPlanner ||
    typeof value.batchPlanner.filenameFor !== "function"
  )
    throw fail("SUBMISSION_BATCH_PLANNER_REQUIRED");
  const inputRoot = path.resolve(
    value.inputRoot || path.join(process.cwd(), "input"),
  );

  function regularFile(filename) {
    try {
      const stat = fs.lstatSync(filename);
      return stat.isFile() && !stat.isSymbolicLink();
    } catch (_) {
      return false;
    }
  }

  function prepareMediaExport(input) {
    if (
      !input ||
      input.confirmed !== true ||
      typeof input.clientId !== "string" ||
      !input.clientId.trim() ||
      typeof input.generatedArticleId !== "string" ||
      !input.generatedArticleId.trim()
    )
      throw fail(
        "CONTENT_EXPORT_CONFIRMATION_REQUIRED",
        "Manual confirmation is required",
      );
    if (input.targetPlatform !== "media" || input.mediaResourceId !== undefined)
      throw fail(
        "CONTENT_EXPORT_TARGET_INVALID",
        "Paid-media staging does not select a media resource",
      );
    const platform = value.targetCatalog.find("media");
    if (!platform || platform.contentQueueImport !== true)
      throw fail(
        "CONTENT_EXPORT_TARGET_INVALID",
        "Paid-media staging is unavailable",
      );
    let article;
    try {
      article = value.contentStore.getArticle(
        input.clientId,
        input.generatedArticleId,
      );
    } catch (_) {
      throw fail(
        "CONTENT_SUBMISSION_ARTICLE_NOT_FOUND",
        "Selected article was not found",
      );
    }
    const eligibility = value.preflight.check(article, {
      id: "media",
      contentQueueImport: true,
    });
    if (!eligibility.eligible)
      throw fail("CONTENT_EXPORT_NOT_READY", eligibility.reasons.join("、"));
    const markdown = articleMarkdown(article);
    const contentHash = crypto
      .createHash("sha256")
      .update(markdown)
      .digest("hex");
    const filename = value.batchPlanner.filenameFor(article);
    const directory = path.join(inputRoot, platform.scanDir || "media");
    const filePath = path.join(directory, filename);
    const sidecarPath = filePath + ".submission.json";
    const mainExists = fs.existsSync(filePath);
    const sidecarExists = fs.existsSync(sidecarPath);
    let status = "queueable";
    if (mainExists || sidecarExists) {
      let sidecar = null;
      try {
        sidecar = regularFile(sidecarPath)
          ? JSON.parse(fs.readFileSync(sidecarPath, "utf8"))
          : null;
      } catch (_) {
        sidecar = null;
      }
      const matches =
        regularFile(filePath) &&
        regularFile(sidecarPath) &&
        fs.readFileSync(filePath, "utf8") === markdown &&
        sidecar &&
        sidecar.version === 2 &&
        sidecar.clientId === article.clientId &&
        sidecar.generatedArticleId === article.id &&
        sidecar.targetPlatform === "media" &&
        sidecar.contentHash === contentHash;
      status = matches ? "idempotent" : "conflict";
    }
    return {
      article,
      markdown,
      contentHash,
      filename,
      directory,
      filePath,
      sidecarPath,
      status,
    };
  }

  function previewExport(input) {
    const prepared = prepareMediaExport(input);
    return {
      filename: prepared.filename,
      targetPlatform: "media",
      contentHash: prepared.contentHash,
      markdown: prepared.markdown,
      status: prepared.status,
    };
  }

  function exportArticle(input) {
    const prepared = prepareMediaExport(input);
    if (prepared.status === "conflict")
      throw fail(
        "CONTENT_EXPORT_CONFLICT",
        "Paid-media queue copy conflicts with the selected article",
      );
    if (prepared.status === "queueable") {
      fs.mkdirSync(prepared.directory, { recursive: true });
      const sidecar = {
        version: 2,
        generatedArticleId: prepared.article.id,
        clientId: prepared.article.clientId,
        targetPlatform: "media",
        targetPlatformId: "media",
        filename: prepared.filename,
        contentHash: prepared.contentHash,
        status: "queued",
        exportedAt: new Date().toISOString(),
      };
      writePairAtomic(
        prepared.filePath,
        prepared.markdown,
        prepared.sidecarPath,
        JSON.stringify(sidecar, null, 2) + "\n",
      );
    }
    if (typeof value.onDataInvalidated === "function")
      value.onDataInvalidated("CONTENT_EXPORT_QUEUED");
    return {
      filename: prepared.filename,
      targetPlatform: "media",
      contentHash: prepared.contentHash,
      markdown: prepared.markdown,
      status: prepared.status,
      idempotent: prepared.status === "idempotent",
    };
  }

  return Object.freeze({ previewExport, exportArticle });
}

module.exports = { createSubmissionMediaExport };
