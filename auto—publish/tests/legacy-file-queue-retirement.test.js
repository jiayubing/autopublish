"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createSubmissionTargetCatalog,
} = require("../desktop/services/submission-target-catalog");
const {
  createPlatformWorkbenchApplication,
} = require("../desktop/services/platform-workbench-application");

test("regular submission catalog semantics stay unchanged after file queue retirement", () => {
  const targets = createSubmissionTargetCatalog().list();
  assert.deepEqual(
    targets.map((target) => ({
      id: target.id,
      contentQueueImport: target.contentQueueImport,
    })),
    [
      { id: "lieju", contentQueueImport: true },
      { id: "hepan", contentQueueImport: true },
    ],
  );
});

test("platform queue projection never scans retired physical queue files", async () => {
  let scanCount = 0;
  const application = createPlatformWorkbenchApplication({
    directoryEntries: [
      {
        id: "lieju",
        displayName: "列举网",
        publicationTargetKind: "platform",
      },
    ],
    platformSessionService: {
      supports: () => true,
      openLogin: async () => ({ platformId: "lieju", status: "opened" }),
      checkLogin: async () => ({ platformId: "lieju", authenticated: true }),
    },
    platformWorkbenchService: {
      scanQueue() {
        scanCount += 1;
        return [
          {
            platformId: "lieju",
            articles: [{ filename: "legacy.txt", title: "Legacy" }],
          },
        ];
      },
    },
  });

  const snapshot = await application.getQueue();
  assert.equal(scanCount, 0);
  assert.deepEqual(snapshot, {
    platforms: [
      { id: "lieju", displayName: "列举网", loginAvailable: true },
    ],
    queue: [],
  });
});
