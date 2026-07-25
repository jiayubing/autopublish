"use strict";

const crypto = require("node:crypto");

function createMediaPublicationSubmissionService(options) {
  const value = options || {};
  if (!value.workflow || !value.operationalStore || !value.workbench) throw new Error("Media publication submission dependencies are required");
  return Object.freeze({
    submit: async function(articles) {
      const commands = await value.workbench.prepareMediaPublicationCommands(articles);
      if (!commands.length) return Object.freeze({ batchId: null, results: [] });
      const batch = value.operationalStore.createSubmissionBatch({
        batchId: `batch-${crypto.randomUUID()}`,
        items: commands.map((command) => ({ articleId: command.articleId, target: command.target, payload: command.postProcessingPayload })),
      });
      const results = [];
      for (let index = 0; index < commands.length; index += 1) {
        const command = commands[index];
        results.push(await value.workflow.publish(Object.assign({}, command, {
          attemptId: `attempt-${crypto.randomUUID()}`,
          batchItemId: batch.items[index].itemId,
          postProcessingPayload: Object.assign({}, command.postProcessingPayload, { batchId: batch.batchId, batchItemId: batch.items[index].itemId }),
        })));
      }
      return Object.freeze({ batchId: batch.batchId, results: Object.freeze(results) });
    },
  });
}
module.exports = { createMediaPublicationSubmissionService };
