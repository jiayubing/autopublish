const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");

const { MediaDraftStore } = require("../src/platforms/media/media-draft-store");

describe("MediaDraftStore multi-resource support", function() {
  let dir;
  let storePath;

  beforeEach(function() {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "media-drafts-"));
    storePath = path.join(dir, "media-drafts.json");
  });

  afterEach(function() {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("stores multiple selected resources for one article", function() {
    const store = new MediaDraftStore({ storePath: storePath });
    store.set("a.docx", {
      title: "Article A",
      selectedResources: [
        { resourceId: "101", name: "Media One", price: 120 },
        { resourceId: "102", name: "Media Two", price: 80 }
      ],
      ignoreImages: true
    });

    assert.deepStrictEqual(store.get("a.docx").selectedResources.map(function(resource) {
      return resource.resourceId;
    }), ["101", "102"]);
  });

  it("migrates old single resource drafts", function() {
    fs.writeFileSync(storePath, JSON.stringify({
      "old.docx": {
        title: "Old Article",
        resourceId: "201",
        resourceName: "Old Media"
      }
    }, null, 2), "utf-8");

    const store = new MediaDraftStore({ storePath: storePath });
    assert.deepStrictEqual(store.get("old.docx").selectedResources, [
      { resourceId: "201", name: "Old Media", price: undefined }
    ]);
  });

  it("sets one resource on many files without deleting other draft fields", function() {
    const store = new MediaDraftStore({ storePath: storePath });
    store.set("a.docx", { title: "A", ignoreImages: true });
    store.setBulkResource(["a.docx", "b.docx"], "301", "Batch Media");

    assert.strictEqual(store.get("a.docx").title, "A");
    assert.strictEqual(store.get("a.docx").ignoreImages, true);
    assert.deepStrictEqual(store.get("a.docx").selectedResources, [
      { resourceId: "301", name: "Batch Media", price: undefined }
    ]);
    assert.deepStrictEqual(store.get("b.docx").selectedResources, [
      { resourceId: "301", name: "Batch Media", price: undefined }
    ]);
  });
});
