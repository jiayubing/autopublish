const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createArticleStore } = require("../src/content/article-store");
const { createContentStore } = require("../src/content/content-store");
const { createArticleAttentionQuery } = require("../desktop/services/article-attention-query");
const { createArticleManagementSnapshot } = require("../desktop/services/article-management-snapshot");
const { createRegularSubmissionPermissionQuery } = require("../desktop/services/regular-submission-permission-query");
const { createWorkspaceDataInvalidation } = require("../desktop/workspace-data-invalidation");

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "article-summary-test-"));
  t.after(() => {
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith("article-summary-test-"));
    fs.rmSync(root, { recursive: true, force: true });
  });
  const reads = [];
  let rejectCacheWrites = false;
  const io = new Proxy(fs, { get(target, key) {
    if (key === "readFileSync") return (...args) => { reads.push(String(args[0])); return target[key](...args); };
    if (key === "writeFileSync") return (...args) => {
      if (rejectCacheWrites && String(args[0]).includes(".summary")) throw Object.assign(new Error("fixture cache unavailable"), { code: "EACCES" });
      return target[key](...args);
    };
    return target[key];
  }});
  const open = () => createContentStore({ articleStore: createArticleStore(root, { fs: io }), listClientIds: () => ["a", "b"] });
  const content = open();
  function article(clientId, index, body = "body-only-search-token") {
    return { id: `${clientId}-${index}`, clientId, title: `Title ${index}`, content: body,
      generationTaskId: `task-${clientId}-${index}`, status: "generated", createdAt: "2026-09-12T00:00:00.000Z" };
  }
  return { root, content, open, reads, article, rejectCacheWrites: () => { rejectCacheWrites = true; } };
}

test("scoped titles and summaries never enumerate another client or load bodies after restart", t => {
  const f = fixture(t);
  for (const client of ["a", "b"]) for (let i = 0; i < 20; i++) f.content.createArticle(f.article(client, i, "x".repeat(16384)));
  f.reads.length = 0;
  const reopened = f.open();
  assert.equal(reopened.getGenerationTaskArticleTitle("task-a-0", { clientId: "a", articleId: "a-0" }), "Title 0");
  assert.equal(f.reads.length, 1);
  assert.ok(f.reads[0].endsWith("a-0.summary"));
  assert.equal(reopened.getGenerationTaskArticleTitle("different-task", { clientId: "a", articleId: "a-0" }), null);
  const summaries = reopened.listArticleSummaries("a");
  assert.equal(summaries.length, 20);
  assert.ok(summaries.every(row => row.hasContent && !("content" in row)));
  assert.ok(f.reads.every(file => file.endsWith(".summary")));
  summaries[0].title = "Caller mutation";
  assert.equal(reopened.getArticleSummary("a", summaries[0].id).title.startsWith("Title"), true);
  assert.equal(reopened.getArticle("a", "a-0").content.length, 16384);
});

test("legacy cache rebuild, edits from another store, corrupt sources and search preserve source semantics", async t => {
  const f = fixture(t);
  f.content.createArticle(f.article("a", 0));
  // Locate the derived file from observed public summary reads, independent of workspace layout.
  f.reads.length = 0;
  f.open().getArticleSummary("a", "a-0");
  const cachedPath = f.reads.find(file => file.endsWith(".summary"));
  assert.ok(cachedPath);
  fs.unlinkSync(cachedPath);
  f.reads.length = 0;
  const reopened = f.open();
  assert.equal(reopened.getArticleSummary("a", "a-0").hasContent, true);
  assert.equal(f.reads.filter(file => file.endsWith(".md")).length, 1);
  f.content.saveArticle({ ...f.article("a", 0), title: "Updated" });
  assert.equal(reopened.getArticleSummary("a", "a-0").title, "Updated");
  assert.throws(() => f.content.saveArticle({ ...f.article("a", 0), content: "   " }), { code: "ARTICLE_INVALID" });
  assert.equal(reopened.getArticleSummary("a", "a-0").hasContent, true);
  f.content.saveArticle(f.article("a", 0));
  assert.deepEqual(await reopened.searchArticleIds("a", "body-only-search-token"), ["a-0"]);
  const bodyFile = f.reads.find(file => file.endsWith(".md"));
  fs.writeFileSync(bodyFile, "broken source pair");
  assert.throws(() => reopened.getArticleSummary("a", "a-0"), { code: "ARTICLE_INVALID" });
});

test("unwritable and malformed derived caches do not turn a successful save into a failure", t => {
  const f = fixture(t);
  f.rejectCacheWrites();
  assert.doesNotThrow(() => f.content.createArticle(f.article("a", 0)));
  assert.equal(f.open().getArticleSummary("a", "a-0").title, "Title 0");
  assert.equal(f.content.getArticle("a", "a-0").content, "body-only-search-token");
  const g = fixture(t);
  g.content.createArticle(g.article("a", 0));
  g.open().getArticleSummary("a", "a-0");
  const cache = g.reads.find(file => file.endsWith(".summary"));
  fs.writeFileSync(cache, "invalid cache");
  assert.equal(g.open().getArticleSummary("a", "a-0").hasContent, true);
});

test("empty attention and one-article permission stay bounded with a real content store", async t => {
  const f = fixture(t);
  for (let i = 0; i < 50; i++) f.content.createArticle(f.article("a", i));
  const content = f.open();
  const attention = createArticleAttentionQuery({ readers: {
    getArticle: content.getArticleSummary, getTrashedTombstone: content.getTrashedTombstone,
  }});
  const facts = { listArticleLifecycleFacts: () => ({ publications: [], submissionItems: [], orders: [] }) };
  f.reads.length = 0;
  assert.deepEqual(attention.list({ clientId: "a" }).items, []);
  assert.equal(f.reads.length, 0);
  const permissions = createRegularSubmissionPermissionQuery({ contentStore: content, operationalStore: facts, articleAttentionQuery: attention });
  assert.equal((await permissions.list({ clientId: "a", articleIds: ["a-0"] })).items[0].allowed, true);
  assert.equal(f.reads.length, 1);
  assert.ok(f.reads[0].endsWith("a-0.summary"));
});

test("snapshot caches ignore source-only revisions, preserve public revision and refresh saved content", async t => {
  const f = fixture(t);
  f.content.createArticle(f.article("a", 0));
  const invalidation = createWorkspaceDataInvalidation({ workspaceRuntimeId: "summary-test" });
  let lists = 0;
  const service = createArticleManagementSnapshot({
    getRevision: invalidation.getRevision, getCacheRevision: invalidation.getArticleReadRevision,
    listArticles: client => { lists++; return f.content.listArticleSummaries(client); },
    searchArticleIds: f.content.searchArticleIds,
  });
  const initial = await service.get({ clientId: "a" });
  assert.equal("content" in initial.articles[0], false);
  invalidation.invalidate("CONTENT_QUESTION_UPDATED");
  const next = await service.get({ clientId: "a" });
  assert.equal(lists, 1);
  assert.equal(next.revision, invalidation.getRevision());
  assert.deepEqual((await service.get({ clientId: "a", search: "body-only-search-token" })).matchingArticleIds, ["a-0"]);
  f.content.saveArticle({ ...f.article("a", 0), title: "New title" });
  invalidation.invalidate("ARTICLE_SAVED");
  assert.equal((await service.get({ clientId: "a" })).articles[0].title, "New title");
  assert.equal(lists, 2);
  invalidation.invalidate("CONTENT_SOURCE_CHANGED");
  assert.equal(invalidation.getArticleReadRevision(), invalidation.getRevision());
  invalidation.invalidate("UNKNOWN_MUTATION");
  assert.equal(invalidation.getArticleReadRevision(), invalidation.getRevision());
});

test("trash, restore and purge cannot revive a stale active summary", t => {
  const f = fixture(t);
  f.content.createArticle(f.article("a", 0));
  const reader = f.open();
  reader.getArticleSummary("a", "a-0");
  const cache = f.reads.find(file => file.endsWith(".summary"));
  const tombstone = { version: 1, clientId: "a", articleId: "a-0", status: "generated",
    deletedAt: "2026-09-12T00:00:00.000Z", references: [] };
  f.content.moveArticleToTrash("a", "a-0", tombstone);
  assert.throws(() => reader.getArticleSummary("a", "a-0"), { code: "ARTICLE_NOT_FOUND" });
  assert.deepEqual(reader.listArticleSummaries("a"), []);
  f.content.restoreTrashedArticle("a", "a-0");
  assert.equal(reader.getArticleSummary("a", "a-0").title, "Title 0");
  f.content.moveArticleToTrash("a", "a-0", tombstone);
  f.content.permanentlyDeleteTrashedArticle("a", "a-0");
  assert.equal(fs.existsSync(cache), false);
  assert.throws(() => reader.getArticleSummary("a", "a-0"), { code: "ARTICLE_NOT_FOUND" });
});

test("independent attention facts for one article share a single bounded summary read", t => {
  const f = fixture(t);
  f.content.createArticle(f.article("a", 0));
  const content = f.open();
  const query = createArticleAttentionQuery({ readers: {
    getArticle: content.getArticleSummary,
    listTransactions: () => [{ transactionId: "repair", clientId: "a", articleId: "a-0", status: "needs_repair" }],
    listOrderAttention: () => [{ orderId: "order", clientId: "a", articleId: "a-0", anomaly: { reason: "unknown-status" } }],
  }});
  f.reads.length = 0;
  assert.equal(query.list({ clientId: "a" }).items.length, 2);
  assert.equal(f.reads.length, 1);
  assert.ok(f.reads[0].endsWith("a-0.summary"));
});

test("large summary and full-text queries yield to the event loop and cancel superseded work", async t => {
  const f = fixture(t);
  for (let i = 0; i < 120; i++) f.content.createArticle(f.article("a", i, "searchable " + "x".repeat(8192)));
  let ticks = 0;
  const timer = setInterval(() => ticks++, 0);
  try {
    const summary = await f.open().listArticleSummariesAsync("a");
    assert.equal(summary.length, 120);
    assert.ok(ticks > 0, "summary reading must let timers run");
    ticks = 0;
    const found = await f.content.searchArticleIds("a", "searchable");
    assert.equal(found.length, 120);
    assert.ok(ticks > 0, "search must let timers run");
    const controller = new AbortController();
    const pending = f.content.searchArticleIds("a", "searchable", { signal: controller.signal });
    controller.abort();
    await assert.rejects(pending, { code: "ARTICLE_SEARCH_SUPERSEDED" });
  } finally { clearInterval(timer); }
});

test("a replacement client directory between search slices fails closed", async t => {
  const f = fixture(t);
  for (let i = 0; i < 80; i++) f.content.createArticle(f.article("a", i));
  f.open().getArticleSummary("a", "a-0");
  const directory = path.dirname(f.reads.find(file => file.endsWith(".summary")));
  const moved = directory + "-original";
  const pending = f.content.searchArticleIds("a", "body");
  fs.renameSync(directory, moved);
  fs.mkdirSync(directory);
  await assert.rejects(pending, { code: "ARTICLE_PATH_OUT_OF_BOUNDS" });
});
