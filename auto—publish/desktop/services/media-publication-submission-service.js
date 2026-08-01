"use strict";

const crypto = require("node:crypto");

function quotedPrice(value) {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 100000000
    ? value
    : undefined;
}

function submissionDisplayPayload(command, articles) {
  const payload = Object.assign({}, command.postProcessingPayload || {});
  payload.attemptId = command.attemptId;
  const filename = payload.filename;
  const source =
    (articles || []).find(
      (article) => article && article.filename === filename,
    ) || {};
  const resourceId = command.target && command.target.mediaResourceId;
  const resource =
    (source.selectedResources || []).find(
      (item) => item && item.resourceId === resourceId,
    ) || {};
  payload.titleSnapshot = command.title;
  if (typeof resource.name === "string" && resource.name)
    payload.resourceNameSnapshot = resource.name;
  const price = quotedPrice(resource.price);
  if (price !== undefined) payload.quotedPrice = price;
  return payload;
}

function createMediaPublicationSubmissionService(options) {
  const value = options || {};
  if (!value.workflow || !value.operationalStore || !value.workbench)
    throw new Error("Media publication submission dependencies are required");
  return Object.freeze({
    submit: async function (articles) {
      const commands =
        await value.workbench.prepareMediaPublicationCommands(articles);
      if (!commands.length)
        return Object.freeze({ batchId: null, results: [] });
      const attemptedCommands = commands.map((command) =>
        Object.assign({}, command, {
          attemptId: `attempt-${crypto.randomUUID()}`,
        }),
      );
      const batch = value.operationalStore.createSubmissionBatch({
        batchId: `batch-${crypto.randomUUID()}`,
        items: attemptedCommands.map((command) => ({
          articleId: command.articleId,
          target: command.target,
          payload: submissionDisplayPayload(command, articles),
        })),
      });
      const results = [];
      for (let index = 0; index < attemptedCommands.length; index += 1) {
        const command = attemptedCommands[index];
        results.push(
          await value.workflow.publish(
            Object.assign({}, command, {
              batchItemId: batch.items[index].itemId,
              postProcessingPayload: Object.assign(
                {},
                command.postProcessingPayload,
                {
                  batchId: batch.batchId,
                  batchItemId: batch.items[index].itemId,
                },
              ),
            }),
          ),
        );
      }
      return Object.freeze({
        batchId: batch.batchId,
        results: Object.freeze(results),
      });
    },
  });
}
module.exports = { createMediaPublicationSubmissionService };
