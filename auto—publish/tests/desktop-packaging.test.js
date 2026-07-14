const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const childProcess = require("child_process");
const fs = require("fs");
const Module = require("module");
const os = require("os");
const path = require("path");
const vm = require("vm");

function read(file) {
  return fs.readFileSync(path.resolve(__dirname, "..", file), "utf8");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function loadMainWithQuitHarness(dispose, harnessOptions) {
  const options = harnessOptions || {};
  const mainPath = path.resolve(__dirname, "..", "desktop", "main.js");
  const listeners = new Map();
  const service = {
    subscribe: function() { return options.unsubscribeDoubaoQueue || function() {}; },
    dispose: dispose
  };
  let quitCalls = 0;
  const quitEvents = [];
  const app = {
    on: function(name, handler) { listeners.set(name, handler); },
    getPath: function() { return "C:\\Users\\test\\AppData\\Roaming\\AutoPublish"; },
    getAppPath: function() { return "C:\\Program Files\\AutoPublish"; },
    relaunch: function() {},
    whenReady: function() {
      return { then: function(callback) { callback(); } };
    },
    quit: function() {
      quitCalls += 1;
      const event = { prevented: false, preventDefault: function() { this.prevented = true; } };
      quitEvents.push(event);
      listeners.get("before-quit")(event);
      return event;
    }
  };
  function BrowserWindow() {
    this.webContents = {
      setWindowOpenHandler: function() {},
      on: function() {},
      session: { setPermissionRequestHandler: function() {} },
      send: function() {}
    };
  }
  BrowserWindow.getAllWindows = function() { return []; };
  BrowserWindow.prototype.setMenuBarVisibility = function() {};
  BrowserWindow.prototype.loadFile = function() {};
  BrowserWindow.prototype.on = function() {};

  const mocks = new Map([
    ["electron", {
      app: app,
      BrowserWindow: BrowserWindow,
      ipcMain: {},
      dialog: { showOpenDialog: function() {} },
      shell: { openPath: function() {} }
    }],
    ["./security/navigation", { isAllowedRendererNavigation: function() { return true; } }],
    ["./workspace-bootstrap-service", {
      createWorkspaceBootstrapService: function() {
        return { bootstrap: function() {
          return { state: "ready", workspacePath: "C:\\workspace" };
        } };
      }
    }],
    ["./ipc/workspace-bootstrap-ipc", { registerWorkspaceBootstrapIpc: function() {} }],
    ["./runtime-paths", {
      configureRuntimeEnvironment: function() {
        return { workspaceRoot: "workspace", appRoot: "app", paths: {} };
      }
    }],
    ["./services/desktop-task-service", { createDesktopTaskService: function() { return {}; } }],
    ["./services/doubao-collection-service", {
      createDoubaoCollectionDesktopService: function() { return service; }
    }],
    ["./ipc/register", { registerIpc: function() {} }],
    ["../src/core/logger", { subscribe: function() { return options.unsubscribeLogs || function() {}; } }]
  ]);
  const originalLoad = Module._load;
  Module._load = function(request, parent, isMain) {
    if (parent && parent.filename === mainPath && mocks.has(request)) return mocks.get(request);
    return originalLoad.apply(this, arguments);
  };
  delete require.cache[mainPath];
  try {
    require(mainPath);
  } finally {
    Module._load = originalLoad;
    delete require.cache[mainPath];
  }
  return {
    beforeQuit: listeners.get("before-quit"),
    app: app,
    quitCalls: function() { return quitCalls; },
    quitEvents: quitEvents
  };
}

function loadPreloadHarness() {
  const calls = [];
  const exposed = {};
  const ipcRenderer = {
    invoke: function(channel, input) {
      calls.push([channel, input]);
      return Promise.resolve({ ok: true });
    },
    on: function() {},
    removeListener: function() {}
  };
  vm.runInNewContext(read("desktop/preload.js"), {
    require: function(name) {
      if (name === "electron") {
        return {
          contextBridge: { exposeInMainWorld: function(name, api) { exposed[name] = api; } },
          ipcRenderer: ipcRenderer
        };
      }
      throw new Error("unexpected require: " + name);
    }
  }, { filename: path.resolve(__dirname, "..", "desktop", "preload.js") });
  return { calls: calls, api: exposed.desktopConsole };
}

function loadMainWithStartupHarness(bootstrapState, harnessOptions) {
  const options = harnessOptions || {};
  const mainPath = path.resolve(__dirname, "..", "desktop", "main.js");
  const listeners = new Map();
  const events = [];
  const handles = new Map();
  const requires = [];
  let readyPromise = null;
  const app = {
    on: function(name, handler) { listeners.set(name, handler); },
    whenReady: function() {
      return {
        then: function(callback) {
          readyPromise = Promise.resolve(callback());
          return readyPromise;
        }
      };
    },
    getPath: function(name) {
      events.push(["getPath", name]);
      return "C:\\Users\\test\\AppData\\Roaming\\AutoPublish";
    },
    getAppPath: function() {
      events.push(["getAppPath"]);
      return "C:\\Program Files\\AutoPublish";
    },
    relaunch: function() { events.push(["relaunch"]); },
    quit: function() { events.push(["quit"]); }
  };
  function BrowserWindow() {
    events.push(["window"]);
    this.webContents = {
      setWindowOpenHandler: function() {},
      on: function() {},
      session: { setPermissionRequestHandler: function() {} },
      send: function() {}
    };
  }
  BrowserWindow.getAllWindows = function() { return []; };
  BrowserWindow.prototype.setMenuBarVisibility = function() {};
  BrowserWindow.prototype.loadFile = function() {};
  BrowserWindow.prototype.on = function() {};

  const ipcMain = {
    handle: function(channel, handler) {
      handles.set(channel, handler);
      events.push(["handle", channel]);
    }
  };
  const service = {
    bootstrap: function() {
      events.push(["bootstrap"]);
      if (options.bootstrapError) throw options.bootstrapError;
      return bootstrapState;
    },
    getBootstrapState: function() { return bootstrapState; },
    chooseDirectory: function() {},
    confirmSelection: function() {},
    cancelSelection: function() {},
    requestSwitch: function() {},
    getCurrent: function() {},
    openCurrent: function() {}
  };
  const mocks = new Map([
    ["electron", {
      app: app,
      BrowserWindow: BrowserWindow,
      ipcMain: ipcMain,
      dialog: { showOpenDialog: function() {} },
      shell: { openPath: options.openPath || function() {} }
    }],
    ["./security/navigation", { isAllowedRendererNavigation: function() { return true; } }],
    ["./workspace-bootstrap-service", {
      createWorkspaceBootstrapService: function(options) {
        events.push(["create-bootstrap", options]);
        return service;
      }
    }],
    ["./ipc/workspace-bootstrap-ipc", {
      registerWorkspaceBootstrapIpc: function() { events.push(["workspace-ipc"]); }
    }],
    ["./runtime-paths", {
      configureRuntimeEnvironment: function(options) {
        events.push(["runtime", options]);
        if (harnessOptions && harnessOptions.runtimeError) throw harnessOptions.runtimeError;
        return { workspaceRoot: options.workspaceRoot, appRoot: options.appRoot, paths: {} };
      }
    }],
    ["./services/desktop-task-service", {
      createDesktopTaskService: function(options) { events.push(["task", options]); return {}; }
    }],
    ["./services/doubao-collection-service", {
      createDoubaoCollectionDesktopService: function(options) {
        events.push(["doubao", options]);
        return {
          subscribe: function() { return function() {}; },
          dispose: function() { events.push(["dispose"]); },
          getQueueState: function() { return { state: "idle" }; }
        };
      }
    }],
    ["./ipc/register", { registerIpc: function() { events.push(["business-ipc"]); } }],
    ["../src/core/logger", { subscribe: function() { events.push(["logger"]); return function() {}; } }]
  ]);
  const originalLoad = Module._load;
  Module._load = function(request, parent, isMain) {
    requires.push(request);
    if (mocks.has(request)) return mocks.get(request);
    return originalLoad.apply(this, arguments);
  };
  delete require.cache[mainPath];
  try {
    require(mainPath);
  } finally {
    Module._load = originalLoad;
    delete require.cache[mainPath];
  }
  return {
    app: app,
    events: events,
    handles: handles,
    requires: requires,
    ready: function() { return readyPromise; },
    listeners: listeners
  };
}

describe("source assembly and packaging contract", function() {
  it("does not create runtime or business services before workspace bootstrap is ready", async function() {
    const harness = loadMainWithStartupHarness({ state: "selection_required" });
    await harness.ready();

    assert.deepEqual(harness.events.map(function(event) { return event[0]; }), [
      "getPath",
      "getAppPath",
      "create-bootstrap",
      "workspace-ipc",
      "bootstrap",
      "window"
    ]);
    assert.equal(harness.events.some(function(event) { return event[0] === "runtime"; }), false);
    assert.equal(harness.events.some(function(event) { return event[0] === "task"; }), false);
    assert.equal(harness.events.some(function(event) { return event[0] === "doubao"; }), false);
    assert.equal(harness.events.some(function(event) { return event[0] === "business-ipc"; }), false);
    assert.equal(harness.events.some(function(event) { return event[0] === "logger"; }), false);
    for (const request of [
      "./runtime-paths",
      "./runtime-config",
      "./services/desktop-task-service",
      "./services/doubao-collection-service",
      "./ipc/register",
      "../src/core/logger"
    ]) assert.equal(harness.requires.includes(request), false, request + " must not be required");
  });

  it("keeps every non-ready bootstrap state free of runtime and business initialization", async function() {
    for (const state of ["checking", "selection_required", "invalid", "confirmation_required", "relaunching"]) {
      const harness = loadMainWithStartupHarness({ state: state });
      await harness.ready();
      assert.equal(harness.events.some(function(event) { return event[0] === "runtime"; }), false, state);
      assert.equal(harness.events.some(function(event) { return event[0] === "task"; }), false, state);
      assert.equal(harness.events.some(function(event) { return event[0] === "doubao"; }), false, state);
      assert.equal(harness.events.some(function(event) { return event[0] === "business-ipc"; }), false, state);
      assert.equal(harness.events.some(function(event) { return event[0] === "logger"; }), false, state);
    }
  });

  it("fails closed when workspace bootstrap throws and activate does not create a window", async function() {
    const harness = loadMainWithStartupHarness({ state: "selection_required" }, {
      bootstrapError: new Error("bootstrap leaked internal details")
    });
    await harness.ready();

    assert.equal(harness.events.some(function(event) { return event[0] === "window"; }), false);
    assert.equal(harness.events.filter(function(event) { return event[0] === "quit"; }).length, 1);
    harness.listeners.get("activate")();
    assert.equal(harness.events.some(function(event) { return event[0] === "window"; }), false);
  });

  it("fails closed when runtime initialization throws", async function() {
    const harness = loadMainWithStartupHarness({ state: "ready", workspacePath: "C:\\workspace" }, {
      runtimeError: new Error("runtime leaked internal details")
    });
    await harness.ready();

    assert.equal(harness.events.some(function(event) { return event[0] === "window"; }), false);
    assert.equal(harness.events.filter(function(event) { return event[0] === "quit"; }).length, 1);
    harness.listeners.get("activate")();
    assert.equal(harness.events.some(function(event) { return event[0] === "window"; }), false);
  });

  it("initializes ready runtime after bootstrap and injects protected runtime dependencies", async function() {
    const bootstrapWorkspacePath = "C:\\workspace-from-bootstrap";
    const harness = loadMainWithStartupHarness({ state: "ready", workspacePath: bootstrapWorkspacePath });
    await harness.ready();

    assert.deepEqual(harness.events.map(function(event) { return event[0]; }), [
      "getPath",
      "getAppPath",
      "create-bootstrap",
      "workspace-ipc",
      "bootstrap",
      "runtime",
      "task",
      "doubao",
      "business-ipc",
      "logger",
      "window"
    ]);
    const options = harness.events.filter(function(event) { return event[0] === "create-bootstrap"; })[0][1];
    assert.equal(options.userDataPath, "C:\\Users\\test\\AppData\\Roaming\\AutoPublish");
    assert.equal(options.validatorOptions.appPath, "C:\\Program Files\\AutoPublish");
    assert.equal(options.validatorOptions.resourcesPath, process.resourcesPath);
    assert.equal(options.validatorOptions.userDataPath, options.userDataPath);
    assert.equal(options.env, process.env);
    assert.equal(typeof options.taskService.getState, "function");
    assert.equal(typeof options.doubaoCollectionService.getQueueState, "function");
    assert.equal(typeof options.relaunch, "function");
    assert.equal(typeof options.disposeRuntime, "function");

    const runtimeEvent = harness.events.filter(function(event) { return event[0] === "runtime"; })[0];
    assert.deepEqual(runtimeEvent[1], {
      workspaceRoot: bootstrapWorkspacePath,
      appRoot: "C:\\Program Files\\AutoPublish"
    });
    const taskEvent = harness.events.filter(function(event) { return event[0] === "task"; })[0];
    assert.equal(taskEvent[1].cwd, bootstrapWorkspacePath);
    const doubaoEvent = harness.events.filter(function(event) { return event[0] === "doubao"; })[0];
    assert.equal(doubaoEvent[1].workspaceRoot, bootstrapWorkspacePath);
  });

  it("wraps shell.openPath failures with a stable safe error", async function() {
    const systemError = "The system cannot find the path: C:\\private\\workspace-token";
    const harness = loadMainWithStartupHarness({ state: "selection_required" }, {
      openPath: function() { return Promise.resolve(systemError); }
    });
    await harness.ready();
    const options = harness.events.filter(function(event) { return event[0] === "create-bootstrap"; })[0][1];

    await assert.rejects(options.openPath("C:\\private\\workspace-token"), function(error) {
      assert.equal(error.code, "WORKSPACE_OPEN_FAILED");
      assert.equal(error.message, "Could not open the current workspace");
      assert.equal(error.message.includes(systemError), false);
      return true;
    });
  });

  it("disposes the current runtime once before relaunch and tolerates relaunch without runtime", async function() {
    const readyHarness = loadMainWithStartupHarness({ state: "ready", workspacePath: "C:\\workspace" });
    await readyHarness.ready();
    const options = readyHarness.events.filter(function(event) { return event[0] === "create-bootstrap"; })[0][1];
    await options.relaunch();
    await options.disposeRuntime();
    assert.equal(readyHarness.events.filter(function(event) { return event[0] === "dispose"; }).length, 1);
    assert.deepEqual(readyHarness.events.slice(-2).map(function(event) { return event[0]; }), ["relaunch", "quit"]);

    const selectionHarness = loadMainWithStartupHarness({ state: "selection_required" });
    await selectionHarness.ready();
    const selectionOptions = selectionHarness.events.filter(function(event) { return event[0] === "create-bootstrap"; })[0][1];
    await selectionOptions.relaunch();
    assert.deepEqual(selectionHarness.events.slice(-2).map(function(event) { return event[0]; }), ["relaunch", "quit"]);
  });

  it("exposes only the workspace bootstrap API and forwards token-only confirmations", async function() {
    const harness = loadPreloadHarness();
    assert.deepEqual(Object.keys(harness.api.workspace).sort(), [
      "cancelSelection",
      "chooseDirectory",
      "confirmSelection",
      "getBootstrapState",
      "getCurrent",
      "openCurrent",
      "requestSwitch"
    ]);
    assert.equal(Object.prototype.hasOwnProperty.call(harness.api.workspace, "setPath"), false);

    await harness.api.workspace.getBootstrapState();
    await harness.api.workspace.chooseDirectory();
    await harness.api.workspace.confirmSelection({ token: "selection-token" });
    await harness.api.workspace.cancelSelection();
    await harness.api.workspace.getCurrent();
    await harness.api.workspace.openCurrent();
    await harness.api.workspace.requestSwitch();
    assert.deepEqual(harness.calls.map(function(call) { return call[0]; }).slice(-7), [
      "workspace:get-bootstrap-state",
      "workspace:choose-directory",
      "workspace:confirm-selection",
      "workspace:cancel-selection",
      "workspace:get-current",
      "workspace:open-current",
      "workspace:request-switch"
    ]);
    assert.equal(harness.calls[harness.calls.length - 5][1].token, "selection-token");
    await assert.rejects(function() {
      return harness.api.workspace.confirmSelection({ token: "selection-token", path: "C:\\private" });
    });
    assert.equal(harness.calls.filter(function(call) { return call[0] === "workspace:confirm-selection"; }).length, 1);
  });

  it("does not retain a default Documents or cwd workspace fallback", function() {
    const main = read("desktop/main.js");
    assert.doesNotMatch(main, /Documents[\\/]/i);
    assert.doesNotMatch(main, /process\.cwd\s*\(/);
    assert.doesNotMatch(main, /homedir\s*\(/);
  });

  it("loads the React build from the packaged app files", function() {
    const main = read("desktop/main.js");
    assert.ok(main.includes("media-workbench"));
    assert.ok(main.includes("dist"));
    assert.ok(main.includes("index.html"));
  });

  it("configures a writable runtime workspace before IPC registration", function() {
    const main = read("desktop/main.js");
    assert.ok(main.includes("configureRuntimeEnvironment"));
    assert.ok(main.includes("rootDir: runtime.workspaceRoot") || main.includes("rootDir: runtimeRoot"));
    assert.ok(main.indexOf("configureRuntimeEnvironment") < main.indexOf("registerIpc"));
  });

  it("excludes private runtime data from alpha package config", function() {
    const config = read("electron-builder.alpha.yml");
    assert.ok(config.includes("!**/.env"));
    assert.ok(config.includes("!input/**"));
    assert.ok(config.includes("!data/**"));
    assert.ok(config.includes("!logs/**"));
  });

  it("declares every Doubao workspace boundary without excluding runtime code", function() {
    const config = read("electron-builder.alpha.yml");
    for (const pattern of [
      "!browser/**",
      "!research/**",
      "!clients/**",
      "!generated/**",
      "!logs/**",
      "!tests/fixtures/**"
    ]) assert.match(config, new RegExp("^\\s*-\\s+[\\\"']?" + escapeRegExp(pattern) + "[\\\"']?\\s*$", "m"), pattern);
    assert.match(config, /- src\/\*\*\//);
    assert.match(config, /- media-workbench\/dist\/\*\*\//);
    assert.doesNotMatch(config, /!src\/content\/doubao-\*\.js/);
    assert.doesNotMatch(config, /!media-workbench\/dist/);
    assert.equal((config.match(/!logs\/\*\*/g) || []).length, 1);
    for (const redundantPattern of [
      "!input/media/**",
      "!input/lieju/**",
      "!input/toutiao/**",
      "!input/hepan/**",
      "!tests/**"
    ]) assert.equal(config.includes(redundantPattern), false, redundantPattern + " should not duplicate a parent boundary");
  });

  it("rejects private data in app-owned paths", function() {
    const verifier = path.resolve(__dirname, "..", "scripts", "verify-alpha-package.js");
    const cases = [
      ["nested/.env", ".env"],
      ["workspace-location.json", "workspace-location.json"],
      ["nested/.autopublish-workspace.json", "nested/.autopublish-workspace.json"],
      ["clients/client-1/questions.json", "questions.json"],
      ["research/client-1/question-1.json", "research/client-1/question-1.json"],
      ["browser/doubao/profile/marker", "browser/doubao"],
      ["work/playwright-cli/profiles/doubao/marker", "work/playwright-cli/profiles/doubao"],
      ["logs/doubao-diagnostics/marker.json", "doubao-diagnostics"],
      ["tests/fixtures/marker.json", "tests/fixtures"]
    ];

    for (const [relativePath, reportedPath] of cases) {
      const appDir = fs.mkdtempSync(path.join(os.tmpdir(), "alpha-package-boundary-"));
      try {
        const filename = path.join(appDir, relativePath);
        fs.mkdirSync(path.dirname(filename), { recursive: true });
        fs.writeFileSync(filename, "private\n");
        const result = childProcess.spawnSync(process.execPath, [verifier, appDir], { encoding: "utf8" });
        assert.notEqual(result.status, 0, relativePath + " should fail verification");
        assert.match(result.stderr, new RegExp("SHOULD_NOT_EXIST:.*" + escapeRegExp(reportedPath)), relativePath);
      } finally {
        fs.rmSync(appDir, { recursive: true, force: true });
      }
    }
  });

  it("ignores private-looking files inside packaged node_modules dependencies", function() {
    const verifier = path.resolve(__dirname, "..", "scripts", "verify-alpha-package.js");
    const appDir = fs.mkdtempSync(path.join(os.tmpdir(), "alpha-package-dependency-"));
    try {
      for (const relativePath of [
        "node_modules/vendor/.env",
        "node_modules/vendor/questions.json",
        "node_modules/vendor/research/result.json",
        "node_modules/vendor/tests/fixtures/fixture.json",
        "node_modules/vendor/browser/doubao/profile"
      ]) {
        const filename = path.join(appDir, relativePath);
        fs.mkdirSync(path.dirname(filename), { recursive: true });
        fs.writeFileSync(filename, "third-party\n");
      }
      const result = childProcess.spawnSync(process.execPath, [verifier, appDir], { encoding: "utf8" });
      assert.doesNotMatch(result.stderr, /SHOULD_NOT_EXIST:/);
    } finally {
      fs.rmSync(appDir, { recursive: true, force: true });
    }
  });

  it("packages scripts/config.js because runtime modules require it", function() {
    const config = read("electron-builder.alpha.yml");
    assert.ok(
      config.includes("scripts/**/*") || config.includes("scripts/config.js"),
      "electron-builder config must include scripts/config.js"
    );
    assert.equal(
      config.includes("!scripts/**"),
      false,
      "electron-builder config must not exclude the scripts directory"
    );
  });

  it("initializes runtime environment before loading config-dependent services", function() {
    const main = read("desktop/main.js");
    assert.ok(main.includes("configureRuntimeEnvironment"));
    assert.ok(
      main.indexOf("configureRuntimeEnvironment") < main.indexOf('require("../src/core/logger")'),
      "logger must be required after runtime environment configuration"
    );
    assert.ok(
      main.indexOf("configureRuntimeEnvironment") < main.indexOf('require("./ipc/register")'),
      "IPC registration must be required after runtime environment configuration"
    );
  });

  it("checks the Doubao service source assembly contract", function() {
    const main = read("desktop/main.js");
    assert.match(main, /createDoubaoCollection/);
    assert.match(main, /content:doubao-queue-state/);
    assert.match(main, /(?:doubaoCollectionService|service)\.dispose\(\)/);
    assert.ok(main.indexOf("configureRuntimeEnvironment") < main.indexOf("createDoubaoCollection"));
  });

  it("waits for Doubao disposal before quitting and does not re-enter the quit guard", async function() {
    let resolveDispose;
    let disposeCalls = 0;
    const disposePromise = new Promise(function(resolve) { resolveDispose = resolve; });
    const harness = loadMainWithQuitHarness(function() {
      disposeCalls += 1;
      return disposePromise;
    });
    const firstEvent = { prevented: false, preventDefault: function() { this.prevented = true; } };

    const quitPromise = harness.beforeQuit(firstEvent);
    assert.equal(firstEvent.prevented, true);
    assert.equal(disposeCalls, 1);
    assert.equal(harness.quitCalls(), 0);

    resolveDispose();
    await quitPromise;

    assert.equal(harness.quitCalls(), 1);
    assert.equal(disposeCalls, 1);
    assert.equal(harness.quitEvents[0].prevented, false);

    const secondEvent = { prevented: false, preventDefault: function() { this.prevented = true; } };
    await harness.beforeQuit(secondEvent);
    assert.equal(secondEvent.prevented, false);
    assert.equal(harness.quitCalls(), 1);
    assert.equal(disposeCalls, 1);
  });

  it("continues runtime disposal and quits when either unsubscribe throws", async function() {
    let disposeCalls = 0;
    const harness = loadMainWithQuitHarness(function() { disposeCalls += 1; }, {
      unsubscribeDoubaoQueue: function() { throw new Error("queue cleanup leaked details"); },
      unsubscribeLogs: function() { throw new Error("log cleanup leaked details"); }
    });
    const event = { prevented: false, preventDefault: function() { this.prevented = true; } };

    await harness.beforeQuit(event);

    assert.equal(event.prevented, true);
    assert.equal(disposeCalls, 1);
    assert.equal(harness.quitCalls(), 1);
    assert.equal(harness.quitEvents[0].prevented, false);
  });

  it("prevents concurrent before-quit events until the shared disposal completes", async function() {
    let resolveDispose;
    let disposeCalls = 0;
    const disposePromise = new Promise(function(resolve) { resolveDispose = resolve; });
    const harness = loadMainWithQuitHarness(function() {
      disposeCalls += 1;
      return disposePromise;
    });
    const firstEvent = { prevented: false, preventDefault: function() { this.prevented = true; } };
    const secondEvent = { prevented: false, preventDefault: function() { this.prevented = true; } };

    const firstQuit = harness.beforeQuit(firstEvent);
    const secondQuit = harness.beforeQuit(secondEvent);
    assert.equal(firstEvent.prevented, true);
    assert.equal(secondEvent.prevented, true);
    assert.equal(disposeCalls, 1);
    assert.equal(harness.quitCalls(), 0);

    resolveDispose();
    await Promise.all([firstQuit, secondQuit]);
    assert.equal(harness.quitCalls(), 1);
    assert.equal(harness.quitEvents[0].prevented, false);
  });

  it("exposes Doubao commands and a removable queue-state listener", function() {
    const preload = read("desktop/preload.js");
    for (const channel of [
      "content:list-questions",
      "content:create-question",
      "content:update-question",
      "content:delete-question",
      "content:get-doubao-login-state",
      "content:open-doubao-login",
      "content:collect-doubao-one",
      "content:start-doubao-batch",
      "content:pause-doubao-batch",
      "content:resume-doubao-batch",
      "content:stop-doubao-batch",
      "content:retry-failed-doubao",
      "content:get-doubao-queue-state",
      "content:save-manual-research"
    ]) assert.ok(preload.includes(channel), channel + " should be exposed");
    assert.match(preload, /onDoubaoQueueState/);
    assert.match(preload, /removeListener\("content:doubao-queue-state", handler\)/);
  });
});
