"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { DatabaseSync } = require("node:sqlite");

const {
  SCHEMA_VERSION,
  createOperationalStore,
} = require("../src/infrastructure/operational-store/operational-store");

function workspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "regular-queue-interval-"));
}

function openStore(workspaceRoot, options) {
  const transitionPorts = {};
  const store = createOperationalStore({
    workspaceRoot,
    transitionPorts,
    ...(options || {}),
  });
  return { store, transitionPorts };
}

function admit(transitionPorts, profile, articleId, submissionIntervalSeconds) {
  return transitionPorts.regularQueueTransitions.admitRegularQueueItem({
    clientId: "client-interval",
    articleId,
    publicationId: `publication-${articleId}`,
    attemptId: `attempt-${articleId}`,
    target: {
      kind: "platform",
      platformId: profile.platformId,
      accountProfileId: profile.accountProfileId,
    },
    queueConfig:
      submissionIntervalSeconds === undefined
        ? undefined
        : { submissionIntervalSeconds },
    publicationSnapshot: {
      articleId,
      title: `Title ${articleId}`,
      body: `Body ${articleId}`,
      fingerprint: "a".repeat(64),
    },
  });
}

function group(transitionPorts, queueGroupId) {
  return transitionPorts.regularQueueGroupTransitions.listRegularQueueGroupSnapshots({
    queueGroupId,
  })[0];
}

test("schema v9 gives existing queue groups the persistent 30-second default", () => {
  const root = workspace();
  let runtime;
  try {
    runtime = openStore(root);
    const profile = runtime.store.createAccountProfile({
      platformId: "hepan",
      displayName: "legacy interval profile",
    });
    const admitted = admit(
      runtime.transitionPorts,
      profile,
      "legacy-interval-article",
      7,
    );
    const databasePath = runtime.store.databasePath;
    runtime.store.close();
    runtime = null;

    const database = new DatabaseSync(databasePath);
    try {
      database.exec(
        "ALTER TABLE submission_queue_groups DROP COLUMN submission_interval_seconds; DELETE FROM schema_migrations WHERE version=9;",
      );
    } finally {
      database.close();
    }

    runtime = openStore(root);
    assert.equal(runtime.store.verify().schemaVersion, SCHEMA_VERSION);
    assert.equal(group(runtime.transitionPorts, admitted.queueGroupId).submissionIntervalSeconds, 30);
    runtime.store.close();
    runtime = openStore(root);
    assert.equal(group(runtime.transitionPorts, admitted.queueGroupId).submissionIntervalSeconds, 30);
  } finally {
    if (runtime) runtime.store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("queue-group submission interval validates boundaries and uses revision CAS across restart", () => {
  const root = workspace();
  let runtime;
  try {
    runtime = openStore(root);
    const zeroProfile = runtime.store.createAccountProfile({
      platformId: "lieju",
      displayName: "zero interval",
    });
    const maxProfile = runtime.store.createAccountProfile({
      platformId: "hepan",
      displayName: "max interval",
    });
    const zero = admit(
      runtime.transitionPorts,
      zeroProfile,
      "zero-interval-article",
      0,
    );
    const maximum = admit(
      runtime.transitionPorts,
      maxProfile,
      "max-interval-article",
      3600,
    );
    assert.equal(group(runtime.transitionPorts, zero.queueGroupId).submissionIntervalSeconds, 0);
    assert.equal(group(runtime.transitionPorts, maximum.queueGroupId).submissionIntervalSeconds, 3600);

    for (const invalid of [-1, 3601, 1.5, "30", null])
      assert.throws(
        () =>
          admit(
            runtime.transitionPorts,
            runtime.store.createAccountProfile({
              platformId: "hepan",
              displayName: `invalid ${String(invalid)}`,
            }),
            `invalid-interval-${String(invalid)}`,
            invalid,
          ),
        { code: "OPERATIONAL_QUEUE_GROUP_SUBMISSION_INTERVAL_INVALID" },
      );

    const before = group(runtime.transitionPorts, zero.queueGroupId);
    const updated = runtime.transitionPorts.regularQueueGroupSubmissionIntervalTransitions.setRegularQueueGroupSubmissionInterval({
      queueGroupId: zero.queueGroupId,
      submissionIntervalSeconds: 45,
      expectedRevision: before.revision,
    });
    assert.equal(updated.submissionIntervalSeconds, 45);
    assert.equal(updated.revision, before.revision + 1);
    assert.throws(
      () =>
        runtime.transitionPorts.regularQueueGroupSubmissionIntervalTransitions.setRegularQueueGroupSubmissionInterval({
          queueGroupId: zero.queueGroupId,
          submissionIntervalSeconds: 60,
          expectedRevision: before.revision,
        }),
      { code: "OPERATIONAL_QUEUE_GROUP_REVISION_CONFLICT" },
    );

    runtime.store.close();
    runtime = openStore(root);
    assert.equal(group(runtime.transitionPorts, zero.queueGroupId).submissionIntervalSeconds, 45);
  } finally {
    if (runtime) runtime.store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
