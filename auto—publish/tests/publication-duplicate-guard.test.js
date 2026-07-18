const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createPublicationLedger } = require("../src/publication/publication-ledger");
const { resolvePublicationTarget } = require("../src/publication/publication-targets");
const { resolveArticleIdentity } = require("../src/publication/article-identity");

function tempDirectory() { return fs.mkdtempSync(path.join(os.tmpdir(), "auto-publish-publication-guard-")); }
function setup() {
  const root = tempDirectory();
  const ledger = createPublicationLedger({ workspaceRoot: root });
  const article = resolveArticleIdentity({ clientId: "client-1", articleId: "article-1", title: "标题", content: "正文" });
  return { root, ledger, article };
}

describe("publication duplicate guard", function() {
  it("blocks the same article and platform while allowing another platform", function() {
    const { root, ledger, article } = setup();
    try {
      const toutiao = resolvePublicationTarget({ platformId: "toutiao" });
      const hepan = resolvePublicationTarget({ platformId: "hepan" });
      const first = ledger.reserve(article, toutiao, { displayName: "今日头条" });
      assert.equal(first.status, "queued");
      assert.throws(() => ledger.reserve(article, toutiao), { code: "PUBLICATION_DUPLICATE" });
      assert.equal(ledger.reserve(article, hepan).targetKey, "platform:hepan");
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  it("treats each media resource as an independent target", function() {
    const { root, ledger, article } = setup();
    try {
      const first = ledger.reserve(article, resolvePublicationTarget({ mediaResourceId: "1001" }));
      const second = ledger.reserve(article, resolvePublicationTarget({ mediaResourceId: "1002" }));
      assert.notEqual(first.publicationId, second.publicationId);
      assert.throws(() => ledger.reserve(article, resolvePublicationTarget({ mediaResourceId: "1001" })), { code: "PUBLICATION_DUPLICATE" });
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  it("blocks submitted and uncertain, but allows failed retry with a new attempt", function() {
    const { root, ledger, article } = setup();
    try {
      const target = resolvePublicationTarget({ platformId: "toutiao" });
      const submitted = ledger.reserve(article, target);
      ledger.markSubmitting(submitted.publicationId, submitted.attemptId);
      ledger.recordOutcome(submitted.publicationId, submitted.attemptId, { status: "submitted", remoteId: "remote-1" });
      assert.throws(() => ledger.reserve(article, target), { code: "PUBLICATION_DUPLICATE" });

      ledger.recordOutcome(submitted.publicationId, submitted.attemptId, { status: "uncertain", errorCode: "REMOTE_RESULT_UNKNOWN" });
      assert.throws(() => ledger.reserve(article, target), { code: "PUBLICATION_UNCERTAIN" });
      ledger.reconcile(submitted.publicationId, { status: "failed", reasonCode: "CONFIRMED_NOT_PUBLISHED" });
      const retry = ledger.reserve(article, target);
      assert.equal(retry.publicationId, submitted.publicationId);
      assert.notEqual(retry.attemptId, submitted.attemptId);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  it("uses one exclusive publication record for concurrent reservations", function() {
    const { root, ledger, article } = setup();
    try {
      const target = resolvePublicationTarget({ platformId: "toutiao" });
      const results = [0, 1].map(() => { try { return { ok: true, value: ledger.reserve(article, target) }; } catch (error) { return { ok: false, error }; } });
      assert.equal(results.filter((item) => item.ok).length, 1);
      assert.equal(results.filter((item) => !item.ok)[0].error.code, "PUBLICATION_DUPLICATE");
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
});
