"use strict";

const {
  createRegularQueueGroupOrchestrator,
} = require("../services/regular-queue-group-orchestrator");

function createRegularQueueGroupComposition(options) {
  const value = options || {};
  const orchestrator = createRegularQueueGroupOrchestrator({
    regularQueueGroupTransitions: value.regularQueueGroupTransitions,
    platformSubmissionExecutor: value.platformSubmissionExecutor,
    regularPlatformOutcomeService: value.regularPlatformOutcomeService,
    onDataInvalidated: value.onDataInvalidated,
    randomUUID: value.randomUUID,
  });
  const startupSnapshot = orchestrator.initializePaused();
  const orphanedOutcomes = Object.freeze(
    value.regularPlatformOutcomeService
      ? startupSnapshot.groups
          .filter(
            (group) =>
              group.current && group.current.phase === "remote_call_started",
          )
          .map((group) =>
            value.regularPlatformOutcomeService.markOrphanedRegularAttemptUncertain(
              {
                regularPublicationAttemptId:
                  group.current.regularPublicationAttemptId,
              },
            ),
          )
      : [],
  );
  return Object.freeze({ orchestrator, orphanedOutcomes, startupSnapshot });
}

module.exports = { createRegularQueueGroupComposition };
