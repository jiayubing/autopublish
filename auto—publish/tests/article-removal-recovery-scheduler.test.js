const { it } = require("node:test");
const assert = require("node:assert/strict");
const { createArticleRemovalRecoveryScheduler } = require("../src/content/article-removal-recovery-scheduler");
it("serializes recovery and prevents an in-flight recovery from continuing IO after dispose", async () => {
  let calls = 0; let io = 0; let release; const pending = new Promise((resolve) => { release = resolve; });
  const scheduler = createArticleRemovalRecoveryScheduler({ delayMs: 1, recover: async (lifecycle) => { calls += 1; await pending; if (!lifecycle.isDisposed()) io += 1; } });
  scheduler.start(); scheduler.start(); await Promise.resolve(); assert.equal(calls, 1);
  scheduler.dispose(); release(); await new Promise((resolve) => setTimeout(resolve, 10)); assert.equal(calls, 1); assert.equal(io, 0);
});

it("captures recovery rejection as a diagnostic", async () => {
  const diagnostics = [];
  const scheduler = createArticleRemovalRecoveryScheduler({ delayMs: 1, recover: async () => { throw new Error("boom"); }, onDiagnostic: (item) => diagnostics.push(item) });
  scheduler.start(); await new Promise((resolve) => setTimeout(resolve, 10)); scheduler.dispose();
  assert.deepEqual(diagnostics, [{
    code: "ARTICLE_REMOVAL_RECOVERY_FAILED",
    module: "article-removal-recovery",
    category: "storage",
    operationId: "article-removal-recovery",
    metadata: { outcome: "failed" },
  }]);
});
