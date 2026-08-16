"use strict";

const crypto = require("node:crypto");
const domain = require("../../src/domain");
const { reportDiagnostic } = require("../../src/diagnostics/diagnostic-producer");

const TRANSITION_METHODS = Object.freeze([
  "beginRegularRemoteSubmission",
  "claimRegularQueueGroupHead",
  "listRegularQueueGroupSnapshots",
  "pauseAllRegularQueueGroups",
  "pauseRegularQueueGroupsOnStartup",
  "renewRegularQueueGroupClaim",
  "setRegularQueueGroupRunIntent",
  "startAllRegularQueueGroups",
]);
const PREPARATION_GROUP_BLOCK_CODES = new Set([
  "HEPAN_CONFIG_NOT_SET",
  "LOGIN_REQUIRED",
  "REGULAR_ACCOUNT_PROFILE_UNVERIFIED",
  "REGULAR_PLATFORM_PREPARATION_UNAVAILABLE",
]);
const PREPARATION_ARTICLE_REJECTION_CODES = new Set([
  "REGULAR_CONTENT_INVALID",
  "REMOTE_REJECTED",
]);

function fail(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function diagnose(code, action) {
  reportDiagnostic({
    code,
    module: "regular-queue-group-orchestrator",
    category: "storage",
    operationId: "regular-queue-group-orchestrator",
    metadata: { action },
  });
}

function validateTransitions(value) {
  if (
    !value ||
    Object.keys(value).sort().join("\u0000") !==
      [...TRANSITION_METHODS].sort().join("\u0000") ||
    TRANSITION_METHODS.some((method) => typeof value[method] !== "function")
  )
    throw fail("REGULAR_QUEUE_GROUP_TRANSITIONS_INVALID");
  return value;
}

function validateExecutor(value) {
  if (
    !value ||
    Object.keys(value).join("\u0000") !== "preparePlatformSubmission" ||
    typeof value.preparePlatformSubmission !== "function"
  )
    throw fail("REGULAR_PLATFORM_EXECUTOR_INVALID");
  return value;
}

function uncertainObservation(claim, evidence) {
  return Object.freeze({
    status: "uncertain",
    errorCode: "REGULAR_REMOTE_RESULT_UNCERTAIN",
    regularPublicationAttemptId: claim.regularPublicationAttemptId,
    preparedSubmissionEvidenceV1: evidence,
  });
}

function explicitPreparationOutcome(error) {
  const code = error && error.code;
  if (PREPARATION_GROUP_BLOCK_CODES.has(code))
    return Object.freeze({
      status: "group_blocked",
      errorCode: code,
      articleRecoverable: true,
    });
  if (PREPARATION_ARTICLE_REJECTION_CODES.has(code))
    return Object.freeze({ status: "article_rejected", errorCode: code });
  return null;
}

function createRegularQueueGroupOrchestrator(options) {
  const value = options || {};
  const transitions = validateTransitions(value.regularQueueGroupTransitions);
  const executor = validateExecutor(value.platformSubmissionExecutor);
  const outcomeService = value.regularPlatformOutcomeService || null;
  if (
    outcomeService !== null &&
    typeof outcomeService.applyRegularOutcome !== "function"
  )
    throw fail("REGULAR_OUTCOME_SERVICE_INVALID");
  const randomUUID = value.randomUUID || crypto.randomUUID;
  const setTimer = value.setInterval || setInterval;
  const clearTimer = value.clearInterval || clearInterval;
  const activeGroups = new Map();
  const activePlatforms = new Map();
  const onDataInvalidated =
    typeof value.onDataInvalidated === "function"
      ? value.onDataInvalidated
      : null;

  function notifyDataInvalidated(reasonCode) {
    if (!onDataInvalidated) return;
    try {
      onDataInvalidated(reasonCode);
    } catch (_) {
      diagnose("REGULAR_DATA_INVALIDATION_FAILED", "data-invalidation");
    }
  }

  function applyOutcome(input) {
    const transition = outcomeService.applyRegularOutcome(input);
    notifyDataInvalidated("PUBLICATION_RECONCILED");
    return transition;
  }

  function snapshot() {
    return transitions.listRegularQueueGroupSnapshots({});
  }

  async function executeClaim(claim) {
    let renewalError = null;
    let renewalReported = false;
    const recordRenewalFailure = function (error) {
      if (renewalReported) return;
      renewalReported = true;
      renewalError = error || fail("REGULAR_CLAIM_RENEWAL_FAILED");
      diagnose("REGULAR_CLAIM_RENEWAL_FAILED", "claim-renewal");
    };
    const timer = setTimer(function () {
      try {
        const result = transitions.renewRegularQueueGroupClaim({
          regularPublicationAttemptId: claim.regularPublicationAttemptId,
          claimToken: claim.claimToken,
          leaseMs: 30000,
        });
        if (result && typeof result.then === "function")
          result.catch(recordRenewalFailure);
      } catch (error) {
        recordRenewalFailure(error);
      }
    }, 10000);
    if (timer && typeof timer.unref === "function") timer.unref();
    let prepared;
    try {
      const preparation = await executor.preparePlatformSubmission(claim);
      if (
        preparation &&
        ["article_rejected", "group_blocked"].includes(preparation.status)
      ) {
        if (!outcomeService) return preparation;
        return Object.freeze({
          ...preparation,
          transition: applyOutcome({
            regularPublicationAttemptId: claim.regularPublicationAttemptId,
            outcome: preparation,
          }),
        });
      }
      prepared = domain.createPreparedSubmission(preparation);
    } catch (error) {
      const preparationOutcome = explicitPreparationOutcome(error);
      if (!preparationOutcome || !outcomeService) throw error;
      return Object.freeze({
        ...preparationOutcome,
        transition: applyOutcome({
          regularPublicationAttemptId: claim.regularPublicationAttemptId,
          outcome: preparationOutcome,
        }),
      });
    } finally {
      clearTimer(timer);
    }
    if (renewalError) throw fail("REGULAR_CLAIM_RENEWAL_FAILED");
    const evidence = prepared.preparedSubmissionEvidenceV1;
    if (
      evidence.attemptId !== claim.regularPublicationAttemptId ||
      JSON.stringify(evidence.articleIdentityV1) !==
        JSON.stringify(claim.articleIdentityV1) ||
      JSON.stringify(evidence.targetIdentityV1) !==
        JSON.stringify(claim.targetIdentityV1)
    )
      throw fail("REGULAR_PREPARED_SUBMISSION_MISMATCH");
    const boundary = transitions.beginRegularRemoteSubmission({
      regularPublicationAttemptId: claim.regularPublicationAttemptId,
      claimToken: claim.claimToken,
      preparedSubmissionEvidenceV1: evidence,
    });
    if (!boundary.submitAuthorized)
      return Object.freeze({ status: "submission_already_started" });
    let observation;
    try {
      observation = await prepared.submitPreparedPublication();
    } catch (_) {
      observation = uncertainObservation(claim, evidence);
    }
    if (!outcomeService) return observation;
    let transition;
    try {
      transition = applyOutcome({
        regularPublicationAttemptId: claim.regularPublicationAttemptId,
        outcome: observation,
      });
    } catch (error) {
      if (!error || error.code !== "REGULAR_ADAPTER_OUTCOME_INVALID")
        throw error;
      observation = Object.freeze({
        status: "uncertain",
        errorCode: "REGULAR_ADAPTER_OUTCOME_INVALID",
      });
      transition = applyOutcome({
        regularPublicationAttemptId: claim.regularPublicationAttemptId,
        outcome: observation,
      });
    }
    return Object.freeze({ ...observation, transition });
  }

  function runGroup(queueGroupId) {
    if (activeGroups.has(queueGroupId)) return activeGroups.get(queueGroupId);
    const group = snapshot().find(
      (candidate) => candidate.queueGroupId === queueGroupId,
    );
    if (!group) return Promise.reject(fail("REGULAR_QUEUE_GROUP_NOT_FOUND"));
    const previousPlatformOperation = activePlatforms.get(group.platformId);
    const operation = Promise.resolve(previousPlatformOperation)
      .catch(() => {
        diagnose("REGULAR_PREVIOUS_OPERATION_FAILED", "previous-operation");
        return undefined;
      })
      .then(async function () {
        const completed = [];
        while (true) {
          const claim = transitions.claimRegularQueueGroupHead({
            queueGroupId,
            claimToken: `regular-claim-${randomUUID()}`,
            leaseMs: 30000,
          });
          if (!claim)
            return completed.length
              ? Object.freeze({
                  queueGroupId,
                  status: "observation_ready",
                  regularPublicationAttemptId:
                    completed[completed.length - 1]
                      .regularPublicationAttemptId,
                  observation: completed[completed.length - 1].observation,
                  processed: Object.freeze(completed),
                })
              : Object.freeze({ queueGroupId, status: "idle" });
          const observation = await executeClaim(claim);
          if (observation.status === "submission_already_started")
            return Object.freeze({
              queueGroupId,
              status: "submission_already_started",
              regularPublicationAttemptId: claim.regularPublicationAttemptId,
            });
          completed.push(
            Object.freeze({
              regularPublicationAttemptId: claim.regularPublicationAttemptId,
              observation,
            }),
          );
          if (
            !outcomeService ||
            ["group_blocked", "uncertain"].includes(observation.status)
          )
            return Object.freeze({
              queueGroupId,
              status: "observation_ready",
              regularPublicationAttemptId: claim.regularPublicationAttemptId,
              observation,
              processed: Object.freeze(completed),
            });
        }
      })
      .finally(function () {
        activeGroups.delete(queueGroupId);
        if (activePlatforms.get(group.platformId) === operation)
          activePlatforms.delete(group.platformId);
      });
    activeGroups.set(queueGroupId, operation);
    activePlatforms.set(group.platformId, operation);
    return operation;
  }

  async function startGroup(input) {
    const group = transitions.setRegularQueueGroupRunIntent({
      queueGroupId: input && input.queueGroupId,
      running: true,
    });
    notifyDataInvalidated("REGULAR_QUEUE_GROUP_RUN_INTENT_CHANGED");
    return runGroup(group.queueGroupId);
  }

  async function startAll() {
    const started = transitions.startAllRegularQueueGroups();
    if (started.changedCount > 0)
      notifyDataInvalidated("REGULAR_QUEUE_GROUP_RUN_INTENT_CHANGED");
    const runnable = started.groups.filter(
      (group) => group.pauseIntent === "none",
    );
    const results = await Promise.all(
      runnable.map((group) => runGroup(group.queueGroupId)),
    );
    return Object.freeze({
      changedCount: started.changedCount,
      results: Object.freeze(results),
    });
  }

  function pauseGroup(input) {
    const group = transitions.setRegularQueueGroupRunIntent({
      queueGroupId: input && input.queueGroupId,
      running: false,
    });
    notifyDataInvalidated("REGULAR_QUEUE_GROUP_RUN_INTENT_CHANGED");
    return group;
  }

  function pauseAll() {
    const result = transitions.pauseAllRegularQueueGroups();
    if (result.changedCount > 0)
      notifyDataInvalidated("REGULAR_QUEUE_GROUP_RUN_INTENT_CHANGED");
    return result;
  }

  function initializePaused() {
    return transitions.pauseRegularQueueGroupsOnStartup();
  }

  return Object.freeze({
    initializePaused,
    pauseAll,
    pauseGroup,
    snapshot,
    startAll,
    startGroup,
  });
}

module.exports = { createRegularQueueGroupOrchestrator };
