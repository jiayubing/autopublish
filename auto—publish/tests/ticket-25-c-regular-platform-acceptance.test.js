"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const domain = require("../src/domain");
const {
  createRegularPlatformOutcomeService,
} = require("../desktop/services/regular-platform-outcome-service");
const {
  createArticleAttentionQuery,
} = require("../desktop/services/article-attention-query");
const {
  createRegularQueueApplication,
} = require("../desktop/services/regular-queue-application");
const {
  createRegularQueueGroupComposition,
} = require("../desktop/composition/regular-queue-group-composition");
const {
  createArticleMutationCoordinator,
} = require("../src/content/article-mutation-coordinator");
const { createArticleStore } = require("../src/content/article-store");
const { createContentStore } = require("../src/content/content-store");
const {
  createOperationalStore,
} = require("../src/infrastructure/operational-store/operational-store");

const CLOCK = new Date("2026-08-12T00:00:00.000Z");

function article(articleId, clientId = "client-a") {
  return {
    id: articleId,
    clientId,
    platform: "toutiao",
    scenario: "guide",
    templateId: "template-1",
    title: "标题 " + articleId,
    content: "正文 " + articleId,
    status: "saved",
    createdAt: CLOCK.toISOString(),
    updatedAt: CLOCK.toISOString(),
  };
}

function ref(articleId, clientId = "client-a") {
  return { clientId, articleId };
}

function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ticket-25-c-"));
  const transitionPorts = {};
  const store = createOperationalStore({
    workspaceRoot: root,
    clock: () => CLOCK,
    transitionPorts,
  });
  const clients = new Set(["client-a"]);
  const articleStore = createArticleStore(root);
  const contentStore = createContentStore({
    articleStore,
    listClientIds: () => [...clients],
  });
  const profiles = {
    hepanPrimary: store.createAccountProfile({
      platformId: "hepan",
      displayName: "禾畔主账号",
    }),
    hepanSecondary: store.createAccountProfile({
      platformId: "hepan",
      displayName: "禾畔副账号",
    }),
    toutiaoPrimary: store.createAccountProfile({
      platformId: "toutiao",
      displayName: "头条账号",
    }),
  };
  const coordinator = createArticleMutationCoordinator({
    articleStore,
    contentStore,
    regularQueueTransitions: transitionPorts.regularQueueTransitions,
    lifecycleFacts: transitionPorts.regularQueueTransitions,
    clock: () => CLOCK,
  });
  const application = createRegularQueueApplication({
    contentStore,
    articleMutationCoordinator: coordinator,
    regularQueueTransitions: transitionPorts.regularQueueTransitions,
    accountProfileResolver: store.assertExecutableAccountProfile,
    platforms: [
      {
        id: "hepan", publicationTargetKind: "platform", imagePublishing: false,
      },
      {
        id: "toutiao", publicationTargetKind: "platform", imagePublishing: false,
      },
      {
        id: "media", publicationTargetKind: "resource", imagePublishing: false,
      },
    ],
  });
  return {
    root,
    store,
    transitionPorts,
    articleStore,
    contentStore,
    coordinator,
    application,
    profiles,
    add(value) {
      clients.add(value.clientId);
      contentStore.createArticle(value);
    },
    close() {
      store.close();
      fs.rmSync(root, { recursive: true, force: true, maxRetries: 3 });
    },
  };
}

function admission(
  fixture,
  articleIds,
  platformId,
  accountProfileId,
  queueGroupId,
) {
  const input = {
    articleRefs: articleIds.map((articleId) => ref(articleId)),
    platformId,
    accountProfileId,
  };
  if (queueGroupId) input.queueConfig = { queueGroupId };
  return fixture.application.admitRegularQueueItems(input);
}

function groupSnapshots(fixture) {
  return fixture.transitionPorts.regularQueueGroupTransitions.listRegularQueueGroupSnapshots(
    {},
  );
}

function findGroup(fixture, queueGroupId) {
  const group = groupSnapshots(fixture).find(
    (candidate) => candidate.queueGroupId === queueGroupId,
  );
  assert.ok(group, "queue group should remain publicly observable");
  return group;
}

function deferred() {
  let resolve;
  const promise = new Promise((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function createFakeExecutor(plans) {
  const calls = [];
  const preparedEvidence = [];
  return {
    calls,
    preparedEvidence,
    executor: {
      async preparePlatformSubmission(claim) {
        const articleId = claim.articleIdentityV1.articleId;
        const plan = plans.get(articleId) || {};
        if (plan.prepareOutcome) return plan.prepareOutcome;
        const evidence =
          domain.createTextOnlyPreparedSubmissionEvidenceV1(claim);
        preparedEvidence.push(evidence);
        return {
          preparedSubmissionEvidenceV1: evidence,
          async submitPreparedPublication() {
            calls.push({
              articleId,
              platformId: claim.targetIdentityV1.platformId,
              accountProfileId: claim.targetIdentityV1.accountProfileId,
            });
            if (plan.gate) await plan.gate.promise;
            if (plan.throwError) throw new Error("synthetic transport failure");
            return (
              plan.outcome || {
                status: "accepted",
                remoteId: "remote-" + articleId,
              }
            );
          },
        };
      },
    },
  };
}

function createQueueRuntime(fixture, executor) {
  const outcomeService = createRegularPlatformOutcomeService({
    regularOutcomeTransitions:
      fixture.transitionPorts.regularOutcomeTransitions,
    clock: () => CLOCK,
  });
  const composition = createRegularQueueGroupComposition({
    regularQueueGroupTransitions:
      fixture.transitionPorts.regularQueueGroupTransitions,
    platformSubmissionExecutor: executor,
    regularPlatformOutcomeService: outcomeService,
  });
  return { composition, outcomeService };
}

async function waitFor(predicate, message) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.fail(message || "synthetic queue condition was not reached");
}

test("25-C admission keeps one target, groups by identity, and hides a sole account in the public view", async () => {
  const fixture = makeFixture();
  let platformFeature;
  try {
    for (const articleId of ["admit-a", "admit-b", "admit-c", "admit-d"])
      fixture.add(article(articleId));

    const first = admission(
      fixture,
      ["admit-a", "admit-b"],
      "hepan",
      fixture.profiles.hepanPrimary.accountProfileId,
    );
    const second = admission(
      fixture,
      ["admit-c"],
      "hepan",
      fixture.profiles.hepanSecondary.accountProfileId,
    );
    const third = admission(
      fixture,
      ["admit-d"],
      "toutiao",
      fixture.profiles.toutiaoPrimary.accountProfileId,
    );

    assert.equal(first.target.platformId, "hepan");
    assert.equal(
      first.target.accountProfileId,
      fixture.profiles.hepanPrimary.accountProfileId,
    );
    assert.equal(new Set(first.items.map((item) => item.queueGroupId)).size, 1);
    assert.equal(
      new Set(second.items.map((item) => item.queueGroupId)).size,
      1,
    );
    assert.notEqual(first.items[0].queueGroupId, second.items[0].queueGroupId);
    assert.notEqual(first.items[0].queueGroupId, third.items[0].queueGroupId);
    assert.deepEqual(
      groupSnapshots(fixture)
        .map((group) => [group.platformId, group.accountProfileId])
        .sort((left, right) =>
          left.join("\u0000").localeCompare(right.join("\u0000")),
        ),
      [
        ["hepan", fixture.profiles.hepanPrimary.accountProfileId],
        ["hepan", fixture.profiles.hepanSecondary.accountProfileId],
        ["toutiao", fixture.profiles.toutiaoPrimary.accountProfileId],
      ].sort((left, right) =>
        left.join("\u0000").localeCompare(right.join("\u0000")),
      ),
    );

    assert.throws(
      () =>
        fixture.application.previewRegularQueueAdmission({
          articleRefs: [ref("admit-a")],
          platformId: "hepan",
          accountProfileId: fixture.profiles.hepanPrimary.accountProfileId,
          targetPlatformIds: ["hepan", "toutiao"],
        }),
      { code: "REGULAR_QUEUE_SINGLE_TARGET_REQUIRED" },
    );
    assert.throws(
      () =>
        fixture.application.previewRegularQueueAdmission({
          articleRefs: [ref("admit-a")],
          platformId: "media",
          accountProfileId: fixture.profiles.hepanPrimary.accountProfileId,
          mediaResourceId: "resource-not-regular",
        }),
      { code: "REGULAR_QUEUE_PLATFORM_REQUIRED" },
    );
    assert.throws(
      () =>
        fixture.application.previewRegularQueueAdmission({
          articleRefs: [ref("admit-a")],
          platformId: "third-party-self-media",
          accountProfileId: fixture.profiles.hepanPrimary.accountProfileId,
        }),
      { code: "REGULAR_QUEUE_PLATFORM_UNSUPPORTED" },
    );

    const snapshot = findGroup(fixture, first.items[0].queueGroupId);
    assert.equal(snapshot.current, null);
    assert.deepEqual(
      snapshot.remaining.map((item) => item.articleId),
      ["admit-a", "admit-b"],
    );
    assert.equal(
      Object.prototype.hasOwnProperty.call(snapshot, "payload"),
      false,
    );
    assert.equal(
      Object.prototype.hasOwnProperty.call(snapshot, "title"),
      false,
    );
    assert.equal(Object.prototype.hasOwnProperty.call(snapshot, "body"), false);

    const module =
      await import("../media-workbench/src/features/platform/platform-feature.js");
    const bridge = {
      platformDisplayName: (platformId) =>
        platformId === "hepan" ? "禾畔" : "头条",
      listAccountProfiles: async () => fixture.store.listAccountProfiles(),
      listRegularQueueGroups: async () => groupSnapshots(fixture),
    };
    platformFeature = module.createPlatformFeature(bridge);
    platformFeature.setScope({ workspaceRuntimeId: "ticket-25-c-runtime" });
    await platformFeature.refreshAccountProfiles("acceptance");
    await platformFeature.refreshRegularQueueGroups("acceptance");
    const views = platformFeature.getSnapshot().regularQueueGroupViews;
    assert.equal(
      views.find((group) => group.queueGroupId === first.items[0].queueGroupId)
        .showAccount,
      true,
    );
    assert.equal(
      views.find((group) => group.queueGroupId === second.items[0].queueGroupId)
        .showAccount,
      true,
    );
    const soleAccountView = views.find(
      (group) => group.queueGroupId === third.items[0].queueGroupId,
    );
    assert.equal(soleAccountView.showAccount, false);
    assert.equal(
      soleAccountView.accountProfileId,
      fixture.profiles.toutiaoPrimary.accountProfileId,
    );
  } finally {
    if (platformFeature) platformFeature.dispose();
    fixture.close();
  }
});

test("25-C runs different platforms concurrently, serializes same-platform accounts, appends FIFO text-only work, and scopes failures", async () => {
  const fixture = makeFixture();
  try {
    for (const articleId of [
      "fifo-first",
      "fifo-second",
      "same-platform-second-account",
      "independent-platform",
    ])
      fixture.add(article(articleId));
    const firstGate = deferred();
    const plans = new Map([
      [
        "fifo-first",
        {
          gate: firstGate,
          outcome: { status: "article_rejected", errorCode: "REMOTE_REJECTED" },
        },
      ],
      [
        "fifo-second",
        { outcome: { status: "accepted", remoteId: "remote-fifo-second" } },
      ],
      [
        "fifo-appended",
        { outcome: { status: "accepted", remoteId: "remote-fifo-appended" } },
      ],
      [
        "same-platform-second-account",
        {
          outcome: {
            status: "group_blocked",
            errorCode: "LOGIN_REQUIRED",
            articleRecoverable: true,
          },
        },
      ],
      [
        "independent-platform",
        { outcome: { status: "accepted", remoteId: "remote-independent" } },
      ],
    ]);
    const fake = createFakeExecutor(plans);
    const runtime = createQueueRuntime(fixture, fake.executor);
    const first = admission(
      fixture,
      ["fifo-first", "fifo-second"],
      "hepan",
      fixture.profiles.hepanPrimary.accountProfileId,
    );
    const samePlatform = admission(
      fixture,
      ["same-platform-second-account"],
      "hepan",
      fixture.profiles.hepanSecondary.accountProfileId,
    );
    const independent = admission(
      fixture,
      ["independent-platform"],
      "toutiao",
      fixture.profiles.toutiaoPrimary.accountProfileId,
    );

    const firstRun = runtime.composition.orchestrator.startGroup({
      queueGroupId: first.items[0].queueGroupId,
    });
    await waitFor(
      () => fake.calls.some((call) => call.articleId === "fifo-first"),
      "first same-platform article should reach the fake transport",
    );
    const samePlatformRun = runtime.composition.orchestrator.startGroup({
      queueGroupId: samePlatform.items[0].queueGroupId,
    });
    const independentRun = runtime.composition.orchestrator.startGroup({
      queueGroupId: independent.items[0].queueGroupId,
    });
    await waitFor(
      () =>
        fake.calls.some((call) => call.articleId === "independent-platform"),
      "a different platform should run while the first platform is blocked",
    );
    assert.equal(
      fake.calls.some(
        (call) => call.articleId === "same-platform-second-account",
      ),
      false,
    );

    fixture.add(article("fifo-appended"));
    const appended = admission(
      fixture,
      ["fifo-appended"],
      "hepan",
      fixture.profiles.hepanPrimary.accountProfileId,
      first.items[0].queueGroupId,
    );
    assert.equal(appended.items[0].queueGroupId, first.items[0].queueGroupId);
    assert.equal(appended.items[0].position, 3);
    const inFlight = findGroup(fixture, first.items[0].queueGroupId);
    assert.equal(inFlight.current.articleId, "fifo-first");
    assert.deepEqual(
      inFlight.remaining.map((item) => item.articleId),
      ["fifo-second", "fifo-appended"],
    );

    firstGate.resolve();
    await Promise.all([firstRun, samePlatformRun, independentRun]);
    const samePlatformCalls = fake.calls
      .filter((call) => call.platformId === "hepan")
      .map((call) => call.articleId);
    assert.deepEqual(samePlatformCalls, [
      "fifo-first",
      "fifo-second",
      "fifo-appended",
      "same-platform-second-account",
    ]);
    assert.ok(
      fake.calls.findIndex(
        (call) => call.articleId === "independent-platform",
      ) <
        fake.calls.findIndex(
          (call) => call.articleId === "same-platform-second-account",
        ),
    );
    assert.deepEqual(
      fake.preparedEvidence.map((evidence) => evidence.deliveryMode),
      ["text_only", "text_only", "text_only", "text_only", "text_only"],
    );
    for (const evidence of fake.preparedEvidence) {
      assert.deepEqual(evidence.images, []);
      assert.equal(evidence.decisionKind, "initial");
    }

    assert.equal(
      fixture.store.listArticleLifecycleFacts({ articleIds: ["fifo-first"] })
        .publications[0].status,
      "failed",
    );
    assert.equal(
      fixture.store.listArticleLifecycleFacts({ articleIds: ["fifo-second"] })
        .publications[0].status,
      "published",
    );
    assert.equal(
      fixture.store.listArticleLifecycleFacts({
        articleIds: ["same-platform-second-account"],
      }).publications[0].status,
      "queued",
    );
    assert.equal(
      fixture.store.listArticleLifecycleFacts({
        articleIds: ["same-platform-second-account"],
      }).attentionItems.length,
      0,
    );
    assert.equal(
      fixture.store.listArticleLifecycleFacts({
        articleIds: ["independent-platform"],
      }).publications[0].status,
      "published",
    );
    assert.equal(
      findGroup(fixture, samePlatform.items[0].queueGroupId).pauseIntent,
      "system",
    );
    assert.equal(
      fixture.coordinator.readArticleForEdit(ref("fifo-first")).article.id,
      "fifo-first",
    );

    const lateFailure = runtime.outcomeService.applyRegularOutcome({
      regularPublicationAttemptId: first.items.find(
        (item) => item.articleRef.articleId === "fifo-second",
      ).attemptId,
      outcome: { status: "article_rejected", errorCode: "REMOTE_REJECTED" },
    });
    assert.equal(lateFailure.status, "published");
    assert.equal(lateFailure.firstWins, true);
    const archiveAfterLateObservation = fixture.store.listPublicationRecords({
      articleIds: ["fifo-second"],
    });
    assert.equal(archiveAfterLateObservation.length, 1);
    assert.equal(
      archiveAfterLateObservation[0].attempts.filter(
        (attempt) => attempt.status === "published",
      ).length,
      1,
    );
  } finally {
    fixture.close();
  }
});

test("25-C pause-all, manual pause, start-all, and restart preserve operator intent", async () => {
  const fixture = makeFixture();
  try {
    for (const articleId of ["pause-current", "pause-remaining", "manual-only"])
      fixture.add(article(articleId));
    const gate = deferred();
    const fake = createFakeExecutor(
      new Map([
        [
          "pause-current",
          {
            gate,
            outcome: { status: "accepted", remoteId: "remote-pause-current" },
          },
        ],
        [
          "pause-remaining",
          {
            outcome: { status: "accepted", remoteId: "remote-pause-remaining" },
          },
        ],
        [
          "manual-only",
          { outcome: { status: "accepted", remoteId: "remote-manual-only" } },
        ],
      ]),
    );
    const runtime = createQueueRuntime(fixture, fake.executor);
    const pending = admission(
      fixture,
      ["pause-current", "pause-remaining"],
      "hepan",
      fixture.profiles.hepanPrimary.accountProfileId,
    );
    const manual = admission(
      fixture,
      ["manual-only"],
      "hepan",
      fixture.profiles.hepanSecondary.accountProfileId,
    );
    const run = runtime.composition.orchestrator.startGroup({
      queueGroupId: pending.items[0].queueGroupId,
    });
    await waitFor(
      () => fake.calls.some((call) => call.articleId === "pause-current"),
      "pause test should reach its first remote call",
    );
    const pauseResult = runtime.composition.orchestrator.pauseAll();
    assert.equal(
      pauseResult.groups.find(
        (group) => group.queueGroupId === pending.items[0].queueGroupId,
      ).pauseIntent,
      "system",
    );
    gate.resolve();
    await run;
    assert.deepEqual(
      fake.calls.map((call) => call.articleId),
      ["pause-current"],
    );
    assert.deepEqual(
      findGroup(fixture, pending.items[0].queueGroupId).remaining.map(
        (item) => item.articleId,
      ),
      ["pause-remaining"],
    );

    const manualRun = runtime.composition.orchestrator.startGroup({
      queueGroupId: manual.items[0].queueGroupId,
    });
    const manualPause = runtime.composition.orchestrator.pauseGroup({
      queueGroupId: manual.items[0].queueGroupId,
    });
    assert.equal(manualPause.pauseIntent, "manual");
    await manualRun;
    assert.equal(
      fake.calls.some((call) => call.articleId === "manual-only"),
      false,
    );

    const restartFake = createFakeExecutor(
      new Map([
        [
          "pause-remaining",
          {
            outcome: {
              status: "accepted",
              remoteId: "remote-pause-remaining-after-restart",
            },
          },
        ],
        [
          "manual-only",
          {
            outcome: {
              status: "accepted",
              remoteId: "remote-manual-after-restart",
            },
          },
        ],
      ]),
    );
    const restarted = createQueueRuntime(fixture, restartFake.executor);
    assert.ok(
      restarted.composition.startupSnapshot.groups.every(
        (group) => group.pauseIntent !== "none",
      ),
    );
    assert.equal(restartFake.calls.length, 0);
    assert.deepEqual(
      findGroup(fixture, pending.items[0].queueGroupId).remaining.map(
        (item) => item.articleId,
      ),
      ["pause-remaining"],
    );
    await restarted.composition.orchestrator.startAll();
    assert.deepEqual(
      restartFake.calls.map((call) => call.articleId),
      ["pause-remaining"],
    );
    assert.equal(
      findGroup(fixture, manual.items[0].queueGroupId).pauseIntent,
      "manual",
    );
  } finally {
    fixture.close();
  }
});

test("25-C uncertain freezes the article, forbids replay, and exposes only the two named manual closures", async () => {
  const fixture = makeFixture();
  try {
    fixture.add(article("uncertain-accepted"));
    fixture.add(article("uncertain-not-accepted"));
    const fake = createFakeExecutor(
      new Map([
        ["uncertain-accepted", { throwError: true }],
        ["uncertain-not-accepted", { throwError: true }],
      ]),
    );
    const runtime = createQueueRuntime(fixture, fake.executor);
    const accepted = admission(
      fixture,
      ["uncertain-accepted"],
      "hepan",
      fixture.profiles.hepanPrimary.accountProfileId,
    );
    const notAccepted = admission(
      fixture,
      ["uncertain-not-accepted"],
      "toutiao",
      fixture.profiles.toutiaoPrimary.accountProfileId,
    );
    await Promise.all([
      runtime.composition.orchestrator.startGroup({
        queueGroupId: accepted.items[0].queueGroupId,
      }),
      runtime.composition.orchestrator.startGroup({
        queueGroupId: notAccepted.items[0].queueGroupId,
      }),
    ]);
    assert.equal(fake.calls.length, 2);
    assert.equal(
      findGroup(fixture, accepted.items[0].queueGroupId).pauseIntent,
      "system",
    );
    assert.equal(
      fixture.store.listArticleLifecycleFacts({
        articleIds: ["uncertain-accepted"],
      }).submissionItems[0].status,
      "uncertain",
    );
    const frozen = fixture.coordinator.readArticleForEdit(
      ref("uncertain-accepted"),
    );
    assert.throws(
      () =>
        fixture.coordinator.saveExistingArticle({
          article: Object.assign({}, frozen.article, { title: "不应保存" }),
          expectedFingerprint: frozen.editFingerprint,
        }),
      { code: "PUBLICATION_UNCERTAIN" },
    );

    const acceptToken =
      runtime.outcomeService.prepareRegularUncertainResolution({
        regularPublicationAttemptId: accepted.items[0].attemptId,
      });
    assert.deepEqual(acceptToken.actions, [
      "confirm_accepted",
      "confirm_not_accepted",
    ]);
    const acceptedResult = runtime.outcomeService.confirmRegularAccepted({
      regularPublicationAttemptId: accepted.items[0].attemptId,
      confirmationToken: acceptToken.confirmationToken,
      manualPositiveEvidence: {
        observedAt: CLOCK.toISOString(),
        remoteUrl: "https://synthetic.example/accepted",
      },
    });
    assert.equal(acceptedResult.status, "published");
    assert.equal(fake.calls.length, 2);
    const acceptedSnapshot = runtime.outcomeService.getRegularOutcomeSnapshot({
      regularPublicationAttemptId: accepted.items[0].attemptId,
    });
    const acceptedEvidence = fake.preparedEvidence.find(
      (evidence) => evidence.attemptId === accepted.items[0].attemptId,
    );
    assert.equal(
      acceptedSnapshot.publicationEvidenceV1.contentFingerprint,
      acceptedEvidence.contentFingerprint,
    );
    assert.equal(
      acceptedSnapshot.publicationEvidenceV1.imageSummaryV1.deliveryMode,
      "text_only",
    );
    assert.deepEqual(
      acceptedSnapshot.publicationEvidenceV1.imageSummaryV1.images,
      [],
    );
    assert.throws(
      () =>
        runtime.outcomeService.confirmRegularNotAccepted({
          regularPublicationAttemptId: accepted.items[0].attemptId,
          confirmationToken: acceptToken.confirmationToken,
          manualNegativeEvidence: {
            reasonCode: "OPERATOR_VERIFIED_NOT_ACCEPTED",
            observedAt: CLOCK.toISOString(),
          },
        }),
      { code: "REGULAR_UNCERTAIN_RESOLUTION_OPPOSITE" },
    );
    const repeatedAccepted = runtime.outcomeService.confirmRegularAccepted({
      regularPublicationAttemptId: accepted.items[0].attemptId,
      confirmationToken: acceptToken.confirmationToken,
      manualPositiveEvidence: {
        observedAt: CLOCK.toISOString(),
        remoteUrl: "https://synthetic.example/accepted",
      },
    });
    assert.equal(repeatedAccepted.status, "published");
    assert.equal(repeatedAccepted.idempotent, true);
    const lateAccepted = runtime.outcomeService.applyRegularOutcome({
      regularPublicationAttemptId: accepted.items[0].attemptId,
      outcome: { status: "accepted", remoteId: "late-different-remote" },
    });
    assert.equal(lateAccepted.status, "published");
    assert.equal(lateAccepted.firstWins, true);
    assert.equal(
      runtime.outcomeService.getRegularOutcomeSnapshot({
        regularPublicationAttemptId: accepted.items[0].attemptId,
      }).publicationStatus,
      "published",
    );
    assert.equal(
      runtime.outcomeService.getRegularOutcomeSnapshot({
        regularPublicationAttemptId: accepted.items[0].attemptId,
      }).queueGroupId,
      null,
    );
    assert.equal(
      fixture.store.listPublicationRecords({
        articleIds: ["uncertain-accepted"],
      }).length,
      1,
    );

    const rejectToken =
      runtime.outcomeService.prepareRegularUncertainResolution({
        regularPublicationAttemptId: notAccepted.items[0].attemptId,
      });
    const rejectedResult = runtime.outcomeService.confirmRegularNotAccepted({
      regularPublicationAttemptId: notAccepted.items[0].attemptId,
      confirmationToken: rejectToken.confirmationToken,
      manualNegativeEvidence: {
        reasonCode: "OPERATOR_VERIFIED_NOT_ACCEPTED",
        observedAt: CLOCK.toISOString(),
      },
    });
    assert.equal(rejectedResult.status, "not_accepted");
    assert.equal(
      fixture.coordinator.readArticleForEdit(ref("uncertain-not-accepted"))
        .article.id,
      "uncertain-not-accepted",
    );
    const resolvedAttention = createArticleAttentionQuery({
      operationalStore: fixture.store,
      regularPlatformOutcomeService: runtime.outcomeService,
      readers: {
        getArticle: (clientId, articleId) =>
          fixture.contentStore.getArticle(clientId, articleId),
      },
    }).list({ clientId: "client-a" });
    const readmissionPreview = fixture.application.previewRegularQueueAdmission(
      {
        articleRefs: [ref("uncertain-not-accepted")],
        platformId: "toutiao",
        accountProfileId: fixture.profiles.toutiaoPrimary.accountProfileId,
      },
    );
    const readmitted = admission(
      fixture,
      ["uncertain-not-accepted"],
      "toutiao",
      fixture.profiles.toutiaoPrimary.accountProfileId,
    );
    assert.deepEqual(
      {
        attentionCount: resolvedAttention.items.length,
        previewStatus: readmissionPreview.items[0].status,
        admittedCount: readmitted.admittedCount,
        admissionStatus: readmitted.items[0].status,
        admissionReasonCode: readmitted.items[0].reasonCode || null,
      },
      {
        attentionCount: 0,
        previewStatus: "queueable",
        admittedCount: 1,
        admissionStatus: "queued",
        admissionReasonCode: null,
      },
    );
    assert.notEqual(
      readmitted.items[0].attemptId,
      notAccepted.items[0].attemptId,
    );
    assert.throws(
      () =>
        runtime.outcomeService.confirmRegularAccepted({
          regularPublicationAttemptId: notAccepted.items[0].attemptId,
          confirmationToken: rejectToken.confirmationToken,
          manualPositiveEvidence: { observedAt: CLOCK.toISOString() },
        }),
      { code: "REGULAR_UNCERTAIN_RESOLUTION_OPPOSITE" },
    );
    assert.equal(
      Object.prototype.hasOwnProperty.call(
        runtime.composition.orchestrator,
        "retry",
      ),
      false,
    );
  } finally {
    fixture.close();
  }
});
