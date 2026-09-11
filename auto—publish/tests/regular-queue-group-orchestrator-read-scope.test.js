"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createRegularQueueGroupOrchestrator,
} = require("../desktop/services/regular-queue-group-orchestrator");

function createTransitions(reads) {
  const group = Object.freeze({
    queueGroupId: "group-a",
    platformId: "hepan",
    submissionIntervalSeconds: 0,
    pauseIntent: "none",
    remaining: Object.freeze([]),
  });
  const unrelated = Object.freeze({
    queueGroupId: "group-b",
    platformId: "lieju",
    submissionIntervalSeconds: 0,
    pauseIntent: "none",
    remaining: Object.freeze([]),
  });
  return {
    beginRegularRemoteSubmission() {
      return { submitAuthorized: true };
    },
    claimRegularQueueGroupHead() {
      return null;
    },
    listRegularQueueGroupSnapshots(input) {
      reads.push(input);
      if (input && input.queueGroupId === group.queueGroupId) return [group];
      return [group, unrelated];
    },
    pauseAllRegularQueueGroups() {
      return { changedCount: 0, groups: [] };
    },
    pauseRegularQueueGroupsOnStartup() {
      return { changedCount: 0, groups: [] };
    },
    renewRegularQueueGroupClaim() {
      return { renewed: true };
    },
    setRegularQueueGroupRunIntent(input) {
      assert.equal(input.queueGroupId, group.queueGroupId);
      return group;
    },
    startAllRegularQueueGroups() {
      return { changedCount: 0, groups: [] };
    },
  };
}

test("regular queue runner scopes execution reads to its queueGroupId", async () => {
  const reads = [];
  const orchestrator = createRegularQueueGroupOrchestrator({
    regularQueueGroupTransitions: createTransitions(reads),
    platformSubmissionExecutor: {
      async preparePlatformSubmission() {
        throw new Error("should not execute without a claim");
      },
    },
  });

  const result = await orchestrator.startGroup({ queueGroupId: "group-a" });
  assert.equal(result.status, "idle");
  assert.deepEqual(reads, [{ queueGroupId: "group-a" }]);

  reads.length = 0;
  const snapshot = orchestrator.snapshot();
  assert.equal(snapshot.length, 2);
  assert.deepEqual(reads, [{}]);

  await orchestrator.dispose();
});
