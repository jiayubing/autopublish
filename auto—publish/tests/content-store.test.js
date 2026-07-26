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

it("indexes 5000 articles through one client pass", function() {
  let reads = 0; const rows = Array.from({ length: 5000 }, (_, index) => ({ id: `a-${index}`, clientId: "c", generationTaskId: `t-${index}` }));
  const store = createContentStore({ listClientIds: () => ["c"], articleStore: { listArticles: () => { reads += 1; return rows; } } });
  assert.equal(store.findByGenerationTaskId("t-4999").article.id, "a-4999");
  assert.equal(reads, 1);
});
