const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  clearStopSignal,
  isStopRequested,
  requestStopSignal,
  stopFilePath,
} = require("../src/core/stop-signal");
const {
  createBrowserSessionLifecycle,
} = require("../src/platforms/shared/browser-session-lifecycle");
const {
  createPaidMediaPreflightService,
} = require("../desktop/services/paid-media-preflight-service");
const {
  createSubmissionItemProjection,
} = require("../desktop/services/submission-item-projection");

describe("M06-C remote/process/runtime outcomes", function () {
  it("fails closed when the stop signal cannot be read or cleared", function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "m06-c-stop-"));
    try {
      fs.mkdirSync(stopFilePath(dir));
      assert.equal(isStopRequested(dir), true);
      assert.throws(function () {
        clearStopSignal(dir);
      }, { code: "DESKTOP_STOP_SIGNAL_CLEAR_FAILED" });

      const notDirectory = path.join(dir, "not-a-directory");
      fs.writeFileSync(notDirectory, "fixture", "utf8");
      assert.throws(function () {
        requestStopSignal("fixture", notDirectory);
      }, { code: "DESKTOP_STOP_SIGNAL_WRITE_FAILED" });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not start a browser daemon after an unknown session probe", function () {
    let starts = 0;
    const lifecycle = createBrowserSessionLifecycle({
      session: { session: "fixture" },
      run: function () {
        throw new Error("provider response contains a secret");
      },
      start: function () {
        starts += 1;
      },
      maxAttempts: 1,
      sleep: function () {},
    });

    assert.throws(function () {
      lifecycle.ensureStarted();
    }, { code: "BROWSER_SESSION_PROBE_FAILED" });
    assert.equal(starts, 0);
  });

  it("keeps a paid preflight article read failure distinct from not-found", async function () {
    const service = createPaidMediaPreflightService({
      contentStore: {
        getArticle: function () {
          throw new Error("private article store failure");
        },
      },
      mediaPoolStore: { contains: function () { return true; } },
      paidAdmission: { admitPaidBatch: function () {} },
      queryResource: async function () {
        return { resourceId: "resource-1", name: "Fixture", price: 1, available: true };
      },
      systemSubmissionCodeProvider: function () {
        return "submission-1";
      },
      clientSnapshotResolver: function (clientId) {
        return { version: 1, clientId: clientId, displayName: "Fixture" };
      },
    });

    const preview = await service.preflight({
      articleRefs: [{ clientId: "client-1", articleId: "article-1" }],
      mediaResourceId: "resource-1",
    });
    assert.equal(preview.status, "blocked");
    assert.equal(
      preview.blockers.includes("PAID_MEDIA_ARTICLE_STATE_UNAVAILABLE"),
      true,
    );
    assert.equal(preview.blockers.includes("PAID_MEDIA_ARTICLE_NOT_FOUND"), false);
  });

  it("does not project unavailable submission state as an empty history", function () {
    const projection = createSubmissionItemProjection({
      workspaceRoot: os.tmpdir(),
      queuePaths: function () {
        return { filePath: "fixture.txt", sidecarPath: "fixture.txt.submission.json" };
      },
      operationalStore: {
        listPublicationRecords: function () {
          throw new Error("private operational store failure");
        },
        getSubmissionBatch: function () {
          throw new Error("private operational store failure");
        },
      },
    });
    const batch = {
      batchId: "batch-1",
      items: [{ itemId: "item-1", articleId: "article-1", targetKey: "platform:hepan", payload: {} }],
    };
    assert.throws(function () {
      projection.batchViews(batch);
    }, { code: "SUBMISSION_PUBLICATION_STATE_UNAVAILABLE" });
    assert.throws(function () {
      projection.findItemView({ batchId: "batch-1" });
    }, { code: "SUBMISSION_BATCH_STATE_UNAVAILABLE" });
  });
});
