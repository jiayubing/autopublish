const { it } = require("node:test");
const assert = require("node:assert/strict");
const { createArticleTrashService } = require("../src/content/article-trash-service");

function fixture(clock) {
  let deleted = false;
  const tombstone = { version: 1, deletedAt: "2026-07-25T00:00:00.000Z", clientId: "c", articleId: "a", status: "saved", references: [] };
  const store = {
    getTrashedTombstone() { return Object.assign({}, tombstone); },
    permanentlyDeleteTrashedArticle() { deleted = true; return Object.assign({}, tombstone, { permanentlyDeleted: true }); },
    listTrashedArticles() { return [tombstone]; }
  };
  return { service: createArticleTrashService({ contentStore: store, now: () => clock.value, permanentDeleteTokenTtlMs: 1000 }), deleted: () => deleted };
}

it("expires at the exact TTL boundary and fails closed for an invalid execution clock", function() {
  const clock = { value: "2026-07-25T00:00:00.000Z" };
  const item = fixture(clock); const prepared = item.service.preparePermanentDelete({ clientId: "c", articleId: "a" });
  clock.value = prepared.expiresAt;
  assert.throws(() => item.service.permanentlyDeleteArticle({ clientId: "c", articleId: "a", token: prepared.token }), (error) => error.code === "ARTICLE_PERMANENT_DELETE_CONFIRMATION_EXPIRED");
  const next = item.service.preparePermanentDelete({ clientId: "c", articleId: "a" });
  clock.value = "not-a-clock";
  assert.throws(() => item.service.permanentlyDeleteArticle({ clientId: "c", articleId: "a", token: next.token }), (error) => error.code === "ARTICLE_PERMANENT_DELETE_CLOCK_INVALID");
  assert.equal(item.deleted(), false);
});

it("invalidates all same-tombstone confirmations after the first successful delete", function() {
  const clock = { value: "2026-07-25T00:00:00.000Z" };
  const item = fixture(clock); const first = item.service.preparePermanentDelete({ clientId: "c", articleId: "a" }); const second = item.service.preparePermanentDelete({ clientId: "c", articleId: "a" });
  assert.equal(item.service.permanentlyDeleteArticle({ clientId: "c", articleId: "a", token: first.token }).deleted, true);
  assert.throws(() => item.service.permanentlyDeleteArticle({ clientId: "c", articleId: "a", token: second.token }), (error) => error.code === "ARTICLE_PERMANENT_DELETE_CONFIRMATION_INVALID");
});
