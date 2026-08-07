"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const domain = require("../src/domain");
const {
  createOperationalStore,
} = require("../src/infrastructure/operational-store/operational-store");
const {
  createRegularQueueGroupOrchestrator,
} = require("../desktop/services/regular-queue-group-orchestrator");
const {
  createRegularQueueGroupComposition,
} = require("../desktop/composition/regular-queue-group-composition");

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function fixture(options) {
  const value = options || {};
  const root =
    value.root || fs.mkdtempSync(path.join(os.tmpdir(), "ticket-08-"));
  const transitionPorts = {};
  const clockState = value.clockState || {
    value: "2026-08-07T00:00:00.000Z",
  };
  const store = createOperationalStore({
    workspaceRoot: root,
    transitionPorts,
    clock: () => new Date(clockState.value),
    internalRegularQueueTransitionFault: value.fault,
  });
  return {
    root,
    store,
    transitions: transitionPorts.regularQueueGroupTransitions,
    admission: transitionPorts.regularQueueTransitions,
    clockState,
    close(remove = true) {
      store.close();
      if (remove)
        fs.rmSync(root, {
          recursive: true,
          force: true,
          maxRetries: 3,
          retryDelay: 100,
        });
    },
  };
}

function addProfile(fixtureValue, platformId) {
  return fixtureValue.store.createAccountProfile({
    platformId,
    displayName: `${platformId} account`,
  });
}

function admit(fixtureValue, input) {
  const value = input || {};
  const articleId = value.articleId;
  const platformId = value.platformId || "toutiao";
  const accountProfileId = value.accountProfileId || "account-toutiao";
  return fixtureValue.admission.admitRegularQueueItem({
    articleId,
    clientId: value.clientId || "client-a",
    articleRef: {
      clientId: value.clientId || "client-a",
      articleId,
    },
    publicationId: `publication-${articleId}`,
    attemptId: `attempt-${articleId}`,
    itemId: `item-${articleId}`,
    batchId: `batch-${articleId}`,
    target: { kind: "platform", platformId, accountProfileId },
    publicationSnapshot: {
      articleId,
      title: `Title ${articleId}`,
      body: `Body ${articleId}`,
      fingerprint: "a".repeat(64),
    },
  });
}

function evidence(claim, overrides) {
  const title = `Prepared ${claim.articleIdentityV1.articleId}`;
  const body = `Prepared body ${claim.articleIdentityV1.articleId}`;
  return Object.assign(
    {
      version: 1,
      attemptId: claim.regularPublicationAttemptId,
      articleIdentityV1: claim.articleIdentityV1,
      targetIdentityV1: claim.targetIdentityV1,
      title,
      body,
      contentFingerprint: domain.preparedContentFingerprint({ title, body }),
      deliveryMode: "text_only",
      images: [],
      decisionKind: "initial",
    },
    overrides || {},
  );
}

function executorFor(prepare) {
  return Object.freeze({ preparePlatformSubmission: prepare });
}

test("V1 identity and prepared evidence owners recursively reject open or unsafe shapes", () => {
  assert.deepEqual(
    domain.parseArticleIdentityV1({
      version: 1,
      clientId: " client-a ",
      articleId: "article-a",
    }),
    { version: 1, clientId: "client-a", articleId: "article-a" },
  );
  assert.deepEqual(
    domain.parseTargetIdentityV1({
      version: 1,
      kind: "legacy-unknown-account",
      platformId: "toutiao",
      autoExecutable: false,
    }),
    {
      version: 1,
      kind: "legacy-unknown-account",
      platformId: "toutiao",
      autoExecutable: false,
    },
  );
  assert.throws(
    () =>
      domain.parseArticleIdentityV1({
        version: 1,
        clientId: "client-a",
        articleId: "article-a",
        path: "C:\\secret",
      }),
    { code: "DTO_UNKNOWN_FIELD" },
  );
  assert.throws(
    () =>
      domain.parseTargetIdentityV1({
        version: 1,
        kind: "legacy-unknown-account",
        platformId: "toutiao",
        autoExecutable: true,
      }),
    { code: "TARGET_IDENTITY_V1_INVALID" },
  );
  assert.throws(
    () =>
      domain.parseTargetIdentityV1({
        version: 1,
        kind: "legacy-unknown-account",
        platformId: "toutiao",
      }),
    { code: "TARGET_IDENTITY_V1_INVALID" },
  );

  const sampleClaim = {
    regularPublicationAttemptId: "attempt-a",
    articleIdentityV1: {
      version: 1,
      clientId: "client-a",
      articleId: "article-a",
    },
    targetIdentityV1: {
      version: 1,
      kind: "platform",
      platformId: "toutiao",
      accountProfileId: "account-a",
    },
  };
  const valid = evidence(sampleClaim);
  assert.deepEqual(domain.parsePreparedSubmissionEvidenceV1(valid), valid);
  assert.throws(
    () =>
      domain.parsePreparedSubmissionEvidenceV1({
        ...valid,
        token: "secret",
      }),
    { code: "DTO_UNKNOWN_FIELD" },
  );
  assert.throws(
    () =>
      domain.parsePreparedSubmissionEvidenceV1({
        ...valid,
        deliveryMode: "with_images",
      }),
    { code: "PREPARED_SUBMISSION_EVIDENCE_V1_INVALID" },
  );
  assert.throws(
    () =>
      domain.parsePreparedSubmissionEvidenceV1({
        ...valid,
        targetIdentityV1: {
          version: 1,
          kind: "media",
          mediaResourceId: "resource-a",
        },
      }),
    { code: "PREPARED_SUBMISSION_PLATFORM_TARGET_REQUIRED" },
  );
  const sparseImages = new Array(1);
  assert.throws(
    () =>
      domain.parsePreparedSubmissionEvidenceV1({
        ...valid,
        deliveryMode: "with_images",
        images: sparseImages,
      }),
    { code: "PREPARED_SUBMISSION_EVIDENCE_V1_INVALID" },
  );
});

test("PreparedSubmission exposes only evidence and named submit and refuses serialization", async () => {
  const sampleClaim = {
    regularPublicationAttemptId: "attempt-a",
    articleIdentityV1: {
      version: 1,
      clientId: "client-a",
      articleId: "article-a",
    },
    targetIdentityV1: {
      version: 1,
      kind: "platform",
      platformId: "toutiao",
      accountProfileId: "account-a",
    },
  };
  const privateState = { token: "never exposed" };
  const prepared = domain.createPreparedSubmission({
    preparedSubmissionEvidenceV1: evidence(sampleClaim),
    submitPreparedPublication: async () => ({
      status: "accepted",
      usedPrivateState: privateState.token === "never exposed",
    }),
  });
  assert.deepEqual(Object.keys(prepared).sort(), [
    "preparedSubmissionEvidenceV1",
    "submitPreparedPublication",
  ]);
  assert.equal(Object.isFrozen(prepared), true);
  assert.equal(Object.prototype.hasOwnProperty.call(prepared, "token"), false);
  assert.throws(() => JSON.stringify(prepared), {
    code: "PREPARED_SUBMISSION_NOT_SERIALIZABLE",
  });
  assert.deepEqual(await prepared.submitPreparedPublication(), {
    status: "accepted",
    usedPrivateState: true,
  });
  assert.throws(
    () =>
      domain.createPreparedSubmission({
        preparedSubmissionEvidenceV1: evidence(sampleClaim),
        submitPreparedPublication: async () => ({}),
        metadata: {},
      }),
    { code: "DTO_UNKNOWN_FIELD" },
  );
});

test("claim atomically selects the FIFO head and append preserves the running group tail", () => {
  const current = fixture();
  try {
    const profile = addProfile(current, "toutiao");
    const first = admit(current, {
      articleId: "article-a",
      accountProfileId: profile.accountProfileId,
    });
    const second = admit(current, {
      articleId: "article-b",
      accountProfileId: profile.accountProfileId,
    });
    current.transitions.startAllRegularQueueGroups();
    const claim = current.transitions.claimRegularQueueGroupHead({
      queueGroupId: first.queueGroupId,
      claimToken: "claim-a",
    });
    assert.equal(claim.itemId, first.itemId);
    assert.equal(claim.regularPublicationAttemptId, first.attemptId);
    assert.equal(
      current.transitions.claimRegularQueueGroupHead({
        queueGroupId: first.queueGroupId,
        claimToken: "claim-duplicate",
      }),
      null,
    );
    const appended = admit(current, {
      articleId: "article-c",
      accountProfileId: profile.accountProfileId,
    });
    assert.equal(appended.queueGroupId, first.queueGroupId);
    const snapshot = current.transitions.listRegularQueueGroupSnapshots({})[0];
    assert.equal(snapshot.current.itemId, first.itemId);
    assert.equal(snapshot.current.phase, "prepared");
    assert.deepEqual(
      snapshot.remaining.map((item) => item.itemId),
      [second.itemId, appended.itemId],
    );
    assert.deepEqual(
      snapshot.remaining.map((item) => item.position),
      [2, 3],
    );
  } finally {
    current.close();
  }
});

test("different groups submit concurrently while manual pause remains isolated", async () => {
  const current = fixture();
  const gates = new Map();
  const started = [];
  try {
    const toutiao = addProfile(current, "toutiao");
    const hepan = addProfile(current, "hepan");
    const first = admit(current, {
      articleId: "article-a",
      accountProfileId: toutiao.accountProfileId,
    });
    const second = admit(current, {
      articleId: "article-b",
      platformId: "hepan",
      accountProfileId: hepan.accountProfileId,
    });
    const orchestrator = createRegularQueueGroupOrchestrator({
      regularQueueGroupTransitions: current.transitions,
      randomUUID: (() => {
        let value = 0;
        return () => `uuid-${++value}`;
      })(),
      platformSubmissionExecutor: executorFor(async (claim) => {
        const gate = deferred();
        gates.set(claim.queueGroupId, gate);
        return domain.createPreparedSubmission({
          preparedSubmissionEvidenceV1: evidence(claim),
          submitPreparedPublication: async () => {
            started.push(claim.queueGroupId);
            await gate.promise;
            return { status: "accepted" };
          },
        });
      }),
    });
    const running = orchestrator.startAll();
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(
      new Set(started),
      new Set([first.queueGroupId, second.queueGroupId]),
    );
    orchestrator.pauseGroup({ queueGroupId: first.queueGroupId });
    assert.equal(
      orchestrator
        .snapshot()
        .find((group) => group.queueGroupId === first.queueGroupId)
        .manuallyPaused,
      true,
    );
    assert.equal(
      orchestrator
        .snapshot()
        .find((group) => group.queueGroupId === second.queueGroupId)
        .pauseIntent,
      "none",
    );
    gates.forEach((gate) => gate.resolve());
    const result = await running;
    assert.equal(result.results.length, 2);
  } finally {
    current.close();
  }
});

test("same-platform account groups are serialized until account-specific sessions exist", async () => {
  const current = fixture();
  const gates = [];
  const prepared = [];
  try {
    const firstProfile = addProfile(current, "toutiao");
    const secondProfile = addProfile(current, "toutiao");
    const first = admit(current, {
      articleId: "article-same-platform-a",
      accountProfileId: firstProfile.accountProfileId,
    });
    const second = admit(current, {
      articleId: "article-same-platform-b",
      accountProfileId: secondProfile.accountProfileId,
    });
    const orchestrator = createRegularQueueGroupOrchestrator({
      regularQueueGroupTransitions: current.transitions,
      platformSubmissionExecutor: executorFor(async (claim) => {
        const gate = deferred();
        gates.push(gate);
        prepared.push(claim.queueGroupId);
        return domain.createPreparedSubmission({
          preparedSubmissionEvidenceV1: evidence(claim),
          submitPreparedPublication: async () => {
            await gate.promise;
            return { status: "accepted" };
          },
        });
      }),
    });
    const running = orchestrator.startAll();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(prepared.length, 1);
    gates.forEach((gate) => gate.resolve());
    const result = await running;
    assert.deepEqual(result.results.map((item) => item.status).sort(), [
      "observation_ready",
      "platform_busy",
    ]);
    assert.deepEqual(
      new Set([first.queueGroupId, second.queueGroupId]).has(prepared[0]),
      true,
    );
  } finally {
    current.close();
  }
});

test("production preparation port verifies the account profile before adapter preparation", async () => {
  const {
    createRegularPlatformPreparationPort,
  } = require("../desktop/services/regular-platform-preparation-port");
  let verified = false;
  let preparations = 0;
  const claim = {
    platformId: "toutiao",
    accountProfileId: "account-a",
    regularPublicationAttemptId: "attempt-account-prepare",
    articleIdentityV1: {
      version: 1,
      clientId: "client-a",
      articleId: "article-account-prepare",
    },
    targetIdentityV1: {
      version: 1,
      kind: "platform",
      platformId: "toutiao",
      accountProfileId: "account-a",
    },
    publicationSnapshot: { title: "Title", body: "Body" },
  };
  const port = createRegularPlatformPreparationPort({
    accountInspector: {
      inspect: async () => ({
        verified,
        ...(verified
          ? {
              accountProfileId: "account-a",
              remoteFingerprint: "fingerprint-account-a",
            }
          : {}),
      }),
    },
    adapters: [
      {
        id: "toutiao",
        preparePlatformSubmission: async () => {
          preparations += 1;
          return domain.createPreparedSubmission({
            preparedSubmissionEvidenceV1:
              domain.createTextOnlyPreparedSubmissionEvidenceV1(claim),
            submitPreparedPublication: async () => ({ status: "accepted" }),
          });
        },
      },
    ],
  });
  await assert.rejects(port.preparePlatformSubmission(claim), {
    code: "REGULAR_ACCOUNT_PROFILE_UNVERIFIED",
  });
  assert.equal(preparations, 0);
  verified = true;
  await port.preparePlatformSubmission(claim);
  assert.equal(preparations, 1);
});

test("prepared browser submission rechecks the bound account immediately before submit", async () => {
  const {
    createRegularPlatformPreparationPort,
  } = require("../desktop/services/regular-platform-preparation-port");
  let inspections = 0;
  let submissions = 0;
  const claim = {
    platformId: "toutiao",
    accountProfileId: "account-a",
    regularPublicationAttemptId: "attempt-account-recheck",
    articleIdentityV1: {
      version: 1,
      clientId: "client-a",
      articleId: "article-account-recheck",
    },
    targetIdentityV1: {
      version: 1,
      kind: "platform",
      platformId: "toutiao",
      accountProfileId: "account-a",
    },
    publicationSnapshot: { title: "Title", body: "Body" },
  };
  const port = createRegularPlatformPreparationPort({
    accountInspector: {
      inspect: async () => {
        inspections += 1;
        return inspections === 1
          ? {
              verified: true,
              accountProfileId: "account-a",
              remoteFingerprint: "fingerprint-account-a",
            }
          : {
              verified: true,
              accountProfileId: "account-a",
              remoteFingerprint: "fingerprint-account-b",
            };
      },
    },
    adapters: [
      {
        id: "toutiao",
        preparePlatformSubmission: async () =>
          domain.createPreparedSubmission({
            preparedSubmissionEvidenceV1:
              domain.createTextOnlyPreparedSubmissionEvidenceV1(claim),
            submitPreparedPublication: async () => {
              submissions += 1;
              return { status: "accepted" };
            },
          }),
      },
    ],
  });

  const prepared = await port.preparePlatformSubmission(claim);
  assert.equal(inspections, 1);
  assert.deepEqual(await prepared.submitPreparedPublication(), {
    status: "uncertain",
    errorCode: "REGULAR_ACCOUNT_PROFILE_DRIFT",
  });
  assert.equal(inspections, 2);
  assert.equal(submissions, 0);
});

test("start all skips manually paused groups and pause all preserves the in-flight request", async () => {
  const current = fixture();
  const gate = deferred();
  const preparedGroups = [];
  try {
    const toutiao = addProfile(current, "toutiao");
    const hepan = addProfile(current, "hepan");
    const manual = admit(current, {
      articleId: "article-manual",
      accountProfileId: toutiao.accountProfileId,
    });
    const running = admit(current, {
      articleId: "article-running-a",
      platformId: "hepan",
      accountProfileId: hepan.accountProfileId,
    });
    const queued = admit(current, {
      articleId: "article-running-b",
      platformId: "hepan",
      accountProfileId: hepan.accountProfileId,
    });
    current.transitions.setRegularQueueGroupRunIntent({
      queueGroupId: manual.queueGroupId,
      running: false,
    });
    const orchestrator = createRegularQueueGroupOrchestrator({
      regularQueueGroupTransitions: current.transitions,
      platformSubmissionExecutor: executorFor(async (claim) => {
        preparedGroups.push(claim.queueGroupId);
        return domain.createPreparedSubmission({
          preparedSubmissionEvidenceV1: evidence(claim),
          submitPreparedPublication: async () => {
            await gate.promise;
            return { status: "accepted" };
          },
        });
      }),
    });
    const resultPromise = orchestrator.startAll();
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(preparedGroups, [running.queueGroupId]);
    const paused = orchestrator.pauseAll();
    assert.equal(
      paused.groups.find((group) => group.queueGroupId === running.queueGroupId)
        .pauseIntent,
      "system",
    );
    assert.equal(
      paused.groups.find((group) => group.queueGroupId === manual.queueGroupId)
        .pauseIntent,
      "manual",
    );
    assert.equal(
      paused.groups.find((group) => group.queueGroupId === running.queueGroupId)
        .current.itemId,
      running.itemId,
    );
    gate.resolve();
    await resultPromise;
    const snapshot = orchestrator
      .snapshot()
      .find((group) => group.queueGroupId === running.queueGroupId);
    assert.equal(snapshot.pauseIntent, "system");
    assert.deepEqual(
      snapshot.remaining.map((item) => item.itemId),
      [queued.itemId],
    );
  } finally {
    current.close();
  }
});

test("begin freezes complete evidence before submit and failures roll back without remote call", async () => {
  let armed = false;
  const current = fixture({
    fault(point) {
      if (armed && point === "after-evidence-freeze") {
        const error = new Error("synthetic persistence fault");
        error.code = "SYNTHETIC_PERSISTENCE_FAULT";
        throw error;
      }
    },
  });
  let submissions = 0;
  try {
    const profile = addProfile(current, "toutiao");
    const admitted = admit(current, {
      articleId: "article-a",
      accountProfileId: profile.accountProfileId,
    });
    const orchestrator = createRegularQueueGroupOrchestrator({
      regularQueueGroupTransitions: current.transitions,
      platformSubmissionExecutor: executorFor(async (claim) =>
        domain.createPreparedSubmission({
          preparedSubmissionEvidenceV1: evidence(claim),
          submitPreparedPublication: async () => {
            submissions += 1;
            return { status: "accepted" };
          },
        }),
      ),
    });
    armed = true;
    await assert.rejects(
      orchestrator.startGroup({ queueGroupId: admitted.queueGroupId }),
      { code: "SYNTHETIC_PERSISTENCE_FAULT" },
    );
    assert.equal(submissions, 0);
    const snapshot = orchestrator.snapshot()[0];
    assert.equal(snapshot.current.phase, "prepared");
    assert.equal(
      current.store.listPublicationRecords({ articleIds: ["article-a"] })[0]
        .status,
      "queued",
    );
  } finally {
    current.close();
  }
});

for (const faultPoint of [
  "after-head-claim",
  "after-prepared-intent",
  "after-group-current-item",
]) {
  test(`claim transaction rolls back every fact at ${faultPoint}`, () => {
    let armed = false;
    const current = fixture({
      fault(point) {
        if (armed && point === faultPoint) {
          const error = new Error("synthetic claim fault");
          error.code = "SYNTHETIC_CLAIM_FAULT";
          throw error;
        }
      },
    });
    try {
      const profile = addProfile(current, "toutiao");
      const admitted = admit(current, {
        articleId: `article-${faultPoint}`,
        accountProfileId: profile.accountProfileId,
      });
      current.transitions.startAllRegularQueueGroups();
      armed = true;
      assert.throws(
        () =>
          current.transitions.claimRegularQueueGroupHead({
            queueGroupId: admitted.queueGroupId,
            claimToken: `claim-${faultPoint}`,
          }),
        { code: "SYNTHETIC_CLAIM_FAULT" },
      );
      const snapshot = current.transitions.listRegularQueueGroupSnapshots(
        {},
      )[0];
      assert.equal(snapshot.current, null);
      assert.equal(snapshot.remaining[0].itemId, admitted.itemId);
      assert.equal(
        current.store.listPublicationRecords({
          articleIds: [admitted.articleId],
        })[0].status,
        "queued",
      );
    } finally {
      current.close();
    }
  });
}

for (const faultPoint of [
  "after-evidence-freeze",
  "after-attempt-remote-started",
  "after-publication-remote-started",
  "after-active-target-remote-started",
  "after-submission-start",
]) {
  test(`submission-start transaction rolls back every fact at ${faultPoint}`, () => {
    let armed = false;
    const current = fixture({
      fault(point) {
        if (armed && point === faultPoint) {
          const error = new Error("synthetic begin fault");
          error.code = "SYNTHETIC_BEGIN_FAULT";
          throw error;
        }
      },
    });
    try {
      const profile = addProfile(current, "toutiao");
      const admitted = admit(current, {
        articleId: `article-${faultPoint}`,
        accountProfileId: profile.accountProfileId,
      });
      current.transitions.startAllRegularQueueGroups();
      const claim = current.transitions.claimRegularQueueGroupHead({
        queueGroupId: admitted.queueGroupId,
        claimToken: `claim-${faultPoint}`,
      });
      const preparedEvidence = evidence(claim);
      armed = true;
      assert.throws(
        () =>
          current.transitions.beginRegularRemoteSubmission({
            regularPublicationAttemptId: claim.regularPublicationAttemptId,
            claimToken: claim.claimToken,
            preparedSubmissionEvidenceV1: preparedEvidence,
          }),
        { code: "SYNTHETIC_BEGIN_FAULT" },
      );
      const snapshot = current.transitions.listRegularQueueGroupSnapshots(
        {},
      )[0];
      assert.equal(snapshot.current.phase, "prepared");
      assert.equal(
        current.store.listPublicationRecords({
          articleIds: [admitted.articleId],
        })[0].status,
        "queued",
      );
      armed = false;
      const begun = current.transitions.beginRegularRemoteSubmission({
        regularPublicationAttemptId: claim.regularPublicationAttemptId,
        claimToken: claim.claimToken,
        preparedSubmissionEvidenceV1: preparedEvidence,
      });
      assert.equal(begun.phase, "remote_call_started");
    } finally {
      current.close();
    }
  });
}

test("startup pauses groups, expired prepared work reuses its attempt, and remote-started work never replays", async () => {
  const current = fixture();
  const root = current.root;
  let admitted;
  try {
    const profile = addProfile(current, "toutiao");
    admitted = admit(current, {
      articleId: "article-a",
      accountProfileId: profile.accountProfileId,
    });
    current.transitions.startAllRegularQueueGroups();
    const firstClaim = current.transitions.claimRegularQueueGroupHead({
      queueGroupId: admitted.queueGroupId,
      claimToken: "first-claim",
      leaseMs: 1000,
    });
    assert.equal(firstClaim.regularPublicationAttemptId, admitted.attemptId);
    current.close(false);

    const reopened = fixture({ root, clockState: current.clockState });
    try {
      const noRemoteExecutor = executorFor(async () => {
        throw new Error("must not prepare before explicit start");
      });
      const composition = createRegularQueueGroupComposition({
        regularQueueGroupTransitions: reopened.transitions,
        platformSubmissionExecutor: noRemoteExecutor,
      });
      assert.equal(
        composition.orchestrator.snapshot()[0].pauseIntent,
        "system",
      );
      reopened.clockState.value = "2026-08-07T00:00:02.000Z";
      let preparedAttempt = null;
      let preparedClaimToken = null;
      let frozenEvidence = null;
      const resumed = createRegularQueueGroupOrchestrator({
        regularQueueGroupTransitions: reopened.transitions,
        platformSubmissionExecutor: executorFor(async (claim) => {
          preparedAttempt = claim.regularPublicationAttemptId;
          preparedClaimToken = claim.claimToken;
          frozenEvidence = evidence(claim);
          return domain.createPreparedSubmission({
            preparedSubmissionEvidenceV1: frozenEvidence,
            submitPreparedPublication: async () => ({ status: "accepted" }),
          });
        }),
      });
      const result = await resumed.startAll();
      assert.equal(preparedAttempt, admitted.attemptId);
      assert.equal(result.results[0].status, "observation_ready");
      const boundary = reopened.transitions.beginRegularRemoteSubmission({
        regularPublicationAttemptId: admitted.attemptId,
        claimToken: preparedClaimToken,
        preparedSubmissionEvidenceV1: frozenEvidence,
      });
      assert.equal(boundary.idempotent, true);
      assert.equal(
        reopened.transitions.claimRegularQueueGroupHead({
          queueGroupId: admitted.queueGroupId,
          claimToken: "forbidden-replay",
        }),
        null,
      );
    } finally {
      reopened.close();
    }
  } catch (error) {
    if (fs.existsSync(root)) current.close();
    throw error;
  }
});

test("an expired claimant cannot begin after a new owner takes the lease", () => {
  const current = fixture();
  try {
    const profile = addProfile(current, "toutiao");
    const admitted = admit(current, {
      articleId: "article-stale-owner",
      accountProfileId: profile.accountProfileId,
    });
    current.transitions.startAllRegularQueueGroups();
    const stale = current.transitions.claimRegularQueueGroupHead({
      queueGroupId: admitted.queueGroupId,
      claimToken: "claim-stale",
      leaseMs: 1000,
    });
    current.clockState.value = "2026-08-07T00:00:02.000Z";
    const owner = current.transitions.claimRegularQueueGroupHead({
      queueGroupId: admitted.queueGroupId,
      claimToken: "claim-owner",
      leaseMs: 30000,
    });
    assert.equal(
      owner.regularPublicationAttemptId,
      stale.regularPublicationAttemptId,
    );
    assert.throws(
      () =>
        current.transitions.beginRegularRemoteSubmission({
          regularPublicationAttemptId: stale.regularPublicationAttemptId,
          claimToken: stale.claimToken,
          preparedSubmissionEvidenceV1: evidence(stale),
        }),
      { code: "REGULAR_SUBMISSION_CLAIM_STALE" },
    );
    const begun = current.transitions.beginRegularRemoteSubmission({
      regularPublicationAttemptId: owner.regularPublicationAttemptId,
      claimToken: owner.claimToken,
      preparedSubmissionEvidenceV1: evidence(owner),
    });
    assert.equal(begun.submitAuthorized, true);
  } finally {
    current.close();
  }
});

test("a transition-specific renewal keeps a long preparation lease valid", () => {
  const current = fixture();
  try {
    const profile = addProfile(current, "toutiao");
    const admitted = admit(current, {
      articleId: "article-renewed-owner",
      accountProfileId: profile.accountProfileId,
    });
    current.transitions.startAllRegularQueueGroups();
    const claim = current.transitions.claimRegularQueueGroupHead({
      queueGroupId: admitted.queueGroupId,
      claimToken: "claim-renewed",
      leaseMs: 1000,
    });
    current.clockState.value = "2026-08-07T00:00:00.500Z";
    const renewed = current.transitions.renewRegularQueueGroupClaim({
      regularPublicationAttemptId: claim.regularPublicationAttemptId,
      claimToken: claim.claimToken,
      leaseMs: 2000,
    });
    assert.equal(renewed.claimUntil, "2026-08-07T00:00:02.500Z");
    current.clockState.value = "2026-08-07T00:00:02.000Z";
    const begun = current.transitions.beginRegularRemoteSubmission({
      regularPublicationAttemptId: claim.regularPublicationAttemptId,
      claimToken: claim.claimToken,
      preparedSubmissionEvidenceV1: evidence(claim),
    });
    assert.equal(begun.submitAuthorized, true);
  } finally {
    current.close();
  }
});

test("a lease is stale at its exact claim-until instant", () => {
  const current = fixture();
  try {
    const profile = addProfile(current, "toutiao");
    const admitted = admit(current, {
      articleId: "article-exact-lease-boundary",
      accountProfileId: profile.accountProfileId,
    });
    current.transitions.startAllRegularQueueGroups();
    const claim = current.transitions.claimRegularQueueGroupHead({
      queueGroupId: admitted.queueGroupId,
      claimToken: "claim-exact-boundary",
      leaseMs: 1000,
    });
    current.clockState.value = claim.claimUntil;
    assert.throws(
      () =>
        current.transitions.renewRegularQueueGroupClaim({
          regularPublicationAttemptId: claim.regularPublicationAttemptId,
          claimToken: claim.claimToken,
          leaseMs: 1000,
        }),
      { code: "REGULAR_SUBMISSION_CLAIM_STALE" },
    );
    assert.throws(
      () =>
        current.transitions.beginRegularRemoteSubmission({
          regularPublicationAttemptId: claim.regularPublicationAttemptId,
          claimToken: claim.claimToken,
          preparedSubmissionEvidenceV1: evidence(claim),
        }),
      { code: "REGULAR_SUBMISSION_PHASE_INVALID" },
    );
  } finally {
    current.close();
  }
});

test("an idempotent submission-start read never authorizes another remote call", async () => {
  let submissions = 0;
  const preparedEvidence = {
    version: 1,
    attemptId: "attempt-a",
    articleIdentityV1: {
      version: 1,
      clientId: "client-a",
      articleId: "article-a",
    },
    targetIdentityV1: {
      version: 1,
      kind: "platform",
      platformId: "toutiao",
      accountProfileId: "account-a",
    },
    title: "Title",
    body: "Body",
    contentFingerprint: domain.preparedContentFingerprint({
      title: "Title",
      body: "Body",
    }),
    deliveryMode: "text_only",
    images: [],
    decisionKind: "initial",
  };
  const transitions = Object.freeze({
    beginRegularRemoteSubmission: () => ({
      idempotent: true,
      submitAuthorized: false,
    }),
    claimRegularQueueGroupHead: () => ({
      queueGroupId: "group-a",
      regularPublicationAttemptId: "attempt-a",
      claimToken: "claim-a",
      articleIdentityV1: preparedEvidence.articleIdentityV1,
      targetIdentityV1: preparedEvidence.targetIdentityV1,
    }),
    listRegularQueueGroupSnapshots: () => [
      { queueGroupId: "group-a", platformId: "toutiao" },
    ],
    pauseAllRegularQueueGroups: () => ({ groups: [] }),
    pauseRegularQueueGroupsOnStartup: () => ({ groups: [] }),
    renewRegularQueueGroupClaim: () => ({}),
    setRegularQueueGroupRunIntent: () => ({ queueGroupId: "group-a" }),
    startAllRegularQueueGroups: () => ({ changedCount: 0, groups: [] }),
  });
  const orchestrator = createRegularQueueGroupOrchestrator({
    regularQueueGroupTransitions: transitions,
    platformSubmissionExecutor: executorFor(async () =>
      domain.createPreparedSubmission({
        preparedSubmissionEvidenceV1: preparedEvidence,
        submitPreparedPublication: async () => {
          submissions += 1;
          return { status: "accepted" };
        },
      }),
    ),
  });
  const result = await orchestrator.startGroup({ queueGroupId: "group-a" });
  assert.equal(submissions, 0);
  assert.equal(result.status, "submission_already_started");
});

test("composition and orchestrator receive only queue-group transitions and the single-item executor", () => {
  const current = fixture();
  try {
    assert.deepEqual(Object.keys(current.transitions).sort(), [
      "beginRegularRemoteSubmission",
      "claimRegularQueueGroupHead",
      "listRegularQueueGroupSnapshots",
      "pauseAllRegularQueueGroups",
      "pauseRegularQueueGroupsOnStartup",
      "renewRegularQueueGroupClaim",
      "setRegularQueueGroupRunIntent",
      "startAllRegularQueueGroups",
    ]);
    assert.equal(
      Object.prototype.hasOwnProperty.call(
        current.transitions,
        "commitRemoteOutcome",
      ),
      false,
    );
    assert.equal(
      Object.prototype.hasOwnProperty.call(
        current.transitions,
        "admitPaidBatch",
      ),
      false,
    );
    assert.throws(
      () =>
        createRegularQueueGroupOrchestrator({
          regularQueueGroupTransitions: current.store,
          platformSubmissionExecutor: executorFor(async () => ({})),
        }),
      { code: "REGULAR_QUEUE_GROUP_TRANSITIONS_INVALID" },
    );
    assert.throws(
      () =>
        createRegularQueueGroupOrchestrator({
          regularQueueGroupTransitions: current.transitions,
          platformSubmissionExecutor: {
            preparePlatformSubmission: async () => ({}),
            publish: async () => ({}),
          },
        }),
      { code: "REGULAR_PLATFORM_EXECUTOR_INVALID" },
    );
  } finally {
    current.close();
  }
});

test("all regular platform adapters expose the PreparedSubmission preparation seam", () => {
  const adapters = [
    require("../src/platforms/toutiao/adapter"),
    require("../src/platforms/lieju/adapter"),
    require("../src/platforms/hepan/adapter"),
  ];
  for (const adapter of adapters)
    assert.equal(typeof adapter.preparePlatformSubmission, "function");
});

test("browser adapters finish form preparation before exposing the final-submit capability", () => {
  for (const platformId of ["toutiao", "lieju"]) {
    const source = fs.readFileSync(
      path.join(__dirname, "..", "src", "platforms", platformId, "adapter.js"),
      "utf8",
    );
    const start = source.indexOf("async function preparePlatformSubmission");
    const end = source.indexOf("\nfunction isStopError", start);
    const preparation = source.slice(start, end);
    assert.notEqual(start, -1, platformId);
    assert.match(preparation, /await prepareArticleSubmission\(/, platformId);
    assert.doesNotMatch(preparation, /publishArticle\(/, platformId);
    assert.match(source, /function preparedContentMatches\(/, platformId);
    if (platformId === "lieju")
      assert.match(
        source,
        /status: "uncertain", errorCode: "PREPARED_CONTENT_DRIFT"/,
        platformId,
      );
    else assert.match(source, /driftError\.code = "PREPARED_CONTENT_DRIFT"/);
  }

  const toutiaoSource = fs.readFileSync(
    path.join(__dirname, "..", "src", "platforms", "toutiao", "adapter.js"),
    "utf8",
  );
  const preparationStart = toutiaoSource.indexOf(
    "async function prepareArticleSubmission",
  );
  const capabilityStart = toutiaoSource.indexOf(
    "submitPreparedPublication: async function",
    preparationStart,
  );
  const capabilityEnd = toutiaoSource.indexOf(
    "async function publishArticle",
    capabilityStart,
  );
  const preparation = toutiaoSource.slice(preparationStart, capabilityStart);
  const capability = toutiaoSource.slice(capabilityStart, capabilityEnd);
  assert.match(preparation, /clickPreviewAndPublish\(\)/);
  assert.match(preparation, /confirmAdDialog\(\)/);
  assert.doesNotMatch(capability, /clickPreviewAndPublish\(\)/);
  assert.doesNotMatch(capability, /confirmAdDialog\(\)/);
  assert.match(capability, /clickConfirmPublish\(\)/);
});

test("Hepan preparation creates the final payload before submission-start", async () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "ticket-08-hepan-prepare-"),
  );
  const payloadRoot = path.join(root, "payloads");
  const cookiePath = path.join(root, "cookie.txt");
  fs.writeFileSync(cookiePath, "uid=synthetic", "utf8");
  let commands = 0;
  try {
    const { createHepanAdapter } = require("../src/platforms/hepan/adapter");
    const adapter = createHepanAdapter({
      tempDir: payloadRoot,
      runtime: {
        pythonPath: "python",
        cookiePath,
        categoryId: 121,
        vendorDir: "",
      },
      runCommand: async () => {
        commands += 1;
        return {
          status: 0,
          stdout: JSON.stringify({
            ok: true,
            title: "Prepared",
            url: "https://example.test/article?aid=remote-a",
          }),
          stderr: "",
        };
      },
    });
    const claim = {
      platformId: "hepan",
      regularPublicationAttemptId: "attempt-hepan-prepare",
      articleIdentityV1: {
        version: 1,
        clientId: "client-a",
        articleId: "article-hepan-prepare",
      },
      targetIdentityV1: {
        version: 1,
        kind: "platform",
        platformId: "hepan",
        accountProfileId: "account-hepan",
      },
      publicationSnapshot: { title: "Prepared", body: "Prepared body" },
    };
    const prepared = await adapter.preparePlatformSubmission(claim);
    assert.equal(commands, 0);
    assert.equal(fs.readdirSync(payloadRoot).length, 1);
    const outcome = await prepared.submitPreparedPublication();
    assert.equal(commands, 1);
    assert.equal(outcome.status, "accepted");
    assert.equal(fs.existsSync(payloadRoot), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("Hepan production preparation owns temporary credential cleanup", async () => {
  const {
    createHepanRegularPreparationAdapter,
  } = require("../desktop/services/hepan-regular-preparation-adapter");
  let cookieCleanups = 0;
  let cookieCreations = 0;
  let expiredCleanups = 0;
  let preparedRuntime = null;
  let rejectSubmission = false;
  const claim = {
    platformId: "hepan",
    regularPublicationAttemptId: "attempt-hepan-runtime",
    articleIdentityV1: {
      version: 1,
      clientId: "client-a",
      articleId: "article-hepan-runtime",
    },
    targetIdentityV1: {
      version: 1,
      kind: "platform",
      platformId: "hepan",
      accountProfileId: "account-hepan",
    },
    publicationSnapshot: { title: "Title", body: "Body" },
  };
  const preparedEvidence =
    domain.createTextOnlyPreparedSubmissionEvidenceV1(claim);
  const adapter = createHepanRegularPreparationAdapter({
    paths: { tmp: "C:\\synthetic-tmp" },
    platformSettingsService: {
      getAdapterForRuntime: () => ({
        config: {
          pythonPath: "C:\\python.exe",
          categoryId: 121,
          vendorDir: "",
        },
        adapter: {
          cleanupExpiredTemporaryFiles: () => {
            expiredCleanups += 1;
          },
          createTemporaryCookie: () => {
            cookieCreations += 1;
            return {
              cookiePath: "C:\\synthetic-cookie.tmp",
              cleanup: () => {
                cookieCleanups += 1;
              },
            };
          },
        },
      }),
    },
    cleanupExpiredHepanPayloads: () => {
      expiredCleanups += 1;
    },
    createHepanAdapter: (options) => {
      preparedRuntime = options.runtime;
      return {
        preparePlatformSubmission: async () =>
          domain.createPreparedSubmission({
            preparedSubmissionEvidenceV1: preparedEvidence,
            submitPreparedPublication: async () => {
              if (rejectSubmission) throw new Error("synthetic submit failure");
              return { status: "accepted" };
            },
          }),
      };
    },
  });
  const prepared = await adapter.preparePlatformSubmission(claim);
  assert.equal(expiredCleanups, 2);
  assert.equal(cookieCreations, 0);
  assert.equal(cookieCleanups, 0);
  assert.equal(preparedRuntime.cookiePath, "");
  assert.deepEqual(await prepared.submitPreparedPublication(), {
    status: "accepted",
  });
  assert.equal(cookieCreations, 1);
  assert.equal(cookieCleanups, 1);

  rejectSubmission = true;
  const rejected = await adapter.preparePlatformSubmission(claim);
  await assert.rejects(rejected.submitPreparedPublication(), {
    message: "synthetic submit failure",
  });
  assert.equal(cookieCreations, 2);
  assert.equal(cookieCleanups, 2);
});

test("Hepan does not materialize a temporary credential when submission-start fails", async () => {
  const {
    createHepanRegularPreparationAdapter,
  } = require("../desktop/services/hepan-regular-preparation-adapter");
  const current = fixture({
    fault(point) {
      if (point === "after-evidence-freeze") {
        const error = new Error("synthetic begin failure");
        error.code = "SYNTHETIC_BEGIN_FAULT";
        throw error;
      }
    },
  });
  let cookieCreations = 0;
  try {
    const profile = addProfile(current, "hepan");
    const admitted = admit(current, {
      articleId: "article-hepan-begin-failure",
      platformId: "hepan",
      accountProfileId: profile.accountProfileId,
    });
    const adapter = createHepanRegularPreparationAdapter({
      paths: { tmp: "C:\\synthetic-tmp" },
      platformSettingsService: {
        getAdapterForRuntime: () => ({
          config: {
            pythonPath: "C:\\python.exe",
            categoryId: 121,
            vendorDir: "",
          },
          adapter: {
            cleanupExpiredTemporaryFiles: () => {},
            createTemporaryCookie: () => {
              cookieCreations += 1;
              return {
                cookiePath: "C:\\synthetic-cookie.tmp",
                cleanup: () => {},
              };
            },
          },
        }),
      },
      cleanupExpiredHepanPayloads: () => {},
      createHepanAdapter: () => ({
        preparePlatformSubmission: async (claim) =>
          domain.createPreparedSubmission({
            preparedSubmissionEvidenceV1: evidence(claim),
            submitPreparedPublication: async () => ({ status: "accepted" }),
          }),
      }),
    });
    const orchestrator = createRegularQueueGroupOrchestrator({
      regularQueueGroupTransitions: current.transitions,
      platformSubmissionExecutor: executorFor((claim) =>
        adapter.preparePlatformSubmission(claim),
      ),
    });

    await assert.rejects(
      orchestrator.startGroup({ queueGroupId: admitted.queueGroupId }),
      { code: "SYNTHETIC_BEGIN_FAULT" },
    );
    assert.equal(cookieCreations, 0);
  } finally {
    current.close();
  }
});
