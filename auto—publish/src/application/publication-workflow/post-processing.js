"use strict";

const crypto = require("node:crypto");

function normalizePostProcessingErrorCode(error) {
  const code = error && error.code;
  return typeof code === "string" && /^[A-Z0-9][A-Z0-9_.:-]{0,127}$/.test(code)
    ? code
    : "POST_PROCESSING_FAILED";
}

function createPostProcessingCoordinator(options) {
  const value = options || {};
  if (!value.operationalStore)
    throw new Error("Post-processing operational store is required");

  async function drain(options) {
    const collectResults = options && options.collectResults === true;
    const results = [];

    function descriptor(job) {
      const payload = (job && job.payload) || {};
      return {
        jobId: job && job.jobId,
        kind: job && job.kind,
        batchId: typeof payload.batchId === "string" ? payload.batchId : null,
        sourcePlatformId:
          typeof payload.sourcePlatformId === "string"
            ? payload.sourcePlatformId
            : null,
        filename:
          typeof payload.filename === "string" ? payload.filename : null,
      };
    }

    function result(job, status, output, error) {
      if (!collectResults) return;
      results.push({
        ...descriptor(job),
        status,
        ...(output !== undefined ? { output } : {}),
        ...(error && error.code ? { errorCode: error.code } : {}),
      });
    }

    if (
      !value.postProcessor ||
      typeof value.postProcessor.process !== "function"
    )
      return collectResults ? { count: 0, results: [] } : 0;
    let count = 0;
    for (;;) {
      const claimToken = `post-${crypto.randomUUID()}`;
      const job = value.operationalStore.claimPostProcessing({ claimToken });
      if (!job)
        return collectResults ? { count, results } : count;
      try {
        const output = await value.postProcessor.process(job);
        const autoTrash = output && output.autoTrash;
        const autoTrashFailure =
          autoTrash &&
          ["blocked", "failed", "needs_repair"].includes(autoTrash.status);
        if (autoTrashFailure) {
          const error = new Error(
            autoTrash.reasonCode || "REMOVAL_NEEDS_REPAIR",
          );
          error.code = autoTrash.reasonCode || "REMOVAL_NEEDS_REPAIR";
          value.operationalStore.completePostProcessing({
            jobId: job.jobId,
            claimToken,
            success: false,
            output,
          });
          result(job, "failed", output, error);
        } else {
          value.operationalStore.completePostProcessing({
            jobId: job.jobId,
            claimToken,
            success: true,
            output,
          });
          result(job, "completed", output);
        }
      } catch (error) {
        if (error && error.code === "POST_PROCESSING_ARCHIVE_NOT_ELIGIBLE") {
          value.operationalStore.completePostProcessing({
            jobId: job.jobId,
            claimToken,
            retry: true,
          });
          result(job, "deferred", undefined, error);
          return collectResults ? { count, results } : count;
        }
        value.operationalStore.completePostProcessing({
          jobId: job.jobId,
          claimToken,
          success: false,
          errorCode: normalizePostProcessingErrorCode(error),
        });
        result(job, "failed", undefined, error);
      }
      count += 1;
    }
  }

  return Object.freeze({ drain });
}

module.exports = { createPostProcessingCoordinator };
