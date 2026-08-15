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
  return fs.mkdtempSync(path.join(os.tmpdir(), "ticket-18-a-image-count-"));
}

function openStore(workspaceRoot, options) {
  const transitionPorts = {};
  const store = createOperationalStore({
    ...(options || {}),
    workspaceRoot,
    transitionPorts,
  });
  return { store, transitionPorts };
}

function v7QueueGroupSnapshot(databasePath) {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    return {
      history: database
        .prepare("SELECT version FROM schema_migrations ORDER BY version")
        .all()
        .map((row) => row.version),
      columns: database
        .prepare("PRAGMA table_info(submission_queue_groups)")
        .all()
        .map((row) => ({
          name: row.name,
          type: row.type,
          notnull: row.notnull,
          dfltValue: row.dflt_value,
          pk: row.pk,
        })),
      groups: database
        .prepare(
          "SELECT queue_group_id,platform_id,account_profile_id,pause_intent,revision,created_at,updated_at FROM submission_queue_groups ORDER BY queue_group_id",
        )
        .all(),
    };
  } finally {
    database.close();
  }
}

function createLegacyV7QueueGroupDatabase() {
  const root = workspace();
  const initial = openStore(root);
  const profile = initial.store.createAccountProfile({
    platformId: "toutiao",
    displayName: "legacy profile",
  });
  const databasePath = initial.store.databasePath;
  initial.store.close();
  const database = new DatabaseSync(databasePath);
  try {
    database.exec(`
      PRAGMA foreign_keys=OFF;
      DROP TABLE submission_queue_items;
      DROP TABLE submission_queue_groups;
      CREATE TABLE submission_queue_groups(
        queue_group_id TEXT PRIMARY KEY NOT NULL,
        platform_id TEXT NOT NULL,
        account_profile_id TEXT NOT NULL REFERENCES account_profiles(account_profile_id),
        pause_intent TEXT NOT NULL CHECK(pause_intent IN('none','manual','system')),
        revision INTEGER NOT NULL CHECK(revision > 0),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(platform_id,account_profile_id)
      );
      CREATE INDEX queue_group_pause_intent ON submission_queue_groups(pause_intent,updated_at,queue_group_id);
      CREATE TABLE submission_queue_items(
        item_id TEXT PRIMARY KEY NOT NULL REFERENCES submission_items(item_id),
        queue_group_id TEXT NOT NULL REFERENCES submission_queue_groups(queue_group_id),
        position INTEGER NOT NULL CHECK(position > 0),
        created_at TEXT NOT NULL,
        UNIQUE(queue_group_id,position)
      );
      CREATE INDEX queue_item_article ON submission_queue_items(item_id,queue_group_id);
      DELETE FROM schema_migrations WHERE version>=8;
    `);
    database
      .prepare(
        "INSERT INTO submission_queue_groups(queue_group_id,platform_id,account_profile_id,pause_intent,revision,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
      )
      .run(
        "legacy-group",
        "toutiao",
        profile.accountProfileId,
        "manual",
        7,
        "2026-08-15T00:00:00.000Z",
        "2026-08-15T00:00:01.000Z",
      );
  } finally {
    database.close();
  }
  return { root, databasePath, profile };
}

function groupSnapshot(transitionPorts, queueGroupId) {
  const snapshot =
    transitionPorts.regularQueueGroupTransitions.listRegularQueueGroupSnapshots(
      {
        queueGroupId,
      },
    )[0];
  assert.ok(snapshot, `missing queue group ${queueGroupId}`);
  return snapshot;
}

function admitWithQueueConfig(
  transitionPorts,
  profile,
  articleId,
  queueConfig,
) {
  const input = {
    articleId,
    publicationId: `publication-${articleId}`,
    attemptId: `attempt-${articleId}`,
    clientId: "client-18-a",
    target: {
      kind: "platform",
      platformId: profile.platformId,
      accountProfileId: profile.accountProfileId,
    },
    publicationSnapshot: {
      articleId,
      title: `Title ${articleId}`,
      body: `Body ${articleId}`,
      fingerprint: `${String(articleId.length % 10)}${"a".repeat(63)}`,
    },
  };
  if (queueConfig !== undefined) input.queueConfig = queueConfig;
  return transitionPorts.regularQueueTransitions.admitRegularQueueItem(input);
}

function admit(transitionPorts, profile, articleId, imageCount) {
  return admitWithQueueConfig(
    transitionPorts,
    profile,
    articleId,
    imageCount === undefined ? undefined : { imageCount },
  );
}

test("schema v8 migrates existing queue groups to zero atomically and preserves zero after restart", () => {
  for (const point of [
    "before-v8",
    "after-v8-add-image-count",
    "after-v8-verify",
    "after-v8-record",
  ]) {
    const fixture = createLegacyV7QueueGroupDatabase();
    try {
      const before = v7QueueGroupSnapshot(fixture.databasePath);
      assert.deepEqual(before.history, [1, 2, 3, 4, 5, 6, 7]);
      assert.throws(
        () =>
          openStore(fixture.root, {
            internalMigrationFault(actual) {
              if (actual === point) throw new Error(point);
            },
          }),
        { code: "OPERATIONAL_DATABASE_OPEN_FAILED" },
      );
      assert.deepEqual(v7QueueGroupSnapshot(fixture.databasePath), before);

      let runtime = openStore(fixture.root);
      assert.equal(runtime.store.verify().schemaVersion, SCHEMA_VERSION);
      const migrated = groupSnapshot(runtime.transitionPorts, "legacy-group");
      assert.equal(migrated.imageCount, 0);
      assert.equal(migrated.revision, 7);
      assert.equal(migrated.platformId, "toutiao");
      assert.equal(migrated.accountProfileId, fixture.profile.accountProfileId);
      runtime.store.close();

      runtime = openStore(fixture.root);
      assert.equal(
        groupSnapshot(runtime.transitionPorts, "legacy-group").imageCount,
        0,
      );
      runtime.store.close();
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  }
});

test("queue group image count defaults, admission inheritance, validation, CAS update, and restart are stable", async () => {
  const root = workspace();
  let now = "2026-08-15T01:00:00.000Z";
  let runtime;
  try {
    runtime = openStore(root, { clock: () => new Date(now) });
    const { store, transitionPorts } = runtime;
    const profiles = {
      default: store.createAccountProfile({
        platformId: "toutiao",
        displayName: "default",
      }),
      zero: store.createAccountProfile({
        platformId: "hepan",
        displayName: "zero",
      }),
      admission: store.createAccountProfile({
        platformId: "lieju",
        displayName: "admission",
      }),
      admissionDefault: store.createAccountProfile({
        platformId: "toutiao",
        displayName: "admission default",
      }),
    };
    const defaultGroup = store.createSubmissionQueueGroup({
      queueGroupId: "default-image-count",
      platformId: profiles.default.platformId,
      accountProfileId: profiles.default.accountProfileId,
    });
    const zeroGroup = store.createSubmissionQueueGroup({
      queueGroupId: "zero-image-count",
      platformId: profiles.zero.platformId,
      accountProfileId: profiles.zero.accountProfileId,
      imageCount: 0,
    });
    assert.equal(defaultGroup.imageCount, 1);
    assert.equal(zeroGroup.imageCount, 0);
    assert.equal(
      groupSnapshot(transitionPorts, defaultGroup.queueGroupId).imageCount,
      1,
    );

    const groupCountBeforeInvalidCreates =
      store.listSubmissionQueueGroups().length;
    for (const imageCount of [-1, 6, 1.5, "1", null])
      assert.throws(
        () =>
          store.createSubmissionQueueGroup({
            queueGroupId: `invalid-${String(imageCount)}`,
            platformId: profiles.default.platformId,
            accountProfileId: profiles.default.accountProfileId,
            imageCount,
          }),
        { code: "OPERATIONAL_QUEUE_GROUP_IMAGE_COUNT_INVALID" },
      );
    assert.equal(
      store.listSubmissionQueueGroups().length,
      groupCountBeforeInvalidCreates,
    );

    const firstAdmission = admit(
      transitionPorts,
      profiles.admission,
      "admission-first",
      5,
    );
    const secondAdmission = admit(
      transitionPorts,
      profiles.admission,
      "admission-second",
    );
    const explicitExistingGroupAdmission = admit(
      transitionPorts,
      profiles.admission,
      "admission-explicit-existing-group",
      0,
    );
    assert.equal(secondAdmission.queueGroupId, firstAdmission.queueGroupId);
    assert.equal(
      explicitExistingGroupAdmission.queueGroupId,
      firstAdmission.queueGroupId,
    );
    const admittedGroup = groupSnapshot(
      transitionPorts,
      firstAdmission.queueGroupId,
    );
    assert.equal(admittedGroup.imageCount, 5);
    assert.equal(admittedGroup.remaining.length, 3);
    assert.equal("imageRefs" in admittedGroup, false);
    assert.equal("imagePaths" in admittedGroup, false);

    for (const imageCount of [-1, 6, 1.5, "1", null])
      assert.throws(
        () =>
          admit(
            transitionPorts,
            profiles.admission,
            `invalid-admission-${String(imageCount)}`,
            imageCount,
          ),
        { code: "OPERATIONAL_QUEUE_GROUP_IMAGE_COUNT_INVALID" },
      );
    assert.throws(
      () =>
        admitWithQueueConfig(
          transitionPorts,
          profiles.admission,
          "invalid-admission-extra-config",
          { imageCount: 1, unexpected: true },
        ),
      { code: "REGULAR_QUEUE_CONFIG_INVALID" },
    );
    assert.deepEqual(
      groupSnapshot(transitionPorts, firstAdmission.queueGroupId),
      admittedGroup,
    );

    const defaultAdmission = admit(
      transitionPorts,
      profiles.admissionDefault,
      "admission-default",
    );
    assert.equal(
      groupSnapshot(transitionPorts, defaultAdmission.queueGroupId).imageCount,
      1,
    );

    const beforeUpdate = groupSnapshot(
      transitionPorts,
      firstAdmission.queueGroupId,
    );
    now = "2026-08-15T01:00:01.000Z";
    const updated =
      transitionPorts.regularQueueGroupImageCountTransitions.setRegularQueueGroupImageCount(
        {
          queueGroupId: firstAdmission.queueGroupId,
          imageCount: 0,
          expectedRevision: beforeUpdate.revision,
        },
      );
    assert.equal(updated.imageCount, 0);
    assert.equal(updated.revision, beforeUpdate.revision + 1);
    assert.notEqual(updated.updatedAt, beforeUpdate.updatedAt);
    assert.equal(updated.platformId, beforeUpdate.platformId);
    assert.equal(updated.accountProfileId, beforeUpdate.accountProfileId);

    const beforeInvalidUpdate = groupSnapshot(
      transitionPorts,
      firstAdmission.queueGroupId,
    );
    for (const imageCount of [-1, 6, 1.5, "1", null])
      assert.throws(
        () =>
          transitionPorts.regularQueueGroupImageCountTransitions.setRegularQueueGroupImageCount(
            {
              queueGroupId: firstAdmission.queueGroupId,
              imageCount,
              expectedRevision: beforeInvalidUpdate.revision,
            },
          ),
        { code: "OPERATIONAL_QUEUE_GROUP_IMAGE_COUNT_INVALID" },
      );
    assert.deepEqual(
      groupSnapshot(transitionPorts, firstAdmission.queueGroupId),
      beforeInvalidUpdate,
    );

    const contenders = await Promise.allSettled(
      [2, 3].map((imageCount) =>
        Promise.resolve().then(() =>
          transitionPorts.regularQueueGroupImageCountTransitions.setRegularQueueGroupImageCount(
            {
              queueGroupId: firstAdmission.queueGroupId,
              imageCount,
              expectedRevision: beforeInvalidUpdate.revision,
            },
          ),
        ),
      ),
    );
    assert.equal(
      contenders.filter((result) => result.status === "fulfilled").length,
      1,
    );
    assert.equal(
      contenders.filter((result) => result.status === "rejected").length,
      1,
    );
    assert.equal(
      contenders.find((result) => result.status === "rejected").reason.code,
      "OPERATIONAL_QUEUE_GROUP_REVISION_CONFLICT",
    );
    const afterConcurrentUpdate = groupSnapshot(
      transitionPorts,
      firstAdmission.queueGroupId,
    );
    assert.ok([2, 3].includes(afterConcurrentUpdate.imageCount));
    assert.equal(
      afterConcurrentUpdate.revision,
      beforeInvalidUpdate.revision + 1,
    );

    const databasePath = store.databasePath;
    store.close();
    runtime = null;
    const database = new DatabaseSync(databasePath);
    try {
      assert.throws(
        () =>
          database
            .prepare(
              "UPDATE submission_queue_groups SET image_count=? WHERE queue_group_id=?",
            )
            .run(1.5, firstAdmission.queueGroupId),
        (error) => /CHECK constraint failed/i.test(error.message),
      );
      assert.equal(
        database
          .prepare(
            "SELECT image_count FROM submission_queue_groups WHERE queue_group_id=?",
          )
          .get(firstAdmission.queueGroupId).image_count,
        afterConcurrentUpdate.imageCount,
      );
    } finally {
      database.close();
    }

    runtime = openStore(root, { clock: () => new Date(now) });
    assert.equal(
      groupSnapshot(runtime.transitionPorts, firstAdmission.queueGroupId)
        .imageCount,
      afterConcurrentUpdate.imageCount,
    );
  } finally {
    if (runtime) runtime.store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("image count update fault leaves the prior group configuration intact", () => {
  const root = workspace();
  let runtime;
  try {
    runtime = openStore(root, {
      internalRegularQueueTransitionFault(point) {
        if (point === "after-group-image-count")
          throw new Error("injected image-count update failure");
      },
    });
    const profile = runtime.store.createAccountProfile({
      platformId: "toutiao",
      displayName: "fault fixture",
    });
    const group = runtime.store.createSubmissionQueueGroup({
      queueGroupId: "fault-group",
      platformId: profile.platformId,
      accountProfileId: profile.accountProfileId,
      imageCount: 1,
    });
    const before = groupSnapshot(runtime.transitionPorts, group.queueGroupId);
    assert.throws(() =>
      runtime.transitionPorts.regularQueueGroupImageCountTransitions.setRegularQueueGroupImageCount(
        {
          queueGroupId: group.queueGroupId,
          imageCount: 4,
          expectedRevision: before.revision,
        },
      ),
    );
    assert.deepEqual(
      groupSnapshot(runtime.transitionPorts, group.queueGroupId),
      before,
    );
  } finally {
    if (runtime) runtime.store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
