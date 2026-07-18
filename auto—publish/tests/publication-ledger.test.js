const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createPublicationLedger } = require("../src/publication/publication-ledger");
const { resolveArticleIdentity } = require("../src/publication/article-identity");
const { resolvePublicationTarget } = require("../src/publication/publication-targets");

function temporaryRoot() { return fs.mkdtempSync(path.join(os.tmpdir(), "publication-ledger-")); }

function setup() {
  const root = temporaryRoot();
  const ledger = createPublicationLedger({ workspaceRoot: root, now: () => "2026-07-18T00:00:00.000Z" });
  const article = resolveArticleIdentity({ clientId: "client-1", articleId: "article-1", title: "title", content: "body" });
  return { root, ledger, article };
}

describe("publication ledger", function() {
  it("persists a per-target aggregate and keeps failed retry history", function() {
    const { root, ledger, article } = setup();
    try {
      const target = resolvePublicationTarget({ platformId: "toutiao" });
      const first = ledger.reserve(article, target, { displayName: "今日头条", accountId: "account-secret" });
      ledger.markSubmitting(first.publicationId, first.attemptId);
      ledger.recordOutcome(first.publicationId, first.attemptId, { status: "failed", errorCode: "REMOTE_REJECTED" });
      const retry = ledger.reserve(article, target);
      const record = ledger.get(first.publicationId);

      assert.equal(retry.publicationId, first.publicationId);
      assert.notEqual(retry.attemptId, first.attemptId);
      assert.equal(record.attempts.length, 2);
      assert.equal(record.status, "queued");
      assert.equal(record.displayName, "今日头条");
      assert.match(record.accountFingerprint, /^[a-f0-9]{64}$/);
      assert.equal(Object.prototype.hasOwnProperty.call(record, "content"), false);
      assert.equal(fs.readdirSync(path.join(root, ".autopublish", "submission-records", "publications")).filter((name) => name.endsWith(".json")).length, 1);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  it("requires reconciliation for uncertain outcomes", function() {
    const { root, ledger, article } = setup();
    try {
      const target = resolvePublicationTarget({ platformId: "hepan" });
      const reserved = ledger.reserve(article, target);
      ledger.markSubmitting(reserved.publicationId, reserved.attemptId);
      ledger.recordOutcome(reserved.publicationId, reserved.attemptId, { status: "uncertain", errorCode: "REMOTE_RESULT_UNKNOWN", rawResponse: { secret: "no-store" }, stack: "no-store" });
      assert.throws(() => ledger.reserve(article, target), { code: "PUBLICATION_UNCERTAIN" });
      ledger.reconcile(reserved.publicationId, { status: "failed", reasonCode: "CONFIRMED_NOT_PUBLISHED" });
      assert.equal(ledger.reserve(article, target).publicationId, reserved.publicationId);
      const raw = fs.readFileSync(ledger.store.directory + "/" + fs.readdirSync(ledger.store.directory).find((name) => name.endsWith(".json")), "utf8");
      assert.equal(raw.includes("rawResponse"), false);
      assert.equal(raw.includes("no-store"), false);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  it("lists only requested generated articles for a client", function() {
    const { root, ledger, article } = setup();
    try {
      ledger.reserve(article, resolvePublicationTarget({ platformId: "toutiao" }));
      ledger.reserve(resolveArticleIdentity({ clientId: "client-1", articleId: "article-2", title: "two", content: "body" }), resolvePublicationTarget({ platformId: "hepan" }));
      ledger.reserve(resolveArticleIdentity({ clientId: "other-client", articleId: "article-1", title: "other", content: "body" }), resolvePublicationTarget({ platformId: "toutiao" }));
      assert.deepEqual(ledger.listForArticles("client-1", ["article-2"]).map((record) => record.articleId), ["article-2"]);
      assert.deepEqual(ledger.listForArticles("client-1", ["missing"]), []);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
});
