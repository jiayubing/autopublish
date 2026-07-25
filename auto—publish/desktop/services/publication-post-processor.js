"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { archivePublishedArticle } = require("../../src/core/files");

function invalid(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function createPublicationPostProcessor(options) {
  const value = options || {};
  if (!value.operationalStore || typeof value.workspaceRoot !== "string")
    throw new Error("Publication post-processor dependencies are required");
  const inputRoot = value.paths && value.paths.input;
  const publishedRoot = value.paths && value.paths.published;
  const platforms = new Map((value.platforms || []).map((platform) => [platform.id, platform]));
  if (typeof inputRoot !== "string" || typeof publishedRoot !== "string")
    throw new Error("Publication post-processor paths are required");

  function sourceFile(payload) {
    if (!payload || typeof payload.sourcePlatformId !== "string" || typeof payload.filename !== "string")
      throw invalid("POST_PROCESSING_PAYLOAD_INVALID");
    const platform = platforms.get(payload.sourcePlatformId);
    if (!platform || path.basename(payload.filename) !== payload.filename || path.isAbsolute(payload.filename))
      throw invalid("POST_PROCESSING_PAYLOAD_INVALID");
    const directory = path.resolve(inputRoot, platform.scanDir || platform.id);
    const filename = path.resolve(directory, payload.filename);
    if (path.dirname(filename) !== directory) throw invalid("POST_PROCESSING_PAYLOAD_INVALID");
    return filename;
  }

  return Object.freeze({
    process: async function(job) {
      if (!job || job.kind !== "archive") throw invalid("POST_PROCESSING_KIND_INVALID");
      const payload = job.payload || {};
      const eligibility = value.operationalStore.getArchiveEligibility({
        batchId: payload.batchId,
        sourcePlatformId: payload.sourcePlatformId,
        filename: payload.filename,
      });
      if (!eligibility.eligible) throw invalid("POST_PROCESSING_ARCHIVE_NOT_ELIGIBLE");
      const source = sourceFile(payload);
      // A completed prior archive may be observed after a process crash
      // before its job completion transaction.  Treat precisely that state as
      // idempotent; any partial/conflicting target remains a safe failure.
      const target = path.join(publishedRoot, payload.filename);
      if (!fs.existsSync(source) && fs.existsSync(target)) return { archived: true, idempotent: true };
      archivePublishedArticle({ sourceFile: source, filename: payload.filename }, { published: publishedRoot });
      return { archived: true, idempotent: false };
    },
  });
}

module.exports = { createPublicationPostProcessor };
