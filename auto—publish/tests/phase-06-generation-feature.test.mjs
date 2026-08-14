import test from "node:test";
import assert from "node:assert/strict";
import { createGenerationFeature } from "../media-workbench/src/features/generation/generation-feature.js";

function runtimeAdapters(overrides = {}) {
  return {
    hydrate: async (reason, scope) => ({
      runtimeId: "runner-1",
      sequence: 0,
      runtime: { batchId: scope.batchId, status: "idle", state: "idle" },
      batch: { id: scope.batchId, status: "idle" },
      capabilities: {},
    }),
    subscribeRuntime: () => () => {},
    previewBatch: async () => ({}),
    previewCancelPending: async () => ({}),
    cancelPending: async () => null,
    ...overrides,
  };
}

test("generation exposes named commands whose tokens do not finalize one another", async () => {
  let resolvePause;
  const feature = createGenerationFeature(runtimeAdapters({
    start: async () => ({ id: "batch-1" }),
    pause: () => new Promise((resolve) => { resolvePause = resolve; }),
    resume: async () => ({ id: "batch-1", status: "running" }),
    stop: async () => ({ id: "batch-1", status: "stopping" }),
    continue: async () => ({ id: "batch-1" }),
    retry: async () => ({ id: "batch-1" }),
  }));
  feature.setScope({ workspaceRuntimeId: "w1", batchId: "batch-1" });
  assert.equal("run" in feature, false);
  const pause = feature.pause({ batchId: "batch-1" });
  const stop = feature.stop({ batchId: "batch-1" });
  assert.equal(feature.getSnapshot().commands.pause.busy, true);
  assert.equal(feature.getSnapshot().commands.stop.busy, true);
  await stop;
  assert.equal(feature.getSnapshot().commands.stop.busy, false);
  assert.equal(feature.getSnapshot().commands.pause.busy, true);
  resolvePause({ id: "batch-1", status: "paused" });
  await pause;
  assert.equal(feature.getSnapshot().commands.pause.busy, false);
});

test("generation rejects stale batch results after a scope switch", async () => {
  let resolveStart;
  const refreshed = [];
  const feature = createGenerationFeature(runtimeAdapters({
    start: () => new Promise((resolve) => { resolveStart = resolve; }),
    pause: async () => null,
    resume: async () => null,
    stop: async () => null,
    continue: async () => null,
    retry: async () => null,
    previewBatch: async () => ({}),
    previewCancelPending: async () => ({}),
    cancelPending: async () => null,
    hydrate: async (reason, scope) => {
      refreshed.push([reason, scope]);
      return {
        runtimeId: "runner-1",
        sequence: 0,
        runtime: { batchId: scope.batchId, status: "idle", state: "idle" },
        batch: { id: scope.batchId, status: "idle" },
        capabilities: {},
      };
    },
  }));
  feature.setScope({ workspaceRuntimeId: "w1", batchId: "batch-a" });
  const pending = feature.start({ batchId: "batch-a" });
  feature.setScope({ workspaceRuntimeId: "w1", batchId: "batch-b" });
  resolveStart({ id: "batch-a" });
  assert.equal(await pending, undefined);
  assert.equal(feature.getSnapshot().scope.batchId, "batch-b");
  assert.equal(feature.getSnapshot().commands.start.result, null);
  assert.deepEqual(refreshed, [["stale-command-result", { workspaceRuntimeId: "w1", batchId: "batch-b" }]]);
});

test("generation hydrates its runtime snapshot and owns the event subscription lifetime", async () => {
  let runtimeListener;
  let unsubscribeCount = 0;
  const feature = createGenerationFeature({
    start: async () => null,
    pause: async () => null,
    resume: async () => null,
    stop: async () => null,
    continue: async () => null,
    retry: async () => null,
    previewBatch: async () => ({}),
    previewCancelPending: async () => ({}),
    cancelPending: async () => null,
    hydrate: async () => ({
      runtimeId: "runner-1",
      sequence: 4,
      runtime: { batchId: "batch-1", status: "running", state: "running", counts: { total: 2, pending: 1, succeeded: 1 } },
      batch: { id: "batch-1", status: "pending", counts: { total: 2, pending: 2, succeeded: 0 } },
      capabilities: { canResume: false },
    }),
    subscribeRuntime(listener) {
      runtimeListener = listener;
      return () => { unsubscribeCount += 1; };
    },
  });

  feature.setScope({ workspaceRuntimeId: "workspace-1", batchId: "batch-1" });
  await feature.hydrate();

  assert.equal(typeof runtimeListener, "function");
  assert.equal(feature.getSnapshot().runtime.status, "running");
  assert.equal(feature.getSnapshot().batch.id, "batch-1");
  assert.equal(feature.getSnapshot().batch.status, "running");
  assert.equal(feature.getSnapshot().batch.counts.succeeded, 1);
  assert.equal(feature.getSnapshot().runtimeId, "runner-1");
  assert.equal(feature.getSnapshot().sequence, 4);

  feature.dispose();
  feature.dispose();
  assert.equal(unsubscribeCount, 1);
});

test("generation exposes an incomplete hydration observation when the runtime read fails", async () => {
  const feature = createGenerationFeature(runtimeAdapters({
    hydrate: async () => {
      throw new Error("private runtime transport detail");
    },
    start: async () => null,
    pause: async () => null,
    resume: async () => null,
    stop: async () => null,
    continue: async () => null,
    retry: async () => null,
  }));
  feature.setScope({ workspaceRuntimeId: "workspace-hydration-failure", batchId: "batch-1" });
  await assert.rejects(feature.hydrate("initial"));
  assert.deepEqual(feature.getSnapshot().hydration.error, {
    code: "GENERATION_RUNTIME_HYDRATION_FAILED",
    category: "internal",
    retryability: "safe",
    userMessage: "批量生成状态读取失败，请刷新重试。",
  });
  assert.equal(feature.getSnapshot().hydration.loading, false);
  assert.doesNotMatch(JSON.stringify(feature.getSnapshot()), /private runtime transport detail/);
  feature.dispose();
});

test("generation keeps a successful action result when its follow-up refresh fails", async () => {
  let hydrationCount = 0;
  const reports = [];
  const feature = createGenerationFeature(runtimeAdapters({
    hydrate: async (reason, scope) => {
      hydrationCount += 1;
      if (reason === "command-result") throw new Error("private refresh transport detail");
      return {
        runtimeId: "runner-1",
        sequence: 0,
        runtime: { batchId: scope.batchId, status: "idle", state: "idle" },
        batch: { id: scope.batchId, status: "idle" },
        capabilities: {},
      };
    },
    start: async () => ({ id: "batch-refresh-failure" }),
    pause: async () => null,
    resume: async () => null,
    stop: async () => null,
    continue: async () => null,
    retry: async () => null,
    reportDiagnostic: (code) => reports.push(code),
  }));
  feature.setScope({ workspaceRuntimeId: "workspace-refresh-failure", batchId: "batch-refresh-failure" });
  await feature.hydrate("initial");
  const result = await feature.start({ batchId: "batch-refresh-failure" });
  assert.deepEqual(result, { id: "batch-refresh-failure" });
  assert.equal(feature.getSnapshot().commands.start.error, null);
  assert.equal(feature.getSnapshot().hydration.error.code, "GENERATION_RUNTIME_HYDRATION_FAILED");
  assert.equal(hydrationCount, 2);
  assert.deepEqual(reports, ["GENERATION_RUNTIME_REFRESH_FAILED"]);
  assert.doesNotMatch(JSON.stringify(feature.getSnapshot()), /private refresh transport detail/);
  feature.dispose();
});

test("generation accepts only newer events from the hydrated runtime and displayed batch", async () => {
  let emitRuntime;
  const feature = createGenerationFeature(runtimeAdapters({
    hydrate: async () => ({
      runtimeId: "runner-1",
      sequence: 4,
      runtime: { batchId: "batch-1", status: "running", state: "running" },
      batch: { id: "batch-1", status: "running" },
      capabilities: {},
    }),
    subscribeRuntime(listener) {
      emitRuntime = listener;
      return () => {};
    },
    start: async () => null,
    pause: async () => null,
    resume: async () => null,
    stop: async () => null,
    continue: async () => null,
    retry: async () => null,
  }));
  feature.setScope({ workspaceRuntimeId: "workspace-1", batchId: "batch-1" });
  await feature.hydrate();

  emitRuntime({ runtimeId: "runner-2", sequence: 5, batchId: "batch-1", status: "failed", batch: { id: "batch-1", status: "failed" } });
  emitRuntime({ runtimeId: "runner-1", sequence: 4, batchId: "batch-1", status: "failed", batch: { id: "batch-1", status: "failed" } });
  emitRuntime({ runtimeId: "runner-1", sequence: 5, batchId: "batch-2", status: "failed", batch: { id: "batch-2", status: "failed" } });
  emitRuntime({ runtimeId: "runner-1", sequence: "5", batchId: "batch-1", status: "failed", batch: { id: "batch-1", status: "failed" } });
  assert.equal(feature.getSnapshot().sequence, 4);
  assert.equal(feature.getSnapshot().runtime.status, "running");

  emitRuntime({ runtimeId: "runner-1", sequence: 5, batchId: "batch-1", status: "completed", batch: { id: "batch-1", status: "completed" } });
  assert.equal(feature.getSnapshot().sequence, 5);
  assert.equal(feature.getSnapshot().runtime.status, "completed");

  feature.dispose();
  emitRuntime({ runtimeId: "runner-1", sequence: 6, batchId: "batch-1", status: "failed", batch: { id: "batch-1", status: "failed" } });
  assert.equal(feature.getSnapshot().sequence, 5);
  assert.equal(feature.getSnapshot().runtime.status, "completed");
});
