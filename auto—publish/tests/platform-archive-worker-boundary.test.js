const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { it } = require("node:test");

const { createPlatformWorkbenchService } = require("../desktop/services/platform-workbench-service");

it("retains a published local archive failure after the worker service instance is discarded", async function() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "platform-archive-worker-boundary-"));
  try {
    const input = path.join(root, "input", "lieju");
    const published = path.join(root, "published");
    fs.mkdirSync(input, { recursive: true });
    fs.mkdirSync(published, { recursive: true });
    fs.writeFileSync(path.join(input, "article.txt"), "Title\nBody", "utf8");
    fs.writeFileSync(path.join(published, "article.txt"), "collision", "utf8");
    const options = {
      rootDir: root,
      paths: { input: path.join(root, "input"), published },
      platforms: [{ id: "lieju", scanDir: "lieju" }],
      adapters: { lieju: { ensureSession: () => {}, ensureLoggedIn: async () => {}, publishArticle: async () => ({ status: "published", remoteId: "remote-1" }), closeSession: () => {} } }
    };
    const workerService = createPlatformWorkbenchService(options);
    const result = await workerService.submitSelectedPlanSerially(workerService.buildSelectedPlan({ selectedArticles: [{ sourcePlatformId: "lieju", filename: "article.txt" }], targetPlatformIds: ["lieju"] }), { autoSubmit: true, interactive: false });
    assert.equal(result.results[0].publicationStatus, "published");
    assert.equal(result.results[0].archiveError, "PUBLISHED_ARCHIVE_CONFLICT");
    assert.equal(workerService.listArchiveFailures().length, 1);

    const mainProcessQuery = createPlatformWorkbenchService(options);
    assert.equal(mainProcessQuery.listArchiveFailures().length, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
