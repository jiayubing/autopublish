const { it } = require("node:test");
const assert = require("node:assert/strict");
const { registerPublicationIpc } = require("../desktop/ipc/publication-ipc");

it("production registration closes generic reconcile and exposes only named regular outcome commands", async function () {
  const handlers = new Map();
  const calls = [];
  registerPublicationIpc({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    regularPlatformOutcomeService: {
      prepareRegularUncertainResolution: (input) => {
        calls.push(["prepare", input]);
        return {
          regularPublicationAttemptId: input.regularPublicationAttemptId,
          confirmationToken: "token-1",
          expiresAt: "2026-08-07T00:05:00.000Z",
          actions: ["confirm_accepted", "confirm_not_accepted"],
          observationFingerprint: "observation-1",
          preparedEvidenceFingerprint: "evidence-1",
        };
      },
      confirmRegularAccepted: (input) => {
        calls.push(["accepted", input]);
        return {
          attemptId: input.regularPublicationAttemptId,
          status: "published",
        };
      },
      confirmRegularNotAccepted: (input) => ({
        attemptId: input.regularPublicationAttemptId,
        status: "not_accepted",
      }),
    },
  });
  assert.equal(handlers.has("publication:reconcile"), false);
  assert.equal(
    handlers.has("publication:prepare-regular-uncertain-resolution"),
    true,
  );
  const prepared = await handlers.get(
    "publication:prepare-regular-uncertain-resolution",
  )(null, {
    regularPublicationAttemptId: "attempt-1",
  });
  assert.equal(prepared.ok, true);
  const accepted = await handlers.get("publication:confirm-regular-accepted")(
    null,
    {
      regularPublicationAttemptId: "attempt-1",
      confirmationToken: "token-1",
      manualPositiveEvidence: { observedAt: "2026-08-06T00:00:00.000Z" },
      confirmed: true,
    },
  );
  assert.equal(accepted.ok, true);
  assert.equal(calls[1][1].regularPublicationAttemptId, "attempt-1");
  assert.equal(calls[1][1].confirmed, true);
});
