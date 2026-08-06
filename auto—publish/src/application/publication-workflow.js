"use strict";

const {
  createPublicationExecution,
} = require("./publication-workflow/execution");
const {
  createPostProcessingCoordinator,
} = require("./publication-workflow/post-processing");
const {
  createPublicationRecovery,
} = require("./publication-workflow/recovery");

function createPublicationWorkflow(dependencies) {
  const value = dependencies || {};
  if (!value.operationalStore || !value.publisher || !value.clock)
    throw new Error("PublicationWorkflow dependencies are required");
  const postProcessing = createPostProcessingCoordinator({
    operationalStore: value.operationalStore,
    postProcessor: value.postProcessor,
  });
  const execution = createPublicationExecution({
    operationalStore: value.operationalStore,
    articleMutationCoordinator: value.articleMutationCoordinator,
    publisher: value.publisher,
    postProcessing,
  });
  const recovery = createPublicationRecovery({
    operationalStore: value.operationalStore,
    articleMutationCoordinator: value.articleMutationCoordinator,
    postProcessing,
  });
  return Object.freeze({
    publish: execution.publish,
    retry: execution.retry,
    recover: recovery.recover,
    reconcile: execution.reconcile,
  });
}

module.exports = { createPublicationWorkflow };
