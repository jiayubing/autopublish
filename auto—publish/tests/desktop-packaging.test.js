const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const childProcess = require("child_process");
const fs = require("fs");
const Module = require("module");
const os = require("os");
const path = require("path");

function read(file) {
  return fs.readFileSync(path.resolve(__dirname, "..", file), "utf8");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function loadMainWithQuitHarness(dispose) {
  const mainPath = path.resolve(__dirname, "..", "desktop", "main.js");
  const listeners = new Map();
  const service = {
    subscribe: function() { return function() {}; },
    dispose: dispose
  };
  let quitCalls = 0;
  const quitEvents = [];
  const app = {
    on: function(name, handler) { listeners.set(name, handler); },
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
    ["electron", { app: app, BrowserWindow: BrowserWindow, ipcMain: {}, shell: {} }],
    ["./security/navigation", { isAllowedRendererNavigation: function() { return true; } }],
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
    ["../src/core/logger", { subscribe: function() { return function() {}; } }]
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

describe("source assembly and packaging contract", function() {
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
