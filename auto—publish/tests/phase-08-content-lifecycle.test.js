const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync, spawn } = require("node:child_process");

const { createArticleStore } = require("../src/content/article-store");
const {
  createGenerationBatchStore,
} = require("../src/content/generation-batch-store");
const {
  createArticleRemovalTransactionStore,
} = require("../src/content/article-removal-transaction-store");
const {
  createWorkspacePaths,
} = require("../src/infrastructure/workspace/workspace-paths");

function article(id) {
  return {
    id,
    clientId: "client-1",
    researchQueryIds: ["query-1"],
    researchSnapshots: [
      {
        questionId: "query-1",
        question: "Question",
        answerText: "Answer",
        references: [],
        collectedAt: "2026-07-01T00:00:00.000Z",
        collectionMethod: "manual",
      },
    ],
    platform: "ctrip",
    scenario: "guide",
    templateId: "template-1",
    title: "Title",
    content: "Body",
    status: "generated",
    source: {
      client_material: true,
      doubao_answer: true,
      references: false,
      template: true,
    },
    createdAt: "2026-07-01T00:00:00.000Z",
  };
}

function tombstone(item) {
  return {
    version: 1,
    deletedAt: "2026-07-02T00:00:00.000Z",
    clientId: item.clientId,
    articleId: item.id,
    status: item.status,
    references: [],
  };
}

function crashBetweenFileSteps(root, operation, point) {
  const modulePath = path.join(
    __dirname,
    "..",
    "src",
    "content",
    "article-store.js",
  );
  const child = spawnSync(
    process.execPath,
    [
      "-e",
      [
        `const { createArticleStore } = require(process.argv[1]);`,
        `const store = createArticleStore(process.argv[2], { internalArticleFileFault(actual) { if (actual === process.argv[4]) process.exit(97); } });`,
        operation,
      ].join("\n"),
      modulePath,
      root,
      JSON.stringify(article("article-1")),
      point,
    ],
    { encoding: "utf8" },
  );
  assert.equal(child.status, 97, child.stderr);
}

function pauseRestoreAfterFileStep(root, point) {
  const modulePath = path.join(
    __dirname,
    "..",
    "src",
    "content",
    "article-store.js",
  );
  const ready = path.join(root, "restore-ready");
  const proceed = path.join(root, "restore-proceed");
  const child = spawn(
    process.execPath,
    [
      "-e",
      [
        `const fs = require("node:fs");`,
        `const { createArticleStore } = require(process.argv[1]);`,
        `const store = createArticleStore(process.argv[2], { internalArticleFileFault(actual) { if (actual === process.argv[3]) { fs.writeFileSync(process.argv[4], "ready"); const signal = new Int32Array(new SharedArrayBuffer(4)); while (!fs.existsSync(process.argv[5])) Atomics.wait(signal, 0, 0, 10); } } });`,
        `store.restoreTrashedArticle("client-1", "article-1");`,
      ].join("\n"),
      modulePath,
      root,
      point,
      ready,
      proceed,
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  const done = new Promise(function (resolve, reject) {
    let stderr = "";
    child.stderr.on("data", function (chunk) {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("exit", function (code, signal) {
      resolve({ code: code, signal: signal, stderr: stderr });
    });
  });
  const readyPromise = (async function () {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      if (fs.existsSync(ready)) return;
      await new Promise(function (resolve) { setTimeout(resolve, 5); });
    }
    child.kill();
    throw new Error("Restore child did not reach the fault boundary");
  })();
  return { child: child, ready: readyPromise, proceed: proceed, done: done };
}

describe("phase 08 content lifecycle seams", function () {
  it("recovers a trash move journal after a process stops between renames", function () {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "phase08-trash-crash-"));
    try {
      const store = createArticleStore(root);
      const item = article("article-1");
      store.saveArticle(item);
      crashBetweenFileSteps(
        root,
        `store.moveArticleToTrash("client-1", "article-1", ${JSON.stringify(tombstone(item))});`,
        "after-trash-json",
      );
      const restarted = createArticleStore(root);
      assert.deepEqual(restarted.listTrashedArticles("client-1"), []);
      assert.deepEqual(restarted.getArticle("client-1", "article-1"), item);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("recovers a restore journal and leaves the trash pair intact after a partial restore", function () {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "phase08-restore-crash-"),
    );
    try {
      const store = createArticleStore(root);
      const item = article("article-1");
      store.saveArticle(item);
      store.moveArticleToTrash("client-1", item.id, tombstone(item));
      crashBetweenFileSteps(
        root,
        `store.restoreTrashedArticle("client-1", "article-1");`,
        "after-restore-json",
      );
      const restarted = createArticleStore(root);
      assert.equal(restarted.listTrashedArticles("client-1").length, 1);
      assert.deepEqual(
        restarted.getTrashedTombstone("client-1", item.id).articleId,
        item.id,
      );
      assert.deepEqual(
        restarted.restoreTrashedArticle("client-1", item.id),
        item,
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not let trash listing recover a pair while restore owns its article lock", async function () {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "phase08-trash-list-race-"));
    let running;
    try {
      const store = createArticleStore(root);
      const item = article("article-1");
      store.saveArticle(item);
      store.moveArticleToTrash("client-1", item.id, tombstone(item));
      running = pauseRestoreAfterFileStep(root, "after-restore-json");
      await running.ready;
      assert.throws(
        function () { createArticleStore(root).listTrashedArticles("client-1"); },
        function (error) { return error.code === "ARTICLE_STORE_BUSY"; },
      );
    } finally {
      if (running) {
        if (!fs.existsSync(running.proceed)) fs.writeFileSync(running.proceed, "continue");
        await running.done;
      }
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("recovers a permanent-delete staging journal without treating partial staging as deletion", function () {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "phase08-purge-crash-"));
    try {
      const store = createArticleStore(root);
      const item = article("article-1");
      store.saveArticle(item);
      store.moveArticleToTrash("client-1", item.id, tombstone(item));
      crashBetweenFileSteps(
        root,
        `store.permanentlyDeleteTrashedArticle("client-1", "article-1", "2026-07-03T00:00:00.000Z");`,
        "after-permanent-stage-article-1",
      );
      const restarted = createArticleStore(root);
      assert.equal(restarted.listTrashedArticles("client-1").length, 1);
      assert.equal(
        restarted.getTrashedTombstone("client-1", item.id).permanentlyDeleted,
        undefined,
      );
      assert.deepEqual(
        restarted.permanentlyDeleteTrashedArticle(
          "client-1",
          item.id,
          "2026-07-03T00:00:00.000Z",
        ).permanentlyDeleted,
        true,
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails closed when generation batch or removal transaction roots are junctions", function (t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "phase08-path-root-"));
    const removalRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "phase08-removal-root-"),
    );
    const outside = fs.mkdtempSync(
      path.join(os.tmpdir(), "phase08-path-outside-"),
    );
    try {
      const batchRoot = createWorkspacePaths(root).generationBatches;
      fs.mkdirSync(path.dirname(batchRoot), { recursive: true });
      try {
        fs.symlinkSync(outside, batchRoot, "junction");
      } catch (error) {
        if (["EPERM", "EACCES", "ENOTSUP", "EINVAL"].includes(error.code))
          return t.skip("directory junctions are unavailable");
        throw error;
      }
      assert.throws(() => createGenerationBatchStore({ workspaceRoot: root }), {
        code: "GENERATION_BATCH_PATH_UNSAFE",
      });
      const transactionRoot = path.join(
        removalRoot,
        ".autopublish",
        "article-removal-transactions",
      );
      fs.mkdirSync(path.dirname(transactionRoot), { recursive: true });
      fs.symlinkSync(outside, transactionRoot, "junction");
      assert.throws(
        () =>
          createArticleRemovalTransactionStore({ workspaceRoot: removalRoot }),
        { code: "ARTICLE_REMOVAL_PATH_INVALID" },
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(removalRoot, { recursive: true, force: true });
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });
});
