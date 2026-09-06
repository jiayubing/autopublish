const { it } = require("node:test");
const assert = require("node:assert/strict");
const { createContentStore } = require("../src/content/content-store");

it("returns closed 0/1/many GenerationTaskId results without selecting a candidate", function() {
  const rows = { c1: [{ id: "a1", clientId: "c1", generationTaskId: "one" }, { id: "a2", clientId: "c1", generationTaskId: "many" }], c2: [{ id: "a3", clientId: "c2", generationTaskId: "many" }] };
  const store = createContentStore({ listClientIds: () => ["c1", "c2"], articleStore: { listArticles: (id) => rows[id] || [] } });
  assert.deepEqual(store.findByGenerationTaskId("missing"), { kind: "none" });
  assert.equal(store.findByGenerationTaskId("one").kind, "one");
  assert.equal(store.findByArticleId("a1").kind, "one");
  assert.deepEqual(store.findByGenerationTaskId("many"), { kind: "many", matches: [{ clientId: "c1", articleId: "a2" }, { clientId: "c2", articleId: "a3" }] });
});

it("returns closed operation identity results across clients", function() {
  const rows = { c1: [{ id: "a1", clientId: "c1", generationOperationId: "operation-1" }], c2: [{ id: "a2", clientId: "c2", generationOperationId: "operation-1" }] };
  const store = createContentStore({ listClientIds: () => ["c1", "c2"], articleStore: { listArticles: (id) => rows[id] || [] } });
  assert.equal(store.findByGenerationOperationId("missing").kind, "none");
  assert.deepEqual(store.findByGenerationOperationId("operation-1"), { kind: "many", matches: [{ clientId: "c1", articleId: "a1" }, { clientId: "c2", articleId: "a2" }] });
});

it("indexes 5000 articles through one client pass", function() {
  let reads = 0; const rows = Array.from({ length: 5000 }, (_, index) => ({ id: `a-${index}`, clientId: "c", generationTaskId: `t-${index}` }));
  const store = createContentStore({ listClientIds: () => ["c"], articleStore: { listArticles: () => { reads += 1; return rows; } } });
  assert.equal(store.findByGenerationTaskId("t-4999").article.id, "a-4999");
  assert.equal(reads, 1);
});

function readAmplificationFixture(articleCount) {
  let enumerations = 0;
  let articleReads = 0;
  const rows = Array.from({ length: articleCount }, function(_, index) {
    return { id: `a-${index}`, clientId: "c", generationTaskId: `existing-${index}` };
  });
  const articleStore = {
    listArticles: function() {
      enumerations += 1;
      articleReads += rows.length;
      return rows.map(function(article) { return Object.assign({}, article); });
    },
    createArticle: function(article) {
      rows.push(Object.assign({}, article));
      return Object.assign({}, article);
    },
    saveArticle: function(article) {
      const index = rows.findIndex(function(item) { return item.clientId === article.clientId && item.id === article.id; });
      if (index >= 0) rows[index] = Object.assign({}, article);
      else rows.push(Object.assign({}, article));
      return Object.assign({}, article);
    },
  };
  return {
    store: createContentStore({ listClientIds: () => ["c"], articleStore: articleStore }),
    counts: function() { return { enumerations: enumerations, articleReads: articleReads }; },
  };
}

[100, 1000].forEach(function(articleCount) {
  it(`reuses one identity enumeration for 100 task lookups with ${articleCount} existing articles`, function() {
    const fixture = readAmplificationFixture(articleCount);
    for (let index = 0; index < 100; index += 1) {
      assert.equal(fixture.store.findByGenerationTaskId(`new-task-${index}`).kind, "none");
    }
    assert.deepEqual(fixture.counts(), { enumerations: 1, articleReads: articleCount });
  });
});

it("keeps 1000 task lookups at one full-library enumeration", function() {
  const fixture = readAmplificationFixture(1000);
  for (let index = 0; index < 1000; index += 1) fixture.store.findByGenerationTaskId(`task-${index}`);
  assert.deepEqual(fixture.counts(), { enumerations: 1, articleReads: 1000 });
});

it("makes an article created after index construction immediately visible", function() {
  const fixture = readAmplificationFixture(100);
  assert.equal(fixture.store.findByGenerationTaskId("created-now").kind, "none");
  fixture.store.createArticle({ id: "new-article", clientId: "c", generationTaskId: "created-now" });
  assert.equal(fixture.store.findByGenerationTaskId("created-now").article.id, "new-article");
  assert.deepEqual(fixture.counts(), { enumerations: 1, articleReads: 100 });
});

it("updates generation identity after a legitimate save without rebuilding the library", function() {
  const fixture = readAmplificationFixture(1);
  const existing = fixture.store.findByGenerationTaskId("existing-0").article;
  fixture.store.saveArticle(Object.assign({}, existing, { generationTaskId: "changed-task" }));
  assert.equal(fixture.store.findByGenerationTaskId("existing-0").kind, "none");
  assert.equal(fixture.store.findByGenerationTaskId("changed-task").article.id, "a-0");
  assert.deepEqual(fixture.counts(), { enumerations: 1, articleReads: 1 });
});

it("keeps identity indexes scoped to each ContentStore instance", function() {
  const first = createContentStore({ listClientIds: () => ["c"], articleStore: { listArticles: () => [{ id: "a", clientId: "c", generationTaskId: "first" }] } });
  const second = createContentStore({ listClientIds: () => ["c"], articleStore: { listArticles: () => [{ id: "b", clientId: "c", generationTaskId: "second" }] } });
  assert.equal(first.findByGenerationTaskId("first").article.id, "a");
  assert.equal(first.findByGenerationTaskId("second").kind, "none");
  assert.equal(second.findByGenerationTaskId("first").kind, "none");
  assert.equal(second.findByGenerationTaskId("second").article.id, "b");
});
