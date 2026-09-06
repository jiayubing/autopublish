const { it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const { createArticleStore } = require("../src/content/article-store");
const { createContentStore, snapshotArticle } = require("../src/content/content-store");
const { createContentIdentityIndex } = require("../src/content/content-identity-index");

function instrumentFs() {
  const counts = { reads: 0, maintenanceWrites: 0, enumerations: 0 };
  const writeMethods = new Set(["writeFileSync", "renameSync", "copyFileSync", "unlinkSync", "mkdirSync", "rmSync"]);
  const proxy = new Proxy(fs, {
    get: function(target, property) {
      const value = target[property];
      if (typeof value !== "function") return value;
      return function() {
        if (property === "readFileSync") counts.reads += 1;
        if (property === "readdirSync") counts.enumerations += 1;
        if (writeMethods.has(property)) counts.maintenanceWrites += 1;
        return value.apply(target, arguments);
      };
    },
  });
  return {
    fs: proxy,
    counts: counts,
    reset: function() {
      counts.reads = 0;
      counts.maintenanceWrites = 0;
      counts.enumerations = 0;
    },
  };
}

function instrumentArticleStore(articleStore) {
  const counts = { fullLibraryEnumerations: 0, articleRecordsRead: 0 };
  const proxy = new Proxy(articleStore, {
    get: function(target, property) {
      const value = target[property];
      if (property === "listArticles" && typeof value === "function") {
        return function() {
          counts.fullLibraryEnumerations += 1;
          const articles = value.apply(target, arguments);
          counts.articleRecordsRead += articles.length;
          return articles;
        };
      }
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return {
    store: proxy,
    counts: counts,
    reset: function() {
      counts.fullLibraryEnumerations = 0;
      counts.articleRecordsRead = 0;
    },
  };
}

function article(index) {
  return {
    id: `article-${index}`,
    clientId: "client-1",
    generationTaskId: `existing-task-${index}`,
    title: `Article ${index}`,
    content: `Body ${index}`,
    status: "generated",
    createdAt: "2026-09-06T00:00:00.000Z",
  };
}

function createFixture(articleCount) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "generation-read-amplification-"));
  const io = instrumentFs();
  const persistedArticleStore = createArticleStore(root, { fs: io.fs });
  for (let index = 0; index < articleCount; index += 1) persistedArticleStore.createArticle(article(index));
  const identityReads = instrumentArticleStore(persistedArticleStore);
  const listClientIds = function() { return ["client-1"]; };
  const store = createContentStore({ articleStore: identityReads.store, listClientIds: listClientIds });
  return {
    root: root,
    io: io,
    identityReads: identityReads,
    articleStore: identityReads.store,
    listClientIds: listClientIds,
    store: store,
  };
}

function legacyLookup(fixture, taskId) {
  const index = createContentIdentityIndex({
    listClientIds: fixture.listClientIds,
    listArticles: function(clientId) { return fixture.articleStore.listArticles(clientId); },
    snapshot: snapshotArticle,
  });
  return index.findByGenerationTaskId(taskId);
}

function measure(lookup, taskCount, fixture) {
  fixture.io.reset();
  fixture.identityReads.reset();
  const eventLoopStart = performance.eventLoopUtilization();
  const started = performance.now();
  for (let index = 0; index < taskCount; index += 1) {
    assert.equal(lookup(`new-task-${index}`).kind, "none");
  }
  const eventLoop = performance.eventLoopUtilization(eventLoopStart);
  return {
    wallClockMs: Number((performance.now() - started).toFixed(2)),
    fullLibraryEnumerations: fixture.identityReads.counts.fullLibraryEnumerations,
    articleRecordsRead: fixture.identityReads.counts.articleRecordsRead,
    fileReads: fixture.io.counts.reads,
    directoryEnumerations: fixture.io.counts.enumerations,
    maintenanceWrites: fixture.io.counts.maintenanceWrites,
    identityLookups: taskCount,
    eventLoopUtilization: Number(eventLoop.utilization.toFixed(6)),
    eventPayloads: 0,
  };
}

function projectLegacyRun(singleLookup, taskCount) {
  return {
    source: "single-real-scan-projection",
    projectedWallClockMs: Number((singleLookup.wallClockMs * taskCount).toFixed(2)),
    fullLibraryEnumerations: singleLookup.fullLibraryEnumerations * taskCount,
    articleRecordsRead: singleLookup.articleRecordsRead * taskCount,
    fileReads: singleLookup.fileReads * taskCount,
    directoryEnumerations: singleLookup.directoryEnumerations * taskCount,
    maintenanceWrites: singleLookup.maintenanceWrites * taskCount,
    identityLookups: taskCount,
    eventPayloads: 0,
  };
}

[100, 1000].forEach(function(articleCount) {
  it(`real file-path identity lookup removes read amplification for ${articleCount} existing articles x 100 tasks`, function() {
    const fixture = createFixture(articleCount);
    try {
      // The full pre-change 100-task baseline was captured during C evidence collection.
      // Replaying it in every CI run recreates the pathological task x library scan and can take minutes.
      // One real legacy lookup gives the exact per-scan I/O, from which the old linear cost is projected.
      const legacySingleLookup = measure(function(taskId) { return legacyLookup(fixture, taskId); }, 1, fixture);
      const beforeModel = projectLegacyRun(legacySingleLookup, 100);
      const after = measure(function(taskId) { return fixture.store.findByGenerationTaskId(taskId); }, 100, fixture);
      process.stdout.write(`READ_AMPLIFICATION_BENCHMARK ${JSON.stringify({ articleCount: articleCount, taskCount: 100, beforeModel: beforeModel, after: after })}\n`);

      assert.equal(legacySingleLookup.fullLibraryEnumerations, 1);
      assert.equal(legacySingleLookup.articleRecordsRead, articleCount);
      assert.equal(beforeModel.fullLibraryEnumerations, 100);
      assert.equal(beforeModel.articleRecordsRead, articleCount * 100);
      assert.equal(after.identityLookups, 100);
      assert.equal(after.fullLibraryEnumerations, 1);
      assert.equal(after.articleRecordsRead, articleCount);
      assert.ok(after.directoryEnumerations <= legacySingleLookup.directoryEnumerations);
      assert.ok(after.fileReads <= legacySingleLookup.fileReads);
      assert.ok(after.maintenanceWrites <= legacySingleLookup.maintenanceWrites);
      assert.ok(after.fileReads < beforeModel.fileReads);
      assert.ok(after.maintenanceWrites < beforeModel.maintenanceWrites);
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });
});

it("real file-path identity lookup stays at one library enumeration for the 1000-task contract", function() {
  const fixture = createFixture(1000);
  try {
    const legacySingleLookup = measure(function(taskId) { return legacyLookup(fixture, taskId); }, 1, fixture);
    const beforeModel = projectLegacyRun(legacySingleLookup, 1000);
    const after = measure(function(taskId) { return fixture.store.findByGenerationTaskId(taskId); }, 1000, fixture);
    process.stdout.write(`READ_AMPLIFICATION_BENCHMARK ${JSON.stringify({ articleCount: 1000, taskCount: 1000, beforeModel: beforeModel, after: after })}\n`);

    assert.equal(beforeModel.fullLibraryEnumerations, 1000);
    assert.equal(beforeModel.articleRecordsRead, 1000000);
    assert.equal(after.fullLibraryEnumerations, 1);
    assert.equal(after.articleRecordsRead, 1000);
    assert.equal(after.identityLookups, 1000);
    assert.ok(after.fileReads <= legacySingleLookup.fileReads);
    assert.ok(after.maintenanceWrites <= legacySingleLookup.maintenanceWrites);
    assert.ok(after.fileReads < beforeModel.fileReads);
    assert.ok(after.maintenanceWrites < beforeModel.maintenanceWrites);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});
