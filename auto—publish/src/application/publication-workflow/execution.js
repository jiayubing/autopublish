"use strict";

const crypto = require("node:crypto");
const domain = require("../../domain");
const { accountInspectionError, uncertainError } = require("./errors");

function createPublicationExecution(options) {
  const value = options || {};
  if (!value.operationalStore || !value.publisher || !value.postProcessing)
    throw new Error("Publication execution dependencies are required");

  async function execute(command, retry) {
    const inputValue = command || {};
    const publicationId =
      inputValue.publicationId || `publication-${crypto.randomUUID()}`;
    const attemptId = inputValue.attemptId || `attempt-${crypto.randomUUID()}`;
    const target = domain.parsePublicationTarget(inputValue.target);
    if (target.kind === "legacy-unknown-account") {
      const error = new Error("Legacy target cannot be executed");
      error.code = "PUBLICATION_LEGACY_TARGET_MANUAL";
      throw error;
    }
    const mutation = value.articleMutationCoordinator;
    let input;
    let publicationAdmission = null;
    if (
      target.kind === "platform" &&
      typeof value.operationalStore.assertExecutableAccountProfile ===
        "function"
    ) {
      value.operationalStore.assertExecutableAccountProfile({
        accountProfileId: target.accountProfileId,
        platformId: target.platformId,
      });
      const inspected = await value.publisher.inspectAccount();
      if (
        !inspected ||
        inspected.verified !== true ||
        inspected.accountProfileId !== target.accountProfileId
      )
        throw accountInspectionError();
    }
    if (mutation) {
      if (!inputValue.articleRef) {
        const error = new Error(
          "Publication article identity could not be resolved",
        );
        error.code = "ARTICLE_IDENTITY_UNRESOLVED";
        throw error;
      }
      publicationAdmission = mutation.readArticleForPublication({
        articleRef: inputValue.articleRef,
      });
    } else {
      input = domain.parsePublishInput({
        version: 1,
        articleId: inputValue.articleId,
        attemptId,
        target,
        title: inputValue.title,
        body: inputValue.body,
      });
    }
    const reservation = {
      articleId: mutation
        ? publicationAdmission.articleRef.articleId
        : input.articleId,
      publicationId,
      attemptId,
      target,
    };
    if (inputValue.batchItemId !== undefined)
      reservation.batchItemId = inputValue.batchItemId;
    if (inputValue.batchClaimToken !== undefined)
      reservation.batchClaimToken = inputValue.batchClaimToken;
    if (inputValue.postProcessingPayload !== undefined)
      reservation.postProcessingPayload = inputValue.postProcessingPayload;
    if (retry) {
      reservation.retryFailed = true;
      reservation.expectedCurrentTargetKey =
        domain.publicationTargetKey(target);
    }
    const reserve = value.operationalStore.reservePublicationTarget;
    if (typeof reserve !== "function")
      throw new Error("Publication reservation is unavailable");
    const reserved = mutation
      ? mutation.reservePublicationTarget(
          Object.assign({}, reservation, {
            articleRef: publicationAdmission.articleRef,
            expectedFingerprint:
              publicationAdmission.publicationSnapshot.fingerprint,
            operation: retry ? "retarget" : "queue",
          }),
        )
      : reserve(reservation);
    if (mutation) {
      input = domain.parsePublishInput({
        version: 1,
        articleId: reserved.publicationSnapshot.articleId,
        attemptId,
        target,
        title: reserved.publicationSnapshot.title,
        body: reserved.publicationSnapshot.body,
      });
    }
    let outcome;
    try {
      outcome = domain.parsePublishOutcome(
        await value.publisher.publish(input, new AbortController().signal),
        input,
      );
    } catch (error) {
      outcome = { status: "uncertain", error: uncertainError() };
    }
    const committed = {
      attemptId: reserved.attemptId,
      outcome,
    };
    if (inputValue.batchItemId !== undefined)
      committed.batchItemId = inputValue.batchItemId;
    if (inputValue.batchClaimToken !== undefined)
      committed.batchClaimToken = inputValue.batchClaimToken;
    if (mutation) {
      committed.postProcessingPayload =
        reserved.postProcessingPayload ||
        Object.assign({}, inputValue.postProcessingPayload || {}, {
          articleRef: reserved.articleRef,
          publicationSnapshot: reserved.publicationSnapshot,
        });
    } else if (inputValue.postProcessingPayload !== undefined) {
      committed.postProcessingPayload = inputValue.postProcessingPayload;
    }
    if (mutation) {
      mutation.commitPublicationOutcome(
        Object.assign({}, committed, {
          articleRef: reserved.articleRef,
        }),
      );
    } else {
      value.operationalStore.commitRemoteOutcome(committed);
    }
    const postProcessing = await value.postProcessing.drain({
      collectResults: true,
    });
    return Object.freeze({
      publicationId: reserved.publicationId,
      attemptId: reserved.attemptId,
      status: outcome.status,
      ...(outcome.error ? { error: outcome.error } : {}),
      ...(outcome.evidence ? { evidence: outcome.evidence } : {}),
      ...(postProcessing.results && postProcessing.results.length
        ? { postProcessing: postProcessing.results }
        : {}),
    });
  }

  async function publish(command) {
    return execute(command, false);
  }

  async function retry(command) {
    return execute(command, true);
  }

  return Object.freeze({ publish, retry });
}

module.exports = { createPublicationExecution };
