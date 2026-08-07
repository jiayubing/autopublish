"use strict";

const {
  createPaidMediaBatchOrchestrator,
} = require("../services/paid-media-batch-orchestrator");

function createPaidMediaBatchComposition(options) {
  const value = options || {};
  const orchestrator = createPaidMediaBatchOrchestrator({
    paidExecutionTransitions: value.paidExecutionTransitions,
    orderCreationPort: value.orderCreationPort,
    recheckPaidOrder: value.recheckPaidOrder,
    randomUUID: value.randomUUID,
  });
  const startupSnapshot = orchestrator.initializePaused();
  return Object.freeze({ orchestrator, startupSnapshot });
}

module.exports = { createPaidMediaBatchComposition };
