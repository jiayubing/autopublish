const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createPublicationLedger } = require("../src/publication/publication-ledger");
const { resolveArticleIdentity } = require("../src/publication/article-identity");
const { resolvePublicationTarget } = require("../src/publication/publication-targets");

describe("publication ledger store", function() {
  it("uses the portable publication directory and versioned JSON records", function() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "publication-store-"));
    try {
      const ledger = createPublicationLedger({ workspaceRoot: root });
      const article = resolveArticleIdentity({ clientId: "client-1", articleId: "article-1" , title: "title", content: "content" });
      const result = ledger.reserve(article, resolvePublicationTarget({ platformId: "lieju" }));
      assert.equal(ledger.store.directory, path.join(root, ".autopublish", "submission-records", "publications"));
      const files = fs.readdirSync(ledger.store.directory);
      assert.equal(files.filter((name) => name.endsWith(".json")).length, 1);
      const record = JSON.parse(fs.readFileSync(path.join(ledger.store.directory, files[0]), "utf8"));
      assert.equal(record.version, 1);
      assert.equal(record.publicationId, result.publicationId);
      assert.equal(record.status, "queued");
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  it("accepts an injected submission-records path only inside the workspace", function() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "publication-store-paths-"));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "publication-store-outside-"));
    try {
      const ledger = createPublicationLedger({ workspaceRoot: root, paths: { submissionRecords: path.join(root, "portable-records") } });
      ledger.reserve(resolveArticleIdentity({ clientId: "client-1", articleId: "article-1" }), resolvePublicationTarget({ platformId: "toutiao" }));
      assert.equal(fs.existsSync(path.join(root, "portable-records", "publications")), true);
      assert.throws(() => createPublicationLedger({ workspaceRoot: root, paths: { publications: outside } }), { code: "PUBLICATION_PATHS_INVALID" });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });
});
