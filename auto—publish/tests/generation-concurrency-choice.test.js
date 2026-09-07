const assert = require("node:assert/strict");
const { it } = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createGenerationBatchStore } = require("../src/content/generation-batch-store");
const { createGenerationBatchRunner } = require("../src/content/generation-batch-runner");

for (const concurrency of [1, 2, 3, 4]) {
  it(`persisted generation concurrency ${concurrency} bounds workers and survives pause/resume`, async (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "generation-concurrency-"));
    const store = createGenerationBatchStore({ workspaceRoot: root });
    const batch = store.createBatch({
      clientSources: [{ clientId: "synthetic-client", materialIds: ["brand"], researchQueryIds: ["question"] }],
      templates: Array.from({ length: 8 }, (_, i) => ({ platform: "hepan", templateId: `template-${i}` })),
      aiConfigFingerprint: "synthetic-config", concurrency,
    });
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    let ready;
    const occupied = new Promise((resolve) => { ready = resolve; });
    let active = 0; let peak = 0;
    const calls = [];
    const runner = createGenerationBatchRunner({ batchStore: store, concurrency,
      contentStore: { findByGenerationTaskId: () => null },
      executeTask: async (task) => {
        calls.push(task.id); active += 1; peak = Math.max(peak, active);
        if (active === concurrency) ready();
        await gate;
        active -= 1;
        return { id: `article-${task.id}` };
      }
    });
    t.after(async () => { release(); await runner.dispose(); fs.rmSync(root, { recursive: true, force: true }); });
    const run = runner.run(batch.id);
    await occupied;
    assert.equal(store.getBatch(batch.id).concurrency, concurrency);
    assert.equal(store.getBatch(batch.id).tasks.filter((task) => task.status === "running").length, concurrency);
    const pausing = runner.pause();
    release();
    await pausing;
    await run;
    assert.equal(calls.length, concurrency, "pause must stop further claims");
    assert.equal(store.getBatch(batch.id).counts.succeeded, concurrency);
    const complete = await runner.run(batch.id, "unfinished");
    assert.equal(complete.status, "completed");
    assert.equal(complete.counts.succeeded, 8);
    assert.equal(new Set(calls).size, 8, "successful tasks are not generated twice");
    assert.equal(calls.length, 8);
    assert.equal(peak, concurrency);
  });
}
