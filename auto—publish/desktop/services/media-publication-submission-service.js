"use strict";

const {
  createPublicationSubmissionOrchestrator,
} = require("./publication-submission-orchestrator");

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
  if (!value.workbench || (!value.orchestrator && !value.workflow))
    throw new Error("Media publication submission dependencies are required");
  const orchestrator =
    value.orchestrator ||
    createPublicationSubmissionOrchestrator({
      workflow: value.workflow,
      operationalStore: value.operationalStore,
      workerPublisher: value.workerPublisher,
    });
  return Object.freeze({
    submit: async function (articles) {
      const commands =
        await value.workbench.prepareMediaPublicationCommands(articles);
      return orchestrator.submit(commands, {
        createBatch: true,
        itemPayload: (command, attemptId) =>
          submissionDisplayPayload(
            Object.assign({}, command, { attemptId }),
            articles,
          ),
      });
    },
  });
}
module.exports = { createMediaPublicationSubmissionService };
