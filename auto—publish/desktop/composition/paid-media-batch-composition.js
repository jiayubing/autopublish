"use strict";

const {
  createPaidMediaBatchOrchestrator,
} = require("../services/paid-media-batch-orchestrator");
const {
  createPaidOrderCreationResolutionService,
} = require("../services/paid-order-creation-resolution-service");

function createPaidMediaBatchComposition(options) {
  const value = options || {};
  const orchestrator = createPaidMediaBatchOrchestrator({
    paidExecutionTransitions: value.paidExecutionTransitions,
    orderCreationPort: value.orderCreationPort,
    recheckPaidOrder: value.recheckPaidOrder,
    randomUUID: value.randomUUID,
  });
  const startupSnapshot = orchestrator.initializePaused();
  const orderCreationResolutionService =
    createPaidOrderCreationResolutionService({
      orderCreationResolutionTransitions:
        value.orderCreationResolutionTransitions,
      orderDetailsQueryPort: value.orderDetailsQueryPort,
    });
  return Object.freeze({
    orchestrator,
    orderCreationResolutionService,
    startupSnapshot,
  });
}

module.exports = { createPaidMediaBatchComposition };
