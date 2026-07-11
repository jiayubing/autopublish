const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { createMediaWorkbenchService } = require("../desktop/services/media-workbench-service");
const { createPlatformWorkbenchService } = require("../desktop/services/platform-workbench-service");
const { validateMediaSubmission, validatePlatformSubmission, validateDraft } = require("../desktop/services/submission-boundary");

describe("submission file resolvers", function() {
  let root;

  beforeEach(function() {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "ipc-submission-boundary-"));
    fs.mkdirSync(path.join(root, "input", "media"), { recursive: true });
    fs.mkdirSync(path.join(root, "input", "lieju"), { recursive: true });
    fs.writeFileSync(path.join(root, "input", "media", "article.md"), "# Article", "utf8");
    fs.writeFileSync(path.join(root, "input", "lieju", "article.txt"), "Article", "utf8");
    fs.writeFileSync(path.join(root, "outside.txt"), "outside", "utf8");
  });

  afterEach(function() { fs.rmSync(root, { recursive: true, force: true }); });

  it("resolves media submissions only from real supported files in its input directory", function() {
    const service = createMediaWorkbenchService({ inputDir: path.join(root, "input", "media") });
    assert.equal(service.resolveSubmissionFile("article.md"), path.join(root, "input", "media", "article.md"));
    ["", "../outside.txt", "nested/article.md", "C:\\outside.txt", "article.exe"].forEach(function(filename) {
      assert.throws(function() { service.resolveSubmissionFile(filename); }, { code: "SUBMISSION_INPUT_INVALID" });
    });
  });

  it("resolves platform submissions only from the declared source platform directory", function() {
    const service = createPlatformWorkbenchService({
      rootDir: root,
      platforms: [{ id: "lieju", scanDir: "lieju" }, { id: "toutiao", scanDir: "toutiao" }]
    });
    const plan = service.buildSelectedPlan({
      selectedArticles: [{ sourcePlatformId: "lieju", filename: "article.txt" }],
      targetPlatformIds: ["toutiao"]
    });
    assert.equal(plan.tasks[0].filePath, path.join(root, "input", "lieju", "article.txt"));
    assert.throws(function() {
      service.buildSelectedPlan({ selectedArticles: [{ sourcePlatformId: "unknown", filename: "article.txt" }], targetPlatformIds: ["toutiao"] });
    }, { code: "SUBMISSION_INPUT_INVALID" });
  });
});

describe("IPC submission schemas", function() {
  it("accepts media submissions containing only filename, resource IDs, and a draft revision", function() {
    assert.deepStrictEqual(validateMediaSubmission({ filename: "article.md", resourceIds: ["101"], draftRevision: "r1" }), {
      filename: "article.md", resourceIds: ["101"], draftRevision: "r1"
    });
    assert.throws(function() {
      validateMediaSubmission({ filename: "article.md", resourceIds: ["101"], title: "renderer supplied" });
    }, { code: "SUBMISSION_INPUT_INVALID" });
    assert.throws(function() {
      validateMediaSubmission({ filename: "article.md", resourceIds: ["101", "101"] });
    }, { code: "SUBMISSION_INPUT_INVALID" });
  });

  it("accepts platform submissions containing only source platform, filename, and targets", function() {
    assert.deepStrictEqual(validatePlatformSubmission({ sourcePlatformId: "lieju", filename: "article.txt", targetPlatformIds: ["toutiao"] }), {
      sourcePlatformId: "lieju", filename: "article.txt", targetPlatformIds: ["toutiao"]
    });
    assert.throws(function() {
      validatePlatformSubmission({ sourcePlatformId: "lieju", filename: "article.txt", targetPlatformIds: ["toutiao"], tasks: [] });
    }, { code: "SUBMISSION_INPUT_INVALID" });
  });

  it("rejects malformed draft payloads without leaking arbitrary fields into the store", function() {
    assert.deepStrictEqual(validateDraft({ title: "Title", remark: "Note", ignoreImages: false, selectedResources: [{ resourceId: "101" }] }), {
      title: "Title", remark: "Note", ignoreImages: false, selectedResources: [{ resourceId: "101" }]
    });
    assert.throws(function() { validateDraft({ title: 3 }); }, { code: "DRAFT_INVALID" });
    assert.throws(function() { validateDraft({ title: "ok", executable: "no" }); }, { code: "DRAFT_INVALID" });
  });
});

describe("media IPC boundary", function() {
  it("rejects renderer article objects and invalid drafts with stable safe errors", async function() {
    const { registerMediaIpc } = require("../desktop/ipc/media-ipc");
    const handlers = new Map();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "media-ipc-boundary-"));
    try {
      fs.mkdirSync(path.join(root, "input", "media"), { recursive: true });
      fs.mkdirSync(path.join(root, "data"), { recursive: true });
      fs.writeFileSync(path.join(root, "input", "media", "article.md"), "# Article", "utf8");
      registerMediaIpc({
        ipcMain: { handle: function(channel, handler) { handlers.set(channel, handler); } },
        rootDir: root,
        paths: { mediaInput: path.join(root, "input", "media"), data: path.join(root, "data") }
      });
      const submitted = await handlers.get("media:submit-selected")(null, [{ filename: "article.md", filePath: "C:\\secret.md" }]);
      assert.deepStrictEqual(submitted, { ok: false, error: { code: "SUBMISSION_INPUT_INVALID", message: "Invalid submission input" } });
      const draft = await handlers.get("media:set-draft")(null, "../article.md", { title: "Article" });
      assert.deepStrictEqual(draft, { ok: false, error: { code: "SUBMISSION_INPUT_INVALID", message: "Invalid submission input" } });
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
});
