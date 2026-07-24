"use strict";
const {
  createOperationalStore,
} = require("../../src/infrastructure/operational-store/operational-store");
const {
  createMigration,
} = require("../../scripts/migrate-operational-store-v1");

const [mode, workspaceRoot] = process.argv.slice(2);
function ready(value) {
  process.stdout.write(JSON.stringify(value) + "\n");
}
if (mode === "writer" || mode === "writer-commit") {
  try {
    const store = createOperationalStore({ workspaceRoot });
    if (mode === "writer-commit") {
      store.reservePublicationTarget({
        articleId: "child-committed-article",
        publicationId: "child-committed-publication",
        attemptId: "child-committed-attempt",
        target: {
          kind: "platform",
          platformId: "toutiao",
          accountProfileId: "account-1",
        },
      });
    }
    ready({ status: "ready" });
    setInterval(() => {}, 1000);
    process.on("SIGTERM", () => {
      store.close();
      process.exit(0);
    });
  } catch (error) {
    ready({ status: "error", code: error.code || "UNKNOWN" });
    process.exitCode = 1;
  }
} else if (mode === "migration") {
  try {
    createMigration({
      workspaceRoot,
      fault(point) {
        if (point === "after_lease") {
          ready({ status: "ready" });
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5000);
        }
      },
    }).execute();
    ready({ status: "done" });
  } catch (error) {
    ready({ status: "error", code: error.code || "UNKNOWN" });
    process.exitCode = 1;
  }
} else if (mode === "writer-uncommitted") {
  try {
    const store = createOperationalStore({
      workspaceRoot,
      internalBeforeCommit() {
        ready({ status: "ready" });
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5000);
      },
    });
    store.reservePublicationTarget({
      articleId: "child-uncommitted-article",
      publicationId: "child-uncommitted-publication",
      attemptId: "child-uncommitted-attempt",
      target: {
        kind: "platform",
        platformId: "toutiao",
        accountProfileId: "account-1",
      },
    });
    store.close();
  } catch (error) {
    ready({ status: "error", code: error.code || "UNKNOWN" });
    process.exitCode = 1;
  }
} else {
  ready({ status: "error", code: "CHILD_MODE_INVALID" });
  process.exitCode = 1;
}
