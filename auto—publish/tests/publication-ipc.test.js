const { it } = require("node:test");
const assert = require("node:assert/strict");
const { registerPublicationIpc } = require("../desktop/ipc/publication-ipc");

it("requires confirmation and refuses the retired reconciliation command", async function () {
  const handlers = new Map();
  registerPublicationIpc({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
  });
  const rejected = await handlers.get("publication:reconcile")(null, {
    publicationId: "publication-1",
    status: "failed",
    reasonCode: "CONFIRMED_NOT_PUBLISHED",
  });
  assert.equal(rejected.ok, false);
  assert.equal(
    rejected.error.code,
    "PUBLICATION_RECONCILE_CONFIRMATION_REQUIRED",
  );
  const result = await handlers.get("publication:reconcile")(null, {
    publicationId: "publication-1",
    status: "failed",
    reasonCode: "CONFIRMED_NOT_PUBLISHED",
    confirmed: true,
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "PUBLICATION_RECONCILE_EVIDENCE_REQUIRED");
});

it("requires evidence for a published reconciliation and binds it to the current attempt", async function () {
  const handlers = new Map();
  let reconcileCommand = null;
  let reads = 0;
  const uncertain = {
    version: 1,
    publicationId: "publication-1",
    articleId: "article-1",
    articleKey: "article-1",
    targetKey: "media-resource:resource-1",
    status: "uncertain",
    createdAt: "2026-08-03T00:00:00.000Z",
    updatedAt: "2026-08-03T00:00:01.000Z",
    attempts: [
      {
        attemptId: "attempt-1",
        status: "uncertain",
        createdAt: "2026-08-03T00:00:00.000Z",
        updatedAt: "2026-08-03T00:00:01.000Z",
      },
    ],
  };
  const published = {
    ...uncertain,
    status: "published",
    attempts: [{ ...uncertain.attempts[0], status: "published" }],
  };
  registerPublicationIpc({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    operationalStore: {
      listPublicationRecords: () => (++reads === 1 ? [uncertain] : [published]),
    },
    publicationWorkflow: {
      reconcile: async (command) => {
        reconcileCommand = command;
      },
    },
  });
  const missingEvidence = await handlers.get("publication:reconcile")(null, {
    publicationId: "publication-1",
    status: "published",
    reasonCode: "CONFIRMED_PUBLISHED",
    confirmed: true,
  });
  assert.equal(missingEvidence.ok, false);
  assert.equal(missingEvidence.error.code, "PUBLICATION_RECONCILE_EVIDENCE_REQUIRED");
  assert.equal(reconcileCommand, null);
  const result = await handlers.get("publication:reconcile")(null, {
    publicationId: "publication-1",
    status: "published",
    reasonCode: "CONFIRMED_PUBLISHED",
    remoteId: "remote-1",
    remoteUrl: "https://example.test/articles/remote-1",
    confirmed: true,
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.record.status, "published");
  assert.equal(reconcileCommand.attemptId, "attempt-1");
  assert.equal(reconcileCommand.outcome.status, "published");
  assert.deepEqual(reconcileCommand.outcome.evidence, {
    articleId: "article-1",
    attemptId: "attempt-1",
    targetKey: "media-resource:resource-1",
    remoteId: "remote-1",
    remoteUrl: "https://example.test/articles/remote-1",
  });
  assert.equal(reconcileCommand.reasonCode, "CONFIRMED_PUBLISHED");
});
