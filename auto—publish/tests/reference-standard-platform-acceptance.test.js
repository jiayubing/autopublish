"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { loadPlatformModules, loadPlatforms } = require("../src/core/platforms");
const {
  createArticleMutationCoordinator,
} = require("../src/content/article-mutation-coordinator");
const { createArticleStore } = require("../src/content/article-store");
const { createContentStore } = require("../src/content/content-store");
const {
  createOperationalStore,
} = require("../src/infrastructure/operational-store/operational-store");
const {
  createPlatformAccountBindingStore,
} = require("../desktop/services/platform-account-binding-store");
const {
  createPlatformAccountInspector,
} = require("../desktop/services/platform-account-inspector");
const {
  createPlatformSessionService,
} = require("../desktop/services/platform-session-service");
const {
  createRegularImagePlanService,
} = require("../desktop/services/regular-image-plan-service");
const {
  createRegularPlatformOutcomeService,
} = require("../desktop/services/regular-platform-outcome-service");
const {
  createRegularPlatformPreparationPort,
} = require("../desktop/services/regular-platform-preparation-port");
const {
  createRegularQueueApplication,
} = require("../desktop/services/regular-queue-application");
const {
  createSubmissionCenterSnapshot,
} = require("../desktop/services/submission-center-snapshot");
const {
  createSubmissionTargetCatalog,
} = require("../desktop/services/submission-target-catalog");
const {
  createArticleManagementSnapshot,
} = require("../desktop/services/article-management-snapshot");
const {
  createRegularQueueGroupComposition,
} = require("../desktop/composition/regular-queue-group-composition");
const {
  productionIpcRegistry,
} = require("../desktop/ipc/contracts/production-registry");
const {
  projectManagementSnapshot,
} = require("../desktop/ipc/contracts/article-management-contracts");
const { requiredArchiveFiles } = require("../scripts/verify-alpha-package");
const {
  PLATFORM_ID,
} = require("./fixtures/reference-standard-platform/definition");
const {
  createReferenceStandardPlatformModule,
} = require("./fixtures/reference-standard-platform/platform");

const NOW = "2026-08-16T08:00:00.000Z";

function article(articleId) {
  return {
    id: articleId,
    clientId: "client-reference",
    platform: PLATFORM_ID,
    scenario: "guide",
    templateId: "template-reference",
    title: `合成标题 ${articleId}`,
    content: `合成正文 ${articleId}`,
    status: "saved",
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function referenceImage(index) {
  return Object.freeze({
    imageId: `client-image:reference-${index}`,
    name: `reference-${index}.png`,
    extension: ".png",
    mimeType: "image/png",
    width: 32,
    height: 32,
    size: 128,
  });
}

function createState(outcomes) {
  return {
    outcomes: new Map(outcomes || []),
    sessionCalls: [],
    accountPreparationCalls: [],
    accountInspectionCalls: 0,
    selectionCalls: [],
    assetReadCalls: [],
    preparations: [],
    preparedEvidence: [],
    submissions: [],
  };
}

function createHarness(options) {
  const value = options || {};
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "reference-standard-platform-"),
  );
  const state = createState(value.outcomes);
  const platformModule = createReferenceStandardPlatformModule({
    imagePublishing: value.imagePublishing === true,
  });
  const imageAssetReader = Object.freeze({
    read(input) {
      state.assetReadCalls.push(input);
      return Object.freeze({
        assetFingerprint: crypto
          .createHash("sha256")
          .update(input.imageId)
          .digest("hex"),
      });
    },
  });
  const loaded = loadPlatformModules({
    platformModules: [platformModule],
    enabledIds: [PLATFORM_ID],
    runtimeContext: {
      referenceStandardPlatformState: state,
      imageAssetReader,
    },
  });
  const platform = loaded[0];
  const directory = createSubmissionTargetCatalog({
    directoryEntries: [platform.submissionDirectoryEntry],
  });

  const transitionPorts = {};
  const operationalStore = createOperationalStore({
    workspaceRoot: root,
    transitionPorts,
    clock: () => new Date(NOW),
  });
  const articleStore = createArticleStore(root);
  const contentStore = createContentStore({
    articleStore,
    listClientIds: () => ["client-reference"],
  });
  const coordinator = createArticleMutationCoordinator({
    articleStore,
    contentStore,
    regularQueueTransitions: transitionPorts.regularQueueTransitions,
    lifecycleFacts: transitionPorts.regularQueueTransitions,
    clock: () => new Date(NOW),
  });
  const accountProfile = operationalStore.createAccountProfile({
    platformId: PLATFORM_ID,
    displayName: "合成平台账号",
  });
  const accountInspector = createPlatformAccountInspector({
    adapters: { [PLATFORM_ID]: platform.accountInspection },
    operationalStore,
    bindingStore: createPlatformAccountBindingStore({
      localStateRoot: path.join(root, "local-state"),
    }),
  });
  const imageSelectionPort = Object.freeze({
    select(input) {
      state.selectionCalls.push(input);
      return Object.freeze({
        version: 1,
        clientId: input.clientId,
        requestedCount: input.count,
        images: Object.freeze(
          Array.from({ length: input.count }, (_, index) =>
            referenceImage(index + 1),
          ),
        ),
        warnings: Object.freeze([]),
      });
    },
  });
  const imagePlanService = createRegularImagePlanService({
    imageSelectionPort,
  });
  const preparationPort = createRegularPlatformPreparationPort({
    accountInspector,
    regularImagePlanService: imagePlanService,
    regularSubmissionPorts: [
      Object.freeze({
        id: PLATFORM_ID,
        preparePlatformSubmission:
          platform.regularSubmission.preparePlatformSubmission,
      }),
    ],
  });
  let revision = 1;
  const queryCalls = { regular: 0, paid: 0, attention: 0 };
  const application = createRegularQueueApplication({
    contentStore,
    articleMutationCoordinator: coordinator,
    regularQueueTransitions: transitionPorts.regularQueueTransitions,
    regularQueueGroupTransitions: transitionPorts.regularQueueGroupTransitions,
    regularQueueGroupImageCountTransitions:
      transitionPorts.regularQueueGroupImageCountTransitions,
    accountProfileResolver: operationalStore.assertExecutableAccountProfile,
    clientSnapshotResolver: (clientId) => ({
      version: 1,
      clientId,
      displayName: "合成客户",
    }),
    platforms: [platform.submissionDirectoryEntry],
    onDataInvalidated: () => {
      revision += 1;
    },
  });
  const outcomeService = createRegularPlatformOutcomeService({
    regularOutcomeTransitions: transitionPorts.regularOutcomeTransitions,
    clock: () => new Date(NOW),
  });
  const queueComposition = createRegularQueueGroupComposition({
    regularQueueGroupTransitions: transitionPorts.regularQueueGroupTransitions,
    platformSubmissionExecutor: preparationPort,
    regularPlatformOutcomeService: outcomeService,
    onDataInvalidated: () => {
      revision += 1;
    },
    randomUUID: (() => {
      let next = 0;
      return () => `reference-${++next}`;
    })(),
  });
  const submissionCenter = createSubmissionCenterSnapshot({
    getRevision: () => revision,
    getWorkspaceRuntimeId: () => "workspace-reference",
    validateClient: (clientId) => {
      if (clientId !== "client-reference")
        throw Object.assign(new Error("missing"), { code: "CLIENT_NOT_FOUND" });
    },
    listRegularQueueGroups(input) {
      queryCalls.regular += 1;
      return application.listRegularQueueGroups(input);
    },
    listPaidMediaBatches() {
      queryCalls.paid += 1;
      return { items: [] };
    },
    listAttention() {
      queryCalls.attention += 1;
      return { items: [] };
    },
  });
  const sessionService = createPlatformSessionService({
    adapters: { [PLATFORM_ID]: platform.loginSession },
  });

  return {
    root,
    state,
    platform,
    directory,
    operationalStore,
    contentStore,
    accountProfile,
    application,
    outcomeService,
    orchestrator: queueComposition.orchestrator,
    submissionCenter,
    sessionService,
    queryCalls,
    close() {
      operationalStore.close();
      fs.rmSync(root, { recursive: true, force: true, maxRetries: 3 });
    },
  };
}

function admit(harness, articleIds, queueConfig) {
  for (const articleId of articleIds)
    harness.contentStore.createArticle(article(articleId));
  const input = {
    articleRefs: articleIds.map((articleId) => ({
      clientId: "client-reference",
      articleId,
    })),
    platformId: PLATFORM_ID,
    accountProfileId: harness.accountProfile.accountProfileId,
  };
  if (queueConfig !== undefined) input.queueConfig = queueConfig;
  return harness.application.admitRegularQueueItems(input);
}

test("reference standard platform reaches the public regular submission chain without platform special cases", async () => {
  const harness = createHarness({
    imagePublishing: true,
    outcomes: [["reference-uncertain", "uncertain"]],
  });
  try {
    assert.deepEqual(harness.directory.list(), [
      {
        id: PLATFORM_ID,
        displayName: "合成标准平台",
        scanDir: PLATFORM_ID,
        contentQueueImport: true,
        imagePublishingCapability: { supported: true },
      },
    ]);
    assert.equal(harness.sessionService.supports(PLATFORM_ID), true);
    assert.deepEqual(await harness.sessionService.openLogin(PLATFORM_ID), {
      platformId: PLATFORM_ID,
      status: "opened",
    });
    assert.deepEqual(await harness.sessionService.checkLogin(PLATFORM_ID), {
      platformId: PLATFORM_ID,
      authenticated: true,
    });
    assert.deepEqual(harness.state.sessionCalls, ["open", "check", "save"]);

    const admitted = admit(
      harness,
      ["reference-accepted", "reference-uncertain"],
      { imageCount: 2 },
    );
    const queueGroupId = admitted.items[0].queueGroupId;
    const before = harness.application
      .listRegularQueueGroups({ clientId: "client-reference" })
      .find((group) => group.queueGroupId === queueGroupId);
    assert.equal(before.imagePublishingSupported, true);
    assert.equal(before.imageCount, 2);
    assert.deepEqual(
      before.remaining.map((item) => item.articleId),
      ["reference-accepted", "reference-uncertain"],
    );

    const center = await harness.submissionCenter.get({
      clientId: "client-reference",
    });
    assert.equal(center.regular.groups[0].platformId, PLATFORM_ID);
    assert.deepEqual(center.counts, {
      regularItems: 2,
      paidBatches: 0,
      attentionItems: 0,
      total: 2,
    });
    assert.deepEqual(harness.queryCalls, {
      regular: 1,
      paid: 1,
      attention: 1,
    });

    const managementService = createArticleManagementSnapshot({
      workspaceIdentity: "workspace-reference",
      getRevision: () => 1,
      listArticles: () => [],
      listTrash: () => [],
      listBatches: () => [],
      listPublications: () => [],
      listAttention: () => ({ items: [] }),
      listTransactions: () => [],
      submissionPlatformDirectory: harness.directory,
    });
    const management = await managementService.get({
      clientId: "client-reference",
    });
    assert.equal(management.submissionPlatforms[0].displayName, "合成标准平台");
    const managementEnvelope = productionIpcRegistry.success(
      productionIpcRegistry.byCapability(
        "content.getArticleManagementSnapshot",
      ),
      projectManagementSnapshot(management),
    );
    assert.deepEqual(managementEnvelope.data.submissionPlatforms, [
      {
        id: PLATFORM_ID,
        displayName: "合成标准平台",
        contentQueueImport: true,
      },
    ]);
    const queueEnvelope = productionIpcRegistry.success(
      productionIpcRegistry.byCapability("content.listRegularQueueGroups"),
      { items: harness.application.listRegularQueueGroups() },
    );
    assert.equal(queueEnvelope.data.items[0].platformId, PLATFORM_ID);
    assert.equal(queueEnvelope.data.items[0].imagePublishingSupported, true);
    const centerEnvelope = productionIpcRegistry.success(
      productionIpcRegistry.byCapability("content.getSubmissionCenterSnapshot"),
      center,
    );
    assert.equal(centerEnvelope.data.counts.total, 2);

    const execution = await harness.orchestrator.startGroup({ queueGroupId });
    assert.equal(execution.processed.length, 2);
    assert.deepEqual(harness.state.submissions, [
      "reference-accepted",
      "reference-uncertain",
    ]);
    assert.deepEqual(
      harness.state.preparations.map((item) => item.articleId),
      ["reference-accepted", "reference-uncertain"],
    );
    assert.deepEqual(
      harness.state.preparations.map((item) => item.imagePlan.selectedCount),
      [2, 2],
    );
    assert.deepEqual(
      harness.state.preparedEvidence.map((item) => item.deliveryMode),
      ["with_images", "with_images"],
    );
    assert.equal(harness.state.assetReadCalls.length, 4);
    assert.equal(harness.state.accountPreparationCalls.length, 4);
    assert.equal(harness.state.accountInspectionCalls, 4);
    assert.equal(
      harness.outcomeService.getRegularOutcomeSnapshot({
        regularPublicationAttemptId: admitted.items[0].attemptId,
      }).publicationStatus,
      "published",
    );
    assert.equal(
      harness.outcomeService.getRegularOutcomeSnapshot({
        regularPublicationAttemptId: admitted.items[1].attemptId,
      }).publicationStatus,
      "uncertain",
    );
    assert.equal(
      harness.state.submissions.filter(
        (articleId) => articleId === "reference-uncertain",
      ).length,
      1,
    );
  } finally {
    harness.close();
  }
});

test("reference definition controls image queue configuration and text-only planning", async () => {
  const harness = createHarness({ imagePublishing: false });
  try {
    harness.contentStore.createArticle(article("reference-rejected-config"));
    assert.throws(
      () =>
        harness.application.admitRegularQueueItems({
          articleRefs: [
            {
              clientId: "client-reference",
              articleId: "reference-rejected-config",
            },
          ],
          platformId: PLATFORM_ID,
          accountProfileId: harness.accountProfile.accountProfileId,
          queueConfig: { imageCount: 1 },
        }),
      { code: "REGULAR_QUEUE_IMAGE_PUBLISHING_UNSUPPORTED" },
    );

    const admitted = admit(harness, ["reference-text-only"]);
    const queueGroupId = admitted.items[0].queueGroupId;
    const group = harness.application
      .listRegularQueueGroups()
      .find((item) => item.queueGroupId === queueGroupId);
    assert.equal(group.imagePublishingSupported, false);
    assert.equal(group.imageCount, 0);
    assert.throws(
      () =>
        harness.application.updateRegularQueueGroupImageCount({
          queueGroupId,
          imageCount: 1,
          expectedRevision: group.revision,
        }),
      { code: "REGULAR_QUEUE_IMAGE_PUBLISHING_UNSUPPORTED" },
    );

    await harness.orchestrator.startGroup({ queueGroupId });
    assert.equal(harness.state.selectionCalls.length, 1);
    assert.equal(harness.state.selectionCalls[0].count, 0);
    assert.equal(harness.state.preparations[0].imagePlan.textOnly, true);
    assert.equal(harness.state.preparedEvidence[0].deliveryMode, "text_only");
    assert.equal(harness.state.assetReadCalls.length, 0);
  } finally {
    harness.close();
  }
});

function productionFiles(root) {
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...productionFiles(absolute));
    else if (/\.(?:c?js|mjs|json|ts|tsx)$/u.test(entry.name))
      files.push(absolute);
  }
  return files;
}

test("reference fixture is absent from production metadata and package inputs", () => {
  const projectRoot = path.resolve(__dirname, "..");
  const enabled = JSON.parse(
    fs.readFileSync(path.join(projectRoot, "config/platforms.json"), "utf8"),
  ).enabled;
  assert.equal(enabled.includes(PLATFORM_ID), false);
  assert.equal(
    loadPlatforms().some((platform) => platform.definition.id === PLATFORM_ID),
    false,
  );
  assert.equal(
    requiredArchiveFiles().some((filename) =>
      filename.includes("reference-standard-platform"),
    ),
    false,
  );
  const builder = fs.readFileSync(
    path.join(projectRoot, "electron-builder.alpha.yml"),
    "utf8",
  );
  assert.match(builder, /!tests\/fixtures\/\*\*/u);
  assert.match(builder, /!\*\*\/tests\/fixtures\/\*\*/u);

  for (const relative of [
    "src",
    "desktop",
    "media-workbench/src",
    "config",
    "scripts",
  ]) {
    for (const filename of productionFiles(path.join(projectRoot, relative)))
      assert.equal(
        fs.readFileSync(filename, "utf8").includes(PLATFORM_ID),
        false,
        path.relative(projectRoot, filename),
      );
  }
});
