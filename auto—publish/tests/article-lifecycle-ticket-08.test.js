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
const {
  createRegularPlatformPreparationPort,
} = require("../desktop/services/regular-platform-preparation-port");

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
  const admission = {
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
  };
  if (value.imageCount !== undefined)
    admission.queueConfig = { imageCount: value.imageCount };
  return fixtureValue.admission.admitRegularQueueItem(admission);
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

function imagePlan(imageCount) {
  const images =
    imageCount > 0
      ? Array.from({ length: imageCount }, (_, index) =>
          Object.freeze({
            imageId: `client-image:fixture-image-${index}`,
            name: `fixture-image-${index}.png`,
            extension: ".png",
            mimeType: "image/png",
            width: 80,
            height: 40,
            size: 120,
          }),
        )
      : [];
  return Object.freeze({
    version: 1,
    requestedCount: imageCount,
    selectedCount: images.length,
    textOnly: images.length === 0,
    images: Object.freeze(images),
    warnings: Object.freeze([]),
  });
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
  assert.equal(
    domain.preparedContentFingerprint({
      title: "标题",
      body: "正文\nsecond line",
    }),
    "b4be445cb5891d838a7bc1751ece7fd08b4b84fafe6d68ce1581ba707511a809",
  );
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
  let markSecondPrepared;
  const secondPrepared = new Promise((resolve) => {
    markSecondPrepared = resolve;
  });
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
        if (prepared.length === 2) markSecondPrepared();
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
    gates[0].resolve();
    await secondPrepared;
    assert.equal(prepared.length, 2);
    gates[1].resolve();
    const result = await running;
    assert.deepEqual(
      result.results.map((item) => item.status),
      ["observation_ready", "observation_ready"],
    );
    assert.deepEqual(
      new Set(prepared),
      new Set([first.queueGroupId, second.queueGroupId]),
    );
  } finally {
    current.close();
  }
});

test("production preparation port verifies the account profile before adapter preparation", async () => {
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
    regularImagePlanService: {
      createPlan: async (request) => imagePlan(request.imageCount),
    },
    regularSubmissionPorts: [
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

test("prepared browser submission rejects account drift before the remote boundary", async () => {
  let inspections = 0;
  let submissions = 0;
  const inspectionTasks = [];
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
      inspect: async (task) => {
        inspectionTasks.push(task);
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
    regularImagePlanService: {
      createPlan: async (request) => imagePlan(request.imageCount),
    },
    regularSubmissionPorts: [
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

  await assert.rejects(port.preparePlatformSubmission(claim), {
    code: "REGULAR_ACCOUNT_PROFILE_UNVERIFIED",
  });
  assert.equal(inspections, 2);
  assert.equal(inspectionTasks[0].preserveCurrentPage, false);
  assert.equal(inspectionTasks[1].preserveCurrentPage, true);
  assert.equal(submissions, 0);
});

test("queue execution does not begin remote submission when final account verification fails", async () => {
  const current = fixture();
  let inspections = 0;
  let submissions = 0;
  const beginCalls = [];
  try {
    const profile = addProfile(current, "toutiao");
    const admitted = admit(current, {
      articleId: "article-account-boundary",
      accountProfileId: profile.accountProfileId,
    });
    const transitions = Object.fromEntries(
      Object.keys(current.transitions).map((method) => [
        method,
        current.transitions[method],
      ]),
    );
    transitions.beginRegularRemoteSubmission = (input) => {
      beginCalls.push(input);
      return current.transitions.beginRegularRemoteSubmission(input);
    };
    const port = createRegularPlatformPreparationPort({
      accountInspector: {
        inspect: async () => {
          inspections += 1;
          return {
            verified: true,
            accountProfileId: profile.accountProfileId,
            remoteFingerprint:
              inspections === 1 ? "fingerprint-a" : "fingerprint-b",
          };
        },
      },
      regularImagePlanService: {
        createPlan: async (request) => imagePlan(request.imageCount),
      },
      regularSubmissionPorts: [
        {
          id: "toutiao",
          preparePlatformSubmission: async (claim) =>
            domain.createPreparedSubmission({
              preparedSubmissionEvidenceV1:
                domain.createTextOnlyPreparedSubmissionEvidenceV1(claim),
              submitPreparedPublication: async () => {
                submissions += 1;
                return { status: "accepted", remoteId: "should-not-submit" };
              },
            }),
        },
      ],
    });
    const orchestrator = createRegularQueueGroupOrchestrator({
      regularQueueGroupTransitions: transitions,
      platformSubmissionExecutor: port,
      regularPlatformOutcomeService: {
        applyRegularOutcome: (input) => input.outcome,
      },
    });

    const result = await orchestrator.startGroup({
      queueGroupId: admitted.queueGroupId,
    });

    assert.equal(result.status, "observation_ready");
    assert.equal(result.observation.status, "group_blocked");
    assert.equal(
      result.observation.errorCode,
      "REGULAR_ACCOUNT_PROFILE_UNVERIFIED",
    );
    assert.equal(result.observation.articleRecoverable, true);
    assert.equal(inspections, 2);
    assert.equal(beginCalls.length, 0);
    assert.equal(submissions, 0);
  } finally {
    current.close();
  }
});

test("preparation resolves the Lieju profile by the claimed article client and passes only prepared data to the adapter", async () => {
  const claims = [];
  const profileRequests = [];
  const claim = {
    platformId: "lieju",
    accountProfileId: "account-a",
    regularPublicationAttemptId: "attempt-client-profile",
    articleIdentityV1: { version: 1, clientId: "client-b", articleId: "article-b" },
    targetIdentityV1: { version: 1, kind: "platform", platformId: "lieju", accountProfileId: "account-a" },
    publicationSnapshot: { title: "Title B", body: "Body B" },
  };
  const port = createRegularPlatformPreparationPort({
    accountInspector: { inspect: async () => ({ verified: true, accountProfileId: "account-a", remoteFingerprint: "fingerprint-a" }) },
    regularImagePlanService: {
      createPlan: async (request) => imagePlan(request.imageCount),
    },
    clientProfileReaders: [{
      id: "lieju",
      requirement: {
        profileKey: "lieju",
        requiredFields: ["city", "contact", "phone"],
      },
      reader: { read: async (input) => {
        profileRequests.push(input);
        return input.clientId === "client-b"
          ? { city: "北京", contact: "李四", phone: "010-12345678" }
          : { city: "上海", contact: "张三", phone: "13800138000" };
      } },
    }],
    regularSubmissionPorts: [{
      id: "lieju",
      preparePlatformSubmission: async (input) => {
        claims.push(input);
        return domain.createPreparedSubmission({
          preparedSubmissionEvidenceV1: domain.createTextOnlyPreparedSubmissionEvidenceV1(input),
          submitPreparedPublication: async () => ({ status: "accepted" }),
        });
      },
    }],
  });

  await port.preparePlatformSubmission(claim);
  assert.deepStrictEqual(profileRequests, [{ clientId: "client-b" }]);
  assert.deepStrictEqual(claims[0].publicationProfile, {
    city: "北京", contact: "李四", phone: "010-12345678",
  });
  assert.equal(claims[0].publicationSnapshot.title, "Title B");
  assert.equal(claims[0].publicationSnapshot.body, "Body B");
});

test("missing client publication profile is normalized before the platform adapter runs", async () => {
  let adapterCalls = 0;
  const claim = {
    platformId: "lieju",
    accountProfileId: "account-a",
    regularPublicationAttemptId: "attempt-missing-client-profile",
    articleIdentityV1: {
      version: 1,
      clientId: "client-missing-profile",
      articleId: "article-missing-profile",
    },
    targetIdentityV1: {
      version: 1,
      kind: "platform",
      platformId: "lieju",
      accountProfileId: "account-a",
    },
    publicationSnapshot: { title: "Title", body: "Body" },
  };
  const port = createRegularPlatformPreparationPort({
    accountInspector: {
      inspect: async () => ({
        verified: true,
        accountProfileId: "account-a",
        remoteFingerprint: "fingerprint-a",
      }),
    },
    regularImagePlanService: {
      createPlan: async (request) => imagePlan(request.imageCount),
    },
    clientProfileReaders: [
      {
        id: "lieju",
        requirement: {
          profileKey: "lieju",
          requiredFields: ["city", "contact", "phone"],
        },
        reader: {
          read: async () => {
            const error = new Error("client publication profile missing");
            error.code = "CLIENT_PROFILE_NOT_FOUND";
            throw error;
          },
        },
      },
    ],
    regularSubmissionPorts: [
      {
        id: "lieju",
        preparePlatformSubmission: async (input) => {
          adapterCalls += 1;
          return domain.createPreparedSubmission({
            preparedSubmissionEvidenceV1:
              domain.createTextOnlyPreparedSubmissionEvidenceV1(input),
            submitPreparedPublication: async () => ({ status: "accepted" }),
          });
        },
      },
    ],
  });

  await assert.rejects(port.preparePlatformSubmission(claim), {
    code: "REGULAR_CLIENT_PROFILE_INCOMPLETE",
  });
  assert.equal(adapterCalls, 0);
});

test("preparation obtains one image plan after account verification and passes it through the common adapter seam", async () => {
  const events = [];
  const planRequests = [];
  const adapterCalls = [];
  const adapters = ["lieju", "toutiao", "hepan"].map((platformId) => ({
    id: platformId,
    async preparePlatformSubmission(claim, plan) {
      events.push(`${platformId}:adapter`);
      adapterCalls.push({ claim, plan });
      return domain.createPreparedSubmission({
        preparedSubmissionEvidenceV1:
          domain.createTextOnlyPreparedSubmissionEvidenceV1(claim),
        submitPreparedPublication: async () => ({ status: "accepted" }),
      });
    },
  }));
  const port = createRegularPlatformPreparationPort({
    accountInspector: {
      inspect: async (task) => {
        events.push(
          `${task.targetPlatformId}:inspect:${task.preserveCurrentPage}`,
        );
        return {
          verified: true,
          accountProfileId: task.accountProfileId,
          remoteFingerprint: `fingerprint-${task.accountProfileId}`,
        };
      },
    },
    regularImagePlanService: {
      createPlan: async (request) => {
        events.push(`${request.clientId}:plan`);
        planRequests.push(request);
        return imagePlan(request.imageCount);
      },
    },
    regularSubmissionPorts: adapters,
  });

  for (const platformId of ["lieju", "toutiao", "hepan"]) {
    const claim = {
      platformId,
      accountProfileId: `account-${platformId}`,
      imageCount: 2,
      regularPublicationAttemptId: `attempt-image-seam-${platformId}`,
      articleIdentityV1: {
        version: 1,
        clientId: `client-${platformId}`,
        articleId: `article-${platformId}`,
      },
      targetIdentityV1: {
        version: 1,
        kind: "platform",
        platformId,
        accountProfileId: `account-${platformId}`,
      },
      publicationSnapshot: { title: "Title", body: "Body" },
    };
    const prepared = await port.preparePlatformSubmission(claim);
    assert.deepEqual(
      {
        deliveryMode: prepared.preparedSubmissionEvidenceV1.deliveryMode,
        images: prepared.preparedSubmissionEvidenceV1.images,
        decisionKind: prepared.preparedSubmissionEvidenceV1.decisionKind,
      },
      { deliveryMode: "text_only", images: [], decisionKind: "initial" },
    );
  }

  assert.deepEqual(planRequests, [
    { clientId: "client-lieju", imageCount: 2 },
    { clientId: "client-toutiao", imageCount: 2 },
    { clientId: "client-hepan", imageCount: 2 },
  ]);
  assert.deepEqual(
    events,
    [
      "lieju:inspect:false",
      "client-lieju:plan",
      "lieju:adapter",
      "lieju:inspect:true",
      "toutiao:inspect:false",
      "client-toutiao:plan",
      "toutiao:adapter",
      "toutiao:inspect:true",
      "hepan:inspect:false",
      "client-hepan:plan",
      "hepan:adapter",
      "hepan:inspect:true",
    ],
  );
  assert.equal(adapterCalls.length, 3);
  for (const call of adapterCalls) {
    assert.equal(call.plan.requestedCount, 2);
    assert.equal("imagePlan" in call.claim, false);
    assert.equal("images" in call.claim, false);
  }
});

test("recoverable image-plan faults downgrade to text-only before the submission boundary", async () => {
  const current = fixture();
  let planCalls = 0;
  let submissions = 0;
  const beginCalls = [];
  try {
    const profile = addProfile(current, "toutiao");
    const admitted = admit(current, {
      articleId: "article-image-plan-recoverable",
      accountProfileId: profile.accountProfileId,
      imageCount: 3,
    });
    const transitions = Object.fromEntries(
      Object.keys(current.transitions).map((method) => [
        method,
        current.transitions[method],
      ]),
    );
    transitions.beginRegularRemoteSubmission = (input) => {
      beginCalls.push(input);
      return current.transitions.beginRegularRemoteSubmission(input);
    };
    const port = createRegularPlatformPreparationPort({
      accountInspector: {
        inspect: async () => ({
          verified: true,
          accountProfileId: profile.accountProfileId,
          remoteFingerprint: "fingerprint-image-plan-recoverable",
        }),
      },
      regularImagePlanService: {
        createPlan: async () => {
          planCalls += 1;
          const error = new Error("temporary image directory read failure");
          error.code = "EIO";
          throw error;
        },
      },
      regularSubmissionPorts: [
        {
          id: "toutiao",
          async preparePlatformSubmission(claim, plan) {
            assert.deepEqual(plan, {
              version: 1,
              requestedCount: 3,
              selectedCount: 0,
              textOnly: true,
              images: [],
              warnings: [
                { code: "REGULAR_IMAGE_PLAN_UNAVAILABLE", stage: "selection" },
              ],
            });
            return domain.createPreparedSubmission({
              preparedSubmissionEvidenceV1:
                domain.createTextOnlyPreparedSubmissionEvidenceV1(claim),
              submitPreparedPublication: async () => {
                submissions += 1;
                return { status: "accepted", remoteId: "text-only-accepted" };
              },
            });
          },
        },
      ],
    });
    const orchestrator = createRegularQueueGroupOrchestrator({
      regularQueueGroupTransitions: transitions,
      platformSubmissionExecutor: port,
    });

    const result = await orchestrator.startGroup({
      queueGroupId: admitted.queueGroupId,
    });

    assert.equal(result.status, "observation_ready");
    assert.equal(result.observation.status, "accepted");
    assert.equal(planCalls, 1);
    assert.equal(submissions, 1);
    assert.equal(beginCalls.length, 1);
    assert.deepEqual(
      {
        deliveryMode: beginCalls[0].preparedSubmissionEvidenceV1.deliveryMode,
        images: beginCalls[0].preparedSubmissionEvidenceV1.images,
        decisionKind: beginCalls[0].preparedSubmissionEvidenceV1.decisionKind,
      },
      { deliveryMode: "text_only", images: [], decisionKind: "initial" },
    );
  } finally {
    current.close();
  }
});

test("adapter image preparation may retain only actual successful images or continue as text", async () => {
  for (const scenario of [
    {
      name: "partial",
      expected: {
        deliveryMode: "with_images",
        images: [
          {
            assetFingerprint: "b".repeat(64),
            layoutSlot: 7,
          },
        ],
      },
    },
    {
      name: "all-failed",
      expected: { deliveryMode: "text_only", images: [] },
    },
  ]) {
    const current = fixture();
    const beginCalls = [];
    try {
      const profile = addProfile(current, "toutiao");
      const admitted = admit(current, {
        articleId: `article-image-adapter-${scenario.name}`,
        accountProfileId: profile.accountProfileId,
        imageCount: 2,
      });
      const transitions = Object.fromEntries(
        Object.keys(current.transitions).map((method) => [
          method,
          current.transitions[method],
        ]),
      );
      transitions.beginRegularRemoteSubmission = (input) => {
        beginCalls.push(input);
        return current.transitions.beginRegularRemoteSubmission(input);
      };
      const port = createRegularPlatformPreparationPort({
        accountInspector: {
          inspect: async () => ({
            verified: true,
            accountProfileId: profile.accountProfileId,
            remoteFingerprint: `fingerprint-image-adapter-${scenario.name}`,
          }),
        },
        regularImagePlanService: {
          createPlan: async (request) => imagePlan(request.imageCount),
        },
        regularSubmissionPorts: [
          {
            id: "toutiao",
            async preparePlatformSubmission(claim, plan) {
              assert.equal(plan.selectedCount, 2);
              const preparedEvidence = evidence(claim, {
                deliveryMode: scenario.expected.deliveryMode,
                images: scenario.expected.images,
              });
              return domain.createPreparedSubmission({
                preparedSubmissionEvidenceV1: preparedEvidence,
                submitPreparedPublication: async () => ({
                  status: "accepted",
                  remoteId: `image-adapter-${scenario.name}`,
                }),
              });
            },
          },
        ],
      });
      const orchestrator = createRegularQueueGroupOrchestrator({
        regularQueueGroupTransitions: transitions,
        platformSubmissionExecutor: port,
      });

      const result = await orchestrator.startGroup({
        queueGroupId: admitted.queueGroupId,
      });

      assert.equal(result.observation.status, "accepted");
      assert.equal(beginCalls.length, 1);
      assert.deepEqual(
        {
          deliveryMode:
            beginCalls[0].preparedSubmissionEvidenceV1.deliveryMode,
          images: beginCalls[0].preparedSubmissionEvidenceV1.images,
          decisionKind:
            beginCalls[0].preparedSubmissionEvidenceV1.decisionKind,
        },
        { ...scenario.expected, decisionKind: "initial" },
      );
    } finally {
      current.close();
    }
  }
});

test("unexpected image-plan faults end preparation before the remote boundary", async () => {
  const current = fixture();
  let planCalls = 0;
  let adapterCalls = 0;
  let beginCalls = 0;
  try {
    const profile = addProfile(current, "toutiao");
    const admitted = admit(current, {
      articleId: "article-image-plan-before-boundary",
      accountProfileId: profile.accountProfileId,
      imageCount: 1,
    });
    const transitions = Object.fromEntries(
      Object.keys(current.transitions).map((method) => [
        method,
        current.transitions[method],
      ]),
    );
    transitions.beginRegularRemoteSubmission = (input) => {
      beginCalls += 1;
      return current.transitions.beginRegularRemoteSubmission(input);
    };
    const port = createRegularPlatformPreparationPort({
      accountInspector: {
        inspect: async () => ({
          verified: true,
          accountProfileId: profile.accountProfileId,
          remoteFingerprint: "fingerprint-image-plan-before-boundary",
        }),
      },
      regularImagePlanService: {
        createPlan: async () => {
          planCalls += 1;
          const error = new Error("image plan contract violated");
          error.code = "REGULAR_IMAGE_PLAN_LIBRARY_RESULT_INVALID";
          throw error;
        },
      },
      regularSubmissionPorts: [
        {
          id: "toutiao",
          async preparePlatformSubmission() {
            adapterCalls += 1;
            throw new Error("adapter must not run");
          },
        },
      ],
    });
    const orchestrator = createRegularQueueGroupOrchestrator({
      regularQueueGroupTransitions: transitions,
      platformSubmissionExecutor: port,
    });

    await assert.rejects(
      orchestrator.startGroup({ queueGroupId: admitted.queueGroupId }),
      { code: "REGULAR_IMAGE_PLAN_LIBRARY_RESULT_INVALID" },
    );

    assert.equal(planCalls, 1);
    assert.equal(adapterCalls, 0);
    assert.equal(beginCalls, 0);
    assert.equal(
      current.transitions.listRegularQueueGroupSnapshots({})[0].current.phase,
      "prepared",
    );
  } finally {
    current.close();
  }
});

test("post-boundary submission faults stay uncertain without reselecting images or resubmitting", async () => {
  const current = fixture();
  let planCalls = 0;
  let submissions = 0;
  let beginCalls = 0;
  try {
    const profile = addProfile(current, "toutiao");
    const admitted = admit(current, {
      articleId: "article-image-plan-after-boundary",
      accountProfileId: profile.accountProfileId,
      imageCount: 2,
    });
    const transitions = Object.fromEntries(
      Object.keys(current.transitions).map((method) => [
        method,
        current.transitions[method],
      ]),
    );
    transitions.beginRegularRemoteSubmission = (input) => {
      beginCalls += 1;
      return current.transitions.beginRegularRemoteSubmission(input);
    };
    const port = createRegularPlatformPreparationPort({
      accountInspector: {
        inspect: async () => ({
          verified: true,
          accountProfileId: profile.accountProfileId,
          remoteFingerprint: "fingerprint-image-plan-after-boundary",
        }),
      },
      regularImagePlanService: {
        createPlan: async (request) => {
          planCalls += 1;
          return imagePlan(request.imageCount);
        },
      },
      regularSubmissionPorts: [
        {
          id: "toutiao",
          async preparePlatformSubmission(claim) {
            return domain.createPreparedSubmission({
              preparedSubmissionEvidenceV1:
                domain.createTextOnlyPreparedSubmissionEvidenceV1(claim),
              submitPreparedPublication: async () => {
                submissions += 1;
                throw new Error("remote response lost after submission");
              },
            });
          },
        },
      ],
    });
    const orchestrator = createRegularQueueGroupOrchestrator({
      regularQueueGroupTransitions: transitions,
      platformSubmissionExecutor: port,
    });

    const result = await orchestrator.startGroup({
      queueGroupId: admitted.queueGroupId,
    });
    const replay = await orchestrator.startGroup({
      queueGroupId: admitted.queueGroupId,
    });

    assert.equal(result.observation.status, "uncertain");
    assert.equal(replay.status, "idle");
    assert.equal(planCalls, 1);
    assert.equal(submissions, 1);
    assert.equal(beginCalls, 1);
    assert.equal(
      current.transitions.listRegularQueueGroupSnapshots({})[0].current.phase,
      "remote_call_started",
    );
  } finally {
    current.close();
  }
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

test("public queue execution submits only after preparation completes", async () => {
  const current = fixture();
  const phases = [];
  try {
    const profile = addProfile(current, "toutiao");
    const admitted = admit(current, {
      articleId: "article-prepared-boundary",
      accountProfileId: profile.accountProfileId,
    });
    const orchestrator = createRegularQueueGroupOrchestrator({
      regularQueueGroupTransitions: current.transitions,
      randomUUID: () => "public-boundary-claim",
      platformSubmissionExecutor: executorFor(async (claim) => {
        phases.push({
          phase: "prepared",
          attemptId: claim.regularPublicationAttemptId,
        });
        return domain.createPreparedSubmission({
          preparedSubmissionEvidenceV1: evidence(claim),
          submitPreparedPublication: async () => {
            phases.push({
              phase: "submitted",
              attemptId: claim.regularPublicationAttemptId,
            });
            return { status: "accepted", remoteId: "remote-prepared-boundary" };
          },
        });
      }),
    });

    const result = await orchestrator.startGroup({
      queueGroupId: admitted.queueGroupId,
    });

    assert.deepEqual(phases, [
      { phase: "prepared", attemptId: admitted.attemptId },
      { phase: "submitted", attemptId: admitted.attemptId },
    ]);
    assert.equal(result.status, "observation_ready");
    assert.deepEqual(result.observation, {
      status: "accepted",
      remoteId: "remote-prepared-boundary",
    });
  } finally {
    current.close();
  }
});

test("public queue execution preserves an uncertain remote failure without replay", async () => {
  const current = fixture();
  let preparations = 0;
  let submissions = 0;
  let preparedEvidence;
  try {
    const profile = addProfile(current, "hepan");
    const admitted = admit(current, {
      articleId: "article-uncertain-boundary",
      platformId: "hepan",
      accountProfileId: profile.accountProfileId,
    });
    const orchestrator = createRegularQueueGroupOrchestrator({
      regularQueueGroupTransitions: current.transitions,
      randomUUID: () => "uncertain-boundary-claim",
      platformSubmissionExecutor: executorFor(async (claim) => {
        preparations += 1;
        preparedEvidence = domain.parsePreparedSubmissionEvidenceV1(
          evidence(claim),
        );
        return domain.createPreparedSubmission({
          preparedSubmissionEvidenceV1: preparedEvidence,
          submitPreparedPublication: async () => {
            submissions += 1;
            throw new Error("synthetic remote disconnect");
          },
        });
      }),
    });

    const result = await orchestrator.startGroup({
      queueGroupId: admitted.queueGroupId,
    });

    assert.equal(preparations, 1);
    assert.equal(submissions, 1);
    assert.deepEqual(result.observation, {
      status: "uncertain",
      errorCode: "REGULAR_REMOTE_RESULT_UNCERTAIN",
      regularPublicationAttemptId: admitted.attemptId,
      preparedSubmissionEvidenceV1: preparedEvidence,
    });
    assert.equal(
      result.observation.preparedSubmissionEvidenceV1.attemptId,
      admitted.attemptId,
    );
    assert.equal(
      current.transitions.claimRegularQueueGroupHead({
        queueGroupId: admitted.queueGroupId,
        claimToken: "uncertain-replay",
      }),
      null,
    );
  } finally {
    current.close();
  }
});

test("Hepan production preparation owns temporary credential cleanup", async () => {
  const {
    createHepanSettingsBackedRuntime,
  } = require("../src/platforms/hepan/settings-backed-runtime");
  let cookieCleanups = 0;
  let cookieCreations = 0;
  let expiredCleanups = 0;
  let readPreparedRuntime = null;
  let receivedImagePlan = null;
  let rejectSubmission = false;
  let rejectCleanup = false;
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
  const adapter = createHepanSettingsBackedRuntime({
    paths: { tmp: "C:\\synthetic-tmp" },
    getPlatformSettingsService: () => ({
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
                if (rejectCleanup)
                  throw new Error("synthetic credential cleanup failure");
              },
            };
          },
        },
      }),
    }),
    cleanupExpiredHepanPayloads: () => {
      expiredCleanups += 1;
    },
    createHepanAdapter: (options) => {
      readPreparedRuntime = options.getRuntime;
      return {
        preparePlatformSubmission: async (preparedClaim, imagePlanInput) => {
          assert.strictEqual(preparedClaim, claim);
          receivedImagePlan = imagePlanInput;
          return domain.createPreparedSubmission({
            preparedSubmissionEvidenceV1: preparedEvidence,
            submitPreparedPublication: async () => {
              assert.equal(
                readPreparedRuntime().cookiePath,
                "C:\\synthetic-cookie.tmp",
              );
              if (rejectSubmission) throw new Error("synthetic submit failure");
              return { status: "accepted" };
            },
          });
        },
      };
    },
  });
  const selectedPlan = imagePlan(1);
  const prepared = await adapter.regularSubmission.preparePlatformSubmission(claim, selectedPlan);
  assert.strictEqual(receivedImagePlan, selectedPlan);
  assert.deepEqual(
    {
      deliveryMode: prepared.preparedSubmissionEvidenceV1.deliveryMode,
      images: prepared.preparedSubmissionEvidenceV1.images,
      decisionKind: prepared.preparedSubmissionEvidenceV1.decisionKind,
    },
    { deliveryMode: "text_only", images: [], decisionKind: "initial" },
  );
  assert.equal(expiredCleanups, 2);
  assert.equal(cookieCreations, 0);
  assert.equal(cookieCleanups, 0);
  assert.equal(readPreparedRuntime().cookiePath, "");
  assert.deepEqual(await prepared.submitPreparedPublication(), {
    status: "accepted",
  });
  assert.equal(cookieCreations, 1);
  assert.equal(cookieCleanups, 1);
  assert.equal(readPreparedRuntime().cookiePath, "");

  rejectSubmission = true;
  const rejected = await adapter.regularSubmission.preparePlatformSubmission(claim);
  await assert.rejects(rejected.submitPreparedPublication(), {
    message: "synthetic submit failure",
  });
  assert.equal(cookieCreations, 2);
  assert.equal(cookieCleanups, 2);

  rejectSubmission = false;
  rejectCleanup = true;
  const cleanupRejected =
    await adapter.regularSubmission.preparePlatformSubmission(claim);
  assert.deepEqual(await cleanupRejected.submitPreparedPublication(), {
    status: "accepted",
  });
  assert.equal(cookieCreations, 3);
  assert.equal(cookieCleanups, 3);
  assert.equal(readPreparedRuntime().cookiePath, "");
});

test("Hepan does not materialize a temporary credential when submission-start fails", async () => {
  const {
    createHepanSettingsBackedRuntime,
  } = require("../src/platforms/hepan/settings-backed-runtime");
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
    const adapter = createHepanSettingsBackedRuntime({
      paths: { tmp: "C:\\synthetic-tmp" },
      getPlatformSettingsService: () => ({
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
      }),
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
        adapter.regularSubmission.preparePlatformSubmission(claim),
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
