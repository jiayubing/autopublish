"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  createRegularRemoteReviewReconciler,
} = require("../desktop/services/regular-remote-review-reconciler");

function pending() {
  return {
    regularPublicationAttemptId: "attempt-1",
    platformId: "hepan",
    remoteId: "98765",
  };
}

test("remote review reconciler applies published provider evidence", async () => {
  const applied = [];
  const invalidations = [];
  const service = {
    listRegularRemotePending: () => [pending()],
    applyRegularOutcome: (input) => applied.push(input),
  };
  const reconciler = createRegularRemoteReviewReconciler({
    regularPlatformOutcomeService: service,
    remoteReviewPorts: [
      {
        id: "hepan",
        port: {
          reconcile: async () => ({
            status: "accepted",
            remoteId: "98765",
            remoteUrl:
              "https://www.hepan.com/portal.php?mod=view&aid=98765",
          }),
        },
      },
    ],
    onDataInvalidated: (reason) => invalidations.push(reason),
  });
  const result = await reconciler.runOnce();
  assert.equal(result[0].status, "accepted");
  assert.deepEqual(applied, [
    {
      regularPublicationAttemptId: "attempt-1",
      outcome: {
        status: "accepted",
        remoteId: "98765",
        remoteUrl:
          "https://www.hepan.com/portal.php?mod=view&aid=98765",
      },
    },
  ]);
  assert.deepEqual(invalidations, ["REGULAR_REMOTE_REVIEW_CHANGED"]);
  await reconciler.dispose();
});

test("remote review reconciler leaves pending and provider errors unchanged", async () => {
  for (const reconcile of [
    async () => ({
      status: "remote_pending",
      errorCode: "HEPAN_REMOTE_PENDING",
      remoteId: "98765",
    }),
    async () => {
      const error = new Error("HEPAN_RATE_LIMITED");
      error.code = "HEPAN_RATE_LIMITED";
      throw error;
    },
  ]) {
    const applied = [];
    const reconciler = createRegularRemoteReviewReconciler({
      regularPlatformOutcomeService: {
        listRegularRemotePending: () => [pending()],
        applyRegularOutcome: (input) => applied.push(input),
      },
      remoteReviewPorts: [
        { id: "hepan", port: { reconcile } },
      ],
    });
    const result = await reconciler.runOnce();
    assert.equal(
      ["remote_pending", "deferred"].includes(result[0].status),
      true,
    );
    assert.deepEqual(applied, []);
    await reconciler.dispose();
  }
});
