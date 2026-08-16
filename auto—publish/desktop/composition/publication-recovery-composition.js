"use strict";

const {
  createOperationalStore,
} = require("../../src/infrastructure/operational-store/operational-store");
const {
  createPublicationRecovery,
} = require("../../src/application/publication-recovery");
const {
  createArticleAttentionQuery,
} = require("../services/article-attention-query");
const {
  createArticleAttentionResolver,
} = require("../services/article-attention-resolver");

function createPublicationRecoveryComposition(options) {
  const value = options || {};
  if (typeof value.workspaceRoot !== "string")
    throw new Error("Publication recovery composition dependencies are required");
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
  const publicationRecovery = createPublicationRecovery({
    operationalStore,
    articleMutationCoordinator: value.articleMutationCoordinator,
    postProcessor,
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
        postProcessingPort,
      }),
    );
    const attentionResolver = createArticleAttentionResolver(
      Object.assign({}, deps, {
        query: attentionQuery,
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
    publicationRecovery,
    postProcessor,
    createAttentionPorts,
    dispose: async function () {
      if (disposed) return;
      disposed = true;
      if (ownsOperationalStore) operationalStore.close();
    },
  });
}

module.exports = { createPublicationRecoveryComposition };
