import assert from "node:assert/strict";
import test from "node:test";

import { createPlatformFeature } from "../media-workbench/src/features/platform/platform-feature.js";

test("platform feature saves a queue-group submission interval and refreshes its snapshot", async () => {
  const calls = [];
  const updatedGroups = [
    {
      queueGroupId: "group-interval",
      platformId: "lieju",
      accountProfileId: "profile-lieju",
      imageCount: 0,
      submissionIntervalSeconds: 45,
      imagePublishingSupported: true,
      runState: "paused",
      pauseIntent: "manual",
      manuallyPaused: true,
      current: null,
      remaining: [],
      actions: { canStart: false, canPause: false, reasonCode: "REGULAR_QUEUE_GROUP_EMPTY" },
      revision: 2,
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:01.000Z",
    },
  ];
  const feature = createPlatformFeature({
    updateRegularQueueGroupSubmissionInterval: async (input) => {
      calls.push(input);
      return updatedGroups;
    },
  });
  feature.setScope({ workspaceRuntimeId: "runtime-interval" });

  await feature.updateSubmissionInterval({
    queueGroupId: "group-interval",
    submissionIntervalSeconds: 45,
    expectedRevision: 1,
  });

  assert.deepEqual(calls, [
    {
      queueGroupId: "group-interval",
      submissionIntervalSeconds: 45,
      expectedRevision: 1,
    },
  ]);
  assert.equal(
    feature.getSnapshot().regularQueueGroups.items[0]
      .submissionIntervalSeconds,
    45,
  );
  assert.equal(
    feature.getSnapshot().commands.updateSubmissionInterval.busy,
    false,
  );
});
