import assert from "node:assert/strict";
import { it } from "node:test";
import { createPlatformFeature } from "../media-workbench/src/features/platform/platform-feature.js";

function createPlatformSubmissionController(bridge, refresh) {
  const loadQueue = bridge.loadQueue || (async () => ({ revision: 0, platforms: [], queue: [] }));
  const feature = createPlatformFeature({
    ...bridge,
    loadQueue: async (reason) => {
      if (refresh) refresh(reason);
      return loadQueue(reason);
    },
    getRunState: bridge.getRunState || (async () => ({ runId: null, phase: "idle", total: 0, processed: 0, succeeded: 0, failed: 0, skipped: 0, uncertain: 0, currentTask: null, startedAt: null, updatedAt: null, terminalResult: null, isBatchRunning: false, isStopPending: false, isPlatformRunning: false, waitRemainingMs: 0 })),
    onRunState: bridge.onRunState || (() => () => {}),
  });
  feature.setScope({ workspaceRuntimeId: "runtime-fixture" });
  return feature;
}

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
  assert.equal(controller.getState().commands.pause.busy, false);
  assert.equal(controller.getState().commands.stop.busy, false);
});

it("submit pause and stop finalize only their own command state", async () => {
  let resolveSubmit;
  let resolvePause;
  let resolveStop;
  const controller = createPlatformSubmissionController({
    submit() { return new Promise((resolve) => { resolveSubmit = resolve; }); },
    pause() { return new Promise((resolve) => { resolvePause = resolve; }); },
    stop() { return new Promise((resolve) => { resolveStop = resolve; }); },
  }, async () => {});

  const submit = controller.submit({ id: 1 });
  const pause = controller.pause("run-1");
  const stop = controller.stop("run-1");
  resolveStop({ stopped: true }); await stop;
  assert.equal(controller.getState().commands.stop.busy, false);
  assert.equal(controller.getState().commands.pause.busy, true);
  assert.equal(controller.getState().commands.submit.busy, true);
  resolvePause({ paused: true }); await pause;
  resolveSubmit({ ok: 1 }); await submit;

  assert.deepEqual(controller.getState().result, { ok: 1 });
  assert.equal(controller.getState().commands.submit.busy, false);
  assert.equal(controller.getState().commands.pause.busy, false);
  assert.equal(controller.getState().commands.stop.busy, false);
});

it("100 interleaved submit pause and stop rounds always converge independently", async () => {
  for (let round = 0; round < 100; round += 1) {
    const pending = {};
    const controller = createPlatformSubmissionController({
      submit: () => new Promise((resolve) => { pending.submit = resolve; }),
      pause: () => new Promise((resolve) => { pending.pause = resolve; }),
      stop: () => new Promise((resolve) => { pending.stop = resolve; }),
    }, async () => {});
    const operations = [
      controller.submit({ round }),
      controller.pause(`run-${round}`),
      controller.stop(`run-${round}`),
    ];
    const order = round % 2 ? ["stop", "submit", "pause"] : ["pause", "stop", "submit"];
    order.forEach((name) => pending[name]({ round, name }));
    await Promise.all(operations);
    assert.deepEqual(
      Object.fromEntries(["submit", "pause", "stop"].map((name) => [name, controller.getState().commands[name].busy])),
      { submit: false, pause: false, stop: false },
    );
    controller.dispose();
  }
});

it("platform controller refreshes each terminal revision once", async () => {
  const reasons = [];
  const controller = createPlatformSubmissionController({ loadQueue: async () => ({ revision: reasons.length + 1, platforms: [], queue: [] }) }, async (reason) => reasons.push(reason));
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
  assert.equal(controller.getState().commands.submit.busy, false);
});

it("platform feature queue identity lets invalidation supersede initial", async () => {
  const pending = [];
  const controller = createPlatformSubmissionController({
    loadQueue: () => new Promise((resolve) => pending.push(resolve)),
  }, () => {});
  const initial = controller.refreshQueue("initial");
  const invalidation = controller.refreshQueue("invalidation");
  assert.equal(pending.length, 2);
  pending[1]({ revision: 8, platforms: [], queue: [{ filename: "new.docx", title: "new", platformId: "hepan", sourcePlatformId: "hepan" }] });
  await invalidation;
  pending[0]({ revision: 3, platforms: [], queue: [{ filename: "old.docx", title: "old", platformId: "hepan", sourcePlatformId: "hepan" }] });
  await initial;
  assert.equal(controller.getSnapshot().queue.queue[0].filename, "new.docx");
  assert.equal(controller.getSnapshot().queue.loading, false);
});

it("platform feature owns initial run, stale event rejection, and subscription disposal", async () => {
  let resolveInitial;
  let emit;
  let disposed = 0;
  const controller = createPlatformSubmissionController({
    getRunState: () => new Promise((resolve) => { resolveInitial = resolve; }),
    onRunState: (listener) => { emit = listener; return () => { disposed += 1; }; },
  }, () => {});
  const start = controller.start();
  emit({ runId: "run-new", phase: "running", total: 2, processed: 1, succeeded: 1, failed: 0, skipped: 0, uncertain: 0, currentTask: null, startedAt: "2026-07-26T01:00:00.000Z", updatedAt: "2026-07-26T01:00:02.000Z", terminalResult: null, isPlatformRunning: true });
  resolveInitial({ runId: "run-old", phase: "running", total: 2, processed: 0, succeeded: 0, failed: 0, skipped: 0, uncertain: 0, currentTask: null, startedAt: "2026-07-26T01:00:00.000Z", updatedAt: "2026-07-26T01:00:01.000Z", terminalResult: null, isPlatformRunning: true });
  await start;
  assert.equal(controller.getSnapshot().run.runId, "run-new");
  controller.dispose();
  assert.equal(disposed, 1);
  emit({ runId: "run-late", phase: "completed", updatedAt: "2026-07-26T01:00:03.000Z" });
  assert.equal(controller.getSnapshot().run.runId, "run-new");
});

it("a late event from an older run cannot replace the current terminal run", () => {
  const controller = createPlatformSubmissionController({}, () => {});
  assert.equal(controller.applyRunSnapshot({ runId: "run-current", phase: "completed", updatedAt: "2026-07-26T01:00:03.000Z" }), true);
  assert.equal(controller.applyRunSnapshot({ runId: "run-old", phase: "running", isPlatformRunning: true, updatedAt: "2026-07-26T01:00:02.000Z" }), false);
  assert.equal(controller.getSnapshot().run.runId, "run-current");
  assert.equal(controller.getSnapshot().run.phase, "completed");
});

it("open-login and check-login have independent owners and project login state", async () => {
  let resolveOpen;
  let resolveCheck;
  const controller = createPlatformSubmissionController({
    openLogin: () => new Promise((resolve) => { resolveOpen = resolve; }),
    checkLogin: () => new Promise((resolve) => { resolveCheck = resolve; }),
  }, () => {});
  const opening = controller.openLogin("hepan");
  assert.deepEqual(await controller.openLogin("toutiao"), { ignored: true });
  const checking = controller.checkLogin("hepan");
  assert.equal(controller.getSnapshot().commands.openLogin.busy, true);
  assert.equal(controller.getSnapshot().commands.checkLogin.busy, true);
  resolveCheck(true);
  await checking;
  assert.equal(controller.getSnapshot().commands.checkLogin.busy, false);
  assert.equal(controller.getSnapshot().commands.openLogin.busy, true);
  assert.equal(controller.getSnapshot().loginByPlatformId.hepan.authenticated, true);
  resolveOpen();
  await opening;
  assert.equal(controller.getSnapshot().commands.openLogin.busy, false);
  assert.equal(controller.getSnapshot().loginByPlatformId.toutiao, undefined);
});

it("platform feature owns account profile query and confirmation independently", async () => {
  let finishConfirm;
  const controller = createPlatformSubmissionController({
    listAccountProfiles: async () => [{ accountProfileId: "profile-1", platformId: "toutiao", displayName: "主账号" }],
    confirmAccountProfile: () => new Promise((resolve) => { finishConfirm = resolve; }),
  }, () => {});
  await controller.refreshAccountProfiles("initial");
  assert.equal(controller.getSnapshot().accountProfiles.items.length, 1);
  const pending = controller.confirmAccountProfile({ platformId: "toutiao", displayName: "新账号" });
  assert.equal(controller.getSnapshot().commands.confirmAccountProfile.busy, true);
  assert.equal(controller.getSnapshot().accountProfiles.query.loading, false);
  finishConfirm({ accountProfileId: "profile-2", platformId: "toutiao", displayName: "新账号" });
  await pending;
  assert.deepEqual(controller.getSnapshot().accountProfiles.items.map((item) => item.accountProfileId), ["profile-1", "profile-2"]);
  assert.equal(controller.getSnapshot().commands.confirmAccountProfile.busy, false);
});

it("account profile confirmation failure settles busy and exposes a safe command error", async () => {
  const controller = createPlatformSubmissionController({
    confirmAccountProfile: async () => {
      const failure = new Error("账号确认失败");
      failure.code = "ACCOUNT_PROFILE_CONFIRM_FAILED";
      throw failure;
    },
  }, () => {});
  const pending = controller.confirmAccountProfile({ platformId: "toutiao", displayName: "失败账号" });
  assert.equal(controller.getSnapshot().commands.confirmAccountProfile.busy, true);
  await assert.rejects(pending, /账号确认失败/);
  assert.equal(controller.getSnapshot().commands.confirmAccountProfile.busy, false);
  assert.deepEqual(controller.getSnapshot().commands.confirmAccountProfile.error, {
    code: "ACCOUNT_PROFILE_CONFIRM_FAILED",
    userMessage: "账号确认失败",
  });
});
