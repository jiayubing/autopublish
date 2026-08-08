"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  createOperationalStore,
} = require("../src/infrastructure/operational-store/operational-store");
const {
  createPublicationWorkflow,
} = require("../src/application/publication-workflow");
const {
  createContentSubmissionService,
} = require("../desktop/services/content-submission-service");
const {
  createPlatformWorkbenchService,
} = require("../desktop/services/platform-workbench-service");
const {
  createPublicationSubmissionService,
} = require("../desktop/services/publication-submission-service");

function article() {
  return {
    id: "article-1",
    clientId: "client-1",
    title: "Fixture",
    content: "Body",
    status: "saved",
    createdAt: "2026-07-25T00:00:00.000Z",
    source: {
      client_material: true,
      doubao_answer: true,
      references: false,
      template: true,
    },
    materialSnapshots: [
      {
        id: "m-1",
        name: "fixture",
        extension: ".md",
        content: "fixture",
        contentHash: "hash",
        source: "text",
      },
    ],
    researchSnapshots: [
      {
        questionId: "q-1",
        answerText: "fixture",
        references: [],
        collectionMethod: "manual",
      },
    ],
    templateSnapshot: {
      platform: "fixture",
      id: "template-1",
      name: "template",
      scenario: "fixture",
      body: "body",
      bodyHash: "hash",
    },
  };
}

test("content queue execution claims and completes its original OperationalStore item", async () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "phase-03-content-chain-"),
  );
  const store = createOperationalStore({ workspaceRoot: root });
  try {
    const profile = store.createAccountProfile({
      platformId: "toutiao",
      displayName: "fixture",
    });
    const input = path.join(root, ".autopublish", "input");
    const content = createContentSubmissionService({
      workspaceRoot: root,
      paths: { input },
      operationalStore: store,
      contentStore: { getArticle: () => article() },
      platforms: [
        { id: "toutiao", scanDir: "toutiao", contentQueueImport: true },
      ],
    });
    const queued = content.createBatch({
      clientId: "client-1",
      articleIds: ["article-1"],
      platformId: "toutiao",
      accountProfileId: profile.accountProfileId,
      confirmed: true,
    });
    const workbench = createPlatformWorkbenchService({
      rootDir: root,
      paths: { input },
      platforms: [{ id: "toutiao", scanDir: "toutiao" }],
      adapters: {
        toutiao: { parseArticleFiles: async () => [{ title: "Fixture" }] },
      },
    });
    let publishedBody = null;
    const workflow = createPublicationWorkflow({
      operationalStore: store,
      clock: () => new Date("2026-07-25T00:00:00.000Z"),
      publisher: {
        inspectAccount: async () => ({
          verified: true,
          accountProfileId: profile.accountProfileId,
        }),
        publish: async (publishInput) => {
          publishedBody = publishInput.body;
          return {
            status: "submitted",
            evidence: {
              articleId: publishInput.articleId,
              attemptId: publishInput.attemptId,
              targetKey: `platform:toutiao:account:${profile.accountProfileId}`,
              accountProfileId: profile.accountProfileId,
              remoteId: "remote-1",
            },
          };
        },
      },
    });
    const service = createPublicationSubmissionService({
      workflow,
      operationalStore: store,
      workbench,
      workerPublisher: {
        registerAttempt: () => {},
        unregisterAttempt: () => {},
      },
    });
    const plan = workbench.buildSelectedPlan({
      selectedArticles: [{
        sourcePlatformId: "toutiao",
        filename: queued.items[0].filename,
      }],
      platformId: "toutiao",
      accountProfileId: profile.accountProfileId,
    });
    const result = await service.submit(plan);
    assert.equal(result.batchId, queued.batchId);
    assert.equal(result.results[0].status, "submitted");
    assert.equal(publishedBody, "Body");
    assert.equal(
      store.getSubmissionBatch(queued.batchId).items[0].status,
      "completed",
    );
    assert.equal(
      store.listPublicationRecords({ articleIds: ["article-1"] })[0].status,
      "submitted",
    );
  } finally {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("multiline platform content passes the operational DTO boundary and completes its queue item", async () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "phase-04-multiline-dto-"),
  );
  const store = createOperationalStore({ workspaceRoot: root });
  try {
    const profile = store.createAccountProfile({
      platformId: "hepan",
      displayName: "hepan-fixture",
    });
    const input = path.join(root, ".autopublish", "input");
    const content = createContentSubmissionService({
      workspaceRoot: root,
      paths: { input },
      operationalStore: store,
      contentStore: {
        getArticle: () =>
          Object.assign({}, article(), {
            content: "First paragraph.\n\nSecond paragraph.",
          }),
      },
      platforms: [{ id: "hepan", scanDir: "hepan", contentQueueImport: true }],
    });
    const queued = content.createBatch({
      clientId: "client-1",
      articleIds: ["article-1"],
      platformId: "hepan",
      accountProfileId: profile.accountProfileId,
      confirmed: true,
    });
    const workbench = createPlatformWorkbenchService({
      rootDir: root,
      paths: { input },
      platforms: [{ id: "hepan", scanDir: "hepan" }],
      adapters: {
        hepan: { parseArticleFiles: async () => [{ title: "Fixture" }] },
      },
    });
    let published = 0;
    const workflow = createPublicationWorkflow({
      operationalStore: store,
      clock: () => new Date("2026-07-25T00:00:00.000Z"),
      publisher: {
        inspectAccount: async () => ({
          verified: true,
          accountProfileId: profile.accountProfileId,
        }),
        publish: async (publishInput) => {
          published += 1;
          return {
            status: "submitted",
            evidence: {
              articleId: publishInput.articleId,
              attemptId: publishInput.attemptId,
              targetKey: `platform:hepan:account:${profile.accountProfileId}`,
              accountProfileId: profile.accountProfileId,
              remoteId: "remote-multiline",
            },
          };
        },
      },
    });
    const service = createPublicationSubmissionService({
      workflow,
      operationalStore: store,
      workbench,
      workerPublisher: {
        registerAttempt: () => {},
        unregisterAttempt: () => {},
      },
    });
    const plan = workbench.buildSelectedPlan({
      selectedArticles: [{
        sourcePlatformId: "hepan",
        filename: queued.items[0].filename,
      }],
      platformId: "hepan",
      accountProfileId: profile.accountProfileId,
    });

    const result = await service.submit(plan);
    assert.equal(result.results[0].status, "submitted");
    assert.equal(published, 1);
    assert.equal(
      store.getSubmissionBatch(queued.batchId).items[0].status,
      "completed",
    );
  } finally {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("an account verification failure does not claim later selected single-target items", async () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "phase-04-content-claim-"),
  );
  const store = createOperationalStore({ workspaceRoot: root });
  try {
    const profile = store.createAccountProfile({
      platformId: "toutiao",
      displayName: "toutiao-fixture",
    });
    const input = path.join(root, ".autopublish", "input");
    const platforms = [{ id: "toutiao", scanDir: "toutiao", contentQueueImport: true }];
    const articles = new Map([
      ["article-1", article()],
      ["article-2", Object.assign({}, article(), { id: "article-2" })],
    ]);
    const content = createContentSubmissionService({
      workspaceRoot: root,
      paths: { input },
      operationalStore: store,
      contentStore: { getArticle: (_clientId, articleId) => articles.get(articleId) },
      platforms,
    });
    const queued = content.createBatch({
      clientId: "client-1",
      articleIds: ["article-1", "article-2"],
      platformId: "toutiao",
      accountProfileId: profile.accountProfileId,
      confirmed: true,
    });
    const workbench = createPlatformWorkbenchService({
      rootDir: root,
      paths: { input },
      platforms,
      adapters: {
        toutiao: { parseArticleFiles: async () => [{ title: "Fixture" }] },
      },
    });
    const workflow = createPublicationWorkflow({
      operationalStore: store,
      clock: () => new Date("2026-07-25T00:00:00.000Z"),
      publisher: {
        inspectAccount: async () => ({ verified: false }),
        publish: async () => {
          throw new Error("must not publish");
        },
      },
    });
    const service = createPublicationSubmissionService({
      workflow,
      operationalStore: store,
      workbench,
      workerPublisher: {
        registerAttempt: () => {},
        unregisterAttempt: () => {},
      },
    });
    const plan = workbench.buildSelectedPlan({
      selectedArticles: queued.items.map((item) => ({
        sourcePlatformId: "toutiao",
        filename: item.filename,
      })),
      platformId: "toutiao",
      accountProfileId: profile.accountProfileId,
    });

    await assert.rejects(() => service.submit(plan), {
      code: "ACCOUNT_PROFILE_INSPECTION_UNVERIFIED",
    });
    assert.deepEqual(
      store.getSubmissionBatch(queued.batchId).items.map((item) => item.status),
      ["queued", "queued"],
    );
  } finally {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("an expired local claim can be reclaimed instead of reporting that the queue is no longer executable", async () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "phase-04-expired-claim-"),
  );
  let now = new Date("2026-07-25T00:00:00.000Z");
  const store = createOperationalStore({
    workspaceRoot: root,
    clock: () => now,
  });
  try {
    const profile = store.createAccountProfile({
      platformId: "toutiao",
      displayName: "fixture",
    });
    const input = path.join(root, ".autopublish", "input");
    const platforms = [
      { id: "toutiao", scanDir: "toutiao", contentQueueImport: true },
    ];
    const content = createContentSubmissionService({
      workspaceRoot: root,
      paths: { input },
      operationalStore: store,
      contentStore: { getArticle: () => article() },
      platforms,
    });
    const queued = content.createBatch({
      clientId: "client-1",
      articleIds: ["article-1"],
      platformId: "toutiao",
      accountProfileId: profile.accountProfileId,
      confirmed: true,
    });
    const durable = store.getSubmissionBatch(queued.batchId).items[0];
    store.claimSubmissionItemById({
      batchId: queued.batchId,
      itemId: durable.itemId,
      claimToken: "abandoned-claim",
      leaseMs: 1000,
    });
    now = new Date("2026-07-25T00:00:02.000Z");

    const workbench = createPlatformWorkbenchService({
      rootDir: root,
      paths: { input },
      platforms,
      adapters: {
        toutiao: { parseArticleFiles: async () => [{ title: "Fixture" }] },
      },
    });
    const workflow = createPublicationWorkflow({
      operationalStore: store,
      clock: () => now,
      publisher: {
        inspectAccount: async () => ({
          verified: true,
          accountProfileId: profile.accountProfileId,
        }),
        publish: async (publishInput) => ({
          status: "submitted",
          evidence: {
            articleId: publishInput.articleId,
            attemptId: publishInput.attemptId,
            targetKey: `platform:toutiao:account:${profile.accountProfileId}`,
            accountProfileId: profile.accountProfileId,
            remoteId: "remote-reclaimed",
          },
        }),
      },
    });
    const service = createPublicationSubmissionService({
      workflow,
      operationalStore: store,
      workbench,
      workerPublisher: {
        registerAttempt: () => {},
        unregisterAttempt: () => {},
      },
    });
    const plan = workbench.buildSelectedPlan({
      selectedArticles: [{
        sourcePlatformId: "toutiao",
        filename: queued.items[0].filename,
      }],
      platformId: "toutiao",
      accountProfileId: profile.accountProfileId,
    });

    const result = await service.submit(plan);
    assert.equal(result.results[0].status, "submitted");
    assert.equal(
      store.getSubmissionBatch(queued.batchId).items[0].status,
      "completed",
    );
  } finally {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
