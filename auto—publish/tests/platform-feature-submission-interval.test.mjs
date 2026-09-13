import assert from "node:assert/strict";
import test from "node:test";

import { createPlatformFeature } from "../media-workbench/src/features/platform/platform-feature.js";

test("platform feature saves a queue-group submission interval without a duplicate queue query", async () => {
  const calls = [];
  const feature = createPlatformFeature({
    listRegularQueueGroups: () => { throw new Error("No duplicate read"); },
    updateRegularQueueGroupSubmissionInterval: async (input) => {
      calls.push(input);
      return undefined;
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
    feature.getSnapshot().commands.updateSubmissionInterval.busy,
    false,
  );
});
