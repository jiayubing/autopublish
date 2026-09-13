const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const {
  createOperationalStore,
} = require("../src/infrastructure/operational-store/operational-store");
const {
  createRegularQueueGroupOrchestrator,
} = require("../desktop/services/regular-queue-group-orchestrator");
const {
  createRegularQueueGroupComposition,
} = require("../desktop/composition/regular-queue-group-composition");
const {
  createPaidMediaBatchOrchestrator,
} = require("../desktop/services/paid-media-batch-orchestrator");

const BODY = "SYNTHETIC_BODY_MUST_NOT_REACH_LIST".repeat(40);

function regularFixture(itemCount, groupCount, prepare) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "regular-exec-reads-"));
  let ports = {};
  let store = createOperationalStore({
    workspaceRoot: root,
    transitionPorts: ports,
  });
  const account = store.createAccountProfile({
    platformId: "hepan",
    displayName: "Synthetic account",
  });
  const admitted = ports.regularQueueTransitions.admitRegularQueueItems([
    {
      clientId: "CLIENTSEED",
      articleId: "ARTICLESEED",
      batchId: "BATCHSEED",
      itemId: "ITEMSEED",
      publicationId: "PUBLICATIONSEED",
      attemptId: "ATTEMPTSEED",
      payload: { clientId: "CLIENTSEED" },
      publicationSnapshot: {
        articleId: "ARTICLESEED",
        title: "Synthetic title",
        body: BODY,
        fingerprint: "a".repeat(64),
      },
      target: {
        kind: "platform",
        platformId: "hepan",
        accountProfileId: account.accountProfileId,
      },
    },
  ])[0];
  if (admitted.error) throw admitted.error;
  const groupId = admitted.result.queueGroupId;
  const accountId = account.accountProfileId;
  const filename = store.databasePath;
  store.close();
  const db = new DatabaseSync(filename);
  try {
    const tables = [
      "account_profiles",
      "submission_queue_groups",
      "submission_batches",
      "publication_records",
      "publication_attempts",
      "recovery_intents",
      "submission_items",
      "article_active_targets",
      "submission_queue_items",
    ];
    const template = Object.fromEntries(
      tables.map((table) => [table, db.prepare(`SELECT * FROM ${table}`).all()]),
    );
    const generatedIntent = template.recovery_intents[0].intent_id;
    db.exec("PRAGMA foreign_keys=OFF; BEGIN");
    for (const table of tables) db.exec(`DELETE FROM ${table}`);
    const inserts = Object.fromEntries(
      tables.map((table) => {
        const keys = Object.keys(template[table][0]);
        return [
          table,
          {
            keys,
            statement: db.prepare(
              `INSERT INTO ${table}(${keys.join(",")}) VALUES(${keys
                .map(() => "?")
                .join(",")})`,
            ),
          },
        ];
      }),
    );
    function replace(value, i, g) {
      if (typeof value !== "string") return value;
      const suffix = String(i).padStart(6, "0");
      const groupSuffix = String(g).padStart(6, "0");
      return Object.entries({
        [generatedIntent]: `intent-${suffix}`,
        CLIENTSEED: `client-${i % 2}`,
        ARTICLESEED: `article-${suffix}`,
        BATCHSEED: `batch-${suffix}`,
        ITEMSEED: `item-${suffix}`,
        PUBLICATIONSEED: `publication-${suffix}`,
        ATTEMPTSEED: `attempt-${suffix}`,
        [accountId]: `account-${groupSuffix}`,
        [groupId]: `group-${groupSuffix}`,
      }).reduce(
        (text, [from, to]) => text.split(from).join(to),
        value,
      );
    }
    for (let g = 0; g < groupCount; g++) {
      for (const table of ["account_profiles", "submission_queue_groups"]) {
        const { keys, statement } = inserts[table];
        statement.run(
          ...keys.map((key) => replace(template[table][0][key], g, g)),
        );
      }
    }
    for (let i = 0; i < itemCount; i++) {
      const g = i % groupCount;
      for (const table of [
        "submission_batches",
        "publication_records",
        "publication_attempts",
        "recovery_intents",
        "submission_items",
        "article_active_targets",
        "submission_queue_items",
      ]) {
        const { keys, statement } = inserts[table];
        statement.run(
          ...keys.map((key) =>
            table === "submission_queue_items" && key === "position"
              ? Math.floor(i / groupCount) + 1
              : replace(template[table][0][key], i, g),
          ),
        );
      }
    }
    if (prepare) prepare(db);
    db.exec("COMMIT; PRAGMA foreign_keys=ON");
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    db.close();
  }
  ports = {};
  store = createOperationalStore({
    workspaceRoot: root,
    transitionPorts: ports,
  });
  return {
    store,
    ports,
    close() {
      store.close();
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

function paidFixture(count, prepare) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "paid-exec-reads-"));
  let ports = {};
  let store = createOperationalStore({
    workspaceRoot: root,
    transitionPorts: ports,
  });
  const ref = { clientId: "CLIENTSEED", articleId: "ARTICLESEED" };
  ports.paidAdmissionTransitions.admitPaidBatch({
    batchId: "BATCHSEED",
    articleCount: 1,
    target: { kind: "media", mediaResourceId: "media-a" },
    confirmationFingerprint: "b".repeat(64),
    confirmation: {
      version: 1,
      articleRefs: [ref],
      mediaResourceId: "media-a",
      quotedPrice: 12.5,
      confirmedAt: "2026-09-13T00:00:00.000Z",
    },
    systemSubmissionCode: "system-a",
    quotedPrice: 12.5,
    estimatedTotal: 12.5,
    items: [
      {
        ...ref,
        articleRef: ref,
        batchId: "BATCHSEED",
        itemId: "ITEMSEED",
        publicationId: "PUBLICATIONSEED",
        attemptId: "ATTEMPTSEED",
        customerSnapshotV1: {
          version: 1,
          clientId: ref.clientId,
          displayName: "Synthetic client",
        },
        publicationSnapshot: {
          articleId: ref.articleId,
          title: "Synthetic title",
          body: BODY,
          fingerprint: "a".repeat(64),
        },
      },
    ],
  });
  const filename = store.databasePath;
  store.close();
  const db = new DatabaseSync(filename);
  try {
    const tables = [
      "submission_batches",
      "publication_records",
      "publication_attempts",
      "recovery_intents",
      "submission_items",
      "paid_submission_batches",
      "article_active_targets",
    ];
    const rows = tables.map((table) => [
      table,
      db.prepare(`SELECT * FROM ${table}`).get(),
    ]);
    const generatedIntent = rows.find(
      ([table]) => table === "recovery_intents",
    )[1].intent_id;
    db.exec("PRAGMA foreign_keys=OFF; BEGIN");
    for (const [table, row] of rows) {
      db.exec(`DELETE FROM ${table}`);
      const keys = Object.keys(row);
      const insert = db.prepare(
        `INSERT INTO ${table}(${keys.join(",")}) VALUES(${keys
          .map(() => "?")
          .join(",")})`,
      );
      for (let index = 0; index < count; index++) {
        const suffix = String(index).padStart(6, "0");
        const replacements = {
          [generatedIntent]: `intent-${suffix}`,
          CLIENTSEED: `client-${index % 2}`,
          ARTICLESEED: `article-${suffix}`,
          BATCHSEED: `batch-${suffix}`,
          ITEMSEED: `item-${suffix}`,
          PUBLICATIONSEED: `publication-${suffix}`,
          ATTEMPTSEED: `attempt-${suffix}`,
        };
        insert.run(
          ...keys.map((key) =>
            typeof row[key] === "string"
              ? Object.entries(replacements).reduce(
                  (value, [from, to]) => value.split(from).join(to),
                  row[key],
                )
              : row[key],
          ),
        );
      }
    }
    if (prepare) prepare(db);
    db.exec("COMMIT; PRAGMA foreign_keys=ON");
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    db.close();
  }
  ports = {};
  store = createOperationalStore({
    workspaceRoot: root,
    transitionPorts: ports,
  });
  return {
    store,
    ports,
    close() {
      store.close();
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

function noFullRemaining(value) {
  const json = JSON.stringify(value);
  assert.equal(json.includes("SYNTHETIC_BODY_MUST_NOT_REACH_LIST"), false);
  if (value && Array.isArray(value.groups)) {
    for (const group of value.groups) {
      assert.ok(
        !group.remaining || group.remaining.length === 0,
        "global run intent must not return remaining arrays",
      );
    }
  }
  if (value && Array.isArray(value.batches)) {
    for (const batch of value.batches) {
      assert.ok(!batch.items || batch.items.length === 0);
    }
  }
}

test("startAll enumerates runnable group ids beyond 20000 and claims the last FIFO head", () => {
  const value = regularFixture(20003, 20003);
  try {
    const started =
      value.ports.regularQueueGroupTransitions.startAllRegularQueueGroups();
    noFullRemaining(started);
    assert.ok(Array.isArray(started.runnableGroupIds));
    assert.equal(started.runnableGroupIds.length, 20003);
    assert.equal(started.runnableGroupIds[20002], "group-020002");
    const claim = value.ports.regularQueueGroupTransitions.claimRegularQueueGroupHead({
      queueGroupId: "group-020002",
      claimToken: "claim-last",
      leaseMs: 30000,
    });
    assert.equal(claim.itemId, "item-020002");
    assert.equal(claim.queueGroupId, "group-020002");
  } finally {
    value.close();
  }
});

test("startup pause returns in-flight identities without remaining and recovers remote_call_started", async () => {
  const orphans = [];
  const value = regularFixture(8, 8, (db) => {
    db.prepare(
      "UPDATE submission_items SET status='remote_started' WHERE item_id=?",
    ).run("item-000007");
    db.prepare(
      "UPDATE recovery_intents SET payload_json=json_set(payload_json,'$.detail.phase','remote_call_started') WHERE attempt_id=?",
    ).run("attempt-000007");
  });
  try {
    const composition = createRegularQueueGroupComposition({
      regularQueueGroupTransitions:
        value.ports.regularQueueGroupTransitions,
      platformSubmissionExecutor: {
        async preparePlatformSubmission() {
          throw new Error("startup must not execute remaining work");
        },
      },
      regularPlatformOutcomeService: {
        applyRegularOutcome() {},
        markOrphanedRegularAttemptUncertain(input) {
          orphans.push(input);
        },
      },
    });
    noFullRemaining(composition.startupSnapshot);
    assert.equal(Object.prototype.hasOwnProperty.call(composition.startupSnapshot, "groups"), false);
    assert.equal(orphans.length, 1);
    assert.equal(
      orphans[0].regularPublicationAttemptId,
      "attempt-000007",
    );
    await composition.orchestrator.dispose();
  } finally {
    value.close();
  }
});

test("regular orchestrator startAll uses runnable ids instead of a truncated remaining snapshot", async () => {
  const reads = [];
  const startedGroups = [];
  const orchestrator = createRegularQueueGroupOrchestrator({
    regularQueueGroupTransitions: {
      beginRegularRemoteSubmission() {
        return { submitAuthorized: true };
      },
      claimRegularQueueGroupHead(input) {
        startedGroups.push(input.queueGroupId);
        return null;
      },
      listRegularQueueGroupSnapshots(input) {
        reads.push(input);
        if (input && input.idsOnly) return { ids: ["group-head", "group-tail"] };
        return [
          {
            queueGroupId: input && input.queueGroupId ? input.queueGroupId : "group-head",
            platformId: "hepan",
            submissionIntervalSeconds: 0,
            pauseIntent: "none",
            remaining: [],
            remainingCount: 0,
          },
        ];
      },
      pauseAllRegularQueueGroups() {
        return { changedCount: 0 };
      },
      pauseRegularQueueGroupsOnStartup() {
        return { changedCount: 0, inFlight: [] };
      },
      renewRegularQueueGroupClaim() {
        return { renewed: true };
      },
      setRegularQueueGroupRunIntent(input) {
        return {
          queueGroupId: input.queueGroupId,
          platformId: "hepan",
          pauseIntent: "none",
          remaining: [],
          remainingCount: 0,
        };
      },
      startAllRegularQueueGroups() {
        return {
          changedCount: 2,
          runnableGroupIds: ["group-head", "group-tail"],
        };
      },
    },
    platformSubmissionExecutor: {
      async preparePlatformSubmission() {
        throw new Error("should not execute without a claim");
      },
    },
  });
  const result = await orchestrator.startAll();
  assert.deepEqual(
    result.results.map((item) => item.queueGroupId),
    ["group-head", "group-tail"],
  );
  assert.deepEqual(startedGroups, ["group-head", "group-tail"]);
  assert.equal(
    reads.some((input) => !input || Object.keys(input).length === 0),
    false,
  );
  await orchestrator.dispose();
});

test("paid global start/pause/startup enumerate ids beyond 20000 without assembling publication bodies", async () => {
  const value = paidFixture(20003, (db) => {
    db.exec("UPDATE paid_submission_batches SET pause_intent='system'");
  });
  try {
    const ids = value.store.listPaidSubmissionBatchSnapshots({
      idsOnly: true,
      runnableOnly: true,
    });
    assert.ok(Array.isArray(ids.ids));
    assert.equal(ids.ids.length, 0);
    const started = value.ports.paidExecutionTransitions.startAllPaidSubmissionBatches();
    noFullRemaining(started);
    assert.equal(started.runnableBatchIds.length, 20003);
    assert.equal(started.runnableBatchIds[20002], "batch-020002");
    const listed = value.store.listPaidSubmissionBatchSnapshots({
      idsOnly: true,
      runnableOnly: true,
    });
    assert.equal(listed.ids[20002], "batch-020002");
    assert.equal(JSON.stringify(listed).includes("SYNTHETIC_BODY_MUST_NOT_REACH_LIST"), false);
    const claim = value.ports.paidExecutionTransitions.claimPaidSubmissionBatchItem({
      batchId: "batch-020002",
      claimToken: "claim-last",
      leaseMs: 30000,
    });
    assert.equal(claim.batchId, "batch-020002");
    assert.equal(claim.publicationSnapshot.body, BODY);

    const paused = value.ports.paidExecutionTransitions.pauseAllPaidSubmissionBatches();
    noFullRemaining(paused);
    const orchestrator = createPaidMediaBatchOrchestrator({
      paidExecutionTransitions: value.ports.paidExecutionTransitions,
      orderCreationPort: {
        createOrder() {
          throw new Error("startup must not create orders");
        },
      },
    });
    noFullRemaining(orchestrator.initializePaused());
    await orchestrator.dispose();
  } finally {
    value.close();
  }
});

test("paid orchestrator startAll uses runnable ids instead of a 20000-truncated snapshot", async () => {
  const listed = [];
  const orchestrator = createPaidMediaBatchOrchestrator({
    paidExecutionTransitions: {
      beginOrderCreationRemoteCall() {
        throw new Error("unexpected remote call");
      },
      cancelRemainingPaidSubmissionBatchItems() {},
      claimPaidSubmissionBatchItem(input) {
        listed.push(["claim", input.batchId]);
        return null;
      },
      listPaidSubmissionBatchSnapshots(input) {
        listed.push(["list", input]);
        if (input && input.idsOnly) return { ids: ["batch-head", "batch-tail"] };
        return [
          {
            batchId: "batch-head",
            pauseIntent: "none",
            items: [
              {
                publicationSnapshot: { body: BODY },
                articleIdentityV1: { clientId: "client-a", articleId: "a" },
              },
            ],
          },
        ];
      },
      pauseAllPaidSubmissionBatches() {
        return { changedCount: 0 };
      },
      pausePaidSubmissionBatchesOnStartup() {
        return { changedCount: 0 };
      },
      recordPaidOrderCreationArticleRejection() {},
      recordPaidOrderCreationSuccess() {},
      recordPaidOrderCreationSystemRejection() {},
      recordPaidOrderCreationUncertain() {},
      releasePaidOrderCreationClaim() {},
      renewPaidOrderCreationClaim() {},
      setPaidSubmissionBatchRunIntent() {},
      startAllPaidSubmissionBatches() {
        return {
          changedCount: 2,
          runnableBatchIds: ["batch-head", "batch-tail"],
        };
      },
    },
    orderCreationPort: {
      async createOrder() {
        throw new Error("unexpected remote call");
      },
    },
  });
  const result = await orchestrator.startAll();
  assert.deepEqual(
    result.results.map((item) => item.batchId),
    ["batch-head", "batch-tail"],
  );
  assert.deepEqual(
    listed.filter((entry) => entry[0] === "claim").map((entry) => entry[1]),
    ["batch-head", "batch-tail"],
  );
  assert.equal(
    listed.some(
      (entry) =>
        entry[0] === "list" &&
        (!entry[1] || Object.keys(entry[1]).length === 0),
    ),
    false,
  );
  await orchestrator.dispose();
});
