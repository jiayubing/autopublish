const { it } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const childProcess = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const { createDesktopTaskService } = require("../desktop/services/desktop-task-service");

it("passes complete storage paths to platform-submit workers and keeps worker config portable", async function() {
  const paths = {
    contentLibrary: "C:\\portable-content",
    localState: "C:\\local-state",
    input: "C:\\portable-content\\.autopublish\\input",
    data: "C:\\portable-content\\.autopublish\\data",
    published: "C:\\portable-content\\.autopublish\\published",
    failed: "C:\\portable-content\\.autopublish\\failed",
    tmp: "C:\\local-state\\tmp",
    logs: "C:\\local-state\\logs",
    browser: "C:\\local-state\\browser",
    doubaoBrowser: "C:\\local-state\\browser\\doubao"
  };
  const calls = [];
  function fakeFork(script, args, forkOptions) {
    calls.push({ script, args, options: forkOptions });
    const child = new EventEmitter();
    child.send = function() {};
    process.nextTick(function() {
      child.emit("message", { schemaVersion: 1, runId: JSON.parse(args[1]).runId, type: "result", payload: { ok: true, data: {} } });
      child.emit("exit", 0);
    });
    return child;
  }

  const service = createDesktopTaskService({ cwd: paths.contentLibrary, paths: paths, fork: fakeFork });
  await service.startPlatformSubmit({ tasks: [] });

  const first = calls[0];
  assert.equal(first.args[0], "platform-submit");
  assert.equal(first.options.env.AUTO_PUBLISH_WORKSPACE, paths.contentLibrary);
  assert.equal(first.options.env.AUTO_PUBLISH_INPUT_DIR, paths.input);
  assert.equal(first.options.env.AUTO_PUBLISH_LOGS_DIR, paths.logs);
  assert.equal(first.options.env.AUTO_PUBLISH_PLAYWRIGHT_HOME, paths.browser);
  assert.equal(first.options.env.AUTO_PUBLISH_PLAYWRIGHT_PROFILE_DIR, paths.doubaoBrowser);
  assert.deepEqual(JSON.parse(first.args[1]).paths, paths);
});

it("derives worker directories from explicit environment paths", function() {
  const project = path.resolve(__dirname, "..");
  const result = childProcess.spawnSync(process.execPath, ["-e", [
    "const c=require('./scripts/config');",
    "process.stdout.write(JSON.stringify({input:c.DIRS.inputDir,logs:c.DIRS.logsDir,home:c.PW.home,profile:c.PW.profileDir}));"
  ].join("")], {
    cwd: project,
    env: Object.assign({}, process.env, {
      AUTO_PUBLISH_WORKSPACE: "C:\\portable-content",
      AUTO_PUBLISH_INPUT_DIR: "C:\\portable-content\\.autopublish\\input",
      AUTO_PUBLISH_LOGS_DIR: "C:\\local-state\\logs",
      AUTO_PUBLISH_PLAYWRIGHT_HOME: "C:\\local-state\\browser",
      AUTO_PUBLISH_PLAYWRIGHT_PROFILE_DIR: "C:\\local-state\\browser\\doubao"
    }),
    encoding: "utf8"
  });

  assert.equal(result.status, 0);
  assert.deepEqual(JSON.parse(result.stdout), {
    input: "C:\\portable-content\\.autopublish\\input",
    logs: "C:\\local-state\\logs",
    home: "C:\\local-state\\browser",
    profile: "C:\\local-state\\browser\\doubao"
  });
});

it("closes every loaded login session and isolates one cleanup failure", async function() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "autopublish-task-runtime-"));
  const node = path.join(root, "tools", "node.exe");
  const cli = path.join(root, "playwright-cli.js");
  fs.mkdirSync(path.dirname(node), { recursive: true });
  fs.writeFileSync(node, "node", "utf8");
  fs.writeFileSync(cli, "cli", "utf8");
  const paths = {
    installation: root,
    contentLibrary: path.join(root, "content"),
    localState: path.join(root, "local"),
    browser: path.join(root, "local", "browser"),
    playwrightNodeExecPath: node,
    playwrightCliJs: cli,
    browserChannel: "msedge"
  };
  const calls = [];
  let worker;
  function fakeFork() {
    worker = new EventEmitter();
    worker.send = function() {};
    worker.kill = function() { worker.emit("exit", 0); };
    return worker;
  }
  try {
    const service = createDesktopTaskService({
      cwd: paths.contentLibrary,
      paths,
      fork: fakeFork,
      loginSessionPorts: [
        { id: "lieju", port: { close: async () => { calls.push("lieju"); throw new Error("fixture"); } } },
        { id: "toutiao", port: { close: async () => { calls.push("toutiao"); } } },
      ],
    });
    const pending = service.startPlatformSubmit({ tasks: [{ id: "task-1" }] });
    await new Promise((resolve) => setImmediate(resolve));
    service.pausePlatformSubmit();
    await pending;
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(calls.sort(), ["lieju", "toutiao"]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

it("closes every loaded login session during workspace shutdown", async function () {
  const calls = [];
  const service = createDesktopTaskService({
    cwd: "C:\\portable-content",
    paths: { contentLibrary: "C:\\portable-content" },
    loginSessionPorts: [
      { id: "first", port: { close: async () => { calls.push("first"); } } },
      { id: "second", port: { close: async () => { calls.push("second"); } } },
    ],
  });
  await service.dispose();
  assert.deepEqual(calls, ["first", "second"]);
});

it("snapshots Hepan worker runtime once when a platform batch starts", async function() {
  const paths = { contentLibrary: "C:\\portable-content", tmp: "C:\\local-state\\tmp" };
  const calls = [];
  let cleaned = false;
  function fakeFork(script, args) {
    calls.push({ script, args });
    const child = new EventEmitter();
    child.send = function() {};
    child.kill = function() {};
    process.nextTick(function() {
      var runId = JSON.parse(args[1]).runId;
      child.emit("message", { schemaVersion: 1, runId: runId, type: "state", payload: { phase: "heartbeat" } });
      child.emit("message", { schemaVersion: 1, runId: runId, type: "result", payload: { ok: true, data: {} } });
      child.emit("exit", 0);
    });
    return child;
  }
  const service = createDesktopTaskService({
    cwd: paths.contentLibrary,
    paths,
    fork: fakeFork,
    platformSettingsService: {
      prepareWorkerRuntime: function() {
        return {
          runtimeContext: {
            hepanRuntime: { pythonPath: "C:\\python.exe", categoryId: 121, vendorDir: "", cookiePath: "C:\\cookie.tmp" },
          },
          timeoutMs: 120000,
          cleanup: function() { cleaned = true; },
        };
      }
    }
  });

  await service.startPlatformSubmit({ tasks: [{ sourcePlatformId: "source", filename: "article.txt", targetPlatformId: "hepan" }] });
  const payload = JSON.parse(calls[0].args[1]);
  assert.equal(Object.hasOwn(payload.platformRuntimeContext.hepanRuntime, "publishIntervalSeconds"), false);
  assert.equal(Object.hasOwn(payload.submitOptions, "intervalByTargetMs"), false);
  assert.equal(cleaned, true);
});

it("returns a distinct progress watchdog error instead of a fixed batch timeout", async function() {
  const child = new EventEmitter();
  child.send = function() {};
  let killed = false;
  child.kill = function() { killed = true; };
  const service = createDesktopTaskService({
    cwd: "C:\\portable-content",
    paths: { contentLibrary: "C:\\portable-content", tmp: "C:\\local-state\\tmp" },
    fork: function() { return child; },
    platformWatchdogMs: 1000
  });

  const result = await service.startPlatformSubmit({ tasks: [{ sourcePlatformId: "source", filename: "article.txt", targetPlatformId: "lieju" }] }, { platformWatchdogMs: 10 });
  assert.equal(result.errorCode, "PLATFORM_WORKER_WATCHDOG_TIMEOUT");
  assert.equal(killed, true);
});

it("keeps a safe run snapshot available while the renderer is absent", async function() {
  let worker;
  function fakeFork() {
    worker = new EventEmitter();
    worker.send = function() {};
    worker.kill = function() {};
    return worker;
  }
  const service = createDesktopTaskService({
    cwd: "C:\\portable-content",
    paths: { contentLibrary: "C:\\portable-content", localState: fs.mkdtempSync(path.join(os.tmpdir(), "platform-snapshot-state-")) },
    fork: fakeFork,
    invalidateData: function() { return 7; }
  });
  try {
    const pending = service.startPlatformSubmit({ tasks: [
      { sourcePlatformId: "hepan", filename: "one.md", targetPlatformId: "lieju" },
      { sourcePlatformId: "hepan", filename: "two.md", targetPlatformId: "lieju" }
    ] });
    await new Promise((resolve) => setImmediate(resolve));
    const started = service.getState();
    assert.equal(started.total, 2);
    assert.equal(typeof started.runId, "string");
    assert.equal(started.isPlatformRunning, true);
    worker.emit("message", { schemaVersion: 1, runId: started.runId, type: "state", payload: { phase: "remote-finished", task: { sourcePlatformId: "hepan", filename: "one.md", targetPlatformId: "lieju" }, status: "published" } });
    assert.equal(service.getState().processed, 1);
    worker.emit("message", { schemaVersion: 1, runId: started.runId, type: "result", payload: { ok: true, data: { ok: 2, fail: 0, skipped: 0, uncertain: 0, results: [{ task: { sourcePlatformId: "hepan", filename: "one.md", targetPlatformId: "lieju" }, status: "success", publicationStatus: "published" }, { task: { sourcePlatformId: "hepan", filename: "two.md", targetPlatformId: "lieju" }, status: "success", publicationStatus: "published" }] } } });
    worker.emit("exit", 0);
    await pending;
    const completed = service.getState();
    assert.equal(completed.phase, "completed");
    assert.equal(completed.processed, 2);
    assert.equal(completed.currentTask.filePath, undefined);
  } finally {
    service.dispose();
  }
});

it("redacts internal paths from a worker result without discarding the result", async function() {
  const child = new EventEmitter();
  child.send = function() {};
  child.kill = function() {};
  const service = createDesktopTaskService({
    cwd: "C:\\portable-content",
    paths: { contentLibrary: "C:\\portable-content", tmp: "C:\\local-state\\tmp" },
    fork: function() { return child; }
  });
  const pending = service.startPlatformSubmit({ tasks: [{ sourcePlatformId: "source", filename: "article.txt", targetPlatformId: "lieju" }] });
  await new Promise((resolve) => setImmediate(resolve));
  const runId = service.getState().runId;
  child.emit("message", {
    schemaVersion: 1,
    runId,
    type: "result",
    payload: { ok: true, data: { ok: 1, fail: 0, uncertain: 0, results: [{ task: { filename: "article.txt", filePath: "C:\\secret\\article.txt" }, status: "success", publicationStatus: "published" }] } }
  });
  child.emit("exit", 0);
  const result = await pending;
  assert.equal(result.ok, true);
  assert.equal(result.data.results[0].task.filePath, undefined);
  assert.equal(service.getState().phase, "completed");
  service.dispose();
});

it("accepts a result queued just after the worker exit notification", async function() {
  const child = new EventEmitter();
  child.send = function() {};
  child.kill = function() {};
  const service = createDesktopTaskService({
    cwd: "C:\\portable-content",
    paths: { contentLibrary: "C:\\portable-content", tmp: "C:\\local-state\\tmp" },
    fork: function() { return child; }
  });
  const pending = service.startPlatformSubmit({ tasks: [{ sourcePlatformId: "source", filename: "article.txt", targetPlatformId: "lieju" }] });
  await new Promise((resolve) => setImmediate(resolve));
  const runId = service.getState().runId;
  child.emit("exit", 0);
  child.emit("message", { schemaVersion: 1, runId, type: "result", payload: { ok: true, data: { ok: 1, fail: 0, uncertain: 0, results: [] } } });
  const result = await pending;
  assert.equal(result.ok, true);
  service.dispose();
});

it("rejects stale, oversized, and secret-bearing worker envelopes", async function() {
  let worker;
  const service = createDesktopTaskService({ cwd: "C:\\portable-content", paths: { contentLibrary: "C:\\portable-content", tmp: "C:\\tmp" }, fork: function() {
    worker = new EventEmitter(); worker.send = function() {}; worker.kill = function() {}; return worker;
  } });
  const pending = service.startPlatformSubmit({ tasks: [{ sourcePlatformId: "a", filename: "a.md", targetPlatformId: "lieju" }] });
  await new Promise((resolve) => setImmediate(resolve));
  const runId = service.getState().runId;
  worker.emit("message", { schemaVersion: 1, runId: "old", type: "state", payload: { phase: "remote-finished" } });
  worker.emit("message", { schemaVersion: 1, runId: "old", type: "result", payload: { ok: true, data: { results: [] } } });
  worker.emit("message", { schemaVersion: 1, runId, type: "state", payload: { phase: "heartbeat", apiKey: "fixture" } });
  worker.emit("message", { schemaVersion: 1, runId, type: "state", payload: { phase: "heartbeat", value: "x".repeat(40000) } });
  assert.equal(service.getState().processed, 0);
  assert.notEqual(service.getState().phase, "completed");
  worker.emit("message", { schemaVersion: 1, runId, type: "result", payload: { ok: true, data: { results: [] } } });
  worker.emit("exit", 0);
  await pending;
});
