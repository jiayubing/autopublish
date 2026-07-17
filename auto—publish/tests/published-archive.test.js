const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { afterEach, it } = require("node:test");
const assert = require("node:assert/strict");

const { configureRuntimePaths, archivePublishedArticle } = require("../src/core/files");
const { createJob, runJob, STATUSES } = require("../src/core/jobs");

const tempRoots = [];

function makeWorkspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "autopublish-published-archive-"));
  tempRoots.push(root);
  const paths = {
    contentLibrary: root,
    input: path.join(root, "input"),
    published: path.join(root, "published"),
    failed: path.join(root, "failed"),
    tmp: path.join(root, "tmp"),
    logs: path.join(root, "logs"),
    data: path.join(root, "data"),
    work: path.join(root, "work"),
    browser: path.join(root, "browser")
  };
  Object.values(paths).forEach(function(value) {
    if (value !== root) fs.mkdirSync(value, { recursive: true });
  });
  configureRuntimePaths(paths);
  return paths;
}

function makeArticle(paths) {
  const sourceFile = path.join(paths.input, "beijing13800138000-contact.docx");
  const sidecar = sourceFile + ".meta.json";
  fs.writeFileSync(sourceFile, "article body", "utf8");
  fs.writeFileSync(sidecar, JSON.stringify({ articleId: "article-1" }), "utf8");
  return {
    title: "Article title",
    filename: path.basename(sourceFile),
    normalizedFilename: path.basename(sourceFile),
    sourceFile
  };
}

afterEach(function() {
  while (tempRoots.length) {
    fs.rmSync(tempRoots.pop(), { recursive: true, force: true });
  }
});

it("rejects a published archive collision without deleting either existing pair", function() {
  const paths = makeWorkspace();
  const article = makeArticle(paths);
  const target = path.join(paths.published, article.normalizedFilename);
  const targetSidecar = target + ".meta.json";
  fs.writeFileSync(target, "existing article", "utf8");
  fs.writeFileSync(targetSidecar, "existing metadata", "utf8");

  assert.throws(function() { archivePublishedArticle(article); }, function(error) {
    return error.code === "PUBLISHED_ARCHIVE_CONFLICT";
  });
  assert.equal(fs.readFileSync(article.sourceFile, "utf8"), "article body");
  assert.equal(fs.readFileSync(article.sourceFile + ".meta.json", "utf8"), JSON.stringify({ articleId: "article-1" }));
  assert.equal(fs.readFileSync(target, "utf8"), "existing article");
  assert.equal(fs.readFileSync(targetSidecar, "utf8"), "existing metadata");
});

it("rolls the complete source pair back when the sidecar archive step fails", function() {
  const paths = makeWorkspace();
  const article = makeArticle(paths);
  const target = path.join(paths.published, article.normalizedFilename);
  const targetSidecar = target + ".meta.json";
  const originalRename = fs.renameSync;
  let injected = false;
  fs.renameSync = function(source, destination) {
    if (!injected && destination === targetSidecar) {
      injected = true;
      throw new Error("sidecar move failed");
    }
    return originalRename(source, destination);
  };

  try {
    assert.throws(function() { archivePublishedArticle(article); }, function(error) {
      return error.code === "PUBLISHED_ARCHIVE_FAILED";
    });
  } finally {
    fs.renameSync = originalRename;
  }

  assert.equal(fs.readFileSync(article.sourceFile, "utf8"), "article body");
  assert.equal(fs.readFileSync(article.sourceFile + ".meta.json", "utf8"), JSON.stringify({ articleId: "article-1" }));
  assert.equal(fs.existsSync(target), false);
  assert.equal(fs.existsSync(targetSidecar), false);
});

it("keeps a remote success distinct from an archive failure so it is not retryable as publish failure", async function() {
  const paths = makeWorkspace();
  const article = makeArticle(paths);
  const targetSidecar = path.join(paths.published, article.normalizedFilename + ".meta.json");
  const originalRename = fs.renameSync;
  let injected = false;
  fs.renameSync = function(source, destination) {
    if (!injected && destination === targetSidecar) {
      injected = true;
      throw new Error("sidecar move failed");
    }
    return originalRename(source, destination);
  };

  try {
    const job = createJob(article, { id: "test-platform", publishArticle: async function() { return true; } });
    const result = await runJob(job, { autoSubmit: true });
    assert.equal(result.status, STATUSES.PUBLISHED_ARCHIVE_FAILED);
    assert.equal(result.error, "PUBLISHED_ARCHIVE_FAILED");
  } finally {
    fs.renameSync = originalRename;
  }

  assert.equal(fs.existsSync(article.sourceFile), true);
  assert.equal(fs.existsSync(article.sourceFile + ".meta.json"), true);
});
