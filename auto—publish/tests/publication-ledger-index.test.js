const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  createPublicationLedger,
} = require("../src/publication/publication-ledger");
const {
  resolveArticleIdentity,
} = require("../src/publication/article-identity");

describe("publication ledger index", function () {
  it("does not rescan the publication directory for repeated id lookups", function () {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "publication-index-"));
    const originalReadDirectory = fs.readdirSync;
    let publicationDirectoryReads = 0;
    try {
      const ledger = createPublicationLedger({ workspaceRoot: root });
      const directory = ledger.store.directory;
      const article = resolveArticleIdentity({
        clientId: "client-1",
        articleId: "article-1",
      });
      const reservation = ledger.reserve(article, { platformId: "toutiao" });
      fs.readdirSync = function (target, options) {
        if (path.resolve(target) === path.resolve(directory))
          publicationDirectoryReads += 1;
        return originalReadDirectory.call(fs, target, options);
      };
      assert.equal(
        ledger.get(reservation.publicationId).publicationId,
        reservation.publicationId,
      );
      assert.equal(
        ledger.get(reservation.publicationId).publicationId,
        reservation.publicationId,
      );
      assert.deepEqual(
        ledger.list().map((record) => record.publicationId),
        [reservation.publicationId],
      );
      assert.equal(publicationDirectoryReads, 0);
    } finally {
      fs.readdirSync = originalReadDirectory;
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
