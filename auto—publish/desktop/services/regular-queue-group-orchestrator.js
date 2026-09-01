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
const OUTCOME_RECOVERY_METHODS = Object.freeze([
  "markOrphanedRegularAttemptUncertain",
]);
const PREPARATION_GROUP_BLOCK_CODES = new Set([
  "HEPAN_CONFIG_NOT_SET",
  "LOGIN_REQUIRED",
  "REGULAR_ACCOUNT_PROFILE_UNVERIFIED",
  "REGULAR_ACCOUNT_PROFILE_NOT_BOUND",
  "REGULAR_ACCOUNT_PROFILE_MISMATCH",
  "REGULAR_ACCOUNT_IDENTITY_UNAVAILABLE",
  "REGULAR_ACCOUNT_BINDING_UNAVAILABLE",
  "REGULAR_CLIENT_PROFILE_INCOMPLETE",
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

function validateOutcomeRecovery(value) {
  if (
    !value ||
    Object.keys(value).sort().join("\u0000") !==
      [...OUTCOME_RECOVERY_METHODS].sort().join("\u0000") ||
    OUTCOME_RECOVERY_METHODS.some(
      (method) => typeof value[method] !== "function",
    )
  )
    throw fail("REGULAR_OUTCOME_RECOVERY_PORT_INVALID");
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

function recoverablePreparationOutcome(error) {
  return (
    explicitPreparationOutcome(error) ||
    Object.freeze({
      status: "group_blocked",
      errorCode: "REGULAR_PREPARATION_FAILED",
      articleRecoverable: true,
    })
  );
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
  const outcomeRecovery =
    value.regularOutcomeRecovery ||
    (outcomeService &&
    typeof outcomeService.markOrphanedRegularAttemptUncertain === "function"
      ? {
          markOrphanedRegularAttemptUncertain:
            outcomeService.markOrphanedRegularAttemptUncertain,
        }
      : null);
  if (outcomeRecovery !== null) validateOutcomeRecovery(outcomeRecovery);
  const randomUUID = value.randomUUID || crypto.randomUUID;
  const setTimer = value.setInterval || setInterval;
  const clearTimer = value.clearInterval || clearInterval;
  const wait =
    typeof value.wait === "function"
      ? value.wait
      : function (intervalMs) {
          return new Promise(function (resolve) {
            const timer = setTimeout(resolve, intervalMs);
            if (timer && typeof timer.unref === "function") timer.unref();
          });
        };
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

  function submissionIntervalMs(group) {
    const seconds = group && group.submissionIntervalSeconds;
    if (!Number.isSafeInteger(seconds) || seconds < 0 || seconds > 3600)
      throw fail("REGULAR_SUBMISSION_INTERVAL_INVALID");
    return seconds * 1000;
  }

  function waitForSubmissionInterval(intervalMs) {
    if (intervalMs <= 0) return Promise.resolve();
    return Promise.resolve(wait(intervalMs));
  }

  function recoverOutcomeCommitFailure(claim, error) {
    diagnose("REGULAR_OUTCOME_COMMIT_FAILED", "outcome-commit");
    if (!outcomeRecovery) throw error;
    try {
      const transition = outcomeRecovery.markOrphanedRegularAttemptUncertain({
        regularPublicationAttemptId: claim.regularPublicationAttemptId,
      });
      notifyDataInvalidated("PUBLICATION_RECONCILED");
      return Object.freeze({
        status: "uncertain",
        errorCode: "REGULAR_OUTCOME_COMMIT_FAILED",
        transition,
      });
    } catch (_) {
      diagnose("REGULAR_OUTCOME_RECOVERY_FAILED", "outcome-commit-recovery");
      throw error;
    }
  }

  function reconcileRemoteObservation(claim, observation) {
    try {
      return Object.freeze({
        ...observation,
        transition: applyOutcome({
          regularPublicationAttemptId: claim.regularPublicationAttemptId,
          outcome: observation,
        }),
      });
    } catch (error) {
      if (!error || error.code !== "REGULAR_ADAPTER_OUTCOME_INVALID") {
        return recoverOutcomeCommitFailure(claim, error);
      }
    }
    const uncertain = Object.freeze({
      status: "uncertain",
      errorCode: "REGULAR_ADAPTER_OUTCOME_INVALID",
    });
    try {
      return Object.freeze({
        ...uncertain,
        transition: applyOutcome({
          regularPublicationAttemptId: claim.regularPublicationAttemptId,
          outcome: uncertain,
        }),
      });
    } catch (error) {
      return recoverOutcomeCommitFailure(claim, error);
    }
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
      if (!outcomeService) throw error;
      const preparationOutcome = recoverablePreparationOutcome(error);
      if (preparationOutcome.errorCode === "REGULAR_PREPARATION_FAILED")
        diagnose("REGULAR_PREPARATION_FAILED", "prepare-platform-submission");
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
    let evidence;
    try {
      if (renewalError) throw fail("REGULAR_CLAIM_RENEWAL_FAILED");
      evidence = prepared.preparedSubmissionEvidenceV1;
      if (
        evidence.attemptId !== claim.regularPublicationAttemptId ||
        JSON.stringify(evidence.articleIdentityV1) !==
          JSON.stringify(claim.articleIdentityV1) ||
        JSON.stringify(evidence.targetIdentityV1) !==
          JSON.stringify(claim.targetIdentityV1)
      )
        throw fail("REGULAR_PREPARED_SUBMISSION_MISMATCH");
    } catch (error) {
      if (!outcomeService) throw error;
      diagnose("REGULAR_PREPARATION_FAILED", "validate-prepared-submission");
      const preparationOutcome = recoverablePreparationOutcome(error);
      return Object.freeze({
        ...preparationOutcome,
        transition: applyOutcome({
          regularPublicationAttemptId: claim.regularPublicationAttemptId,
          outcome: preparationOutcome,
        }),
      });
    }
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
    return reconcileRemoteObservation(claim, observation);
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
        if (executor && typeof executor.beginQueueRun === "function") executor.beginQueueRun("queue-run-" + queueGroupId);
        const intervalMs = submissionIntervalMs(group);
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
          const latest = snapshot().find(
            (candidate) => candidate.queueGroupId === queueGroupId,
          );
          if (latest && latest.remaining.length > 0)
            await waitForSubmissionInterval(intervalMs);
        }
      })
      .finally(function () {
        if (executor && typeof executor.endQueueRun === "function") executor.endQueueRun();
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
