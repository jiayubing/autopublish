"use strict";

const {
  createRegularQueueGroupOrchestrator,
} = require("../services/regular-queue-group-orchestrator");

function createRegularQueueGroupComposition(options) {
  const value = options || {};
  const orchestrator = createRegularQueueGroupOrchestrator({
    regularQueueGroupTransitions: value.regularQueueGroupTransitions,
    platformSubmissionExecutor: value.platformSubmissionExecutor,
    randomUUID: value.randomUUID,
  });
  const startupSnapshot = orchestrator.initializePaused();
  return Object.freeze({ orchestrator, startupSnapshot });
}

module.exports = { createRegularQueueGroupComposition };
