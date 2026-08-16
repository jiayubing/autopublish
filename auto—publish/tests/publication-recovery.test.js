"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  createPublicationRecovery,
} = require("../src/application/publication-recovery");

test("startup recovery preserves a stranded remote-started attempt as uncertain without a remote capability", async () => {
  const marked = [];
  const page = Object.assign(
    [
      {
        state: "remote_started",
        attemptId: "attempt-stranded",
        articleId: "article-1",
        articleRef: { clientId: "client-1", articleId: "article-1" },
      },
    ],
    { hasMore: false },
  );
  const recovery = createPublicationRecovery({
    operationalStore: {
      listActionableRecovery: () => page,
      claimPostProcessing: () => null,
    },
    articleMutationCoordinator: {
      markRecoveryUncertain: (input) => marked.push(input),
    },
  });

  assert.deepEqual(await recovery.recover(), {
    recoveryCount: 1,
    postProcessingCount: 0,
  });
  assert.equal(marked.length, 1);
  assert.equal(marked[0].attemptId, "attempt-stranded");
  assert.equal(marked[0].error.retryability, "manual-check");
  assert.equal("publish" in recovery, false);
  assert.equal("retry" in recovery, false);
});

test("post-processing drain records completed and failed jobs and continues", async () => {
  const jobs = [
    { jobId: "job-complete", kind: "archive", payload: {} },
    { jobId: "job-failed", kind: "archive", payload: {} },
  ];
  const completed = [];
  const recovery = createPublicationRecovery({
    operationalStore: {
      claimPostProcessing: () => jobs.shift() || null,
      completePostProcessing: (input) => completed.push(input),
    },
    postProcessor: {
      process: async (job) => {
        if (job.jobId === "job-failed") {
          const error = new Error("fixture");
          error.code = "ARCHIVE_WRITE_FAILED";
          throw error;
        }
        return { archived: true };
      },
    },
  });

  const result = await recovery.drainPostProcessing({ collectResults: true });
  assert.equal(result.count, 2);
  assert.deepEqual(
    result.results.map((item) => item.status),
    ["completed", "failed"],
  );
  assert.equal(completed[0].success, true);
  assert.equal(completed[1].success, false);
  assert.equal(completed[1].errorCode, "ARCHIVE_WRITE_FAILED");
});

test("post-processing drain defers an ineligible archive for restart", async () => {
  let claimed = false;
  const completed = [];
  const recovery = createPublicationRecovery({
    operationalStore: {
      claimPostProcessing: () => {
        if (claimed) return null;
        claimed = true;
        return { jobId: "job-deferred", kind: "archive", payload: {} };
      },
      completePostProcessing: (input) => completed.push(input),
    },
    postProcessor: {
      process: async () => {
        const error = new Error("not eligible yet");
        error.code = "POST_PROCESSING_ARCHIVE_NOT_ELIGIBLE";
        throw error;
      },
    },
  });

  const result = await recovery.drainPostProcessing({ collectResults: true });
  assert.equal(result.count, 0);
  assert.equal(result.results[0].status, "deferred");
  assert.equal(completed[0].retry, true);
});
