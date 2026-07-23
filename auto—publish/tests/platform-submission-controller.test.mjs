import assert from "node:assert/strict";
import { it } from "node:test";
import { createPlatformSubmissionController } from "../media-workbench/src/controllers/platform-submission-controller.js";

it("platform controller publishes a single snapshot for selection pruning", () => {
  const controller = createPlatformSubmissionController({}, async () => {});
  const snapshots = [];
  const unsubscribe = controller.subscribe(() => snapshots.push(controller.getState()));

  controller.toggleArticle("a");
  controller.togglePlatform("hepan");
  controller.pruneArticles(new Set());

  assert.deepEqual([...controller.getState().selectedArticles], []);
  assert.deepEqual([...controller.getState().selectedPlatformIds], ["hepan"]);
  assert.equal(snapshots.length, 3);
  unsubscribe();
});

it("platform controller ignores duplicate submit, pause, and stop mutations", async () => {
  let resolveSubmit;
  let resolvePause;
  let resolveStop;
  const calls = { submit: 0, pause: 0, stop: 0 };
  const controller = createPlatformSubmissionController({
    submit() { calls.submit += 1; return new Promise((resolve) => { resolveSubmit = resolve; }); },
    pause() { calls.pause += 1; return new Promise((resolve) => { resolvePause = resolve; }); },
    stop() { calls.stop += 1; return new Promise((resolve) => { resolveStop = resolve; }); },
  }, async () => {});

  const submit = controller.submit({ id: 1 });
  assert.deepEqual(await controller.submit({ id: 2 }), { ignored: true });
  const pause = controller.pause("run-1");
  assert.deepEqual(await controller.pause("run-1"), { ignored: true });
  const stop = controller.stop("run-1");
  assert.deepEqual(await controller.stop("run-1"), { ignored: true });
  assert.deepEqual(calls, { submit: 1, pause: 1, stop: 1 });

  resolveSubmit({ ok: 1 }); resolvePause(); resolveStop();
  await Promise.all([submit, pause, stop]);
  assert.equal(controller.getState().pausing, false);
  assert.equal(controller.getState().stopping, false);
});

it("a stale command response cannot overwrite a newer command state", async () => {
  let resolveSubmit;
  let resolveStop;
  const controller = createPlatformSubmissionController({
    submit() { return new Promise((resolve) => { resolveSubmit = resolve; }); },
    stop() { return new Promise((resolve) => { resolveStop = resolve; }); },
  }, async () => {});

  const submit = controller.submit({ id: 1 });
  const stop = controller.stop("run-1");
  resolveStop({ stopped: true }); await stop;
  resolveSubmit({ ok: 1 }); await submit;

  assert.equal(controller.getState().result, null);
  assert.equal(controller.getState().stopping, false);
});

it("platform controller refreshes each terminal revision once", async () => {
  const reasons = [];
  const controller = createPlatformSubmissionController({}, async (reason) => reasons.push(reason));
  assert.equal(await controller.refreshTerminal(3), true);
  assert.equal(await controller.refreshTerminal(3), false);
  assert.equal(await controller.refreshTerminal(4), true);
  assert.deepEqual(reasons, ["submit-terminal", "submit-terminal"]);
});

it("residue inspection, confirmation, cleanup, and refresh share one lifecycle", async () => {
  const calls = [];
  const controller = createPlatformSubmissionController({
    previewResidue: async () => ({ cleanableCount: 2, reportedCount: 3 }),
    cleanupResidue: async () => ({ cleanedCount: 2, failedCount: 0 }),
  }, async (reason) => calls.push(reason));

  const report = await controller.inspectResidue();
  assert.equal(report.cleanableCount, 2);
  assert.equal(controller.getState().residue.phase, "awaiting-confirmation");
  const result = await controller.cleanupResidue({ confirmed: true });
  assert.equal(result.cleanedCount, 2);
  assert.equal(controller.getState().residue.feedback.kind, "status");
  assert.deepEqual(calls, ["residue-cleanup"]);
});

it("dispose prevents late responses from changing the snapshot", async () => {
  let resolveSubmit;
  const controller = createPlatformSubmissionController({
    submit() { return new Promise((resolve) => { resolveSubmit = resolve; }); },
  }, async () => {});
  const pending = controller.submit({ id: 1 });
  controller.dispose();
  resolveSubmit({ ok: 1 }); await pending;
  assert.equal(controller.getState().result, null);
  assert.equal(controller.getState().submitting, true);
});
