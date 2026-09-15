const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync, spawn } = require("node:child_process");
const { createArticleStore } = require("../src/content/article-store");
const { article } = require("./helpers/article-removal-fixture");

const storeModule = require.resolve("../src/content/article-store");
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "article-file-safety-"));
  return {
    root,
    store: createArticleStore(root),
    json: path.join(root, "generated", "client", "a.json"),
    close: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}
function crash(root, operation, point) {
  const result = spawnSync(
    process.execPath,
    [
      "-e",
      `
    const { createArticleStore } = require(process.argv[1]);
    const store = createArticleStore(process.argv[2], {
      internalArticleFileFault(point) { if (point === process.argv[3]) process.exit(97); }
    });
    ${operation}
  `,
      storeModule,
      root,
      point,
    ],
    { encoding: "utf8", timeout: 10000 },
  );
  assert.equal(result.status, 97, result.stderr || String(result.error));
}
function trash(store) {
  store.moveArticleToTrash("client", "a", {
    version: 1,
    clientId: "client",
    articleId: "a",
    status: "generated",
    deletedAt: "2026-09-16T00:00:00.000Z",
    references: [],
  });
}

for (const create of [false, true]) {
  for (const point of [
    "before-article-json-temp",
    "after-article-json-temp",
    "before-article-json-replace",
    "after-article-json-install",
  ]) {
    test(`${create ? "create" : "save"} survives process exit at ${point}`, () => {
      const f = fixture();
      try {
        if (!create) f.store.saveArticle(article());
        const updated = { ...article(), content: "new complete body" };
        crash(
          f.root,
          `store.${create ? "createArticle" : "saveArticle"}(${JSON.stringify(updated)});`,
          point,
        );
        const reopened = createArticleStore(f.root);
        if (point === "after-article-json-install") {
          assert.deepEqual(reopened.getArticle("client", "a"), updated);
          assert.deepEqual(reopened.listArticles("client"), [updated]);
        } else if (create) {
          assert.deepEqual(reopened.listArticles("client"), []);
          assert.throws(() => reopened.getArticle("client", "a"), {
            code: "ARTICLE_NOT_FOUND",
          });
        } else {
          assert.deepEqual(reopened.getArticle("client", "a"), article());
          assert.deepEqual(reopened.listArticles("client"), [article()]);
        }
      } finally {
        f.close();
      }
    });
  }
}

test("replacement failure plus temp cleanup failure preserves the previous JSON and original error", () => {
  const f = fixture();
  try {
    f.store.saveArticle(article());
    const io = Object.create(fs);
    const failure = Object.assign(new Error("synthetic replacement failure"), {
      code: "EACCES",
    });
    let cleanup = 0;
    io.renameSync = (source, target) => {
      if (target === f.json) throw failure;
      return fs.renameSync(source, target);
    };
    io.unlinkSync = (file) => {
      if (String(file).startsWith(f.json + ".tmp-")) {
        cleanup += 1;
        throw Object.assign(new Error("synthetic cleanup failure"), {
          code: "EIO",
        });
      }
      return fs.unlinkSync(file);
    };
    assert.throws(
      () =>
        createArticleStore(f.root, { fs: io }).saveArticle({
          ...article(),
          content: "update",
        }),
      (error) => error === failure,
    );
    assert.ok(cleanup > 0);
    assert.deepEqual(
      createArticleStore(f.root).getArticle("client", "a"),
      article(),
    );
  } finally {
    f.close();
  }
});

test("a short temp write cannot damage or expose a partial canonical article", () => {
  const f = fixture();
  try {
    f.store.saveArticle(article());
    const io = Object.create(fs);
    let failed = 0;
    io.writeFileSync = (file, contents, options) => {
      if (String(file).startsWith(f.json + ".tmp-")) {
        fs.writeFileSync(file, String(contents).slice(0, 15), options);
        failed += 1;
        throw Object.assign(new Error("short write"), { code: "ENOSPC" });
      }
      return fs.writeFileSync(file, contents, options);
    };
    assert.throws(
      () =>
        createArticleStore(f.root, { fs: io }).saveArticle({
          ...article(),
          content: "update",
        }),
      { code: "ENOSPC" },
    );
    assert.equal(failed, 1);
    assert.deepEqual(createArticleStore(f.root).listArticles("client"), [
      article(),
    ]);
  } finally {
    f.close();
  }
});

for (const version of [1, 2]) {
  test(`upgrading a crashed version ${version} save preserves the previous article`, () => {
    const f = fixture();
    try {
      f.store.saveArticle(article());
      const temporary = path.basename(f.json) + ".tmp-upgrade";
      fs.renameSync(f.json, f.json + ".backup");
      fs.writeFileSync(
        path.join(path.dirname(f.json), temporary),
        JSON.stringify({ ...article(), content: "uncommitted" }),
      );
      fs.writeFileSync(
        f.json.slice(0, -5) + ".journal",
        JSON.stringify({
          version,
          kind: "article-json-replace",
          temporaryJson: temporary,
          backup: path.basename(f.json) + ".backup",
          ...(version === 1 ? { temporaryMarkdown: "a.md.tmp-upgrade" } : {}),
        }),
      );
      const reopened = createArticleStore(f.root);
      assert.deepEqual(reopened.listArticles("client"), [article()]);
      const updated = { ...article(), content: "new save after recovery" };
      reopened.saveArticle(updated);
      assert.deepEqual(
        createArticleStore(f.root).getArticle("client", "a"),
        updated,
      );
    } finally {
      f.close();
    }
  });
}

for (const terminal of [false, true]) {
  test(`upgrading old staged purge recovers its ${terminal ? "committed" : "uncommitted"} outcome`, () => {
    const f = fixture();
    try {
      f.store.saveArticle(article());
      trash(f.store);
      const directory = path.join(
        f.root,
        ".autopublish",
        "article-trash",
        "client",
      );
      const staging = "a.deleting-upgrade";
      fs.mkdirSync(path.join(directory, staging));
      fs.renameSync(
        path.join(directory, "a.json"),
        path.join(directory, staging, "a.json"),
      );
      fs.writeFileSync(
        path.join(directory, "a.trash.journal"),
        JSON.stringify({
          version: 1,
          kind: "permanent-delete",
          staging,
          json: "a.json",
          tombstone: "a.tombstone.json",
        }),
      );
      if (terminal) {
        const file = path.join(directory, "a.tombstone.json");
        const value = JSON.parse(fs.readFileSync(file, "utf8"));
        fs.writeFileSync(
          file,
          JSON.stringify({
            ...value,
            permanentlyDeleted: true,
            purgedAt: "2026-09-16T00:00:00.000Z",
          }),
        );
      }
      const reopened = createArticleStore(f.root);
      if (terminal) {
        assert.deepEqual(reopened.listTrashedArticles("client"), []);
        assert.equal(
          reopened.getTrashedTombstone("client", "a").permanentlyDeleted,
          true,
        );
        assert.throws(() => reopened.restoreTrashedArticle("client", "a"), {
          code: "ARTICLE_PERMANENTLY_DELETED",
        });
      } else {
        assert.equal(reopened.listTrashedArticles("client").length, 1);
        assert.deepEqual(
          reopened.restoreTrashedArticle("client", "a"),
          article(),
        );
      }
    } finally {
      f.close();
    }
  });
}

test("post-replace cleanup failure cannot undo or report failure for a committed save", () => {
  const f = fixture();
  try {
    f.store.saveArticle(article());
    const io = Object.create(fs);
    let installed = false;
    let cleanup = 0;
    io.renameSync = (source, target) => {
      fs.renameSync(source, target);
      if (target === f.json) installed = true;
    };
    io.lstatSync = (file, ...args) => {
      if (installed && String(file).startsWith(f.json + ".tmp-")) {
        cleanup += 1;
        throw Object.assign(new Error("synthetic cleanup stat failure"), {
          code: "EIO",
        });
      }
      return fs.lstatSync(file, ...args);
    };
    const updated = { ...article(), content: "committed" };
    assert.deepEqual(
      createArticleStore(f.root, { fs: io }).saveArticle(updated),
      updated,
    );
    assert.ok(cleanup > 0);
    assert.deepEqual(
      createArticleStore(f.root).getArticle("client", "a"),
      updated,
    );
  } finally {
    f.close();
  }
});

for (const point of [
  "before-terminal-replace",
  "after-terminal-install",
  "after-permanent-delete-json",
]) {
  test(`purge survives process exit at ${point}`, () => {
    const f = fixture();
    try {
      f.store.saveArticle(article());
      trash(f.store);
      crash(
        f.root,
        'store.permanentlyDeleteTrashedArticle("client", "a");',
        point,
      );
      const reopened = createArticleStore(f.root);
      if (point === "before-terminal-replace") {
        assert.equal(reopened.listTrashedArticles("client").length, 1);
        assert.deepEqual(
          reopened.restoreTrashedArticle("client", "a"),
          article(),
        );
      } else {
        assert.equal(
          reopened.getTrashedTombstone("client", "a").permanentlyDeleted,
          true,
        );
        assert.deepEqual(reopened.listTrashedArticles("client"), []);
        assert.throws(() => reopened.restoreTrashedArticle("client", "a"), {
          code: "ARTICLE_PERMANENTLY_DELETED",
        });
        assert.equal(
          reopened.permanentlyDeleteTrashedArticle("client", "a")
            .permanentlyDeleted,
          true,
        );
        assert.equal(
          fs.existsSync(
            path.join(
              f.root,
              ".autopublish",
              "article-trash",
              "client",
              "a.json",
            ),
          ),
          false,
        );
      }
    } finally {
      f.close();
    }
  });
}

test("purge unlink failure retains a terminal fact and finishes cleanup on reopen", () => {
  const f = fixture();
  try {
    f.store.saveArticle(article());
    trash(f.store);
    const trashJson = path.join(
      f.root,
      ".autopublish",
      "article-trash",
      "client",
      "a.json",
    );
    const io = Object.create(fs);
    let failed = 0;
    io.unlinkSync = (file) => {
      if (file === trashJson) {
        failed += 1;
        throw Object.assign(new Error("synthetic deletion failure"), {
          code: "EACCES",
        });
      }
      return fs.unlinkSync(file);
    };
    assert.throws(
      () =>
        createArticleStore(f.root, { fs: io }).permanentlyDeleteTrashedArticle(
          "client",
          "a",
        ),
      { code: "EACCES" },
    );
    assert.equal(failed, 1);
    assert.equal(
      createArticleStore(f.root).permanentlyDeleteTrashedArticle("client", "a")
        .permanentlyDeleted,
      true,
    );
    assert.equal(fs.existsSync(trashJson), false);
  } finally {
    f.close();
  }
});

test("force-killing repeated native replacements leaves one complete canonical article", async () => {
  const f = fixture();
  let child;
  let done;
  try {
    f.store.saveArticle(article());
    child = spawn(
      process.execPath,
      [
        "-e",
        `
      const fs = require("node:fs");
      const { createArticleStore } = require(process.argv[1]);
      const value = JSON.parse(process.argv[3]);
      const store = createArticleStore(process.argv[2]);
      store.saveArticle({...value, content: "replacement".repeat(10000)});
      fs.writeFileSync(process.argv[4], "ready");
      for (;;) store.saveArticle({...value, content: "replacement".repeat(10000)});
    `,
        storeModule,
        f.root,
        JSON.stringify(article()),
        path.join(f.root, "ready"),
      ],
      { stdio: "ignore" },
    );
    done = new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", resolve);
    });
    const deadline = Date.now() + 10000;
    while (!fs.existsSync(path.join(f.root, "ready"))) {
      assert.ok(Date.now() < deadline, "writer reached native replacements");
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    for (let i = 0; i < 30; i += 1) {
      const observed = JSON.parse(fs.readFileSync(f.json, "utf8"));
      assert.equal(observed.content, "replacement".repeat(10000));
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
    child.kill("SIGKILL");
    await done;
    const reopened = createArticleStore(f.root);
    assert.equal(
      reopened.getArticle("client", "a").content,
      "replacement".repeat(10000),
    );
    assert.equal(reopened.listArticles("client").length, 1);
  } finally {
    if (child && child.exitCode === null && child.signalCode === null)
      child.kill("SIGKILL");
    if (done) await done;
    f.close();
  }
});
