"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  createRegularQueueApplication,
} = require("../desktop/services/regular-queue-application");
const {
  createRegularQueueGroupOrchestrator,
} = require("../desktop/services/regular-queue-group-orchestrator");
const {
  createArticleMutationCoordinator,
} = require("../src/content/article-mutation-coordinator");
const { createArticleStore } = require("../src/content/article-store");
const { createContentStore } = require("../src/content/content-store");
const {
  createOperationalStore,
} = require("../src/infrastructure/operational-store/operational-store");

function article(articleId) {
  return {
    id: articleId,
    clientId: "client-a",
    platform: "toutiao",
    scenario: "guide",
    templateId: "template-1",
    title: `Title ${articleId}`,
    content: `Body ${articleId}`,
    status: "saved",
    createdAt: "2026-09-04T00:00:00.000Z",
    updatedAt: "2026-09-04T00:00:00.000Z",
  };
}

function ref(articleId) {
  return { clientId: "client-a", articleId };
}

function makeAdmissionFixture() {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "regular-submission-stage1-"),
  );
  const transitionPorts = {};
  let store;
  try {
    store = createOperationalStore({
      workspaceRoot: root,
      clock: () => new Date("2026-09-04T00:00:00.000Z"),
      transitionPorts,
    });
    const articleStore = createArticleStore(root);
    const contentStore = createContentStore({
      articleStore,
      listClientIds: () => ["client-a"],
    });
    const profiles = {
      toutiao: store.createAccountProfile({
        platformId: "toutiao",
        displayName: "头条账号",
      }),
      hepan: store.createAccountProfile({
        platformId: "hepan",
        displayName: "禾畔账号",
      }),
    };
    const coordinator = createArticleMutationCoordinator({
      articleStore,
      contentStore,
      regularQueueTransitions: transitionPorts.regularQueueTransitions,
      lifecycleFacts: transitionPorts.regularQueueTransitions,
      clock: () => new Date("2026-09-04T00:00:00.000Z"),
    });
    const application = createRegularQueueApplication({
      contentStore,
      articleMutationCoordinator: coordinator,
      regularQueueTransitions: transitionPorts.regularQueueTransitions,
      regularQueueGroupTransitions:
        transitionPorts.regularQueueGroupTransitions,
      accountProfileResolver: store.assertExecutableAccountProfile,
      clientSnapshotResolver: (clientId) => ({
        version: 1,
        clientId,
        displayName: `客户 ${clientId}`,
      }),
      platforms: [
        {
          id: "toutiao",
          displayName: "头条",
          publicationTargetKind: "platform",
          imagePublishing: false,
        },
        {
          id: "hepan",
          displayName: "禾畔",
          publicationTargetKind: "platform",
          imagePublishing: false,
        },
      ],
    });
    return {
      store,
      contentStore,
      application,
      profiles,
      close() {
        store.close();
        fs.rmSync(root, {
          recursive: true,
          force: true,
          maxRetries: 3,
          retryDelay: 100,
        });
      },
    };
  } catch (error) {
    if (store) store.close();
    fs.rmSync(root, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    });
    throw error;
  }
}

function admissionInput(fixture, articleId, platformId) {
  return {
    articleRefs: [ref(articleId)],
    platformId,
    accountProfileId: fixture.profiles[platformId].accountProfileId,
  };
}

test("regular admission preview and commit agree on active-target conflicts", () => {
  const fixture = makeAdmissionFixture();
  try {
    fixture.contentStore.createArticle(article("article-conflict"));

    const first = fixture.application.admitRegularQueueItems(
      admissionInput(fixture, "article-conflict", "toutiao"),
    );
    assert.equal(first.admittedCount, 1);
    assert.equal(first.items[0].status, "queued");

    const competingInput = admissionInput(
      fixture,
      "article-conflict",
      "hepan",
    );
    const preview = fixture.application.previewRegularQueueAdmission(
      competingInput,
    );
    assert.equal(preview.conflictCount, 1);
    assert.equal(preview.items[0].status, "conflict");
    assert.equal(
      preview.items[0].reasonCode,
      "ARTICLE_ACTIVE_TARGET_CONFLICT",
    );

    const committed = fixture.application.admitRegularQueueItems(competingInput);
    assert.equal(committed.admittedCount, 0);
    assert.equal(committed.conflictCount, 1);
    assert.equal(committed.items[0].status, "conflict");
    assert.equal(committed.items[0].reasonCode, preview.items[0].reasonCode);
    assert.equal(fixture.store.listSubmissionQueueItems().length, 1);
  } finally {
    fixture.close();
  }
});

test("regular queue runner accepts explicit lifecycle hooks and always closes the run", async () => {
  const events = [];
  const group = {
    queueGroupId: "queue-group-stage1",
    platformId: "hepan",
    submissionIntervalSeconds: 0,
    pauseIntent: "none",
    remaining: [],
  };
  const transitions = {
    beginRegularRemoteSubmission() {
      throw new Error("unexpected remote submission");
    },
    claimRegularQueueGroupHead() {
      return null;
    },
    listRegularQueueGroupSnapshots() {
      return [group];
    },
    pauseAllRegularQueueGroups() {
      return { changedCount: 0, groups: [] };
    },
    pauseRegularQueueGroupsOnStartup() {
      return { changedCount: 0, groups: [] };
    },
    renewRegularQueueGroupClaim() {
      throw new Error("unexpected claim renewal");
    },
    setRegularQueueGroupRunIntent() {
      return group;
    },
    startAllRegularQueueGroups() {
      return { changedCount: 0, groups: [] };
    },
  };
  const executor = {
    beginQueueRun(runId) {
      events.push(["begin", runId]);
    },
    endQueueRun() {
      events.push(["end"]);
    },
    async preparePlatformSubmission() {
      throw new Error("unexpected preparation");
    },
  };

  const orchestrator = createRegularQueueGroupOrchestrator({
    regularQueueGroupTransitions: transitions,
    platformSubmissionExecutor: executor,
    randomUUID: () => "stage1",
  });
  const result = await orchestrator.startGroup({
    queueGroupId: group.queueGroupId,
  });

  assert.deepEqual(result, {
    queueGroupId: group.queueGroupId,
    status: "idle",
  });
  assert.deepEqual(events, [
    ["begin", "queue-run-queue-group-stage1"],
    ["end"],
  ]);
});
