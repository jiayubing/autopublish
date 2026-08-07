"use strict";

const crypto = require("node:crypto");
const domain = require("../../src/domain");

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

function fail(code) {
  const error = new Error(code);
  error.code = code;
  return error;
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
    code: "REGULAR_REMOTE_RESULT_UNCERTAIN",
    regularPublicationAttemptId: claim.regularPublicationAttemptId,
    preparedSubmissionEvidenceV1: evidence,
  });
}

function createRegularQueueGroupOrchestrator(options) {
  const value = options || {};
  const transitions = validateTransitions(value.regularQueueGroupTransitions);
  const executor = validateExecutor(value.platformSubmissionExecutor);
  const randomUUID = value.randomUUID || crypto.randomUUID;
  const setTimer = value.setInterval || setInterval;
  const clearTimer = value.clearInterval || clearInterval;
  const activeGroups = new Map();
  const activePlatforms = new Map();

  function snapshot() {
    return transitions.listRegularQueueGroupSnapshots({});
  }

  async function executeClaim(claim) {
    let renewalError = null;
    const timer = setTimer(function () {
      try {
        transitions.renewRegularQueueGroupClaim({
          regularPublicationAttemptId: claim.regularPublicationAttemptId,
          claimToken: claim.claimToken,
          leaseMs: 30000,
        });
      } catch (error) {
        renewalError = error;
      }
    }, 10000);
    if (timer && typeof timer.unref === "function") timer.unref();
    let prepared;
    try {
      prepared = domain.createPreparedSubmission(
        await executor.preparePlatformSubmission(claim),
      );
    } finally {
      clearTimer(timer);
    }
    if (renewalError) throw renewalError;
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
    try {
      return await prepared.submitPreparedPublication();
    } catch (_) {
      return uncertainObservation(claim, evidence);
    }
  }

  function runGroup(queueGroupId) {
    if (activeGroups.has(queueGroupId)) return activeGroups.get(queueGroupId);
    const group = snapshot().find(
      (candidate) => candidate.queueGroupId === queueGroupId,
    );
    if (!group) return Promise.reject(fail("REGULAR_QUEUE_GROUP_NOT_FOUND"));
    if (activePlatforms.has(group.platformId))
      return Promise.resolve(
        Object.freeze({
          queueGroupId,
          platformId: group.platformId,
          status: "platform_busy",
        }),
      );
    activePlatforms.set(group.platformId, queueGroupId);
    const operation = (async function () {
      const claim = transitions.claimRegularQueueGroupHead({
        queueGroupId,
        claimToken: `regular-claim-${randomUUID()}`,
        leaseMs: 30000,
      });
      if (!claim) return Object.freeze({ queueGroupId, status: "idle" });
      const observation = await executeClaim(claim);
      if (observation.status === "submission_already_started")
        return Object.freeze({
          queueGroupId,
          status: "submission_already_started",
          regularPublicationAttemptId: claim.regularPublicationAttemptId,
        });
      return Object.freeze({
        queueGroupId,
        status: "observation_ready",
        regularPublicationAttemptId: claim.regularPublicationAttemptId,
        observation,
      });
    })().finally(function () {
      activeGroups.delete(queueGroupId);
      if (activePlatforms.get(group.platformId) === queueGroupId)
        activePlatforms.delete(group.platformId);
    });
    activeGroups.set(queueGroupId, operation);
    return operation;
  }

  async function startGroup(input) {
    const group = transitions.setRegularQueueGroupRunIntent({
      queueGroupId: input && input.queueGroupId,
      running: true,
    });
    return runGroup(group.queueGroupId);
  }

  async function startAll() {
    const started = transitions.startAllRegularQueueGroups();
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
    return transitions.setRegularQueueGroupRunIntent({
      queueGroupId: input && input.queueGroupId,
      running: false,
    });
  }

  function pauseAll() {
    return transitions.pauseAllRegularQueueGroups();
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
