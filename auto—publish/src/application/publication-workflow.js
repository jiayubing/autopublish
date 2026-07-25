const crypto = require("node:crypto");
const domain = require("../domain");

function uncertainError() {
  return {
    code: "PUBLISHER_RESULT_UNCERTAIN",
    category: "transport",
    retryability: "manual-check",
    userMessage: "无法确认远端投稿结果，请人工核对",
  };
}
function accountInspectionError() {
  const error = new Error("Current platform account could not be verified");
  error.code = "ACCOUNT_PROFILE_INSPECTION_UNVERIFIED";
  return error;
}
function createPublicationWorkflow(dependencies) {
  const deps = dependencies || {};
  if (!deps.operationalStore || !deps.publisher || !deps.clock)
    throw new Error("PublicationWorkflow dependencies are required");
  async function processPostProcessing() {
    if (!deps.postProcessor || typeof deps.postProcessor.process !== "function")
      return 0;
    let count = 0;
    for (;;) {
      const claimToken = `post-${crypto.randomUUID()}`;
      const job = deps.operationalStore.claimPostProcessing({ claimToken });
      if (!job) return count;
      try {
        await deps.postProcessor.process(job);
        deps.operationalStore.completePostProcessing({
          jobId: job.jobId,
          claimToken,
          success: true,
        });
      } catch (_) {
        deps.operationalStore.completePostProcessing({
          jobId: job.jobId,
          claimToken,
          success: false,
        });
      }
      count += 1;
    }
  }
  return Object.freeze({
    publish: async function (command) {
      const value = command || {};
      const publicationId =
        value.publicationId || `publication-${crypto.randomUUID()}`;
      const attemptId = value.attemptId || `attempt-${crypto.randomUUID()}`;
      const target = domain.parsePublicationTarget(value.target);
      if (target.kind === "legacy-unknown-account") {
        const error = new Error("Legacy target cannot be executed");
        error.code = "PUBLICATION_LEGACY_TARGET_MANUAL";
        throw error;
      }
      const input = domain.parsePublishInput({
        version: 1,
        articleId: value.articleId,
        attemptId,
        target,
        title: value.title,
        body: value.body,
      });
      if (
        target.kind === "platform" &&
        typeof deps.operationalStore.assertExecutableAccountProfile ===
          "function"
      ) {
        deps.operationalStore.assertExecutableAccountProfile({
          accountProfileId: target.accountProfileId,
          platformId: target.platformId,
        });
        const inspected = await deps.publisher.inspectAccount();
        if (
          !inspected ||
          inspected.verified !== true ||
          inspected.accountProfileId !== target.accountProfileId
        )
          throw accountInspectionError();
      }
      const reserved = deps.operationalStore.reservePublicationTarget({
        articleId: input.articleId,
        publicationId,
        attemptId,
        target,
      });
      let outcome;
      try {
        outcome = domain.parsePublishOutcome(
          await deps.publisher.publish(input, new AbortController().signal),
          input,
        );
      } catch (error) {
        outcome = { status: "uncertain", error: uncertainError() };
      }
      deps.operationalStore.commitRemoteOutcome({
        attemptId: reserved.attemptId,
        outcome,
        batchItemId: value.batchItemId,
        postProcessingPayload: value.postProcessingPayload,
      });
      await processPostProcessing();
      return Object.freeze({
        publicationId: reserved.publicationId,
        attemptId: reserved.attemptId,
        status: outcome.status,
        ...(outcome.error ? { error: outcome.error } : {}),
        ...(outcome.evidence ? { evidence: outcome.evidence } : {}),
      });
    },
    recover: async function () {
      const recovery = deps.operationalStore.listActionableRecovery();
      let recoveryCount = 0;
      for (const item of recovery) {
        if (item.state === "manual_check") continue;
        deps.operationalStore.markRecoveryUncertain({
          attemptId: item.attemptId,
          error: uncertainError(),
        });
        recoveryCount += 1;
      }
      const postProcessingCount = await processPostProcessing();
      return Object.freeze({ recoveryCount, postProcessingCount });
    },
    reconcile: async function (command) {
      const value = command || {};
      if (typeof value.attemptId !== "string")
        throw new Error("Reconcile attempt is required");
      if (
        !value.outcome ||
        !["published", "submitted", "failed", "uncertain"].includes(
          value.outcome.status,
        )
      )
        throw new Error("Reconcile outcome is required");
      deps.operationalStore.commitRemoteOutcome({
        attemptId: value.attemptId,
        outcome: value.outcome,
      });
      return Object.freeze({
        attemptId: value.attemptId,
        status: value.outcome.status,
      });
    },
  });
}
module.exports = { createPublicationWorkflow };
