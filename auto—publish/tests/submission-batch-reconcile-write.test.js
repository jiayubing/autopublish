const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  createSubmissionBatchStore,
} = require("../src/content/submission-batch-store");

describe("submission batch reconciliation write boundary", function () {
  it("applies several transitions with one batch rename", function () {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "submission-reconcile-"),
    );
    const originalRename = fs.renameSync;
    let batchRenames = 0;
    try {
      const store = createSubmissionBatchStore({
        workspaceRoot: root,
        createId: () => "batch-1",
        now: () => "2026-07-20T00:00:00.000Z",
      });
      store.save({
        id: "batch-1",
        clientId: "client-1",
        createdAt: "2026-07-20T00:00:00.000Z",
        status: "queued",
        items: [
          {
            publicationId: "publication-1",
            attemptId: "attempt-1",
            targetPlatformId: "toutiao",
            status: "queued",
          },
          {
            publicationId: "publication-2",
            attemptId: "attempt-2",
            targetPlatformId: "hepan",
            status: "queued",
          },
        ],
      });
      fs.renameSync = function (source, target) {
        if (String(target).includes("batch-batch-1.json")) batchRenames += 1;
        return originalRename.call(fs, source, target);
      };
      const result = store.reconcile("batch-1", [
        {
          identity: {
            publicationId: "publication-1",
            attemptId: "attempt-1",
            targetPlatformId: "toutiao",
          },
          transition: { status: "failed", errorCode: "REMOTE_REJECTED" },
        },
        {
          identity: {
            publicationId: "publication-2",
            attemptId: "attempt-2",
            targetPlatformId: "hepan",
          },
          transition: { status: "published", remoteId: "remote-2" },
        },
      ]);
      assert.equal(batchRenames, 1);
      assert.deepEqual(
        result.items.map((item) => item.status),
        ["failed", "published"],
      );
    } finally {
      fs.renameSync = originalRename;
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
