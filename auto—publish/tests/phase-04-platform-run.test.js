"use strict";

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { EventEmitter } = require("node:events");
const test = require("node:test");

const { createPlatformRun } = require("../desktop/services/platform-run");

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function child() {
  const value = new EventEmitter();
  value.killCalls = 0;
  value.kill = () => { value.killCalls += 1; value.emit("exit", 0); };
  value.send = () => {};
  return value;
}

test("PlatformRun rejects a replacement until a remote-started child has terminated and ignores old events", async () => {
  const firstDone = deferred();
  const first = child();
  const second = child();
  const snapshots = [];
  const run = createPlatformRun({
    watchdogMs: 1000,
    launch: ({ runId, onMessage }) => {
      const selected = runId === "run-a" ? first : second;
      selected.on("message", onMessage);
      return { child: selected, promise: runId === "run-a" ? firstDone.promise : Promise.resolve({ ok: true, data: { results: [] } }) };
    },
    onSnapshot: (snapshot) => snapshots.push(snapshot),
  });

  const pending = run.start({ runId: "run-a" });
  first.emit("message", { schemaVersion: 1, runId: "run-a", type: "state", payload: { phase: "remote-started" } });
  assert.equal(run.stop("run-a").alreadyRequested, false);
  assert.throws(() => run.start({ runId: "run-b" }), { code: "PLATFORM_RUN_ACTIVE" });

  firstDone.resolve({ ok: true, data: { results: [] } });
  first.emit("exit", 0);
  await pending;
  const secondPending = run.start({ runId: "run-b" });
  second.emit("exit", 0);
  await secondPending;
  const before = snapshots.length;
  first.emit("message", { schemaVersion: 1, runId: "run-a", type: "state", payload: { phase: "remote-finished" } });
  assert.equal(snapshots.length, before);
});

test("PlatformRun runs cleanup exactly once across stop and terminal completion", async () => {
  const done = deferred();
  const value = child();
  let cleanupCalls = 0;
  const run = createPlatformRun({
    watchdogMs: 1000,
    launch: () => ({ child: value, promise: done.promise }),
  });
  const pending = run.start({ runId: "cleanup" , cleanup: () => { cleanupCalls += 1; } });
  run.stop("cleanup");
  done.resolve({ ok: true, data: { results: [] } });
  await pending;
  assert.equal(cleanupCalls, 1);
});

test("PlatformRun gives its launch an immutable identity and abort signal", async () => {
  const value = child();
  let launch;
  const run = createPlatformRun({
    watchdogMs: 1000,
    launch: (input) => {
      launch = input;
      return { child: value, promise: Promise.resolve({ ok: true, data: { results: [] } }) };
    },
  });
  const pending = run.start({ runId: "identity", publisher: "fixture", accountProfileId: "account-1", target: "toutiao" });
  assert.deepEqual(launch.command, { publisher: "fixture", accountProfileId: "account-1", target: "toutiao", tasks: [] });
  assert.equal(Object.isFrozen(launch.command), true);
  assert.equal(launch.signal.aborted, false);
  run.stop("identity");
  assert.equal(launch.signal.aborted, true);
  await pending;
});

test("PlatformRun keeps the watchdog gate closed until its child exits", async () => {
  let watchdog;
  const stuck = new EventEmitter();
  stuck.kill = () => {};
  stuck.send = () => {};
  const replacement = child();
  const run = createPlatformRun({
    watchdogMs: 1,
    setTimeout: (callback) => { watchdog = callback; return 1; },
    clearTimeout: () => {},
    launch: ({ runId }) => ({
      child: runId === "watchdog-a" ? stuck : replacement,
      promise: Promise.resolve({ ok: true, data: { results: [] } }),
    }),
  });

  const pending = run.start({ runId: "watchdog-a" });
  watchdog();
  assert.equal((await pending).errorCode, "PLATFORM_WORKER_WATCHDOG_TIMEOUT");
  assert.throws(() => run.start({ runId: "watchdog-b" }), { code: "PLATFORM_RUN_ACTIVE" });
  stuck.emit("exit", 1);
  const next = run.start({ runId: "watchdog-b" });
  replacement.emit("exit", 0);
  await next;
});

test("PlatformRun terminates a short real local child without releasing the gate early", async () => {
  let childProcess;
  const run = createPlatformRun({
    watchdogMs: 5000,
    launch: () => {
      childProcess = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore", windowsHide: true });
      return {
        child: childProcess,
        promise: new Promise((resolve) => childProcess.once("exit", () => resolve({ ok: false, errorCode: "STOP_REQUESTED" }))),
      };
    },
  });
  const pending = run.start({ runId: "real-child" });
  assert.equal(run.stop("real-child").alreadyRequested, false);
  assert.throws(() => run.start({ runId: "replacement" }), { code: "PLATFORM_RUN_ACTIVE" });
  assert.equal((await pending).errorCode, "STOP_REQUESTED");
  assert.equal(childProcess.exitCode !== null || childProcess.signalCode !== null, true);
});

test("PlatformRun survives 100 stop-start interleavings without accepting an old run", async () => {
  let sequence = 0;
  const run = createPlatformRun({
    watchdogMs: 1000,
    launch: ({ runId, onMessage }) => {
      const value = child();
      value.on("message", onMessage);
      return { child: value, promise: Promise.resolve({ ok: true, data: { results: [] } }) };
    },
  });
  for (let index = 0; index < 100; index += 1) {
    const runId = "loop-" + sequence++;
    const pending = run.start({ runId });
    assert.equal(run.stop(runId).alreadyRequested, false);
    const active = run.snapshot();
    assert.equal(active.runId, runId);
    // The fake child must model a real process exit before the next start.
    // It is obtained through a short-lived launch closure in this contract.
    const context = run.snapshot();
    assert.equal(context.phase, "stopping");
    // stop kills non-remote fake children; its kill emits exit.
    await pending;
  }
});
