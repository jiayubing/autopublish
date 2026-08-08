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
  createContentLifecycleComposition,
} = require("../desktop/composition/content-lifecycle-composition");
const {
  createContentSubmissionService,
} = require("../desktop/services/content-submission-service");
const {
  createArticleRemovalService,
} = require("../src/content/article-removal-service");
const {
  createArticleRemovalTransactionStore,
} = require("../src/content/article-removal-transaction-store");

function article() {
  return {
    id: "article-1",
    clientId: "client-1",
    title: "Fixture",
    content: "Body",
    status: "saved",
    platform: "fixture",
    scenario: "fixture",
    templateId: "template-1",
    researchQueryIds: ["q-1"],
    researchSnapshots: [
      {
        questionId: "q-1",
        question: "Question",
        answerText: "Answer",
        references: [],
        collectedAt: "2026-07-25T00:00:00.000Z",
        collectionMethod: "manual",
      },
    ],
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
    templateSnapshot: {
      platform: "fixture",
      id: "template-1",
      name: "template",
      scenario: "fixture",
      body: "body",
      bodyHash: "hash",
    },
    createdAt: "2026-07-25T00:00:00.000Z",
  };
}

function productionFixture() {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "phase-05-p1-production-"),
  );
  const inputRoot = path.join(root, ".autopublish", "input");
  let failAfterStaging = false;
  let failAfterMain = false;
  let emptyQueueCommitCount = 0;
  const operationalStore = createOperationalStore({
    workspaceRoot: root,
    internalBeforeCommit: () => {
      const queueDirectory = path.join(inputRoot, "toutiao");
      const queueFiles = fs.existsSync(queueDirectory)
        ? fs.readdirSync(queueDirectory)
        : [];
      const mainPresent = queueFiles.some((name) => name.endsWith(".md"));
      const sidecarPresent = queueFiles.some((name) =>
        name.endsWith(".submission.json"),
      );
      if (failAfterStaging && queueFiles.length === 0)
        emptyQueueCommitCount += 1;
      if (
        (failAfterStaging && emptyQueueCommitCount === 3) ||
        (failAfterMain && !mainPresent && sidecarPresent)
      ) {
        failAfterStaging = false;
        failAfterMain = false;
        const error = new Error("injected operational write failure");
        error.code = "EIO";
        throw error;
      }
    },
  });
  const composition = createContentLifecycleComposition({
    workspaceRoot: root,
    operationalStore,
  });
  const contentStore = composition.contentStore;
  contentStore.saveArticle(article());
  const profile = operationalStore.createAccountProfile({
    platformId: "toutiao",
    displayName: "fixture",
  });
  const input = inputRoot;
  let terminalQueueMutations = 0;
  const submissionOperationalStore = Object.freeze({
    ...operationalStore,
    cancelQueuedSubmissionItem(command) {
      terminalQueueMutations += 1;
      return operationalStore.cancelQueuedSubmissionItem(command);
    },
    markSubmissionItemCleaned(command) {
      terminalQueueMutations += 1;
      return operationalStore.markSubmissionItemCleaned(command);
    },
  });
  const createSubmission = () =>
    createContentSubmissionService({
      workspaceRoot: root,
      paths: { input },
      operationalStore: submissionOperationalStore,
      contentStore,
      platforms: [
        { id: "toutiao", scanDir: "toutiao", contentQueueImport: true },
      ],
    });
  const submission = createSubmission();
  const batch = submission.createBatch({
    clientId: "client-1",
    articleIds: ["article-1"],
    platformId: "toutiao",
    accountProfileId: profile.accountProfileId,
    confirmed: true,
  });
  const removal = createArticleRemovalService({
    workspaceRoot: root,
    contentStore,
    mutationCoordinator: composition.articleMutationCoordinator,
    transactionStore: composition.articleRemovalTransactionStore,
    submissionService: submission,
    tokenTtlMs: 5000,
  });
  return {
    root,
    operationalStore,
    contentStore,
    submission,
    batch,
    queueFiles() {
      const filePath = path.join(inputRoot, "toutiao", batch.items[0].filename);
      return { filePath, sidecarPath: filePath + ".submission.json" };
    },
    removal,
    failAfterStaging: () => {
      failAfterStaging = true;
    },
    failAfterMain: () => {
      failAfterMain = true;
    },
    terminalQueueMutations: () => terminalQueueMutations,
    rebuildRemoval() {
      return createArticleRemovalService({
        workspaceRoot: root,
        contentStore,
        mutationCoordinator: composition.articleMutationCoordinator,
        transactionStore: composition.articleRemovalTransactionStore,
        submissionService: createSubmission(),
        tokenTtlMs: 5000,
        now: () => new Date(Date.now() + 60000).toISOString(),
      });
    },
  };
}

function closeProductionFixture(fixture) {
  fixture.operationalStore.close();
  fs.rmSync(fixture.root, { recursive: true, force: true });
}

test("production queue action survives an OperationalStore write failure after file staging", () => {
  const fixture = productionFixture();
  try {
    const preview = fixture.removal.previewArticleRemovalImpact({
      selections: [{ clientId: "client-1", articleId: "article-1" }],
    });
    fixture.failAfterStaging();
    const first = fixture.removal.applyArticleRemovalImpact({
      confirmed: true,
      token: preview.token,
    });
    assert.equal(first.status, "pending_auto_recovery");
    assert.equal(
      fixture.contentStore.isArticleTrashed("client-1", "article-1"),
      false,
    );
    assert.equal(
      fixture.operationalStore.getSubmissionBatch(fixture.batch.batchId)
        .items[0].status,
      "queued",
    );
    assert.equal(fs.existsSync(fixture.queueFiles().filePath), false);
    assert.equal(fs.existsSync(fixture.queueFiles().sidecarPath), false);
    const operation = fixture.operationalStore.getSubmissionItemAction({
      operationId: `${first.transactionId}:queue:0`,
    });
    assert.equal(operation.state, "staged");
    const repeated = fixture.removal.retryArticleRemovalTransaction({
      transactionId: first.transactionId,
      confirmed: true,
    });
    assert.equal(repeated.status, "committed");

    const second = fixture.removal.retryArticleRemovalTransaction({
      transactionId: first.transactionId,
      confirmed: true,
    });
    assert.equal(second.status, "committed");
    assert.equal(
      fixture.operationalStore.getSubmissionBatch(fixture.batch.batchId)
        .items[0].status,
      "cancelled",
    );
    assert.equal(
      fixture.contentStore.isArticleTrashed("client-1", "article-1"),
      true,
    );
    assert.equal(fs.existsSync(fixture.queueFiles().filePath), false);
    assert.equal(fs.existsSync(fixture.queueFiles().sidecarPath), false);
  } finally {
    closeProductionFixture(fixture);
  }
});

test("a checkpoint interruption after moving only the main queue file resumes the same operation", () => {
  const fixture = productionFixture();
  try {
    const preview = fixture.removal.previewArticleRemovalImpact({
      selections: [{ clientId: "client-1", articleId: "article-1" }],
    });
    fixture.failAfterMain();
    const first = fixture.removal.applyArticleRemovalImpact({
      confirmed: true,
      token: preview.token,
    });
    assert.equal(first.status, "pending_auto_recovery");
    assert.equal(fs.existsSync(fixture.queueFiles().filePath), false);
    assert.equal(fs.existsSync(fixture.queueFiles().sidecarPath), true);
    const second = fixture.removal.retryArticleRemovalTransaction({
      transactionId: first.transactionId,
      confirmed: true,
    });
    assert.equal(second.status, "committed");
    assert.equal(
      fixture.operationalStore.getSubmissionBatch(fixture.batch.batchId)
        .items[0].status,
      "cancelled",
    );
  } finally {
    closeProductionFixture(fixture);
  }
});

test("external queue mutation after a staged operation remains fail-closed", () => {
  const fixture = productionFixture();
  try {
    const preview = fixture.removal.previewArticleRemovalImpact({
      selections: [{ clientId: "client-1", articleId: "article-1" }],
    });
    fixture.failAfterStaging();
    const first = fixture.removal.applyArticleRemovalImpact({
      confirmed: true,
      token: preview.token,
    });
    fs.writeFileSync(fixture.queueFiles().filePath, "external mutation");
    const second = fixture.removal.retryArticleRemovalTransaction({
      transactionId: first.transactionId,
      confirmed: true,
    });
    assert.equal(second.status, "needs_repair");
    assert.equal(
      fixture.operationalStore.getSubmissionBatch(fixture.batch.batchId)
        .items[0].status,
      "queued",
    );
    assert.equal(
      fixture.contentStore.isArticleTrashed("client-1", "article-1"),
      false,
    );
  } finally {
    closeProductionFixture(fixture);
  }
});

test("partial or unexplained absent queue pairs are not treated as completed", () => {
  for (const remove of ["main", "both"]) {
    const fixture = productionFixture();
    try {
      const preview = fixture.removal.previewArticleRemovalImpact({
        selections: [{ clientId: "client-1", articleId: "article-1" }],
      });
      fs.unlinkSync(fixture.queueFiles().filePath);
      if (remove === "both") fs.unlinkSync(fixture.queueFiles().sidecarPath);
      assert.throws(
        () =>
          fixture.removal.applyArticleRemovalImpact({
            confirmed: true,
            token: preview.token,
          }),
        (error) =>
          ["ARTICLE_TRASH_BLOCKED", "ARTICLE_TRASH_PREVIEW_STALE"].includes(
            error.code,
          ),
      );
      assert.equal(
        fixture.operationalStore.getSubmissionBatch(fixture.batch.batchId)
          .items[0].status,
        "queued",
      );
      assert.equal(
        fixture.contentStore.isArticleTrashed("client-1", "article-1"),
        false,
      );
    } finally {
      closeProductionFixture(fixture);
    }
  }
});

function retryableQueueFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "phase-05-p1-retryable-"));
  const store = createArticleRemovalTransactionStore({
    workspaceRoot: root,
    createId: () => "tx-retryable",
  });
  const articleValue = {
    clientId: "c-1",
    id: "a-1",
    title: "Title",
    content: "Body",
    status: "generated",
  };
  let queueCalls = 0;
  let queueProof = {
    status: "retryable",
    reasonCode: "QUEUE_OPERATION_NOT_COMPLETED",
  };
  let lastOperationId = null;
  let failFirstQueueCall = true;
  let trashed = false;
  const contentStore = {
    getArticle: () => {
      if (trashed)
        throw Object.assign(new Error("missing"), {
          code: "ARTICLE_NOT_FOUND",
        });
      return articleValue;
    },
    getTrashedTombstone: () =>
      trashed
        ? {
            clientId: "c-1",
            articleId: "a-1",
            operationId: "tx-retryable:article:0",
            contentFingerprint: contentStore.fingerprintArticle(articleValue),
          }
        : null,
    moveArticleToTrash: () => {
      trashed = true;
    },
    fingerprintArticle: (value) =>
      require("node:crypto")
        .createHash("sha256")
        .update(JSON.stringify(value))
        .digest("hex"),
    isArticleTrashed: () => trashed,
    supportsIdempotentRemovalOperation: true,
  };
  const submissionService = {
    previewArticleRemovalImpact: () => {
      const action = {
        clientId: "c-1",
        articleId: "a-1",
        batchId: "batch-1",
        publicationId: "pub-1",
        targetPlatformId: "toutiao",
        attemptId: "attempt-1",
        action: "cancel",
      };
      return {
        canCommit: true,
        blockedItems: [],
        queuedToCancel: queueProof.status === "completed" ? [] : [action],
      };
    },
    reconcileArticleRemovalAction: (_action, operationId) =>
      Object.assign({}, queueProof, { operationId }),
    cancelArticleSubmissionItem: (action) => {
      queueCalls += 1;
      lastOperationId = action.operationId;
      if (failFirstQueueCall) {
        failFirstQueueCall = false;
        throw Object.assign(new Error("queue action interrupted"), {
          code: "EIO",
        });
      }
      queueProof = { status: "completed", result: { idempotent: true } };
      return { status: "cancelled", idempotent: false };
    },
  };
  const service = createArticleRemovalService({
    contentStore,
    submissionService,
    transactionStore: store,
    now: () => "2026-07-25T00:00:00.000Z",
    runnerId: "runner-retryable",
  });
  return {
    root,
    store,
    service,
    submissionService,
    calls: () => ({ queueCalls, lastOperationId }),
    article: articleValue,
  };
}

test("retryable active queue operation retries the queue action with the same operationId", () => {
  const fixture = retryableQueueFixture();
  try {
    const preview = fixture.service.previewArticleRemovalImpact({
      selections: [{ clientId: "c-1", articleId: "a-1" }],
    });
    const started = fixture.service.applyArticleRemovalImpact({
      confirmed: true,
      token: preview.token,
    });
    const transaction = fixture.store.get(started.transactionId);
    transaction.status = "pending_auto_recovery";
    transaction.phase = "queue-actions";
    transaction.queueCursor = 0;
    transaction.activeOperation = {
      operationId: `${transaction.id}:queue:0`,
      kind: "queue",
      cursor: 0,
      owner: "runner-old",
      clientId: "c-1",
      articleId: "a-1",
    };
    fixture.store.save(transaction);
    const operationId = transaction.activeOperation.operationId;
    const result = fixture.service.retryArticleRemovalTransaction({
      transactionId: transaction.id,
      confirmed: true,
    });
    assert.equal(result.status, "committed");
    assert.equal(fixture.calls().queueCalls, 2);
    assert.equal(fixture.calls().lastOperationId, operationId);
    const repeated = fixture.service.retryArticleRemovalTransaction({
      transactionId: transaction.id,
      confirmed: true,
    });
    assert.equal(repeated.status, "committed");
    assert.equal(fixture.calls().queueCalls, 2);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("a queue active operation with a mismatched operationId fails closed", () => {
  const fixture = retryableQueueFixture();
  try {
    const preview = fixture.service.previewArticleRemovalImpact({
      selections: [{ clientId: "c-1", articleId: "a-1" }],
    });
    const started = fixture.service.applyArticleRemovalImpact({
      confirmed: true,
      token: preview.token,
    });
    const transaction = fixture.store.get(started.transactionId);
    transaction.activeOperation = {
      operationId: `${transaction.id}:queue:wrong`,
      kind: "queue",
      cursor: 0,
      owner: "runner-old",
      clientId: "c-1",
      articleId: "a-1",
    };
    fixture.store.save(transaction);
    const result = fixture.service.retryArticleRemovalTransaction({
      transactionId: transaction.id,
      confirmed: true,
    });
    assert.equal(result.status, "needs_repair");
    assert.equal(fixture.calls().queueCalls, 1);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("state_applied queue cleanup resumes the same operation without turning removal into repair", () => {
  const fixture = productionFixture();
  const originalUnlink = fs.unlinkSync;
  let injected = false;
  try {
    const preview = fixture.removal.previewArticleRemovalImpact({
      selections: [{ clientId: "client-1", articleId: "article-1" }],
    });
    fs.unlinkSync = function (filename) {
      if (
        !injected &&
        String(filename).includes(".submission-operations") &&
        String(filename).endsWith("main.queue-copy")
      ) {
        injected = true;
        const error = new Error("cleanup interrupted");
        error.code = "EIO";
        throw error;
      }
      return originalUnlink.apply(fs, arguments);
    };
    const first = fixture.removal.applyArticleRemovalImpact({
      confirmed: true,
      token: preview.token,
    });
    assert.equal(first.status, "pending_auto_recovery");
    const operationId = `${first.transactionId}:queue:0`;
    assert.equal(
      fixture.operationalStore.getSubmissionItemAction({ operationId }).state,
      "state_applied",
    );
    assert.equal(
      fixture.operationalStore.getSubmissionBatch(fixture.batch.batchId)
        .items[0].status,
      "cancelled",
    );
    fs.unlinkSync = originalUnlink;
    const retry = fixture.removal.retryArticleRemovalTransaction({
      transactionId: first.transactionId,
      confirmed: true,
    });
    assert.equal(retry.status, "committed");
    assert.equal(
      fixture.operationalStore.getSubmissionItemAction({ operationId }).state,
      "complete",
    );
    assert.equal(
      fixture.contentStore.isArticleTrashed("client-1", "article-1"),
      true,
    );
    assert.equal(
      fs.existsSync(
        path.join(
          fixture.root,
          ".autopublish",
          "input",
          ".submission-operations",
        ),
      ),
      true,
    );
    const stage = path.join(
      fixture.root,
      ".autopublish",
      "input",
      ".submission-operations",
      require("node:crypto")
        .createHash("sha256")
        .update(operationId)
        .digest("hex"),
    );
    assert.equal(fs.existsSync(stage), false);
    assert.equal(
      fixture.removal.retryArticleRemovalTransaction({
        transactionId: first.transactionId,
        confirmed: true,
      }).status,
      "committed",
    );
  } finally {
    fs.unlinkSync = originalUnlink;
    closeProductionFixture(fixture);
  }
});

test("state_applied cleanup survives each partial unlink state after rebuilding services", () => {
  for (const interruption of ["after-main", "after-sidecar"]) {
    const fixture = productionFixture();
    const originalUnlink = fs.unlinkSync;
    let injected = false;
    try {
      const preview = fixture.removal.previewArticleRemovalImpact({
        selections: [{ clientId: "client-1", articleId: "article-1" }],
      });
      fs.unlinkSync = function (filename) {
        const name = String(filename);
        if (
          !injected &&
          name.includes(".submission-operations") &&
          name.endsWith("sidecar.json")
        ) {
          injected = true;
          if (interruption === "after-sidecar") {
            originalUnlink.apply(fs, arguments);
          }
          const error = new Error(`interrupted ${interruption}`);
          error.code = "EIO";
          throw error;
        }
        return originalUnlink.apply(fs, arguments);
      };
      const first = fixture.removal.applyArticleRemovalImpact({
        confirmed: true,
        token: preview.token,
      });
      fs.unlinkSync = originalUnlink;
      const operationId = `${first.transactionId}:queue:0`;
      assert.equal(first.status, "pending_auto_recovery");
      assert.equal(
        fixture.operationalStore.getSubmissionItemAction({ operationId }).state,
        "state_applied",
      );
      assert.equal(fixture.terminalQueueMutations(), 1);

      const rebuilt = fixture.rebuildRemoval();
      const retried = rebuilt.retryArticleRemovalTransaction({
        transactionId: first.transactionId,
        confirmed: true,
      });
      assert.equal(retried.status, "committed", JSON.stringify(retried));
      assert.equal(
        fixture.operationalStore.getSubmissionItemAction({ operationId }).state,
        "complete",
      );
      assert.equal(fixture.terminalQueueMutations(), 1);
    } finally {
      fs.unlinkSync = originalUnlink;
      closeProductionFixture(fixture);
    }
  }
});

test("state_applied staging tampering and unexpected entries fail closed", () => {
  for (const mutation of ["hash", "type", "extra", "source"]) {
    const fixture = productionFixture();
    const originalUnlink = fs.unlinkSync;
    let injected = false;
    try {
      const preview = fixture.removal.previewArticleRemovalImpact({
        selections: [{ clientId: "client-1", articleId: "article-1" }],
      });
      fs.unlinkSync = function (filename) {
        if (!injected && String(filename).includes(".submission-operations")) {
          injected = true;
          const error = new Error("cleanup interrupted");
          error.code = "EIO";
          throw error;
        }
        return originalUnlink.apply(fs, arguments);
      };
      const first = fixture.removal.applyArticleRemovalImpact({
        confirmed: true,
        token: preview.token,
      });
      fs.unlinkSync = originalUnlink;
      const operationId = `${first.transactionId}:queue:0`;
      const stage = path.join(
        fixture.root,
        ".autopublish",
        "input",
        ".submission-operations",
        require("node:crypto")
          .createHash("sha256")
          .update(operationId)
          .digest("hex"),
      );
      if (mutation === "hash")
        fs.writeFileSync(path.join(stage, "sidecar.json"), "tampered");
      if (mutation === "type") {
        fs.unlinkSync(path.join(stage, "sidecar.json"));
        fs.mkdirSync(path.join(stage, "sidecar.json"));
      }
      if (mutation === "extra")
        fs.writeFileSync(path.join(stage, "unexpected"), "tampered");
      if (mutation === "source")
        fs.writeFileSync(fixture.queueFiles().filePath, "source duplicate");
      const retry = fixture.removal.retryArticleRemovalTransaction({
        transactionId: first.transactionId,
        confirmed: true,
      });
      assert.equal(retry.status, "needs_repair");
      assert.equal(
        fixture.contentStore.isArticleTrashed("client-1", "article-1"),
        false,
      );
    } finally {
      fs.unlinkSync = originalUnlink;
      closeProductionFixture(fixture);
    }
  }
});

test("state_applied cleanup rejects a staging root junction without touching its target", () => {
  const fixture = productionFixture();
  const external = fs.mkdtempSync(
    path.join(os.tmpdir(), "phase-05-p1-external-stage-"),
  );
  const originalUnlink = fs.unlinkSync;
  let injected = false;
  try {
    const preview = fixture.removal.previewArticleRemovalImpact({
      selections: [{ clientId: "client-1", articleId: "article-1" }],
    });
    fs.unlinkSync = function (filename) {
      if (!injected && String(filename).includes(".submission-operations")) {
        injected = true;
        const error = new Error("cleanup interrupted");
        error.code = "EIO";
        throw error;
      }
      return originalUnlink.apply(fs, arguments);
    };
    const first = fixture.removal.applyArticleRemovalImpact({
      confirmed: true,
      token: preview.token,
    });
    fs.unlinkSync = originalUnlink;
    assert.equal(first.status, "pending_auto_recovery");
    const operationId = `${first.transactionId}:queue:0`;
    const stage = path.join(
      fixture.root,
      ".autopublish",
      "input",
      ".submission-operations",
      require("node:crypto")
        .createHash("sha256")
        .update(operationId)
        .digest("hex"),
    );
    const externalMain = path.join(external, "main.queue-copy");
    const externalSidecar = path.join(external, "sidecar.json");
    fs.copyFileSync(path.join(stage, "main.queue-copy"), externalMain);
    fs.copyFileSync(path.join(stage, "sidecar.json"), externalSidecar);
    const hashesBefore = [externalMain, externalSidecar].map((filename) =>
      require("node:crypto")
        .createHash("sha256")
        .update(fs.readFileSync(filename))
        .digest("hex"),
    );
    fs.rmSync(stage, { recursive: true, force: true });
    fs.symlinkSync(external, stage, "junction");

    const retry = fixture.rebuildRemoval().retryArticleRemovalTransaction({
      transactionId: first.transactionId,
      confirmed: true,
    });
    assert.equal(retry.status, "needs_repair");
    assert.equal(
      fixture.contentStore.isArticleTrashed("client-1", "article-1"),
      false,
    );
    assert.deepEqual(
      [externalMain, externalSidecar].map((filename) =>
        require("node:crypto")
          .createHash("sha256")
          .update(fs.readFileSync(filename))
          .digest("hex"),
      ),
      hashesBefore,
    );
  } finally {
    fs.unlinkSync = originalUnlink;
    closeProductionFixture(fixture);
    fs.rmSync(external, { recursive: true, force: true });
  }
});
