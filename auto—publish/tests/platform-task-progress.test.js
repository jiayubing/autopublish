const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createPlatformTaskStateStore } = require("../desktop/services/platform-task-state-store");
const { setDiagnosticReporter } = require("../src/diagnostics/diagnostic-producer");

describe("platform task progress snapshot", { concurrency: false }, function() {
  it("restores 7 of 20 processed tasks without exposing paths", function() {
    const store = createPlatformTaskStateStore({ now: () => "2026-07-19T00:01:00.000Z" });
    store.start({
      runId: "run-20",
      tasks: Array.from({ length: 20 }, (_, index) => ({
        sourcePlatformId: "hepan",
        filename: `article-${index + 1}.md`,
        targetPlatformId: "hepan",
        filePath: `C:\\private\\article-${index + 1}.md`,
      })),
    });
    for (let index = 0; index < 7; index += 1) {
      store.applyWorkerState({
        runId: "run-20",
        phase: "remote-finished",
        task: { sourcePlatformId: "hepan", filename: `article-${index + 1}.md`, targetPlatformId: "hepan", filePath: "C:\\private\\secret.md" },
        status: index === 6 ? "failed" : "accepted",
        updatedAt: `2026-07-19T00:01:${String(index + 1).padStart(2, "0")}.000Z`,
      });
    }
    const snapshot = store.getSnapshot();
    assert.equal(snapshot.runId, "run-20");
    assert.equal(snapshot.total, 20);
    assert.equal(snapshot.processed, 7);
    assert.equal(snapshot.succeeded, 6);
    assert.equal(snapshot.failed, 1);
    assert.equal(snapshot.currentTask.filePath, undefined);
  });

  it("does not double count duplicate heartbeats or old runs", function() {
    const store = createPlatformTaskStateStore({ now: () => "2026-07-19T00:02:00.000Z" });
    store.start({ runId: "run-new", tasks: [{ sourcePlatformId: "hepan", filename: "one.md", targetPlatformId: "hepan" }] });
    store.applyWorkerState({ runId: "run-old", phase: "remote-finished", task: { sourcePlatformId: "hepan", filename: "old.md", targetPlatformId: "hepan" }, status: "accepted", updatedAt: "2026-07-19T00:00:00.000Z" });
    store.applyWorkerState({ runId: "run-new", phase: "heartbeat", task: { sourcePlatformId: "hepan", filename: "one.md", targetPlatformId: "hepan" }, updatedAt: "2026-07-19T00:02:00.000Z" });
    store.applyWorkerState({ runId: "run-new", phase: "remote-finished", task: { sourcePlatformId: "hepan", filename: "one.md", targetPlatformId: "hepan" }, status: "accepted", updatedAt: "2026-07-19T00:02:01.000Z" });
    store.applyWorkerState({ runId: "run-new", phase: "remote-finished", task: { sourcePlatformId: "hepan", filename: "one.md", targetPlatformId: "hepan" }, status: "accepted", updatedAt: "2026-07-19T00:02:02.000Z" });
    const snapshot = store.getSnapshot();
    assert.equal(snapshot.processed, 1);
    assert.equal(snapshot.succeeded, 1);
  });

  it("restores an interrupted marker without pretending the worker is running", function() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "platform-task-marker-"));
    const marker = path.join(root, "platform-task-snapshot.json");
    try {
      const first = createPlatformTaskStateStore({ persistedSnapshotPath: marker });
      first.start({ runId: "run-interrupted", tasks: [{ sourcePlatformId: "hepan", filename: "one.md", targetPlatformId: "hepan" }] });
      first.markInterrupted();
      const restored = createPlatformTaskStateStore({ persistedSnapshotPath: marker });
      assert.equal(restored.getSnapshot().phase, "interrupted");
      assert.equal(restored.getSnapshot().isPlatformRunning, false);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  it("reports snapshot persistence failure without leaking the marker path", function() {
    const events = [];
    const restore = setDiagnosticReporter(function(record) {
      events.push(record);
      return true;
    });
    const marker = path.join(os.tmpdir(), "platform-task-persistence-failure.json");
    const failingFs = Object.assign({}, fs, {
      writeFileSync: function() {
        throw Object.assign(new Error("disk is full"), { code: "ENOSPC" });
      },
    });
    try {
      const store = createPlatformTaskStateStore({
        fs: failingFs,
        persistedSnapshotPath: marker,
      });
      store.start({
        runId: "run-persistence-failure",
        tasks: [{ sourcePlatformId: "hepan", filename: "one.md", targetPlatformId: "hepan" }],
      });
      assert.equal(store.getSnapshot().phase, "running");
      assert.ok(events.some((record) => record.code === "PLATFORM_TASK_SNAPSHOT_PERSIST_FAILED"));
      assert.equal(JSON.stringify(events).includes(marker), false);
    } finally {
      restore();
    }
  });

  it("isolates one listener failure while notifying the remaining listeners", function() {
    const events = [];
    const restore = setDiagnosticReporter(function(record) {
      events.push(record);
      return true;
    });
    try {
      const store = createPlatformTaskStateStore();
      const snapshots = [];
      store.subscribe(() => { throw new Error("listener failed"); });
      store.subscribe((snapshot) => snapshots.push(snapshot));
      store.start({
        runId: "run-listener-isolation",
        tasks: [],
      });
      assert.equal(snapshots.length, 1);
      assert.ok(events.some((record) => record.code === "PLATFORM_TASK_STATE_LISTENER_FAILED"));
    } finally {
      restore();
    }
  });
});
