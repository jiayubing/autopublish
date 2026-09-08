"use strict";

function operationFixture() {
  return {
    operationId: "client-generation-1",
    clientId: "client-1",
    articleCount: 2,
    concurrency: 2,
    status: "running",
    counts: {
      total: 2,
      pending: 1,
      running: 1,
      succeeded: 0,
      failed: 0,
    },
    tasks: [
      {
        index: 0,
        status: "running",
        attempts: 1,
        articleId: null,
        articleTitle: null,
        error: null,
      },
      {
        index: 1,
        status: "pending",
        attempts: 0,
        articleId: null,
        articleTitle: null,
        error: null,
      },
    ],
    createdAt: "2026-09-08T00:00:00.000Z",
    updatedAt: "2026-09-08T00:00:01.000Z",
  };
}

const clientGenerationIpcContractFixtures = Object.freeze([
  Object.freeze({
    capability: "generation.startClient",
    channel: "content:start-client-generation",
    owner: "generation",
    request: {
      clientId: "client-1",
      materialIds: ["material-1"],
      researchQueryIds: ["research-1"],
      platform: "platform-1",
      templateId: "template-1",
      articleCount: 2,
      concurrency: 2,
      templateCatalogRevision: "revision-1",
      generationOperationId: "client-generation-1",
    },
    result: { operation: operationFixture() },
  }),
  Object.freeze({
    capability: "generation.getClientState",
    channel: "content:get-client-generation-state",
    owner: "generation",
    request: { clientId: "client-1" },
    result: { operation: operationFixture() },
  }),
  Object.freeze({
    capability: "generation.retryClientFailed",
    channel: "content:retry-client-generation",
    owner: "generation",
    request: { operationId: "client-generation-1" },
    result: { operation: operationFixture() },
  }),
  Object.freeze({
    capability: "generation.clientOperationChanged",
    channel: "content:client-generation-state",
    owner: "generation",
    event: operationFixture(),
  }),
]);

module.exports = { clientGenerationIpcContractFixtures };
