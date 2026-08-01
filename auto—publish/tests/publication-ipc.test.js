const { it } = require("node:test");
const assert = require("node:assert/strict");
const { registerPublicationIpc } = require("../desktop/ipc/publication-ipc");

it("requires a second-confirmation marker and exposes only safe reconciliation fields", async function() {
  const handlers = new Map();
  const calls = [];
  registerPublicationIpc({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    publicationLedger: {
      listForArticles: () => [],
      reconcile: (publicationId, decision) => {
        calls.push({ publicationId, decision });
        return {
          version: 1,
          publicationId,
          clientId: "client-1",
          articleId: "article-1",
          articleKey: "generated:client-1:article-1",
          targetKey: "platform:toutiao",
          platformId: "toutiao",
          mediaResourceId: null,
          displayName: "头条",
          status: decision.status,
          createdAt: "2026-07-18T00:00:00.000Z",
          updatedAt: "2026-07-18T01:00:00.000Z",
          attempts: [{ attemptId: "attempt-1", status: decision.status, createdAt: "2026-07-18T00:00:00.000Z", updatedAt: "2026-07-18T01:00:00.000Z", startedAt: null, finishedAt: "2026-07-18T01:00:00.000Z", remoteId: null, remoteUrl: null, errorCode: null, reasonCode: decision.reasonCode }]
        };
      }
    }
  });
  const rejected = await handlers.get("publication:reconcile")(null, { publicationId: "publication-1", status: "failed", reasonCode: "CONFIRMED_NOT_PUBLISHED" });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.error.code, "PUBLICATION_RECONCILE_CONFIRMATION_REQUIRED");
  const result = await handlers.get("publication:reconcile")(null, { publicationId: "publication-1", status: "failed", reasonCode: "CONFIRMED_NOT_PUBLISHED", confirmed: true });
  assert.equal(result.ok, true);
  assert.deepEqual(calls, [{ publicationId: "publication-1", decision: { status: "failed", reasonCode: "CONFIRMED_NOT_PUBLISHED" } }]);
  assert.equal(result.data.record.reasonCode, "CONFIRMED_NOT_PUBLISHED");
  assert.equal(result.data.record.accountFingerprint, undefined);
});
