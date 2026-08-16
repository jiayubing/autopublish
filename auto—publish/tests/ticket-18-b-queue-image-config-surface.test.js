"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  createArticleMutationCoordinator,
} = require("../src/content/article-mutation-coordinator");
const { createArticleStore } = require("../src/content/article-store");
const { createContentStore } = require("../src/content/content-store");
const {
  createOperationalStore,
} = require("../src/infrastructure/operational-store/operational-store");
const {
  createRegularQueueApplication,
} = require("../desktop/services/regular-queue-application");
const { createContractRegistry } = require("../desktop/ipc/contracts/registry");
const {
  submissionRegularContracts,
} = require("../desktop/ipc/contracts/submission-regular-contracts");
const {
  registerContentSubmissionIpc,
} = require("../desktop/ipc/content-submission-ipc");

const NOW = "2026-08-15T12:00:00.000Z";

function article(articleId, clientId = "client-a") {
  return {
    id: articleId,
    clientId,
    platform: "toutiao",
    scenario: "guide",
    templateId: "template-1",
    title: `Title ${articleId}`,
    content: `Body ${articleId}`,
    status: "saved",
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function openRuntime(root, options) {
  const value = options || {};
  const transitionPorts = {};
  const store = createOperationalStore({
    workspaceRoot: root,
    transitionPorts,
    clock: () => new Date(NOW),
  });
  const articleStore = createArticleStore(root);
  const contentStore = createContentStore({
    articleStore,
    listClientIds: () => ["client-a", "client-b"],
  });
  const coordinator = createArticleMutationCoordinator({
    articleStore,
    contentStore,
    regularQueueTransitions: transitionPorts.regularQueueTransitions,
    lifecycleFacts: transitionPorts.regularQueueTransitions,
    clock: () => new Date(NOW),
  });
  const invalidations = [];
  const application = createRegularQueueApplication({
    contentStore,
    articleMutationCoordinator: coordinator,
    regularQueueTransitions: transitionPorts.regularQueueTransitions,
    regularQueueGroupTransitions: transitionPorts.regularQueueGroupTransitions,
    regularQueueGroupImageCountTransitions:
      transitionPorts.regularQueueGroupImageCountTransitions,
    accountProfileResolver: store.assertExecutableAccountProfile,
    clientSnapshotResolver: (clientId) => ({
      version: 1,
      clientId,
      displayName: `客户 ${clientId}`,
    }),
    onDataInvalidated: (code) => invalidations.push(code),
    platforms: value.platforms || [
      {
        id: "toutiao", publicationTargetKind: "platform", imagePublishing: false,
      },
      {
        id: "hepan", publicationTargetKind: "platform", imagePublishing: false,
      },
      {
        id: "lieju", publicationTargetKind: "platform", imagePublishing: true,
      },
    ],
  });
  return {
    store,
    contentStore,
    transitionPorts,
    application,
    invalidations,
    close() {
      store.close();
    },
  };
}

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ticket-18-b-"));
  const runtime = openRuntime(root);
  const profiles = {
    toutiao: runtime.store.createAccountProfile({
      platformId: "toutiao",
      displayName: "头条账号",
    }),
    hepan: runtime.store.createAccountProfile({
      platformId: "hepan",
      displayName: "河畔账号",
    }),
    lieju: runtime.store.createAccountProfile({
      platformId: "lieju",
      displayName: "列举网账号",
    }),
  };
  return {
    root,
    runtime,
    profiles,
    close() {
      runtime.close();
      fs.rmSync(root, { recursive: true, force: true, maxRetries: 3 });
    },
  };
}

function admissionInput(profile, articleId, queueConfig) {
  const input = {
    articleRefs: [{ clientId: "client-a", articleId }],
    platformId: profile.platformId,
    accountProfileId: profile.accountProfileId,
  };
  if (queueConfig !== undefined) input.queueConfig = queueConfig;
  return input;
}

function group(application, queueGroupId) {
  const snapshot = application.listRegularQueueGroups();
  return snapshot.find((item) => item.queueGroupId === queueGroupId);
}

test("18-B application admits only imageCount 0..5, preserves existing groups, and updates through the named transition", () => {
  const fixture = setup();
  try {
    fixture.runtime.contentStore.createArticle(article("default-count"));
    fixture.runtime.contentStore.createArticle(article("zero-count"));
    fixture.runtime.contentStore.createArticle(article("append-count"));
    fixture.runtime.contentStore.createArticle(article("unsupported-count"));

    const defaultAdmission = fixture.runtime.application.admitRegularQueueItems(
      admissionInput(fixture.profiles.toutiao, "default-count"),
    );
    assert.equal(
      group(fixture.runtime.application, defaultAdmission.items[0].queueGroupId)
        .imageCount,
      0,
    );

    const zeroAdmission = fixture.runtime.application.admitRegularQueueItems(
      admissionInput(fixture.profiles.lieju, "zero-count", { imageCount: 0 }),
    );
    const before = group(
      fixture.runtime.application,
      zeroAdmission.items[0].queueGroupId,
    );
    assert.equal(before.imageCount, 0);
    assert.equal(before.imagePublishingSupported, true);

    fixture.runtime.application.admitRegularQueueItems(
      admissionInput(fixture.profiles.lieju, "append-count", {
        queueGroupId: before.queueGroupId,
        imageCount: 5,
      }),
    );
    assert.equal(
      group(fixture.runtime.application, before.queueGroupId).imageCount,
      0,
      "admission cannot silently rewrite an existing group configuration",
    );

    const updated =
      fixture.runtime.application.updateRegularQueueGroupImageCount({
        queueGroupId: before.queueGroupId,
        imageCount: 5,
        expectedRevision: before.revision,
      });
    const saved = updated.find(
      (item) => item.queueGroupId === before.queueGroupId,
    );
    assert.equal(saved.imageCount, 5);
    assert.equal(saved.revision, before.revision + 1);
    assert.ok(
      fixture.runtime.invalidations.includes(
        "REGULAR_QUEUE_GROUP_IMAGE_COUNT_UPDATED",
      ),
    );

    assert.throws(
      () =>
        fixture.runtime.application.updateRegularQueueGroupImageCount({
          queueGroupId: before.queueGroupId,
          imageCount: 1,
          expectedRevision: before.revision,
        }),
      { code: "OPERATIONAL_QUEUE_GROUP_REVISION_CONFLICT" },
    );
    assert.equal(
      group(fixture.runtime.application, before.queueGroupId).imageCount,
      5,
    );

    for (const imageCount of [-1, 6, 1.5, "1", null]) {
      assert.throws(
        () =>
          fixture.runtime.application.previewRegularQueueAdmission(
            admissionInput(fixture.profiles.toutiao, "default-count", {
              imageCount,
            }),
          ),
        { code: "REGULAR_QUEUE_CONFIG_INVALID" },
      );
    }
    for (const profile of [fixture.profiles.toutiao, fixture.profiles.hepan])
      assert.throws(
        () =>
          fixture.runtime.application.previewRegularQueueAdmission(
            admissionInput(profile, "default-count", { imageCount: 1 }),
          ),
        { code: "REGULAR_QUEUE_IMAGE_PUBLISHING_UNSUPPORTED" },
      );
    assert.throws(
      () =>
        fixture.runtime.application.admitRegularQueueItems(
          admissionInput(fixture.profiles.hepan, "unsupported-count", {
            imageCount: 1,
          }),
        ),
      { code: "REGULAR_QUEUE_IMAGE_PUBLISHING_UNSUPPORTED" },
    );
    assert.throws(
      () =>
        fixture.runtime.application.previewRegularQueueAdmission(
          admissionInput(fixture.profiles.toutiao, "default-count", {
            imageCount: 1,
            imagePath: "C:\\private.jpg",
          }),
        ),
      { code: "REGULAR_QUEUE_CONFIG_INVALID" },
    );
    assert.throws(
      () =>
        fixture.runtime.application.updateRegularQueueGroupImageCount({
          queueGroupId: before.queueGroupId,
          imageCount: 6,
          expectedRevision: saved.revision,
          imagePath: "C:\\private.jpg",
        }),
      { code: "REGULAR_QUEUE_CONFIG_INVALID" },
    );
    assert.equal(
      group(fixture.runtime.application, before.queueGroupId).imageCount,
      5,
    );
  } finally {
    fixture.close();
  }
});

test("18-B rereads a saved zero-to-nonzero update after restart and fails closed for undeclared capabilities", () => {
  const fixture = setup();
  let reopened;
  try {
    fixture.runtime.contentStore.createArticle(article("restart-image-count"));
    const admission = fixture.runtime.application.admitRegularQueueItems(
      admissionInput(fixture.profiles.toutiao, "restart-image-count", {
        imageCount: 0,
      }),
    );
    const before = group(
      fixture.runtime.application,
      admission.items[0].queueGroupId,
    );
    assert.equal(before.imagePublishingSupported, false);
    assert.throws(
      () =>
        fixture.runtime.application.updateRegularQueueGroupImageCount({
          queueGroupId: before.queueGroupId,
          imageCount: 1,
          expectedRevision: before.revision,
        }),
      { code: "REGULAR_QUEUE_IMAGE_PUBLISHING_UNSUPPORTED" },
    );
    fixture.runtime.close();

    reopened = openRuntime(fixture.root);
    const persisted = group(reopened.application, before.queueGroupId);
    assert.equal(persisted.imageCount, 0);
    assert.equal(persisted.imagePublishingSupported, false);
    assert.equal(
      Object.prototype.hasOwnProperty.call(persisted, "imagePath"),
      false,
    );
    assert.equal(
      Object.prototype.hasOwnProperty.call(persisted, "images"),
      false,
    );
  } finally {
    if (reopened) reopened.close();
    else fixture.runtime.close();
    fs.rmSync(fixture.root, { recursive: true, force: true, maxRetries: 3 });
  }
});

test("18-B IPC accepts only the closed image-count command and returns its refreshed snapshot", async () => {
  const fixture = setup();
  try {
    fixture.runtime.contentStore.createArticle(article("ipc-image-count"));
    const admission = fixture.runtime.application.admitRegularQueueItems(
      admissionInput(fixture.profiles.lieju, "ipc-image-count", {
        imageCount: 1,
      }),
    );
    const before = group(
      fixture.runtime.application,
      admission.items[0].queueGroupId,
    );
    const handlers = new Map();
    registerContentSubmissionIpc({
      ipcMain: {
        handle(channel, handler) {
          handlers.set(channel, handler);
        },
      },
      submissionMaintenance: {},
      regularQueueApplication: fixture.runtime.application,
    });
    const channel = "content:update-regular-queue-group-image-count";
    const response = await handlers.get(channel)(null, {
      queueGroupId: before.queueGroupId,
      imageCount: 3,
      expectedRevision: before.revision,
    });
    assert.equal(response.ok, true);
    assert.equal(
      response.data.items.find(
        (item) => item.queueGroupId === before.queueGroupId,
      ).imageCount,
      3,
    );
    const invalid = await handlers.get(channel)(null, {
      queueGroupId: before.queueGroupId,
      imageCount: 3,
      expectedRevision: before.revision + 1,
      images: [],
    });
    assert.deepEqual(invalid, {
      ok: false,
      error: {
        code: "REGULAR_QUEUE_CONFIG_INVALID",
        message: "Invalid regular queue image-count request",
      },
    });

    const registry = createContractRegistry(submissionRegularContracts);
    const contract = registry.byChannel(channel);
    assert.equal(
      contract.capability,
      "content.updateRegularQueueGroupImageCount",
    );
    const legalRequest = {
      queueGroupId: before.queueGroupId,
      imageCount: 0,
      expectedRevision: 0,
    };
    assert.deepEqual(
      registry.parseRequest(
        contract,
        registry.encodeRequest(contract, legalRequest),
      ),
      legalRequest,
    );
    assert.throws(
      () =>
        registry.encodeRequest(contract, {
          queueGroupId: before.queueGroupId,
          imageCount: 6,
          expectedRevision: 0,
        }),
      { code: "IPC_REQUEST_INVALID" },
    );
  } finally {
    fixture.close();
  }
});
