"use strict";
const {
  createOperationalStore,
} = require("../../src/infrastructure/operational-store/operational-store");
const {
  createPublicationWorkflow,
} = require("../../src/application/publication-workflow");
const {
  createArticleAttentionQuery,
} = require("../services/article-attention-query");
const {
  createArticleAttentionResolver,
} = require("../services/article-attention-resolver");

function createPublicationWorkflowComposition(options) {
  const value = options || {};
  if (typeof value.workspaceRoot !== "string" || !value.publisher)
    throw new Error(
      "Publication workflow composition dependencies are required",
    );
  const operationalStore =
    value.operationalStore ||
    createOperationalStore({
      workspaceRoot: value.workspaceRoot,
      clock: value.clock,
    });
  const ownsOperationalStore = !value.operationalStore;
  const postProcessor =
    typeof value.createPostProcessor === "function"
      ? value.createPostProcessor(operationalStore)
      : value.postProcessor;
  const publicationWorkflow = createPublicationWorkflow({
    operationalStore,
    articleMutationCoordinator: value.articleMutationCoordinator,
    publisher: value.publisher,
    postProcessor,
    clock: value.clock || (() => new Date()),
  });
  let disposed = false;
  function createAttentionPorts(dependencies) {
    const deps = dependencies || {};
    const postProcessingPort = deps.postProcessingPort || {
      retry: (command) => operationalStore.retryPostProcessing(command),
    };
    const attentionQuery = createArticleAttentionQuery(
      Object.assign({}, deps, {
        operationalStore,
        publicationWorkflow,
        postProcessingPort,
      }),
    );
    const attentionResolver = createArticleAttentionResolver(
      Object.assign({}, deps, {
        query: attentionQuery,
        publicationWorkflow,
        postProcessingPort,
      }),
    );
    return Object.freeze({
      attentionQuery,
      attentionResolver,
      postProcessingPort,
    });
  }
  return Object.freeze({
    operationalStore,
    // Generic publish/retry/reconciliation is intentionally not part of the
    // production capability surface. Regular-platform execution goes through
    // Ticket 08's queue-group orchestrator and Ticket 09's named outcomes.
    publicationWorkflow: Object.freeze({
      recover: publicationWorkflow.recover,
    }),
    postProcessor,
    createAttentionPorts,
    dispose: async function () {
      if (disposed) return;
      disposed = true;
      if (ownsOperationalStore) operationalStore.close();
    },
  });
}
module.exports = { createPublicationWorkflowComposition };
