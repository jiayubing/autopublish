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
const { createMediaAdapter } = require("../src/platforms/media/adapter");
const { MediaDraftStore } = require("../src/platforms/media/media-draft-store");
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

  it("keeps missing media order identity uncertain without exposing transport errors", async function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "m06-c-media-"));
    const articlePath = path.join(dir, "article.txt");
    const originalFetch = globalThis.fetch;
    fs.writeFileSync(articlePath, "fixture article", "utf8");
    try {
      globalThis.fetch = async function () {
        return {
          status: 200,
          ok: true,
          text: async function () {
            return JSON.stringify({ data: {} });
          },
        };
      };
      const missingOrder = await createMediaAdapter({
        mainProcess: true,
        apiKey: "fixture-key",
        baseUrl: "https://media.example.test",
      }).publish({
        title: "Fixture",
        contentFile: articlePath,
        resourceId: "resource-1",
      });
      assert.deepEqual(
        { status: missingOrder.status, errorCode: missingOrder.errorCode },
        { status: "uncertain", errorCode: "MEDIA_ORDER_ID_MISSING" },
      );

      globalThis.fetch = async function () {
        return {
          status: 200,
          ok: true,
          text: async function () {
            return JSON.stringify({ code: 400, data: { order_nid: "must-not-accept" } });
          },
        };
      };
      const rejected = await createMediaAdapter({
        mainProcess: true,
        apiKey: "fixture-key",
        baseUrl: "https://media.example.test",
      }).publish({
        title: "Fixture",
        contentFile: articlePath,
        resourceId: "resource-1",
      });
      assert.deepEqual(
        { status: rejected.status, errorCode: rejected.errorCode },
        { status: "error", errorCode: "MEDIA_REMOTE_REJECTED" },
      );

      globalThis.fetch = async function () {
        throw new Error("api-key=fixture-key cookie=fixture-cookie");
      };
      const networkFailure = await createMediaAdapter({
        mainProcess: true,
        apiKey: "fixture-key",
        baseUrl: "https://media.example.test",
      }).publish({
        title: "Fixture",
        contentFile: articlePath,
        resourceId: "resource-1",
      });
      assert.equal(networkFailure.status, "uncertain");
      assert.equal(networkFailure.errorCode, "MEDIA_NETWORK_ERROR");
      assert.equal(JSON.stringify(networkFailure).includes("fixture-cookie"), false);

      const queryFailure = await createMediaAdapter({
        mainProcess: true,
        apiKey: "fixture-key",
        baseUrl: "https://media.example.test",
      }).queryOrder("order-1");
      assert.equal(queryFailure.status, "uncertain");
      assert.equal(queryFailure.errorCode, "MEDIA_NETWORK_ERROR");

      const balanceFailure = await createMediaAdapter({
        mainProcess: true,
        apiKey: "fixture-key",
        baseUrl: "https://media.example.test",
      }).getBalance();
      assert.equal(balanceFailure.status, "uncertain");
      assert.equal(balanceFailure.errorCode, "MEDIA_NETWORK_ERROR");
    } finally {
      globalThis.fetch = originalFetch;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("surfaces corrupt local media state instead of treating it as absent", function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "m06-c-store-"));
    const storePath = path.join(dir, "media-drafts.json");
    try {
      fs.writeFileSync(storePath, "[]", "utf8");
      const store = new MediaDraftStore({ storePath: storePath });
      assert.throws(function () {
        store.getAll();
      }, { code: "MEDIA_DRAFT_STORE_CORRUPT" });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("keeps a paid preflight article read failure distinct from not-found", async function () {
    const service = createPaidMediaPreflightService({
      contentStore: {
        getArticle: function () {
          throw new Error("private article store failure");
        },
      },
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
