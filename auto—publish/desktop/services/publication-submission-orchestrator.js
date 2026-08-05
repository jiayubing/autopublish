"use strict";

const crypto = require("node:crypto");
const { parsePublishInput } = require("../../src/domain/publisher-contract");
const domain = require("../../src/domain");

function operationId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function preflightClaimError(error) {
  const code = String((error && error.code) || "");
  return (
    code.startsWith("ACCOUNT_PROFILE_") ||
    code === "PUBLICATION_LEGACY_TARGET_MANUAL" ||
    code === "PUBLISH_INPUT_INVALID" ||
    code === "PUBLICATION_TARGET_INVALID" ||
    code === "PUBLICATION_TARGET_EXTRA_FIELD" ||
    code === "PUBLICATION_DUPLICATE" ||
    code === "PUBLICATION_UNCERTAIN"
  );
}

function createPublicationSubmissionOrchestrator(options) {
  const value = options || {};
  if (!value.workflow || !value.operationalStore)
    throw new Error(
      "Publication submission orchestrator dependencies are required",
    );

  function prepareCommands(commands) {
    if (!Array.isArray(commands))
      throw new Error("Publication commands are required");
    return commands.map((rawCommand) => {
      const command = rawCommand || {};
      const attemptId = command.attemptId || operationId("attempt");
      parsePublishInput({
        version: 1,
        articleId: command.articleId,
        attemptId,
        target: command.target,
        title: command.title,
        body: command.body,
      });
      return Object.freeze({ command, attemptId });
    });
  }

  function batchPayload(command, attemptId, index, config) {
    const payload =
      typeof config.itemPayload === "function"
        ? config.itemPayload(command, attemptId, index)
        : command.postProcessingPayload || {};
    if (!payload || typeof payload !== "object" || Array.isArray(payload))
      throw new Error("Submission item payload is invalid");
    return Object.freeze(
      Object.assign(
        {},
        payload,
        { attemptId },
        config.autoTrash === true ? { autoTrash: true } : {},
      ),
    );
  }

  function createBatch(prepared, config) {
    const batchId = config.batchId || operationId("batch");
    const batch = value.operationalStore.createSubmissionBatch({
      batchId,
      items: prepared.map(({ command, attemptId }, index) => ({
        articleId: command.articleId,
        target: command.target,
        payload: batchPayload(command, attemptId, index, config),
      })),
    });
    return { batch, itemRefs: batch.items.slice() };
  }

  function assertNoExistingPublications(prepared, config) {
    if (
      config.createBatch !== true ||
      typeof value.operationalStore.listPublicationRecords !== "function"
    )
      return;
    const articleIds = [
      ...new Set(prepared.map(({ command }) => command.articleId)),
    ];
    const records = value.operationalStore.listPublicationRecords({ articleIds });
    for (const { command } of prepared) {
      const targetKey = domain.publicationTargetKey(
        domain.parsePublicationTarget(command.target),
      );
      const existing = records.find(
        (record) =>
          record.articleId === command.articleId &&
          record.targetKey === targetKey,
      );
      if (existing) {
        const error = new Error(
          existing.status === "uncertain"
            ? "Publication outcome is uncertain"
            : "Publication already exists",
        );
        error.code =
          existing.status === "uncertain"
            ? "PUBLICATION_UNCERTAIN"
            : "PUBLICATION_DUPLICATE";
        throw error;
      }
    }
  }

  function findExistingItems(prepared, config) {
    return {
      batch: null,
      itemRefs: prepared.map(({ command }) => {
        const batchId =
          command.postProcessingPayload &&
          command.postProcessingPayload.batchId;
        if (typeof batchId !== "string" || !batchId)
          throw new Error("Submission batch identity is required");
        return value.operationalStore.findSubmissionItem({
          batchId,
          articleId: command.articleId,
          target: command.target,
        });
      }),
    };
  }

  function startClaimLease(claimed) {
    if (
      typeof value.operationalStore.renewSubmissionItemClaim !== "function"
    )
      return function () {};
    const leaseMs = 30000;
    const interval = setInterval(function () {
      try {
        value.operationalStore.renewSubmissionItemClaim({
          batchId: claimed.batchId,
          itemId: claimed.itemId,
          claimToken: claimed.claimToken,
          leaseMs,
        });
      } catch (_) {
        // The eventual outcome commit remains the authority if the lease is
        // lost; do not turn a timer callback into an unhandled rejection.
      }
    }, Math.max(1000, Math.floor(leaseMs / 3)));
    return function () {
      clearInterval(interval);
    };
  }

  function workerStopRequested() {
    if (
      !value.workerPublisher ||
      typeof value.workerPublisher.isStopRequested !== "function"
    )
      return false;
    try {
      return value.workerPublisher.isStopRequested() === true;
    } catch (_) {
      return false;
    }
  }

  async function submit(commands, options) {
    const config = options || {};
    const prepared = prepareCommands(commands);
    if (!prepared.length)
      return Object.freeze({ batchId: null, results: Object.freeze([]) });

    assertNoExistingPublications(prepared, config);
    const durable =
      config.createBatch === true
        ? createBatch(prepared, config)
        : findExistingItems(prepared, config);
    const results = [];
    let stopRequested = false;
    let firstBatchId =
      durable.batch && durable.batch.batchId ? durable.batch.batchId : null;

    for (let index = 0; index < prepared.length; index += 1) {
      if (stopRequested) break;
      const { command, attemptId } = prepared[index];
      const item = durable.itemRefs[index];
      const claimToken = operationId("submission");
      const claimed = value.operationalStore.claimSubmissionItemById({
        batchId: item.batchId || (durable.batch && durable.batch.batchId),
        itemId: item.itemId,
        claimToken,
        ...(config.retryFailed === true ? { retryFailed: true } : {}),
      });
      if (!claimed) throw new Error("Submission item claim failed");
      const claimedBatchId =
        claimed.batchId ||
        item.batchId ||
        (durable.batch && durable.batch.batchId);
      if (!firstBatchId) firstBatchId = claimedBatchId;

      const workflowCommand = Object.assign({}, command, {
        attemptId,
        batchItemId: claimed.itemId,
        batchClaimToken: claimed.claimToken || claimToken,
        postProcessingPayload: Object.assign(
          {},
          command.postProcessingPayload || {},
          {
            batchId: claimedBatchId,
            batchItemId: claimed.itemId,
            ...(config.autoTrash === true ? { autoTrash: true } : {}),
          },
        ),
      });
      let registered = false;
      let registerAttempted = false;
      const stopClaimLease = startClaimLease(claimed);
      try {
        if (
          value.workerPublisher &&
          typeof value.workerPublisher.registerAttempt === "function" &&
          command.workerTask
        ) {
          registerAttempted = true;
          value.workerPublisher.registerAttempt(attemptId, command.workerTask);
          registered = true;
        }
        const execute = config.retryFailed === true ? value.workflow.retry : value.workflow.publish;
        if (typeof execute !== "function") throw new Error("Publication retry workflow is unavailable");
        results.push(await execute(workflowCommand));
        if (command.workerTask && workerStopRequested()) stopRequested = true;
      } catch (error) {
        if (
          ((registerAttempted && !registered) || preflightClaimError(error)) &&
          typeof value.operationalStore.updateSubmissionItem === "function"
        ) {
          const code = String((error && error.code) || "");
          const status = [
            "PUBLICATION_DUPLICATE",
            "PUBLICATION_UNCERTAIN",
          ].includes(code)
            ? "failed"
            : "queued";
          value.operationalStore.updateSubmissionItem({
            itemId: claimed.itemId,
            revision: claimed.revision,
            claimToken: claimed.claimToken || claimToken,
            status,
            payload: Object.assign(
              {},
              claimed.payload || item.payload || {},
              status === "failed" ? { submissionErrorCode: code } : {},
            ),
          });
        }
        throw error;
      } finally {
        stopClaimLease();
        if (
          registered &&
          value.workerPublisher &&
          typeof value.workerPublisher.unregisterAttempt === "function"
        )
          value.workerPublisher.unregisterAttempt(attemptId);
      }
    }

    return Object.freeze({
      batchId: firstBatchId,
      results: Object.freeze(results),
    });
  }

  return Object.freeze({ submit });
}

module.exports = { createPublicationSubmissionOrchestrator };
