"use strict";

const crypto = require("node:crypto");
const domain = require("../../domain");
const { accountInspectionError, uncertainError } = require("./errors");

function createPublicationExecution(options) {
  const value = options || {};
  if (!value.operationalStore || !value.publisher || !value.postProcessing)
    throw new Error("Publication execution dependencies are required");

  async function publish(command) {
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
    const input = domain.parsePublishInput({
      version: 1,
      articleId: inputValue.articleId,
      attemptId,
      target,
      title: inputValue.title,
      body: inputValue.body,
    });
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
    const reservation = {
      articleId: input.articleId,
      publicationId,
      attemptId,
      target,
    };
    if (inputValue.batchItemId !== undefined)
      reservation.batchItemId = inputValue.batchItemId;
    if (inputValue.postProcessingPayload !== undefined)
      reservation.postProcessingPayload = inputValue.postProcessingPayload;
    const reserved = value.operationalStore.reservePublicationTarget(reservation);
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
    if (inputValue.postProcessingPayload !== undefined)
      committed.postProcessingPayload = inputValue.postProcessingPayload;
    value.operationalStore.commitRemoteOutcome(committed);
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

  async function reconcile(command) {
    const input = command || {};
    if (typeof input.attemptId !== "string")
      throw new Error("Reconcile attempt is required");
    if (
      !input.outcome ||
      !["published", "submitted", "failed", "uncertain"].includes(
        input.outcome.status,
      )
    )
      throw new Error("Reconcile outcome is required");
    value.operationalStore.commitRemoteOutcome({
      attemptId: input.attemptId,
      outcome: input.outcome,
    });
    const postProcessing = await value.postProcessing.drain({
      collectResults: true,
    });
    return Object.freeze({
      attemptId: input.attemptId,
      status: input.outcome.status,
      ...(postProcessing.results && postProcessing.results.length
        ? { postProcessing: postProcessing.results }
        : {}),
    });
  }

  return Object.freeze({ publish, reconcile });
}

module.exports = { createPublicationExecution };
