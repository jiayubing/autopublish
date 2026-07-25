"use strict";
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  test = require("node:test");
const {
  createOperationalStore,
  verifyOperationalDatabase,
} = require("../src/infrastructure/operational-store/operational-store");
function root() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "operational-store-"));
}
function input() {
  return {
    articleId: "article-1",
    publicationId: "publication-1",
    attemptId: "attempt-1",
    target: {
      kind: "platform",
      platformId: "toutiao",
      accountProfileId: "account-1",
    },
  };
}
test("operational store owns an atomic publication outcome and derived recovery", () => {
  const dir = root(),
    store = createOperationalStore({ workspaceRoot: dir });
  const reserved = store.reservePublicationTarget(input());
  assert.equal(reserved.status, "queued");
  assert.equal(store.listActionableRecovery().length, 1);
  store.commitRemoteOutcome({
    attemptId: "attempt-1",
    outcome: {
      status: "published",
      evidence: {
        remoteId: "remote-1",
        remoteUrl: "https://example.test/article",
      },
    },
  });
  assert.equal(store.listActionableRecovery().length, 0);
  assert.equal(
    store.claimPostProcessing({ claimToken: "owner-1" }).kind,
    "archive",
  );
  store.close();
});
test("single write owner, duplicate target and sensitive payload fail closed", () => {
  const dir = root(),
    store = createOperationalStore({ workspaceRoot: dir });
  assert.throws(() => createOperationalStore({ workspaceRoot: dir }), {
    code: "OPERATIONAL_WRITE_OWNER_EXISTS",
  });
  store.reservePublicationTarget(input());
  assert.equal(
    store.reservePublicationTarget({
      ...input(),
      articleId: "article-2",
      publicationId: "publication-3",
      attemptId: "attempt-3",
    }).status,
    "queued",
  );
  assert.throws(
    () =>
      store.reservePublicationTarget({
        ...input(),
        publicationId: "publication-2",
        attemptId: "attempt-2",
      }),
    { code: "PUBLICATION_DUPLICATE" },
  );
  assert.throws(
    () =>
      store.createSubmissionBatch({
        batchId: "batch-1",
        items: [
          {
            articleId: "article-1",
            target: input().target,
            payload: { cookie: "never" },
          },
        ],
      }),
    { code: "OPERATIONAL_SENSITIVE_FIELD" },
  );
  store.close();
});
test("backup verifier reads destination and missing or corrupt targets have no side effects", () => {
  const dir = root(),
    store = createOperationalStore({ workspaceRoot: dir });
  store.reservePublicationTarget(input());
  const backup = path.join(dir, "backup.db");
  const result = store.backup(backup);
  assert.equal(result.rows, 1);
  assert.equal(verifyOperationalDatabase(backup).schemaVersion, 1);
  const missing = path.join(dir, "missing.db");
  assert.throws(() => verifyOperationalDatabase(missing), {
    code: "OPERATIONAL_RESTORE_TARGET_INVALID",
  });
  assert.equal(fs.existsSync(missing), false);
  const broken = path.join(dir, "broken.db");
  fs.writeFileSync(broken, "not sqlite");
  assert.throws(() => verifyOperationalDatabase(broken));
  store.close();
});
test("database reopens after close and explicit batch writes stay isolated from legacy files", () => {
  const dir = root(),
    store = createOperationalStore({ workspaceRoot: dir });
  const batch = store.createSubmissionBatch({
    batchId: "batch-1",
    items: [
      {
        articleId: "article-1",
        target: input().target,
        payload: { revision: 1 },
      },
    ],
  });
  assert.equal(batch.batchId, "batch-1");
  assert.equal(batch.items.length, 1);
  assert.match(batch.items[0].itemId, /^[0-9a-f-]{36}$/i);
  const loadedBatch = store.getSubmissionBatch("batch-1");
  assert.equal(loadedBatch.items[0].status, "queued");
  assert.deepEqual(loadedBatch.items[0].payload, { revision: 1 });
  const db = store.databasePath;
  store.close();
  const reopened = createOperationalStore({ workspaceRoot: dir });
  assert.equal(reopened.verify().schemaVersion, 1);
  assert.equal(
    fs.existsSync(path.join(dir, ".autopublish", "publications")),
    false,
  );
  assert.equal(fs.existsSync(db), true);
  reopened.close();
});

test("batch claim revision and remote order evidence are transactional", () => {
  const dir = root(),
    store = createOperationalStore({ workspaceRoot: dir });
  store.reservePublicationTarget(input());
  store.attachRemoteOrderEvidence({
    attemptId: "attempt-1",
    orderId: "order-1",
    remoteId: "remote-order-1",
    evidence: { source: "fixture" },
  });
  store.createSubmissionBatch({
    batchId: "batch-1",
    items: [
      {
        articleId: "article-1",
        target: input().target,
        payload: { source: "fixture" },
      },
    ],
  });
  const claimed = store.claimSubmissionItem({
    batchId: "batch-1",
    claimToken: "worker-1",
  });
  store.updateSubmissionItem({
    itemId: claimed.itemId,
    claimToken: "worker-1",
    revision: claimed.revision,
    status: "completed",
    payload: { result: "fixture" },
  });
  assert.throws(
    () =>
      store.updateSubmissionItem({
        itemId: claimed.itemId,
        claimToken: "worker-1",
        revision: claimed.revision,
        status: "completed",
      }),
    { code: "OPERATIONAL_BATCH_REVISION_CONFLICT" },
  );
  store.close();
});
