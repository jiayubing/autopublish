"use strict";

const crypto = require("node:crypto");

function createPublicationSubmissionService(options) {
  const value = options || {};
  if (!value.workflow || !value.workbench || !value.workerPublisher || !value.operationalStore) throw new Error("Publication submission dependencies are required");
  return Object.freeze({
    submit: async function(plan) {
      const tasks = plan && Array.isArray(plan.tasks) ? plan.tasks : [];
      const commands = [];
      for (const task of tasks) commands.push(await value.workbench.preparePublicationCommand(task));
      if (!commands.length) return Object.freeze({ batchId: null, results: [] });
      const results = [];
      let firstBatchId = null;
      for (let index = 0; index < commands.length; index += 1) {
        const command = commands[index];
        const batchId = command.postProcessingPayload && command.postProcessingPayload.batchId;
        const item = value.operationalStore.findSubmissionItem({ batchId, articleId: command.articleId, target: command.target });
        const claimToken = `submission-${crypto.randomUUID()}`;
        const batchItem = value.operationalStore.claimSubmissionItemById({ batchId: item.batchId, itemId: item.itemId, claimToken });
        if (!firstBatchId) firstBatchId = batchItem.batchId;
        const attemptId = `attempt-${crypto.randomUUID()}`;
        value.workerPublisher.registerAttempt(attemptId, command.workerTask);
        try {
          results.push(await value.workflow.publish(Object.assign({}, command, {
            attemptId,
            batchItemId: batchItem.itemId,
            batchClaimToken: batchItem.claimToken,
            postProcessingPayload: Object.assign({}, command.postProcessingPayload, {
              batchId: batchItem.batchId,
              batchItemId: batchItem.itemId,
            }),
          })));
        }
        catch (error) {
          // Account/profile validation happens before PublicationWorkflow
          // creates its durable remote intent. Returning this specific claim
          // to the queue is safe; all other failures may have crossed the
          // remote boundary and must remain recoverable/blocked instead.
          if (error && (String(error.code || "").startsWith("ACCOUNT_PROFILE_") || error.code === "PUBLICATION_LEGACY_TARGET_MANUAL")) {
            value.operationalStore.updateSubmissionItem({
              itemId: batchItem.itemId,
              revision: batchItem.revision,
              claimToken: batchItem.claimToken,
              status: "queued",
              payload: batchItem.payload || {},
            });
          }
          throw error;
        }
        finally { value.workerPublisher.unregisterAttempt(attemptId); }
      }
      return Object.freeze({ batchId: firstBatchId, results });
    },
  });
}

module.exports = { createPublicationSubmissionService };
