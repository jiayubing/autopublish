"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { createContractRegistry } = require("../desktop/ipc/contracts/registry");
const {
  articleEditorContracts,
} = require("../desktop/ipc/contracts/article-editor-contracts");
const {
  createArticleMutationCoordinator,
} = require("../src/content/article-mutation-coordinator");
const { createArticleStore } = require("../src/content/article-store");
const {
  createArticleTrashService,
} = require("../src/content/article-trash-service");
const {
  createContentStore,
  fingerprintArticle,
} = require("../src/content/content-store");
const {
  canonicalArticleRefKey,
  canonicalArticleRefs,
} = require("../src/content/article-ref");
const {
  deriveArticleLifecycle,
} = require("../src/content/article-lifecycle-projection");

function article(id, clientId = "client-a", overrides) {
  return Object.assign(
    {
      id,
      clientId,
      platform: "toutiao",
      scenario: "guide",
      templateId: "template-1",
      title: "Title " + id,
      content: "Body " + id,
      status: "saved",
      createdAt: "2026-07-11T00:00:00.000Z",
      updatedAt: "2026-07-11T00:00:00.000Z",
    },
    overrides || {},
  );
}

function emptyFacts() {
  return {
    publications: [],
    submissionItems: [],
    orders: [],
    attentionItems: [],
    removalTransactions: [],
  };
}

function makeFixture(options) {
  const value = options || {};
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "article-mutation-coordinator-"),
  );
  let facts = emptyFacts();
  const lockEvents = [];
  const articleStore = createArticleStore(root, {
    internalArticleLockFault(point, detail) {
      if (
        point === "after-candidate-owner" &&
        detail &&
        detail.files &&
        detail.files.json
      ) {
        lockEvents.push(path.basename(detail.files.json, ".json"));
      }
      if (typeof value.lockFault === "function") value.lockFault(point, detail);
    },
  });
  const clients = new Set(["client-a", "client-b"]);
  const contentStore = createContentStore({
    articleStore,
    listClientIds: () => [...clients],
  });
  const operationalStore = {
    listArticleLifecycleFacts() {
      return facts;
    },
  };
  const coordinator = createArticleMutationCoordinator({
    articleStore,
    contentStore,
    operationalStore,
    regularQueueTransitions: value.regularQueueTransitions,
  });
  return {
    root,
    articleStore,
    contentStore,
    operationalStore,
    coordinator,
    lockEvents,
    setFacts(next) {
      facts = Object.assign(emptyFacts(), next || {});
    },
    add(valueArticle) {
      clients.add(valueArticle.clientId);
      articleStore.createArticle(valueArticle);
    },
    close() {
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

function tombstoneFor(valueArticle, operationId) {
  return {
    version: 1,
    deletedAt: "2026-07-11T00:00:00.000Z",
    clientId: valueArticle.clientId,
    articleId: valueArticle.id,
    status: valueArticle.status,
    references: [],
    titleSnapshot: valueArticle.title,
    contentFingerprint: fingerprintArticle(valueArticle),
    operationId,
  };
}

function removalServiceFor(fixture) {
  return createArticleTrashService({
    workspaceRoot: fixture.root,
    contentStore: fixture.contentStore,
    mutationCoordinator: fixture.coordinator,
    articleRemovalImpactQuery: {
      previewArticleRemovalImpact() {
        return {
          canCommit: true,
          blockedItems: [],
        };
      },
    },
  });
}

test("existing article save uses opaque fingerprint CAS and returns the next token", () => {
  const fixture = makeFixture();
  try {
    const original = article("article-1");
    fixture.add(original);
    const first = fixture.coordinator.readArticleForEdit({
      clientId: "client-a",
      articleId: "article-1",
    });
    assert.match(first.editFingerprint, /^[a-f0-9]{64}$/);
    const saved = fixture.coordinator.saveExistingArticle({
      article: Object.assign({}, original, {
        title: "Updated title",
        content: "Updated body",
        editFingerprint: "renderer-must-not-persist",
      }),
      expectedFingerprint: first.editFingerprint,
    });
    assert.equal(saved.outcome, "saved");
    assert.match(saved.editFingerprint, /^[a-f0-9]{64}$/);
    assert.notEqual(saved.editFingerprint, first.editFingerprint);
    assert.equal(
      Object.prototype.hasOwnProperty.call(saved.article, "editFingerprint"),
      false,
    );
    const stale = fixture.coordinator.saveExistingArticle({
      article: Object.assign({}, original, { title: "Stale title" }),
      expectedFingerprint: first.editFingerprint,
    });
    assert.deepEqual(stale, {
      outcome: "conflict",
      code: "ARTICLE_EDIT_CONFLICT",
      articleId: "article-1",
      refreshRequired: true,
    });
    assert.equal(
      fixture.contentStore.getArticle("client-a", "article-1").title,
      "Updated title",
    );
    const json = fs.readFileSync(
      path.join(fixture.root, "generated", "client-a", "article-1.json"),
      "utf8",
    );
    const markdown = fs.readFileSync(
      path.join(fixture.root, "generated", "client-a", "article-1.md"),
      "utf8",
    );
    assert.doesNotMatch(json, /editFingerprint|renderer-must-not-persist/);
    assert.doesNotMatch(markdown, /editFingerprint|renderer-must-not-persist/);
  } finally {
    fixture.close();
  }
});
test("save IPC contract requires a fingerprint and accepts only closed typed outcomes", () => {
  const registry = createContractRegistry(articleEditorContracts);
  const contract = registry.byChannel("content:save-article");
  assert.throws(
    () => registry.encodeRequest(contract, { article: article("article-1") }),
    { code: "IPC_REQUEST_INVALID" },
  );
  const conflict = registry.success(contract, {
    outcome: "conflict",
    code: "ARTICLE_EDIT_CONFLICT",
    articleId: "article-1",
    refreshRequired: true,
  });
  assert.equal(conflict.data.outcome, "conflict");
  assert.throws(() => registry.success(contract, { outcome: "unsupported" }), {
    code: "IPC_RESULT_INVALID",
  });
});

test("ordinary article edits preserve generation provenance when the request carries stale source fields", () => {
  const original = article("article-provenance", "client-a", {
    materialIds: ["brand-v1.md"],
    researchQueryIds: ["question-v1"],
    materialSnapshots: [{
      id: "brand-v1.md",
      name: "品牌资料 v1",
      extension: ".md",
      content: "生成时资料",
      contentHash: "hash-v1",
      source: "client-material",
    }],
    researchSnapshots: [{
      questionId: "question-v1",
      question: "旧问题",
      answerText: "生成时回答",
      references: [],
      collectedAt: "2026-07-11T00:00:00.000Z",
      collectionMethod: "manual",
    }],
    templateId: "template-v1",
    templateSnapshot: {
      platform: "toutiao",
      id: "template-v1",
      name: "模板 v1",
      scenario: "guide",
      body: "生成时模板",
      bodyHash: "template-hash-v1",
    },
  });
  const fixture = makeFixture();
  try {
    fixture.add(original);
    const editor = fixture.coordinator.readArticleForEdit({
      clientId: original.clientId,
      articleId: original.id,
    });
    const saved = fixture.coordinator.saveExistingArticle({
    article: Object.assign({}, editor.article, {
      title: "编辑后的标题",
      content: "编辑后的正文",
      materialIds: ["brand-v2.md"],
      researchQueryIds: ["question-v2"],
      materialSnapshots: [{
        id: "brand-v2.md",
        name: "当前资料 v2",
        extension: ".md",
        content: "不应写入",
        contentHash: "hash-v2",
        source: "client-material",
      }],
      templateId: "template-v2",
      templateSnapshot: Object.assign({}, original.templateSnapshot, {
        id: "template-v2",
        body: "当前模板 v2",
        bodyHash: "template-hash-v2",
      }),
    }),
    expectedFingerprint: editor.editFingerprint,
    });
    assert.equal(saved.outcome, "saved");
    assert.equal(saved.article.title, "编辑后的标题");
    assert.equal(saved.article.content, "编辑后的正文");
    assert.deepEqual(saved.article.materialIds, original.materialIds);
    assert.deepEqual(saved.article.researchQueryIds, original.researchQueryIds);
    assert.deepEqual(saved.article.materialSnapshots, original.materialSnapshots);
    assert.deepEqual(saved.article.researchSnapshots, original.researchSnapshots);
    assert.equal(saved.article.templateId, original.templateId);
    assert.deepEqual(saved.article.templateSnapshot, original.templateSnapshot);
  } finally {
    fixture.close();
  }
});

test("lifecycle projection exposes one operation decision matrix for runtime facts", () => {
  const base = article("article-1");
  const cases = [
    [
      "active queue",
      {
        submissionItems: [
          {
            articleId: base.id,
            targetKey: "platform:toutiao",
            status: "queued",
          },
        ],
      },
      "ARTICLE_OPERATION_FROZEN",
    ],
    [
      "active publication",
      {
        publications: [
          {
            articleId: base.id,
            targetKey: "platform:toutiao",
            status: "remote_started",
          },
        ],
      },
      "ARTICLE_OPERATION_FROZEN",
    ],
    [
      "active order",
      {
        orders: [
          {
            articleId: base.id,
            targetKey: "media-resource:resource-1",
            orderId: "order-1",
            supplierStatusCode: "0",
          },
        ],
      },
      "ARTICLE_OPERATION_FROZEN",
    ],
    [
      "uncertain result",
      {
        publications: [
          {
            articleId: base.id,
            targetKey: "platform:toutiao",
            status: "uncertain",
          },
        ],
      },
      "PUBLICATION_UNCERTAIN",
    ],
    [
      "removal repair",
      {
        removalTransactions: [
          { articleId: base.id, status: "needs_repair", phase: "needs_repair" },
        ],
      },
      "REMOVAL_REPAIR_REQUIRED",
    ],
    [
      "published",
      {
        publications: [
          {
            articleId: base.id,
            targetKey: "platform:toutiao",
            status: "published",
          },
        ],
      },
      "ARTICLE_PUBLISHED_IMMUTABLE",
    ],
  ];
  for (const [name, facts, reason] of cases) {
    const projection = deriveArticleLifecycle(
      Object.assign({ article: base }, facts),
    );
    assert.deepEqual(
      Object.keys(projection.operations).sort(),
      ["edit", "purge", "queue", "retarget", "restore", "submit", "trash"].sort(),
      name,
    );
    assert.equal(projection.operations.edit.allowed, false, name);
    assert.equal(projection.operations.edit.reasonCodes[0], reason, name);
    assert.equal(projection.operations.queue.allowed, false, name);
    assert.equal(projection.operations.submit.allowed, false, name);
    assert.equal(projection.operations.trash.allowed, false, name);
  }
  const failed = deriveArticleLifecycle({
    article: base,
    publications: [
      { articleId: base.id, targetKey: "platform:toutiao", status: "failed" },
    ],
  });
  assert.equal(failed.operations.edit.allowed, true);
  assert.equal(failed.operations.submit.allowed, true);
  assert.equal(failed.operations.retarget.allowed, true);
  assert.equal(failed.operations.trash.allowed, true);
  const unrelatedRemoval = deriveArticleLifecycle({
    article: base,
    removalTransactions: [
      {
        status: "needs_repair",
        phase: "needs_repair",
        selections: [{ clientId: "client-b", articleId: base.id }],
      },
    ],
  });
  assert.equal(unrelatedRemoval.operations.edit.allowed, true);
  assert.equal(unrelatedRemoval.operations.trash.allowed, true);
});

test("regular admission canonicalizes duplicates and maps active or explicit conflicts", () => {
  let facts = emptyFacts();
  let transitionCalls = 0;
  let transitionFailure = null;
  const transitions = {
    listArticleLifecycleFacts() {
      return facts;
    },
    admitRegularQueueItem(input) {
      transitionCalls += 1;
      if (transitionFailure) throw transitionFailure;
      return {
        articleId: input.articleId,
        itemId: input.itemId,
        batchId: input.batchId,
        targetKey: "platform:toutiao",
        status: "queued",
        idempotent: false,
      };
    },
  };
  const fixture = makeFixture({ regularQueueTransitions: transitions });
  try {
    fixture.add(article("article-1"));
    const input = {
      articleRefs: [
        { clientId: "client-a", articleId: "article-1" },
        { clientId: "client-a", articleId: "article-1" },
      ],
      target: {
        kind: "platform",
        platformId: "toutiao",
        accountProfileId: "account-1",
      },
    };

    const admitted = fixture.coordinator.admitRegularQueueItems(input);
    assert.equal(admitted.admittedCount, 1);
    assert.equal(admitted.items.length, 1);
    assert.equal(transitionCalls, 1);

    transitionFailure = Object.assign(new Error("duplicate"), {
      code: "PUBLICATION_DUPLICATE",
    });
    const duplicate = fixture.coordinator.admitRegularQueueItems(input);
    assert.equal(duplicate.conflictCount, 1);
    assert.equal(
      duplicate.items[0].reasonCode,
      "ARTICLE_ACTIVE_TARGET_CONFLICT",
    );
    assert.equal(transitionCalls, 2);

    transitionFailure = null;
    facts = {
      ...emptyFacts(),
      submissionItems: [
        {
          articleId: "article-1",
          targetKey: "platform:hepan",
          status: "queued",
        },
      ],
    };
    const frozen = fixture.coordinator.admitRegularQueueItems(input);
    assert.equal(frozen.conflictCount, 1);
    assert.equal(frozen.items[0].reasonCode, "ARTICLE_ACTIVE_TARGET_CONFLICT");
    assert.equal(transitionCalls, 2);
  } finally {
    fixture.close();
  }
});
test("canonical article refs prevent delimiter collisions and reject unsafe identities", () => {
  assert.notEqual(
    canonicalArticleRefKey({ clientId: "ab", articleId: "c" }),
    canonicalArticleRefKey({ clientId: "a", articleId: "bc" }),
  );
  assert.equal(
    canonicalArticleRefKey({ clientId: "Ａ", articleId: " article-1 " }),
    canonicalArticleRefKey({ clientId: "A", articleId: "article-1" }),
  );
  assert.deepEqual(
    canonicalArticleRefs([
      { clientId: "client-b", articleId: "article-2" },
      { clientId: "client-a", articleId: "article-1" },
      { clientId: " client-a ", articleId: "article-1" },
    ]),
    [
      { clientId: "client-a", articleId: "article-1" },
      { clientId: "client-b", articleId: "article-2" },
    ],
  );
  for (const invalid of [
    { clientId: "client\u0000-a", articleId: "article-1" },
    { clientId: "client-a", articleId: "article/1" },
    { clientId: "", articleId: "article-1" },
  ])
    assert.throws(() => canonicalArticleRefKey(invalid), {
      code: "ARTICLE_IDENTITY_INVALID",
    });
});

test("public batch trashArticles consumes the coordinator article-set lock in canonical order", () => {
  const fixture = makeFixture();
  try {
    fixture.add(article("article-1"));
    fixture.add(article("article-2"));
    const service = removalServiceFor(fixture);
    const input = {
      selections: [
        { clientId: "client-a", articleId: "article-2" },
        { clientId: "client-a", articleId: "article-1" },
      ],
    };
    const preview = service.previewArticleRemovalImpact(input);
    const result = service.trashArticles(
      Object.assign({}, input, { token: preview.token, confirmed: true }),
    );
    assert.equal(result.status, "committed");
    assert.equal(result.articleCount, 2);
    assert.equal(
      fixture.contentStore.isArticleTrashed("client-a", "article-1"),
      true,
    );
    assert.equal(
      fixture.contentStore.isArticleTrashed("client-a", "article-2"),
      true,
    );
    const adjacentAscending = fixture.lockEvents.some(
      (id, index) =>
        id === "article-1" && fixture.lockEvents[index + 1] === "article-2",
    );
    assert.equal(adjacentAscending, true, fixture.lockEvents.join(","));
  } finally {
    fixture.close();
  }
});

test("already trashed article removal is idempotent inside the held mutation session", () => {
  const fixture = makeFixture();
  try {
    const original = article("article-1");
    fixture.add(original);
    const input = {
      selections: [{ clientId: "client-a", articleId: "article-1" }],
      selection: { clientId: "client-a", articleId: "article-1" },
      operationId: "remove-1",
      tombstone: tombstoneFor(original, "remove-1"),
      expectedFingerprint: fingerprintArticle(original),
    };
    fixture.coordinator.executeArticleRemovalTransaction(input);
    assert.deepEqual(
      fixture.coordinator.executeArticleRemovalTransaction(input),
      {
        idempotent: true,
        articleRef: { clientId: "client-a", articleId: "article-1" },
      },
    );
  } finally {
    fixture.close();
  }
});

test("a failed second acquisition releases the first article lock before any move", () => {
  let armed = false;
  let failed = false;
  const fixture = makeFixture({
    lockFault(point, detail) {
      if (
        armed &&
        !failed &&
        point === "after-candidate-owner" &&
        detail.files.json.endsWith("article-2.json")
      ) {
        failed = true;
        const error = new Error("synthetic article lock contention");
        error.code = "ARTICLE_STORE_BUSY";
        throw error;
      }
    },
  });
  try {
    const first = article("article-1");
    const second = article("article-2");
    fixture.add(first);
    fixture.add(second);
    armed = true;
    assert.throws(
      () =>
        fixture.coordinator.executeArticleRemovalTransaction({
          selections: [
            { clientId: "client-a", articleId: "article-2" },
            { clientId: "client-a", articleId: "article-1" },
          ],
          selection: { clientId: "client-a", articleId: "article-1" },
          operationId: "remove-1",
          tombstone: tombstoneFor(first, "remove-1"),
          expectedFingerprint: fingerprintArticle(first),
        }),
      { code: "ARTICLE_MUTATION_BUSY" },
    );
    assert.equal(failed, true);
    assert.equal(
      fixture.contentStore.getArticle("client-a", "article-1").id,
      "article-1",
    );
    assert.equal(
      fixture.contentStore.isArticleTrashed("client-a", "article-1"),
      false,
    );
    assert.equal(
      fs.existsSync(
        path.join(
          fixture.root,
          "generated",
          "client-a",
          "article-1.article-lock",
        ),
      ),
      false,
    );
  } finally {
    fixture.close();
  }
});

test("a committed save with lock release failure is reported as manual-check uncertain", () => {
  let failRelease = false;
  const fixture = makeFixture({
    lockFault(point) {
      if (failRelease && point === "after-release-rename") {
        const error = new Error("synthetic release failure");
        error.code = "ARTICLE_LOCK_RELEASE_FAILED";
        throw error;
      }
    },
  });
  try {
    const original = article("article-1");
    fixture.add(original);
    const fingerprint = fixture.coordinator.readArticleForEdit({
      clientId: "client-a",
      articleId: "article-1",
    }).editFingerprint;
    failRelease = true;
    assert.throws(
      () =>
        fixture.coordinator.saveExistingArticle({
          article: Object.assign({}, original, {
            content: "saved before release failure",
          }),
          expectedFingerprint: fingerprint,
        }),
      (error) =>
        Boolean(
          error.code === "ARTICLE_MUTATION_RESULT_UNCERTAIN" &&
          error.retryability === "manual-check" &&
          error.diagnosticId,
        ),
    );
    failRelease = false;
    assert.equal(
      fixture.contentStore.getArticle("client-a", "article-1").content,
      "saved before release failure",
    );
  } finally {
    fixture.close();
  }
});

test("removal release uncertainty becomes repairable and is excluded from automatic recovery", () => {
  let failRelease = false;
  let moveCalls = 0;
  const fixture = makeFixture({
    lockFault(point) {
      if (failRelease && point === "after-release-rename") {
        const error = new Error("synthetic removal release failure");
        error.code = "ARTICLE_LOCK_RELEASE_FAILED";
        throw error;
      }
    },
  });
  try {
    const original = article("article-1");
    fixture.add(original);
    const realCoordinator = fixture.coordinator;
    const coordinator = Object.assign({}, realCoordinator, {
      executeArticleRemovalTransaction(input) {
        moveCalls += 1;
        failRelease = true;
        try {
          return realCoordinator.executeArticleRemovalTransaction(input);
        } finally {
          failRelease = false;
        }
      },
    });
    const service = createArticleTrashService({
      workspaceRoot: fixture.root,
      contentStore: fixture.contentStore,
      mutationCoordinator: coordinator,
      articleRemovalImpactQuery: {
        previewArticleRemovalImpact() {
          return {
            canCommit: true,
            blockedItems: [],
          };
        },
      },
    });
    const input = {
      selections: [{ clientId: "client-a", articleId: "article-1" }],
    };
    const preview = service.previewArticleRemovalImpact(input);
    const result = service.trashArticles(
      Object.assign({}, input, { token: preview.token, confirmed: true }),
    );
    assert.equal(result.status, "needs_repair");
    assert.equal(result.errorCode, "ARTICLE_MUTATION_RESULT_UNCERTAIN");
    assert.equal(moveCalls, 1);
    assert.equal(
      fixture.contentStore.isArticleTrashed("client-a", "article-1"),
      true,
    );
    assert.deepEqual(service.recoverPendingRemovals(), []);
    assert.equal(
      service.getArticleRemovalTransaction(result.transactionId).status,
      "needs_repair",
    );
  } finally {
    fixture.close();
  }
});

test("publication reserve rejects an edit after the lock-admission snapshot", () => {
  const fixture = makeFixture();
  try {
    const original = article("article-1");
    fixture.add(original);
    const profile = {
      accountProfileId: "account-1",
      platformId: "toutiao",
    };
    let reserved = 0;
    const realCoordinator = fixture.coordinator;
    fixture.operationalStore.assertExecutableAccountProfile = () => profile;
    fixture.operationalStore.reservePublicationTarget = () => {
      throw new Error("coordinator must own reserve");
    };
    fixture.operationalStore.listActionableRecovery = () => [];
    const coordinator = Object.assign({}, realCoordinator, {
      readArticleForPublication(input) {
        const admission = realCoordinator.readArticleForPublication(input);
        fixture.articleStore.saveArticle(
          Object.assign({}, original, {
            content: "edited during account inspection",
          }),
        );
        return admission;
      },
      reservePublicationTarget(input) {
        reserved += 1;
        return realCoordinator.reservePublicationTarget(input);
      },
    });
    const admission = coordinator.readArticleForPublication({
      articleRef: { clientId: "client-a", articleId: "article-1" },
    });
    assert.throws(
      () =>
        coordinator.reservePublicationTarget({
          articleRef: admission.articleRef,
          publicationId: "publication-1",
          attemptId: "attempt-1",
          target: {
            kind: "platform",
            platformId: "toutiao",
            accountProfileId: profile.accountProfileId,
          },
          expectedFingerprint: admission.publicationSnapshot.fingerprint,
          operation: "queue",
        }),
      { code: "ARTICLE_EDIT_CONFLICT" },
    );
    assert.equal(reserved, 1);
  } finally {
    fixture.close();
  }
});

test("publication reserve persists the complete lock-admission snapshot", () => {
  const fixture = makeFixture();
  try {
    const original = article("article-1");
    fixture.add(original);
    let request = null;
    fixture.operationalStore.reservePublicationTarget = (value) => {
      request = value;
      return {
        publicationId: "publication-1",
        attemptId: "attempt-1",
        targetKey: "platform:toutiao",
        status: "queued",
      };
    };
    const expectedFingerprint = fingerprintArticle(original);
    const reserved = fixture.coordinator.reservePublicationTarget({
      articleRef: { clientId: original.clientId, articleId: original.id },
      publicationId: "publication-1",
      attemptId: "attempt-1",
      target: {
        kind: "platform",
        platformId: "toutiao",
        accountProfileId: "account-1",
      },
      expectedFingerprint,
    });
    assert.deepEqual(request.postProcessingPayload.publicationSnapshot, {
      articleId: original.id,
      title: original.title,
      body: original.content,
      fingerprint: expectedFingerprint,
    });
    assert.deepEqual(
      reserved.publicationSnapshot,
      request.postProcessingPayload.publicationSnapshot,
    );
  } finally {
    fixture.close();
  }
});

test("restore and permanent-delete cannot bypass published lifecycle facts", () => {
  const fixture = makeFixture();
  try {
    const original = article("article-1");
    fixture.add(original);
    fixture.contentStore.moveArticleToTrash(
      "client-a",
      original.id,
      tombstoneFor(original),
    );
    fixture.setFacts({
      publications: [
        {
          articleId: original.id,
          targetKey: "platform:toutiao",
          status: "published",
        },
      ],
    });
    const service = createArticleTrashService({
      contentStore: fixture.contentStore,
      operationalStore: fixture.operationalStore,
      mutationCoordinator: fixture.coordinator,
    });
    assert.throws(
      () =>
        service.restoreArticle({
          clientId: "client-a",
          articleId: original.id,
        }),
      { code: "ARTICLE_PUBLISHED_IMMUTABLE" },
    );
    assert.throws(
      () =>
        service.preparePermanentDelete({
          clientId: "client-a",
          articleId: original.id,
        }),
      { code: "ARTICLE_PUBLISHED_IMMUTABLE" },
    );
    assert.equal(
      fixture.contentStore.isArticleTrashed("client-a", original.id),
      true,
    );
  } finally {
    fixture.close();
  }
});

test("restore and permanent-delete use coordinator mutation sessions for file writes", () => {
  const fixture = makeFixture();
  try {
    const original = article("article-1");
    fixture.add(original);
    const service = createArticleTrashService({
      contentStore: fixture.contentStore,
      operationalStore: fixture.operationalStore,
      mutationCoordinator: fixture.coordinator,
    });
    fixture.contentStore.moveArticleToTrash(
      "client-a",
      original.id,
      tombstoneFor(original),
    );
    assert.equal(
      service.restoreArticle({ clientId: "client-a", articleId: original.id })
        .id,
      original.id,
    );
    fixture.contentStore.moveArticleToTrash(
      "client-a",
      original.id,
      tombstoneFor(original),
    );
    const confirmation = service.preparePermanentDelete({
      clientId: "client-a",
      articleId: original.id,
    });
    assert.equal(
      service.permanentlyDeleteArticle({
        clientId: "client-a",
        articleId: original.id,
        token: confirmation.token,
      }).deleted,
      true,
    );
    assert.equal(
      fixture.contentStore.isArticleTrashed("client-a", original.id),
      false,
    );
  } finally {
    fixture.close();
  }
});
