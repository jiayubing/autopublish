const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { fixture, article } = require("./helpers/article-removal-fixture");

test("file move failure before its first effect leaves JSON intact and allows explicit retry", () => {
  let fail = true;
  const io = Object.create(fs);
  io.renameSync = (from, to) => {
    if (
      fail &&
      to.includes(path.sep + "article-trash" + path.sep) &&
      to.endsWith("a.json")
    )
      throw Object.assign(new Error("Synthetic disk failure"), { code: "EIO" });
    return fs.renameSync(from, to);
  };
  const f = fixture({ fs: io });
  try {
    f.store.saveArticle(article());
    const result = f.commit();
    assert.equal(result.status, "needs_repair");
    assert.deepEqual(f.store.getArticle("client", "a"), article());
    assert.equal(f.store.listTrashedArticles("client").length, 0);
    fail = false;
    assert.equal(
      f.service.retryArticleRemovalTransaction({
        transactionId: result.transactionId,
        confirmed: true,
      }).status,
      "committed",
    );
  } finally {
    f.close();
  }
});

test("batch trash, duplicate requests, restore and permanent delete preserve content and identity", () => {
  const f = fixture();
  try {
    f.store.saveArticle(article("a"));
    f.store.saveArticle(article("b"));
    const p = f.preview(["b", "a"]);
    assert.equal(f.commit(p).status, "committed");
    assert.throws(() => f.commit(p), { code: "ARTICLE_TRASH_PREVIEW_EXPIRED" });
    const before = f.store.getTrashedTombstone("client", "a");
    assert.equal(f.commit(f.preview()).status, "committed");
    assert.deepEqual(f.store.getTrashedTombstone("client", "a"), before);
    assert.equal(f.store.listTrashedArticles("client").length, 2);
    assert.deepEqual(f.intents.list(), []);
    f.service.restoreArticle({ clientId: "client", articleId: "a" });
    assert.deepEqual(f.store.getArticle("client", "a"), article());
    const confirmation = f.service.preparePermanentDelete({
      clientId: "client",
      articleId: "b",
    });
    f.service.permanentlyDeleteArticle({
      ...confirmation,
      clientId: "client",
      articleId: "b",
    });
    assert.equal(
      f.store.getTrashedTombstone("client", "b").permanentlyDeleted,
      true,
    );
    assert.throws(() =>
      f.service.restoreArticle({ clientId: "client", articleId: "b" }),
    );
  } finally {
    f.close();
  }
});

test("lifecycle is rechecked after preview, and any blocked article prevents the entire batch", () => {
  for (const status of ["reserved", "uncertain", "published"]) {
    const f = fixture();
    try {
      f.store.saveArticle(article());
      f.store.saveArticle(article("b"));
      const p = f.preview(["a", "b"]);
      f.setFacts({
        publications: [{ clientId: "client", articleId: "b", status }],
      });
      assert.equal(f.preview(["a", "b"]).canCommit, false);
      assert.throws(() => f.commit(p));
      assert.equal(f.store.listTrashedArticles("client").length, 0);
      assert.equal(f.store.listArticles("client").length, 2);
      assert.deepEqual(f.intents.list(), []);
    } finally {
      f.close();
    }
  }
});

test("stale content confirmation cannot delete an edited article", () => {
  const f = fixture();
  try {
    f.store.saveArticle(article());
    const p = f.preview();
    f.store.saveArticle({ ...article(), content: "Changed after preview" });
    assert.throws(() => f.commit(p), {
      code: "ARTICLE_REMOVAL_CONTENT_CHANGED",
    });
    assert.equal(
      f.store.getArticle("client", "a").content,
      "Changed after preview",
    );
    assert.deepEqual(f.intents.list(), []);
  } finally {
    f.close();
  }
});

test("intent write failure occurs before any article move", () => {
  const f = fixture({
    atomicWriter: {
      write() {
        throw Object.assign(new Error("write failed"), { code: "EIO" });
      },
    },
  });
  try {
    f.store.saveArticle(article());
    assert.throws(() => f.commit(), { code: "EIO" });
    assert.deepEqual(f.store.getArticle("client", "a"), article());
    assert.deepEqual(f.intents.list(), []);
  } finally {
    f.close();
  }
});

test("partial batch failure keeps one intent, blocks overlapping requests, and explicit retry completes it", () => {
  let armed = true;
  const f = fixture({
    fileFault(point, detail) {
      if (
        armed &&
        point === "after-trash-json" &&
        detail.source.json.endsWith("b.json")
      ) {
        throw Object.assign(new Error("disk failed"), { code: "EIO" });
      }
    },
  });
  try {
    f.store.saveArticle(article());
    f.store.saveArticle(article("b"));
    f.store.saveArticle(article("c"));
    const result = f.commit(f.preview(["a", "b"]));
    assert.equal(result.status, "needs_repair");
    assert.equal(f.store.isArticleTrashed("client", "a"), true);
    assert.deepEqual(f.store.getArticle("client", "b"), article("b"));
    const overlap = f.preview(["b", "c"]);
    assert.equal(overlap.canCommit, false);
    assert.equal(
      overlap.openTransactionId,
      undefined,
      "overlap must not offer to retry a different batch",
    );
    assert.throws(() => f.commit(overlap), {
      code: "ARTICLE_TRASH_PREVIEW_STALE",
    });
    assert.throws(() =>
      f.service.restoreArticle({ clientId: "client", articleId: "a" }),
    );
    assert.equal(f.intents.list().length, 1);
    armed = false;
    assert.equal(
      f.service.retryArticleRemovalTransaction({
        transactionId: result.transactionId,
        confirmed: true,
      }).status,
      "committed",
    );
    assert.equal(f.store.listTrashedArticles("client").length, 2);
    assert.equal(f.store.getArticle("client", "c").id, "c");
    assert.deepEqual(f.intents.list(), []);
  } finally {
    f.close();
  }
});

for (const point of ["after-trash-json", "after-trash-tombstone"]) {
  test(
    "process exit at " +
      point +
      " recovers a partially completed batch on reopen",
    () => {
      const f = fixture();
      try {
        f.store.saveArticle(article());
        f.store.saveArticle(article("b"));
        const child = spawnSync(
          process.execPath,
          [
            "-e",
            'const { fixture } = require(process.argv[1]); const f = fixture({ root: process.argv[2], fileFault(point, detail) { if (point === process.argv[3] && detail.source.json.endsWith("b.json")) process.exit(97); } }); f.commit(f.preview(["a", "b"]));',
            path.join(__dirname, "helpers/article-removal-fixture.js"),
            f.root,
            point,
          ],
          { encoding: "utf8" },
        );
        assert.equal(child.status, 97, child.stderr);
        const reopened = fixture({ root: f.root });
        assert.equal(
          reopened.service.recoverPendingRemovals()[0].status,
          "committed",
        );
        assert.deepEqual(reopened.store.listArticles("client"), []);
        assert.deepEqual(
          reopened.store
            .listTrashedArticles("client")
            .map((t) => t.articleId)
            .sort(),
          ["a", "b"],
        );
        assert.deepEqual(reopened.service.recoverPendingRemovals(), []);
        reopened.service.restoreArticle({ clientId: "client", articleId: "a" });
        assert.deepEqual(reopened.store.getArticle("client", "a"), article());
        assert.deepEqual(
          fixture({ root: f.root }).service.recoverPendingRemovals(),
          [],
        );
      } finally {
        f.close();
      }
    },
  );
}

test("two service instances with stale previews cannot overwrite the first deletion", () => {
  const f = fixture();
  try {
    f.store.saveArticle(article());
    const second = fixture({ root: f.root });
    const firstPreview = f.preview();
    const secondPreview = second.preview();
    f.commit(firstPreview);
    const tombstone = f.store.getTrashedTombstone("client", "a");
    assert.throws(() => second.commit(secondPreview), {
      code: "ARTICLE_REMOVAL_OPERATION_CONFLICT",
    });
    assert.deepEqual(
      second.store.getTrashedTombstone("client", "a"),
      tombstone,
    );
    assert.deepEqual(second.intents.list(), []);
  } finally {
    f.close();
  }
});

test("an interrupted file effect with rollback failure is reconciled by ArticleStore before retry", () => {
  let fail = true;
  let rollbackFailed = false;
  const io = Object.create(fs);
  io.renameSync = (from, to) => {
    if (
      fail &&
      from.includes(path.sep + "article-trash" + path.sep) &&
      to.endsWith("a.json")
    ) {
      rollbackFailed = true;
      throw Object.assign(new Error("rollback failed"), { code: "EIO" });
    }
    return fs.renameSync(from, to);
  };
  const f = fixture({
    fs: io,
    fileFault(point) {
      if (fail && point === "after-trash-json")
        throw Object.assign(new Error("move failed"), { code: "EIO" });
    },
  });
  try {
    f.store.saveArticle(article());
    const result = f.commit();
    assert.equal(result.status, "needs_repair");
    assert.equal(rollbackFailed, true);
    fail = false;
    assert.equal(
      f.service.retryArticleRemovalTransaction({
        transactionId: result.transactionId,
        confirmed: true,
      }).status,
      "committed",
    );
    assert.equal(f.store.isArticleTrashed("client", "a"), true);
  } finally {
    f.close();
  }
});

test("restoring an already-trashed article invalidates a prior duplicate-trash preview", () => {
  const f = fixture();
  try {
    f.store.saveArticle(article());
    f.commit();
    const stale = f.preview();
    f.service.restoreArticle({ clientId: "client", articleId: "a" });
    assert.throws(() => f.commit(stale), {
      code: "ARTICLE_REMOVAL_OPERATION_CONFLICT",
    });
    assert.deepEqual(f.store.getArticle("client", "a"), article());
  } finally {
    f.close();
  }
});

test("a second process cannot advance removal while the first holds the article lock", () => {
  let root;
  let checked = false;
  const f = fixture({
    fileFault(point) {
      if (point !== "after-trash-json") return;
      const child = spawnSync(
        process.execPath,
        [
          "-e",
          'const { fixture } = require(process.argv[1]); const f = fixture({ root: process.argv[2] }); try { f.commit(); process.exit(2); } catch (error) { if (error.code !== "ARTICLE_MUTATION_BUSY") throw error; }',
          path.join(__dirname, "helpers/article-removal-fixture.js"),
          root,
        ],
        { encoding: "utf8", timeout: 10000 },
      );
      assert.equal(child.status, 0, child.stderr);
      checked = true;
    },
  });
  root = f.root;
  try {
    f.store.saveArticle(article());
    assert.equal(f.commit().status, "committed");
    assert.equal(checked, true);
    assert.equal(f.store.listTrashedArticles("client").length, 1);
    assert.deepEqual(f.intents.list(), []);
  } finally {
    f.close();
  }
});

test("restart recovery rechecks publication facts and does not delete a newly frozen article", () => {
  let fail = true;
  const f = fixture({
    fileFault(point) {
      if (fail && point === "after-trash-json")
        throw Object.assign(new Error("failed"), { code: "EIO" });
    },
  });
  try {
    f.store.saveArticle(article());
    assert.equal(f.commit().status, "needs_repair");
    fail = false;
    const reopened = fixture({ root: f.root });
    reopened.setFacts({
      publications: [
        { clientId: "client", articleId: "a", status: "published" },
      ],
    });
    const result = reopened.service.recoverPendingRemovals()[0];
    assert.equal(result.status, "needs_repair");
    assert.equal(result.errorCode, "ARTICLE_PUBLISHED_IMMUTABLE");
    assert.deepEqual(reopened.store.getArticle("client", "a"), article());
    assert.equal(reopened.store.listTrashedArticles("client").length, 0);
  } finally {
    f.close();
  }
});

test("retired queue transaction files are left untouched and never replayed", () => {
  const f = fixture();
  try {
    f.store.saveArticle(article());
    const file = path.join(
      f.root,
      ".autopublish",
      "article-removal-transactions",
      "removal-old.json",
    );
    const legacy = JSON.stringify({
      version: 2,
      id: "old",
      phase: "queue-actions",
      queueActions: ["never replay"],
    });
    fs.writeFileSync(file, legacy);
    assert.deepEqual(f.service.recoverPendingRemovals(), []);
    assert.equal(fs.readFileSync(file, "utf8"), legacy);
    assert.deepEqual(f.store.getArticle("client", "a"), article());
    assert.equal(f.commit().status, "committed");
  } finally {
    f.close();
  }
});
