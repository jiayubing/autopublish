"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { createTypedIpcMain } = require("../desktop/ipc/register");
const {
  registerContentSubmissionIpc,
} = require("../desktop/ipc/content-submission-ipc");
const {
  productionIpcRegistry,
} = require("../desktop/ipc/contracts/production-registry");
const { createContentStore } = require("../src/content/content-store");
const { createArticleStore } = require("../src/content/article-store");
const {
  createArticleMutationCoordinator,
} = require("../src/content/article-mutation-coordinator");
const { ClientId } = require("../src/domain/identities");
const {
  createRegularQueueApplication,
} = require("../desktop/services/regular-queue-application");
const {
  createContentSubmissionService,
} = require("../desktop/services/content-submission-service");
const {
  createOperationalStore,
} = require("../src/infrastructure/operational-store/operational-store");
const { loadPreloadHarness } = require("./helpers/preload-harness");

const CLOCK = () => new Date("2026-08-12T00:00:00.000Z");
const PLATFORM = {
  id: "toutiao",
  displayName: "头条",
  scanDir: "toutiao",
  contentQueueImport: true,
  publicationTarget: { kind: "platform" },
};

function key(clientId, articleId) {
  return `${clientId}\u0000${articleId}`;
}

function ref(clientId, articleId) {
  return { clientId, articleId };
}

function article(clientId, articleId, status = "saved") {
  return {
    id: articleId,
    clientId,
    title: `标题 ${articleId}`,
    content: `正文 ${articleId}`,
    status,
    createdAt: "2026-08-12T00:00:00.000Z",
    updatedAt: "2026-08-12T00:00:00.000Z",
    platform: "toutiao",
    scenario: "guide",
    templateId: "template-1",
  };
}

function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "phase-02-paid-staging-"));
  const articles = new Map();
  const clients = new Set();
  const transitionPorts = {};
  let store;
  try {
    store = createOperationalStore({
      workspaceRoot: root,
      transitionPorts,
      clock: CLOCK,
      articleReader: {
        getArticle(clientId, articleId) {
          const value = articles.get(key(clientId, articleId));
          if (!value)
            throw Object.assign(new Error("Article was not found"), {
              code: "ARTICLE_NOT_FOUND",
            });
          return value;
        },
      },
    });
    const articleStore = createArticleStore(root, { clock: CLOCK });
    let saveCalls = 0;
    const saveArticle = articleStore.saveArticle;
    articleStore.saveArticle = function (...args) {
      saveCalls += 1;
      return saveArticle.apply(articleStore, args);
    };
    const contentStore = createContentStore({
      articleStore,
      listClientIds: () => [...clients],
    });
    const coordinator = createArticleMutationCoordinator({
      articleStore,
      contentStore,
      regularQueueTransitions: transitionPorts.regularQueueTransitions,
      lifecycleFacts: transitionPorts.regularQueueTransitions,
      paidStagingTransitions: transitionPorts.paidStagingTransitions,
      clock: CLOCK,
    });
    const profile = store.createAccountProfile({
      platformId: PLATFORM.id,
      displayName: "测试账号",
    });
    const regularQueue = createRegularQueueApplication({
      contentStore,
      articleMutationCoordinator: coordinator,
      regularQueueTransitions: transitionPorts.regularQueueTransitions,
      paidStagingTransitions: transitionPorts.paidStagingTransitions,
      accountProfileResolver: store.assertExecutableAccountProfile,
      platforms: [PLATFORM],
    });
    const contentSubmission = createContentSubmissionService({
      workspaceRoot: root,
      operationalStore: store,
      contentStore,
      platforms: [PLATFORM],
    });
    return {
      root,
      store,
      contentStore,
      contentSubmission,
      regularQueue,
      profile,
      add(value) {
        const saved = contentStore.createArticle(value);
        clients.add(saved.clientId);
        articles.set(key(saved.clientId, saved.id), saved);
        return saved;
      },
      getSaveCalls() {
        return saveCalls;
      },
      close() {
        store.close();
        fs.rmSync(root, { recursive: true, force: true });
      },
    };
  } catch (error) {
    if (store) store.close();
    fs.rmSync(root, { recursive: true, force: true });
    throw error;
  }
}

function stagingMutation(articleRef, status, idempotent = false) {
  return {
    articleRef,
    status,
    idempotent,
    ...(status === "already-staged" ? { reasonCode: "ALREADY_STAGED" } : {}),
    ...(status === "not-staged" ? { reasonCode: "NOT_IN_STAGING" } : {}),
  };
}

function stagingFixtures() {
  const articleRef = ref("client-1", "article-1");
  return {
    add: {
      items: [stagingMutation(articleRef, "staged")],
      addedCount: 1,
      idempotentCount: 0,
    },
    remove: {
      items: [stagingMutation(articleRef, "removed")],
      removedCount: 1,
      idempotentCount: 0,
    },
    media: {
      items: [stagingMutation(articleRef, "media-updated")],
      updatedCount: 1,
      idempotentCount: 0,
      selectedMediaResourceId: "media-1",
    },
    list: {
      clientId: "client-1",
      items: [
        {
          articleRef,
          selectedMediaResourceId: "media-1",
          createdAt: "2026-08-12T00:00:00.000Z",
          updatedAt: "2026-08-12T00:00:00.000Z",
        },
      ],
    },
  };
}

test("application staging capability accepts persisted generated and saved articles while preserving guards", () => {
  const fixture = makeFixture();
  try {
    const saved = ref("client-a", "saved-1");
    const generated = ref("client-a", "generated-1");
    const active = ref("client-a", "active-1");
    fixture.add(article(saved.clientId, saved.articleId));
    fixture.add(article(generated.clientId, generated.articleId, "generated"));
    fixture.add(article(active.clientId, active.articleId));

    const added = fixture.contentSubmission.addPaidSubmissionStaging({
      articleRefs: [saved],
    });
    assert.equal(added.addedCount, 1);
    assert.equal(added.items[0].status, "staged");

    const duplicate = fixture.contentSubmission.addPaidSubmissionStaging({
      articleRefs: [saved],
    });
    assert.equal(duplicate.idempotentCount, 1);
    assert.equal(duplicate.items[0].reasonCode, "ALREADY_STAGED");

    const generatedAdded = fixture.contentSubmission.addPaidSubmissionStaging({
      articleRefs: [generated],
    });
    assert.equal(generatedAdded.addedCount, 1);
    assert.equal(generatedAdded.items[0].status, "staged");
    assert.equal(
      fixture.contentStore.getArticle(generated.clientId, generated.articleId)
        .status,
      "generated",
    );
    assert.equal(fixture.getSaveCalls(), 0);

    assert.throws(
      () =>
        fixture.contentSubmission.addPaidSubmissionStaging({
          articleRefs: [ref("client-a", "missing-1")],
        }),
      { code: "ARTICLE_NOT_FOUND" },
    );

    fixture.store.reservePublicationTarget({
      articleId: active.articleId,
      publicationId: "publication-active",
      attemptId: "attempt-active",
      target: { kind: "media", mediaResourceId: "media-existing" },
    });
    assert.throws(
      () =>
        fixture.contentSubmission.addPaidSubmissionStaging({
          articleRefs: [active],
        }),
      { code: "ACTIVE_PUBLICATION_CONFLICT" },
    );

    const selected = fixture.contentSubmission.setPaidSubmissionStagingMedia({
      articleRefs: [saved],
      mediaResourceId: "media-1",
    });
    assert.equal(selected.selectedMediaResourceId, "media-1");
    assert.throws(
      () =>
        fixture.contentSubmission.setPaidSubmissionStagingMedia({
          articleRefs: [saved],
          mediaResourceId: "../dangerous",
        }),
      { code: "INVALID_MEDIA_RESOURCE_ID" },
    );
    const list = fixture.contentSubmission.getPaidSubmissionStaging({
      clientId: saved.clientId,
    });
    assert.deepEqual(
      list.items.map((item) => item.articleRef),
      [generated, saved],
    );
    assert.equal(list.items[0].selectedMediaResourceId, null);
    assert.equal(list.items[1].selectedMediaResourceId, "media-1");

    assert.equal(fixture.store.listPaidSubmissionBatches().length, 0);
    assert.equal(fixture.store.listRemoteOrders().length, 0);
  } finally {
    fixture.close();
  }
});

test("regular admission is blocked while staged and recovers only after explicit removal", () => {
  const fixture = makeFixture();
  try {
    const articleRef = ref("client-a", "article-1");
    fixture.add(article(articleRef.clientId, articleRef.articleId));
    const input = {
      articleRefs: [articleRef],
      platformId: PLATFORM.id,
      accountProfileId: fixture.profile.accountProfileId,
    };
    fixture.contentSubmission.addPaidSubmissionStaging({
      articleRefs: [articleRef],
    });

    const blockedPreview =
      fixture.regularQueue.previewRegularQueueAdmission(input);
    assert.equal(blockedPreview.items[0].status, "conflict");
    assert.equal(
      blockedPreview.items[0].reasonCode,
      "PAID_STAGING_REGULAR_QUEUE_CONFLICT",
    );
    const blockedAdmission = fixture.regularQueue.admitRegularQueueItems(input);
    assert.equal(blockedAdmission.items[0].status, "conflict");
    assert.equal(
      blockedAdmission.items[0].reasonCode,
      "PAID_STAGING_REGULAR_QUEUE_CONFLICT",
    );
    assert.equal(
      fixture.contentSubmission.getPaidSubmissionStaging({
        clientId: articleRef.clientId,
      }).items.length,
      1,
    );
    assert.equal(fixture.store.listSubmissionQueueItems().length, 0);

    const removed = fixture.contentSubmission.removePaidSubmissionStaging({
      articleRefs: [articleRef],
    });
    assert.equal(removed.removedCount, 1);
    assert.equal(
      fixture.contentSubmission.getPaidSubmissionStaging({
        clientId: articleRef.clientId,
      }).items.length,
      0,
    );
    const recoveredPreview =
      fixture.regularQueue.previewRegularQueueAdmission(input);
    assert.equal(recoveredPreview.items[0].status, "queueable");
    const admitted = fixture.regularQueue.admitRegularQueueItems(input);
    assert.equal(admitted.admittedCount, 1);
    assert.equal(fixture.store.listSubmissionQueueItems().length, 1);
  } finally {
    fixture.close();
  }
});

test("typed staging IPC preserves known business errors and preload forwards the four public channels", async () => {
  const handlers = new Map();
  let addErrorCode = null;
  let receivedInput = null;
  const fixtures = stagingFixtures();
  const ipcMain = createTypedIpcMain({
    handle(channel, handler) {
      handlers.set(channel, handler);
    },
  });
  registerContentSubmissionIpc({
    ipcMain,
    contentSubmissionService: {},
    submissionWorkflow: {
      paidStaging: {
        add(input) {
          receivedInput = input;
          if (addErrorCode)
            throw Object.assign(new Error(addErrorCode), {
              code: addErrorCode,
            });
          return fixtures.add;
        },
        remove() {
          return fixtures.remove;
        },
        setMedia() {
          return fixtures.media;
        },
        list() {
          return fixtures.list;
        },
      },
    },
  });

  const addContract = productionIpcRegistry.byChannel(
    "content:add-paid-submission-staging",
  );
  const addInput = {
    articleRefs: [{ clientId: "东方视光", articleId: "article-1" }],
  };
  const addWire = await handlers.get(addContract.channel)(
    null,
    productionIpcRegistry.encodeRequest(addContract, addInput),
  );
  assert.deepEqual(
    productionIpcRegistry.parseResult(addContract, addWire),
    fixtures.add,
  );
  assert.deepEqual(receivedInput, addInput);

  for (const code of [
    "ARTICLE_NOT_FOUND",
    "ARTICLE_NOT_SAVED",
    "ALREADY_STAGED",
    "ACTIVE_PUBLICATION_CONFLICT",
    "NOT_IN_STAGING",
    "INVALID_MEDIA_RESOURCE_ID",
    "STAGING_PERSISTENCE_FAILED",
  ]) {
    addErrorCode = code;
    const wire = await handlers.get(addContract.channel)(
      null,
      productionIpcRegistry.encodeRequest(addContract, {
        articleRefs: [ref("client-1", "article-1")],
      }),
    );
    assert.equal(wire.ok, false);
    assert.equal(wire.error.code, code);
    assert.notEqual(wire.error.code, "IPC_INTERNAL");
    assert.equal(
      productionIpcRegistry.parseResult(addContract, wire).code,
      code,
    );
  }

  const preload = loadPreloadHarness({
    invoke(channel, request) {
      const contract = productionIpcRegistry.byChannel(channel);
      assert.ok(contract);
      const expected =
        channel === "content:add-paid-submission-staging"
          ? addInput
          : channel === "content:remove-paid-submission-staging"
            ? { articleRefs: [ref("client-1", "article-1")] }
            : channel === "content:set-paid-submission-staging-media"
              ? {
                  articleRefs: [ref("client-1", "article-1")],
                  mediaResourceId: "media-1",
                }
              : { clientId: "client-1" };
      assert.deepEqual(
        productionIpcRegistry.parseRequest(contract, request),
        expected,
      );
      const result =
        channel === "content:add-paid-submission-staging"
          ? fixtures.add
          : channel === "content:remove-paid-submission-staging"
            ? fixtures.remove
            : channel === "content:set-paid-submission-staging-media"
              ? fixtures.media
              : fixtures.list;
      return productionIpcRegistry.success(contract, result);
    },
  });
  await preload.api.content.addPaidSubmissionStaging(addInput);
  await preload.api.content.removePaidSubmissionStaging({
    articleRefs: [ref("client-1", "article-1")],
  });
  await preload.api.content.setPaidSubmissionStagingMedia({
    articleRefs: [ref("client-1", "article-1")],
    mediaResourceId: "media-1",
  });
  await preload.api.content.getPaidSubmissionStaging({ clientId: "client-1" });
  assert.deepEqual(
    preload.transportCalls.map((entry) => entry[0]),
    [
      "content:add-paid-submission-staging",
      "content:remove-paid-submission-staging",
      "content:set-paid-submission-staging-media",
      "content:get-paid-submission-staging",
    ],
  );
});

test("ClientId accepts Unicode customer identities but rejects dangerous path values at domain and IPC boundaries", () => {
  assert.equal(ClientId.parse(" 东方视光 ").value, "东方视光");
  assert.throws(() => ClientId.parse("../escape"), {
    code: "DOMAIN_ID_INVALID",
  });
  const contract = productionIpcRegistry.byCapability(
    "content.addPaidSubmissionStaging",
  );
  assert.doesNotThrow(() =>
    productionIpcRegistry.encodeRequest(contract, {
      articleRefs: [ref("东方视光", "article-1")],
    }),
  );
  assert.throws(
    () =>
      productionIpcRegistry.encodeRequest(contract, {
        articleRefs: [ref("../escape", "article-1")],
      }),
    { code: "IPC_REQUEST_INVALID" },
  );
});
