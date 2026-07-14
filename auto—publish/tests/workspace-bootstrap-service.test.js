const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createWorkspaceBootstrapService } = require("../desktop/workspace-bootstrap-service");
const { createWorkspaceValidator } = require("../desktop/workspace-validator");
const { createWorkspaceLocationStore } = require("../desktop/workspace-location-store");
const { createWorkspacePaths, ensureWorkspaceDirectories } = require("../desktop/workspace-paths");

function tempDirectory(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeMarker(directory, createdAt) {
  fs.writeFileSync(
    path.join(directory, ".autopublish-workspace.json"),
    JSON.stringify({ version: 1, createdAt: createdAt || "2026-07-14T00:00:00.000Z" }),
    "utf8"
  );
}

function createHarness(options) {
  const root = tempDirectory("autopublish-bootstrap-");
  const userDataPath = path.join(root, "user-data");
  const appPath = path.join(root, "app");
  const resourcesPath = path.join(appPath, "resources");
  fs.mkdirSync(resourcesPath, { recursive: true });
  fs.mkdirSync(userDataPath, { recursive: true });
  let currentTime = new Date("2026-07-14T12:00:00.000Z");
  let tokenNumber = 0;
  const events = { saves: [], relaunches: [], opens: [], taskReads: 0, queueReads: 0 };
  const validator = createWorkspaceValidator({
    appPath,
    resourcesPath,
    userDataPath,
    systemPaths: [path.join(root, "system")]
  });
  const locationStore = createWorkspaceLocationStore({ userDataPath });
  let taskState = { isBatchRunning: false, isStopPending: false, isPlatformRunning: false };
  let queueState = { state: "idle" };
  const service = createWorkspaceBootstrapService(Object.assign({
    env: {},
    locationStore,
    validator,
    fs,
    clock: function() { return currentTime; },
    tokenGenerator: function() { tokenNumber += 1; return "selection-token-" + tokenNumber; },
    createWorkspacePaths,
    ensureWorkspaceDirectories,
    taskService: {
      getState: function() { events.taskReads += 1; return taskState; }
    },
    doubaoCollectionService: {
      getQueueState: function() { events.queueReads += 1; return queueState; }
    },
    relaunch: function() { events.relaunches.push(true); },
    openPath: function(value) { events.opens.push(value); }
  }, options || {}));
  return {
    root,
    userDataPath,
    locationStore,
    validator,
    service,
    events,
    setTaskState: function(value) { taskState = value; },
    setQueueState: function(value) { queueState = value; },
    setTime: function(value) { currentTime = new Date(value); },
    cleanup: function() { fs.rmSync(root, { recursive: true, force: true }); }
  };
}

function assertError(errorPromise, code) {
  return assert.rejects(errorPromise, function(error) {
    assert.equal(error.code, code);
    assert.equal(Object.prototype.hasOwnProperty.call(error, "stack"), false);
    return true;
  });
}

function assertSyncError(fn, code) {
  assert.throws(fn, function(error) {
    assert.equal(error.code, code);
    assert.equal(Object.prototype.hasOwnProperty.call(error, "stack"), false);
    return true;
  });
}

function deferred() {
  let resolve;
  const promise = new Promise(function(done) { resolve = done; });
  return { promise, resolve };
}

describe("workspace bootstrap service", function() {
  it("prefers a valid environment workspace and marks it as an override", function() {
    const harness = createHarness();
    const saved = path.join(harness.root, "saved");
    const fromEnv = path.join(harness.root, "from-env");
    fs.mkdirSync(saved);
    fs.mkdirSync(fromEnv);
    harness.locationStore.write(saved);
    harness.service = createWorkspaceBootstrapService({
      env: { AUTO_PUBLISH_WORKSPACE: fromEnv },
      locationStore: harness.locationStore,
      validator: harness.validator,
      fs,
      clock: function() { return new Date("2026-07-14T12:00:00.000Z"); },
      createWorkspacePaths,
      ensureWorkspaceDirectories,
      taskService: { getState: function() { return {}; } },
      doubaoCollectionService: { getQueueState: function() { return {}; } }
    });
    try {
      const state = harness.service.bootstrap();
      assert.equal(state.state, "ready");
      assert.equal(state.workspacePath, fs.realpathSync(fromEnv));
      assert.equal(state.envOverride, true);
      assert.equal(Object.prototype.hasOwnProperty.call(state, "stack"), false);
      assert.equal(Object.prototype.hasOwnProperty.call(state, "fileList"), false);
    } finally { harness.cleanup(); }
  });

  it("uses saved configuration only when the environment is absent", function() {
    const harness = createHarness();
    const saved = path.join(harness.root, "saved");
    fs.mkdirSync(saved);
    harness.locationStore.write(saved);
    try {
      const state = harness.service.bootstrap();
      assert.equal(state.state, "ready");
      assert.equal(state.workspacePath, fs.realpathSync(saved));
      assert.equal(state.envOverride, false);
    } finally { harness.cleanup(); }
  });

  it("requires selection without a fallback directory or when saved configuration is damaged", function() {
    for (const setup of ["missing", "corrupt", "unknown-version"]) {
      const harness = createHarness();
      try {
        if (setup === "corrupt") fs.writeFileSync(path.join(harness.userDataPath, "workspace-location.json"), "{bad", "utf8");
        if (setup === "unknown-version") fs.writeFileSync(path.join(harness.userDataPath, "workspace-location.json"), JSON.stringify({ version: 2, workspacePath: "C:\\workspace" }), "utf8");
        const state = harness.service.bootstrap();
        assert.equal(state.state, "selection_required", setup);
        assert.equal(state.workspacePath, null, setup);
        assert.equal(state.envOverride, false, setup);
        assert.equal(state.error.code, "WORKSPACE_SELECTION_REQUIRED", setup);
        assert.equal(fs.existsSync(path.join(harness.userDataPath, "workspace-location.json")), setup !== "missing", setup);
        assert.notEqual(state.workspacePath, path.join(process.cwd(), "Documents", "AutoPublish"));
      } finally { harness.cleanup(); }
    }
  });

  it("uses invalid state for a saved path rejected by the validator", function() {
    const harness = createHarness();
    const missing = path.join(harness.root, "missing-saved");
    fs.writeFileSync(
      path.join(harness.userDataPath, "workspace-location.json"),
      JSON.stringify({ version: 1, workspacePath: missing }),
      "utf8"
    );
    try {
      const state = harness.service.bootstrap();
      assert.equal(state.state, "invalid");
      assert.equal(state.error.code, "WORKSPACE_PATH_INVALID");
      assert.equal(state.workspacePath, null);
      assert.equal(fs.existsSync(path.join(harness.userDataPath, "workspace-location.json")), true);
    } finally { harness.cleanup(); }
  });

  it("does not fall back when the environment override itself is invalid", function() {
    const harness = createHarness();
    const saved = path.join(harness.root, "saved");
    fs.mkdirSync(saved);
    harness.locationStore.write(saved);
    harness.service = createWorkspaceBootstrapService({
      env: { AUTO_PUBLISH_WORKSPACE: path.join(harness.root, "missing-env") },
      locationStore: harness.locationStore,
      validator: harness.validator,
      fs,
      createWorkspacePaths,
      ensureWorkspaceDirectories
    });
    try {
      const state = harness.service.bootstrap();
      assert.equal(state.state, "invalid");
      assert.equal(state.error.code, "WORKSPACE_PATH_INVALID");
      assert.equal(state.workspacePath, null);
      assert.equal(state.envOverride, false);
    } finally { harness.cleanup(); }
  });

  it("returns cancellation without creating, saving, or relaunching", async function() {
    const harness = createHarness();
    try {
      harness.service.bootstrap();
      assertSyncError(function() { harness.service.cancelSelection(); }, "WORKSPACE_SELECTION_CANCELLED");
      assert.deepEqual(harness.events.relaunches, []);
      assert.deepEqual(fs.readdirSync(harness.userDataPath), []);
    } finally { harness.cleanup(); }
  });

  it("classifies empty, existing, and nonempty directories into pending selections", function() {
    const harness = createHarness();
    const empty = path.join(harness.root, "empty");
    const existing = path.join(harness.root, "existing");
    const nonempty = path.join(harness.root, "nonempty");
    fs.mkdirSync(empty);
    fs.mkdirSync(existing);
    fs.mkdirSync(nonempty);
    writeMarker(existing);
    fs.writeFileSync(path.join(nonempty, "keep.txt"), "keep", "utf8");
    try {
      for (const item of [[empty, "empty_directory"], [existing, "existing_workspace"], [nonempty, "nonempty_directory"]]) {
        const result = harness.service.chooseDirectory(item[0]);
        assert.equal(result.state, "confirmation_required");
        assert.equal(result.selection.kind, item[1]);
        assert.equal(result.selection.path, fs.realpathSync(item[0]));
        assert.equal(typeof result.selection.token, "string");
      }
    } finally { harness.cleanup(); }
  });

  it("confirms an empty directory with only the marker and missing workspace directories", async function() {
    const harness = createHarness();
    const candidate = path.join(harness.root, "empty");
    fs.mkdirSync(candidate);
    try {
      const selected = harness.service.chooseDirectory(candidate);
      const result = await harness.service.confirmSelection({ token: selected.selection.token });
      assert.equal(result.state, "relaunching");
      assert.equal(result.workspacePath, fs.realpathSync(candidate));
      const marker = JSON.parse(fs.readFileSync(path.join(candidate, ".autopublish-workspace.json"), "utf8"));
      assert.deepEqual(marker, { version: 1, createdAt: "2026-07-14T12:00:00.000Z" });
      assert.equal(fs.existsSync(path.join(candidate, "input")), true);
      assert.equal(fs.existsSync(path.join(candidate, "clients")), true);
      assert.equal(harness.events.relaunches.length, 1);
    } finally { harness.cleanup(); }
  });

  it("confirms existing workspaces without changing their contents", async function() {
    const harness = createHarness();
    const candidate = path.join(harness.root, "existing");
    fs.mkdirSync(candidate);
    writeMarker(candidate);
    fs.writeFileSync(path.join(candidate, "keep.txt"), "original", "utf8");
    try {
      const before = fs.readFileSync(path.join(candidate, "keep.txt"), "utf8");
      const selected = harness.service.chooseDirectory(candidate);
      await harness.service.confirmSelection({ token: selected.selection.token });
      assert.equal(fs.readFileSync(path.join(candidate, "keep.txt"), "utf8"), before);
      assert.deepEqual(fs.readdirSync(candidate).sort(), [".autopublish-workspace.json", "keep.txt"]);
      assert.equal(harness.events.relaunches.length, 1);
    } finally { harness.cleanup(); }
  });

  it("confirms nonempty directories without changing unrelated files", async function() {
    const harness = createHarness();
    const candidate = path.join(harness.root, "nonempty");
    fs.mkdirSync(candidate);
    fs.writeFileSync(path.join(candidate, "keep.txt"), "keep", "utf8");
    try {
      const selected = harness.service.chooseDirectory(candidate);
      assert.equal(selected.selection.kind, "nonempty_directory");
      await harness.service.confirmSelection({ token: selected.selection.token });
      assert.equal(fs.readFileSync(path.join(candidate, "keep.txt"), "utf8"), "keep");
      assert.equal(fs.existsSync(path.join(candidate, ".autopublish-workspace.json")), true);
      assert.equal(fs.existsSync(path.join(candidate, "data")), true);
    } finally { harness.cleanup(); }
  });

  it("returns a stable initialization error without saving or relaunching", async function() {
    const harness = createHarness({
      ensureWorkspaceDirectories: function(paths) {
        fs.mkdirSync(paths.input, { recursive: true });
        const error = new Error("simulated directory initialization failure");
        error.code = "EACCES";
        throw error;
      }
    });
    const candidate = path.join(harness.root, "candidate");
    fs.mkdirSync(candidate);
    fs.mkdirSync(path.join(candidate, "data"));
    fs.writeFileSync(path.join(candidate, "keep.txt"), "keep", "utf8");
    try {
      const selected = harness.service.chooseDirectory(candidate);
      await assertError(harness.service.confirmSelection({ token: selected.selection.token }), "WORKSPACE_NOT_WRITABLE");
      assert.deepEqual(fs.readdirSync(candidate).sort(), ["data", "keep.txt"]);
      assert.deepEqual(harness.events.relaunches, []);
      assert.equal(fs.existsSync(path.join(candidate, ".autopublish-workspace.json")), false);
    } finally { harness.cleanup(); }
  });

  it("rolls back initialized directories and marker when location persistence fails", async function() {
    const writes = [];
    const harness = createHarness({
      locationStore: {
        read: function() { return { ok: true, value: null }; },
        write: function() { writes.push(true); return { ok: false, error: { code: "WORKSPACE_LOCATION_WRITE_FAILED" } }; }
      }
    });
    const candidate = path.join(harness.root, "candidate");
    fs.mkdirSync(candidate);
    fs.mkdirSync(path.join(candidate, "data"));
    fs.writeFileSync(path.join(candidate, "keep.txt"), "keep", "utf8");
    try {
      const selected = harness.service.chooseDirectory(candidate);
      await assertError(harness.service.confirmSelection({ token: selected.selection.token }), "WORKSPACE_LOCATION_WRITE_FAILED");
      assert.deepEqual(fs.readdirSync(candidate).sort(), ["data", "keep.txt"]);
      assert.equal(writes.length, 1);
      assert.deepEqual(harness.events.relaunches, []);
    } finally { harness.cleanup(); }
  });

  it("refuses to remove a marker replaced before rollback and reports cleanup failure", async function() {
    let candidate;
    const harness = createHarness({
      locationStore: {
        read: function() { return { ok: true, value: null }; },
        write: function() {
          const markerPath = path.join(candidate, ".autopublish-workspace.json");
          fs.unlinkSync(markerPath);
          fs.writeFileSync(markerPath, "external marker", "utf8");
          return { ok: false, error: { code: "WORKSPACE_LOCATION_WRITE_FAILED" } };
        }
      }
    });
    candidate = path.join(harness.root, "candidate");
    fs.mkdirSync(candidate);
    try {
      const selected = harness.service.chooseDirectory(candidate);
      await assertError(harness.service.confirmSelection({ token: selected.selection.token }), "WORKSPACE_CLEANUP_FAILED");
      assert.equal(fs.readFileSync(path.join(candidate, ".autopublish-workspace.json"), "utf8"), "external marker");
    } finally { harness.cleanup(); }
  });

  it("detects marker modification immediately after the write and preserves it", async function() {
    let candidate;
    const io = Object.create(fs);
    io.writeFileSync = function(target, content, options) {
      fs.writeFileSync(target, content, options);
      if (target === path.join(candidate, ".autopublish-workspace.json")) {
        fs.writeFileSync(target, "external after write", "utf8");
      }
    };
    const harness = createHarness({
      fs: io,
      locationStore: {
        read: function() { return { ok: true, value: null }; },
        write: function() { return { ok: false, error: { code: "WORKSPACE_LOCATION_WRITE_FAILED" } }; }
      }
    });
    candidate = path.join(harness.root, "candidate");
    fs.mkdirSync(candidate);
    try {
      const selected = harness.service.chooseDirectory(candidate);
      await assertError(harness.service.confirmSelection({ token: selected.selection.token }), "WORKSPACE_CLEANUP_FAILED");
      assert.equal(fs.readFileSync(path.join(candidate, ".autopublish-workspace.json"), "utf8"), "external after write");
    } finally { harness.cleanup(); }
  });

  it("refuses to remove a directory deleted and rebuilt before rollback", async function() {
    let candidate;
    const harness = createHarness({
      locationStore: {
        read: function() { return { ok: true, value: null }; },
        write: function() {
          const input = path.join(candidate, "input");
          fs.rmSync(input, { recursive: true, force: true });
          fs.mkdirSync(input);
          return { ok: false, error: { code: "WORKSPACE_LOCATION_WRITE_FAILED" } };
        }
      }
    });
    candidate = path.join(harness.root, "candidate");
    fs.mkdirSync(candidate);
    try {
      const selected = harness.service.chooseDirectory(candidate);
      await assertError(harness.service.confirmSelection({ token: selected.selection.token }), "WORKSPACE_CLEANUP_FAILED");
      assert.equal(fs.existsSync(path.join(candidate, "input")), true);
      assert.equal(fs.existsSync(path.join(candidate, ".autopublish-workspace.json")), false);
    } finally { harness.cleanup(); }
  });

  it("keeps the first directory identity when replacement races with marker failure", async function() {
    let candidate;
    const io = Object.create(fs);
    io.writeFileSync = function(target, content, options) {
      if (target === path.join(candidate, ".autopublish-workspace.json")) {
        const input = path.join(candidate, "input");
        fs.rmSync(input, { recursive: true, force: true });
        fs.mkdirSync(input);
        const error = new Error("marker write failed after directory replacement");
        error.code = "EIO";
        throw error;
      }
      return fs.writeFileSync(target, content, options);
    };
    const harness = createHarness({ fs: io });
    candidate = path.join(harness.root, "candidate");
    fs.mkdirSync(candidate);
    try {
      const selected = harness.service.chooseDirectory(candidate);
      await assertError(harness.service.confirmSelection({ token: selected.selection.token }), "WORKSPACE_CLEANUP_FAILED");
      assert.equal(fs.existsSync(path.join(candidate, "input")), true);
      assert.equal(fs.existsSync(path.join(candidate, ".autopublish-workspace.json")), false);
    } finally { harness.cleanup(); }
  });

  it("reports cleanup failure when a newly created directory cannot be removed", async function() {
    let candidate;
    const failingFs = Object.create(fs);
    failingFs.rmdirSync = function(target) {
      if (target === path.join(candidate, "input")) {
        const error = new Error("simulated cleanup failure");
        error.code = "EPERM";
        throw error;
      }
      return fs.rmdirSync(target);
    };
    const harness = createHarness({
      fs: failingFs,
      locationStore: {
        read: function() { return { ok: true, value: null }; },
        write: function() { return { ok: false, error: { code: "WORKSPACE_LOCATION_WRITE_FAILED" } }; }
      },
      ensureWorkspaceDirectories: function(paths) {
        Object.keys(paths).forEach(function(key) {
          if (key !== "root") fs.mkdirSync(paths[key], { recursive: true });
        });
      }
    });
    candidate = path.join(harness.root, "candidate");
    fs.mkdirSync(candidate);
    try {
      const selected = harness.service.chooseDirectory(candidate);
      await assertError(harness.service.confirmSelection({ token: selected.selection.token }), "WORKSPACE_CLEANUP_FAILED");
      assert.equal(fs.existsSync(path.join(candidate, "input")), true);
      assert.equal(fs.existsSync(path.join(candidate, ".autopublish-workspace.json")), false);
    } finally { harness.cleanup(); }
  });

  it("makes selection tokens single-use, expiring, and immune to renderer path substitution", async function() {
    const harness = createHarness({ selectionTtlMs: 1000 });
    const first = path.join(harness.root, "first");
    const second = path.join(harness.root, "second");
    fs.mkdirSync(first);
    fs.mkdirSync(second);
    try {
      const selected = harness.service.chooseDirectory(first);
      await assertError(harness.service.confirmSelection({ token: selected.selection.token, path: second }), "WORKSPACE_SELECTION_EXPIRED");
      const selectedAgain = harness.service.chooseDirectory(first);
      await assertError(harness.service.confirmSelection({ token: selected.selection.token }), "WORKSPACE_SELECTION_EXPIRED");
      assertSyncError(function() { harness.service.cancelSelection(); }, "WORKSPACE_SELECTION_CANCELLED");
      await assertError(harness.service.confirmSelection({ token: selectedAgain.selection.token }), "WORKSPACE_SELECTION_EXPIRED");
      const selectedExpired = harness.service.chooseDirectory(first);
      harness.setTime("2026-07-14T12:00:01.000Z");
      await assertError(harness.service.confirmSelection({ token: selectedExpired.selection.token }), "WORKSPACE_SELECTION_EXPIRED");
    } finally { harness.cleanup(); }
  });

  it("invalidates the previous token before attempting an invalid new selection", async function() {
    const harness = createHarness();
    const valid = path.join(harness.root, "valid");
    fs.mkdirSync(valid);
    try {
      const selected = harness.service.chooseDirectory(valid);
      assert.throws(function() { harness.service.chooseDirectory(path.join(harness.root, "missing")); }, function(error) {
        assert.equal(error.code, "WORKSPACE_PATH_INVALID");
        return true;
      });
      await assertError(harness.service.confirmSelection({ token: selected.selection.token }), "WORKSPACE_SELECTION_EXPIRED");
    } finally { harness.cleanup(); }
  });

  it("rechecks task and queue state at confirmation and blocks active work", async function() {
    const harness = createHarness();
    const candidate = path.join(harness.root, "candidate");
    fs.mkdirSync(candidate);
    try {
      const selected = harness.service.chooseDirectory(candidate);
      harness.setTaskState({ state: "stopping" });
      await assertError(harness.service.confirmSelection({ token: selected.selection.token }), "WORKSPACE_SWITCH_BUSY");
      assert.equal(harness.events.taskReads, 1);
      assert.equal(harness.events.queueReads, 1);
      assert.equal(fs.existsSync(path.join(candidate, ".autopublish-workspace.json")), false);

      const selectedAgain = harness.service.chooseDirectory(candidate);
      harness.setTaskState({});
      harness.setQueueState({ state: "paused" });
      await assertError(harness.service.confirmSelection({ token: selectedAgain.selection.token }), "WORKSPACE_SWITCH_BUSY");
      assert.equal(harness.events.queueReads, 2);
    } finally { harness.cleanup(); }
  });

  it("blocks request-switch under an environment override", async function() {
    const harness = createHarness();
    const current = path.join(harness.root, "current");
    const candidate = path.join(harness.root, "candidate");
    fs.mkdirSync(current);
    fs.mkdirSync(candidate);
    harness.service = createWorkspaceBootstrapService({
      env: { AUTO_PUBLISH_WORKSPACE: current },
      locationStore: harness.locationStore,
      validator: harness.validator,
      taskService: { getState: function() { return {}; } },
      doubaoCollectionService: { getQueueState: function() { return {}; } }
    });
    try {
      harness.service.bootstrap();
      await assertError(harness.service.requestSwitch(candidate), "WORKSPACE_ENV_OVERRIDE");
    } finally { harness.cleanup(); }
  });

  it("keeps a saved path after relaunch failure and does not retry in the same confirmation", async function() {
    const harness = createHarness({ relaunch: function() { harness.events.relaunches.push(true); throw new Error("relaunch failed"); } });
    const candidate = path.join(harness.root, "candidate");
    fs.mkdirSync(candidate);
    try {
      const selected = harness.service.chooseDirectory(candidate);
      await assertError(harness.service.confirmSelection({ token: selected.selection.token }), "WORKSPACE_RELAUNCH_FAILED");
      assert.deepEqual(harness.locationStore.read().value.workspacePath, fs.realpathSync(candidate));
      assert.equal(harness.events.relaunches.length, 1);
      await assertError(harness.service.confirmSelection({ token: selected.selection.token }), "WORKSPACE_SELECTION_EXPIRED");
    } finally { harness.cleanup(); }
  });

  it("allows a failed relaunch to be retried for the same path and then becomes idempotent", async function() {
    let attempts = 0;
    const harness = createHarness({
      relaunch: function() {
        attempts += 1;
        if (attempts === 1) throw new Error("first relaunch failed");
      }
    });
    const candidate = path.join(harness.root, "candidate");
    fs.mkdirSync(candidate);
    try {
      const first = harness.service.chooseDirectory(candidate);
      await assertError(harness.service.confirmSelection({ token: first.selection.token }), "WORKSPACE_RELAUNCH_FAILED");
      assert.equal(harness.service.getBootstrapState().state, "ready");
      assert.equal(harness.service.getBootstrapState().error.code, "WORKSPACE_RELAUNCH_FAILED");
      assert.equal(harness.service.bootstrap().state, "ready");

      const retry = harness.service.chooseDirectory(candidate);
      const retried = await harness.service.confirmSelection({ token: retry.selection.token });
      assert.equal(retried.state, "relaunching");
      assert.equal(attempts, 2);

      const afterSuccess = harness.service.chooseDirectory(candidate);
      const noOp = await harness.service.confirmSelection({ token: afterSuccess.selection.token });
      assert.equal(noOp.changed, false);
      assert.equal(attempts, 2);
    } finally { harness.cleanup(); }
  });

  it("serializes confirm, choose, and cancel while confirmation awaits relaunch", async function() {
    const gate = deferred();
    const harness = createHarness({
      relaunch: function() {
        harness.events.relaunches.push(true);
        return gate.promise;
      }
    });
    const firstPath = path.join(harness.root, "first");
    const secondPath = path.join(harness.root, "second");
    fs.mkdirSync(firstPath);
    fs.mkdirSync(secondPath);
    try {
      const selected = harness.service.chooseDirectory(firstPath);
      const firstConfirmation = harness.service.confirmSelection({ token: selected.selection.token });
      while (harness.events.relaunches.length === 0) await Promise.resolve();

      assertSyncError(function() { harness.service.chooseDirectory(secondPath); }, "WORKSPACE_SWITCH_BUSY");
      assertSyncError(function() { harness.service.cancelSelection(); }, "WORKSPACE_SWITCH_BUSY");
      await assertError(harness.service.confirmSelection({ token: selected.selection.token }), "WORKSPACE_SWITCH_BUSY");

      gate.resolve();
      const result = await firstConfirmation;
      assert.equal(result.state, "relaunching");
      assert.equal(harness.events.relaunches.length, 1);
    } finally { harness.cleanup(); }
  });

  it("rejects bootstrap while confirmation is waiting for relaunch", async function() {
    const gate = deferred();
    const harness = createHarness({
      relaunch: function() { return gate.promise; }
    });
    const candidate = path.join(harness.root, "candidate");
    fs.mkdirSync(candidate);
    try {
      const selected = harness.service.chooseDirectory(candidate);
      const confirmation = harness.service.confirmSelection({ token: selected.selection.token });
      while (harness.service.getBootstrapState().state !== "relaunching") await Promise.resolve();
      assertSyncError(function() { harness.service.bootstrap(); }, "WORKSPACE_SWITCH_BUSY");
      gate.resolve();
      await confirmation;
    } finally { harness.cleanup(); }
  });

  it("maps task and queue state exceptions to a stable unavailable error", async function() {
    const harness = createHarness({
      taskService: { getState: function() { throw new Error("private task state"); } },
      doubaoCollectionService: { getQueueState: function() { throw new Error("private queue state"); } }
    });
    const candidate = path.join(harness.root, "candidate");
    fs.mkdirSync(candidate);
    try {
      const selected = harness.service.chooseDirectory(candidate);
      await assertError(harness.service.confirmSelection({ token: selected.selection.token }), "WORKSPACE_SWITCH_STATE_UNAVAILABLE");
    } finally { harness.cleanup(); }
  });

  it("treats confirming the current path as a stable no-op", async function() {
    const harness = createHarness();
    const candidate = path.join(harness.root, "candidate");
    fs.mkdirSync(candidate);
    writeMarker(candidate);
    harness.locationStore.write(candidate);
    try {
      harness.service.bootstrap();
      const selected = harness.service.chooseDirectory(candidate);
      const result = await harness.service.confirmSelection({ token: selected.selection.token });
      assert.equal(result.changed, false);
      assert.equal(harness.events.relaunches.length, 0);
      assert.equal(harness.locationStore.read().value.workspacePath, candidate);
    } finally { harness.cleanup(); }
  });

  it("returns current validation and delegates open-current", function() {
    const harness = createHarness();
    const candidate = path.join(harness.root, "candidate");
    fs.mkdirSync(candidate);
    writeMarker(candidate);
    harness.locationStore.write(candidate);
    try {
      harness.service.bootstrap();
      const current = harness.service.getCurrent();
      assert.equal(current.workspacePath, fs.realpathSync(candidate));
      assert.equal(current.envOverride, false);
      assert.equal(current.validation.kind, "existing_workspace");
      harness.service.openCurrent();
      assert.deepEqual(harness.events.opens, [fs.realpathSync(candidate)]);
    } finally { harness.cleanup(); }
  });

  it("maps openPath failures to a stable error without exposing the original message", async function() {
    const harness = createHarness({
      openPath: function() { throw new Error("API key secret C:\\private\\workspace"); }
    });
    const candidate = path.join(harness.root, "candidate");
    fs.mkdirSync(candidate);
    writeMarker(candidate);
    harness.locationStore.write(candidate);
    try {
      harness.service.bootstrap();
      await assertError(harness.service.openCurrent(), "WORKSPACE_OPEN_FAILED");
    } finally { harness.cleanup(); }
  });
});
