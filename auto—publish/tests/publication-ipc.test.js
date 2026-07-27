const { it } = require("node:test");
const assert = require("node:assert/strict");
const { registerPublicationIpc } = require("../desktop/ipc/publication-ipc");

it("lists publication history for many articles in one ledger query and strips sensitive aggregate fields", async function() {
  const handlers = new Map();
  const calls = [];
  registerPublicationIpc({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    publicationLedger: {
      listForArticles: (clientId, articleIds) => {
        calls.push({ clientId, articleIds });
        return [{
          version: 1,
          publicationId: "publication-1",
          clientId: "client-1",
          articleId: "article-1",
          articleKey: "generated:client-1:article-1",
          targetKey: "platform:toutiao",
          platformId: "toutiao",
          mediaResourceId: null,
          displayName: "头条",
          accountFingerprint: "must-not-leak",
          contentHash: "must-not-leak",
          status: "uncertain",
          createdAt: "2026-07-18T00:00:00.000Z",
          updatedAt: "2026-07-18T01:00:00.000Z",
          attempts: [{ attemptId: "attempt-1", status: "uncertain", createdAt: "2026-07-18T00:00:00.000Z", updatedAt: "2026-07-18T01:00:00.000Z", remoteId: null, remoteUrl: null, errorCode: "REMOTE_RESULT_UNKNOWN", reasonCode: null }]
        }];
      }
    }
  });

  const result = await handlers.get("publication:list-for-articles")(null, { clientId: "client-1", articleIds: ["article-1", "article-2"] });

  assert.deepEqual(calls, [{ clientId: "client-1", articleIds: ["article-1", "article-2"] }]);
  assert.equal(result.ok, true);
  assert.equal(result.data.records.length, 1);
  assert.equal(result.data.records[0].status, "uncertain");
  assert.equal(result.data.records[0].errorCode, "REMOTE_RESULT_UNKNOWN");
  assert.equal(result.data.records[0].accountFingerprint, undefined);
  assert.equal(result.data.records[0].contentHash, undefined);
});

it("rejects renderer path-like publication history input", async function() {
  const handlers = new Map();
  registerPublicationIpc({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    publicationLedger: { listForArticles: () => [] }
  });
  const result = await handlers.get("publication:list-for-articles")(null, { clientId: "client-1", articleIds: ["..\\secret"] });
  assert.deepEqual(result, { ok: false, error: { code: "PUBLICATION_ARTICLE_ID_INVALID", message: "Article ids are invalid" } });
});

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
