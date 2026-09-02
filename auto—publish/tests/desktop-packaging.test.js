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
  const events = [];
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
      ipcMain: { handle: function() {} },
      dialog: { showOpenDialog: function() {} },
      shell: { openPath: function() {} }
    }],
    ["./security/navigation", { isAllowedRendererNavigation: function() { return true; } }],
    ["./services/auth-service", { createAuthService: function() { return {
      getState: function() { return { authenticated: true, user: { loginName: "admin" }, entitlements: [] }; },
      initialize: function() { return { then: function(callback) { callback({ authenticated: true }); return { catch: function() {} }; } }; },
      requireAuthenticated: function() { return Promise.resolve("access"); }
    }; } }],
    ["./ipc/auth-ipc", { registerAuthIpc: function() {} }],
    ["./workspace-bootstrap-service", {
      createWorkspaceBootstrapService: function(options) {
        events.push(["create-bootstrap", options]);
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
    ["./services/platform-settings-service", { createPlatformSettingsService: function() { return { getAdapterForRuntime: function() { return null; } }; } }],
    ["./services/platform-settings/media-settings-adapter", { createMediaSettingsAdapter: function() { return {}; } }],
    ["./services/platform-settings/hepan-settings-adapter", { createHepanSettingsAdapter: function() { return {}; } }],
    ["./runtime-config", { createLegacyProviderSettingsMigration: function() { return {}; } }],
    ["./services/ai-provider-service", { createAiProviderService: function() { return { createClient: function() { return {}; } }; } }],
    ["./services/submission-maintenance-service", { createSubmissionMaintenanceService: function() { return {}; } }],
    ["./services/ai-content-service", { createAiContentService: function() { return {}; } }],
    ["./services/content-generation-batch-service", { createContentGenerationBatchService: function() { return { dispose: function() {} }; } }],
    ["./services/doubao-collection-service", {
      createDoubaoCollectionDesktopService: function() { return service; }
    }],
    ["./workspace-runtime", {
      createWorkspaceRuntime: function() {
        return {
          start: function() { return Promise.resolve(); },
          registerIpc: function() {},
          getState: function() { return { phase: "running" }; },
          dispose: function() { return service.dispose(); }
        };
      }
    }],
    ["./ipc/register", { registerIpc: function() {} }]
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
    events: events,
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
  const preloadRegistry = {
    byChannel: function(channel) {
      const eventChannels = ["auth-state-changed", "workspace:data-invalidated", "content:article-removal-transaction", "content:doubao-queue-state", "content:generation-batch-state"];
      return {
        channel: channel,
        kind: eventChannels.includes(channel) ? "event" : "query",
        fromArgs: function(args) { return args[0] || {}; }
      };
    },
    encodeRequest: function(contract, payload) { return payload; },
    parseResult: function() {},
    parseEvent: function(contract, payload) { return payload; },
    failure: function() { return { ok: false, error: { code: "IPC_RESULT_INVALID" } }; }
  };
  vm.runInNewContext(read("desktop/preload.js"), {
    require: function(name) {
      if (name === "electron") {
        return {
          contextBridge: { exposeInMainWorld: function(name, api) { exposed[name] = api; } },
          ipcRenderer: ipcRenderer
        };
      }
      if (name === "./ipc/contracts/production-registry") {
        return { productionIpcRegistry: preloadRegistry };
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
    ["./services/auth-service", { createAuthService: function() { return {
      getState: function() { return { authenticated: options.authenticated !== false, user: { loginName: "admin" }, entitlements: [] }; },
      initialize: function() { return Promise.resolve({ authenticated: options.authenticated !== false }); },
      requireAuthenticated: function() { return Promise.resolve("access"); }
    }; } }],
    ["./ipc/auth-ipc", { registerAuthIpc: function(options) { events.push(["auth-ipc", options]); } }],
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
    ["./ipc/register", { registerIpc: function() { events.push(["business-ipc"]); } }]
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
    ready: function() { return readyPromise.then(function() { return new Promise(function(resolve) { setImmediate(resolve); }); }); },
    listeners: listeners
  };
}

describe("source assembly and packaging contract", function() {
  it("keeps required research, article, migration, submission IPC, and media surfaces in the package boundary", function() {
    const config = read("electron-builder.alpha.yml");
    for (const legacySurface of [
      "src/content/research-store.js",
      "src/content/article-store.js",
      "src/content/legacy-migration.js",
      "src/platforms/media/adapter.js",
      "desktop/ipc/content-submission-ipc.js",
      "desktop/ipc/media-ipc.js",
      "desktop/ipc/platform-ipc.js"
    ]) {
      assert.ok(config.includes("src/**/*") || config.includes(legacySurface), legacySurface + " must remain packaged");
    }
  });

  it("declares new content runtime files and renderer build as alpha package requirements", function() {
    const verifier = read("scripts/verify-alpha-package.js");
    for (const requiredSurface of [
      "src/content/client-material-store.js",
      "src/core/docx-text-extractor.js",
      "src/content/generation-batch-store.js",
      "src/content/generation-batch-runner.js",
      "desktop/ai-provider-config-store.js",
      "desktop/services/ai-provider-service.js",
      "desktop/services/content-generation-batch-service.js",
      "desktop/device-identity-store.js",
      "desktop/ipc/content-generation-batch-ipc.js",
      "media-workbench/dist/index.html"
    ]) {
      assert.match(verifier, new RegExp('"' + escapeRegExp(requiredSurface) + '"'), requiredSurface + " must be verified");
    }
  });

  it("declares the isolated packaged DOCX verifier and Mammoth license", function() {
    const verifier = read("scripts/verify-alpha-package.js");
    assert.match(verifier, /node_modules\/mammoth\/LICENSE/);
    assert.match(read("scripts/verify-packaged-docx-runtime.js"), /MARKITDOWN_CMD/);
    assert.match(read("scripts/verify.js"), /verify-packaged-docx-runtime/);
    assert.match(read("scripts/prepare-runtime-tools.js"), /config.*build-info\.json/);
    assert.match(read("scripts/verify-alpha-package.js"), /config\/build-info\.json/);
  });

  it("declares the bundled Playwright runtime and isolated verifier", function() {
    const config = read("electron-builder.alpha.yml");
    const verifier = read("scripts/verify-alpha-package.js");
    const packageJson = JSON.parse(read("package.json"));
    assert.match(config, /from: build\/runtime-tools\/node/);
    assert.match(config, /to: tools\/node/);
    for (const requiredRuntimeFile of [
      "tools/node/node.exe",
      "tools/node/runtime-tools-manifest.json",
      "node_modules/@playwright/cli/playwright-cli.js",
      "node_modules/playwright/LICENSE",
      "node_modules/playwright-core/LICENSE"
    ]) assert.match(verifier, new RegExp('"' + escapeRegExp(requiredRuntimeFile) + '"'), requiredRuntimeFile);
    assert.equal(packageJson.scripts["prepare:runtime-tools"], "node scripts/prepare-runtime-tools.js");
    assert.match(packageJson.scripts["pack:alpha"], /prepare:runtime-tools/);
    assert.match(packageJson.scripts["pack:smoke"], /prepare:runtime-tools/);
    assert.match(packageJson.scripts["pack:smoke"], /verify-alpha-package\.js\s+release-alpha\/win-unpacked\/resources/);
    for (const scriptName of ["dist:alpha", "dist:alpha:dirty"])
      assert.match(packageJson.scripts[scriptName], /verify-alpha-package\.js\s+release-alpha\/win-unpacked\/resources/);
    assert.match(config, /asarUnpack:/);
    assert.doesNotMatch(config, /asarUnpack:\s*\r?\n\s*-\s+["']?\*\*\/\*["']?/);
    for (const runtimeBoundary of [
      "node_modules/@playwright/cli/**/*",
      "node_modules/playwright/**/*",
      "node_modules/playwright-core/**/*"
    ]) assert.match(config, new RegExp(escapeRegExp(runtimeBoundary)));
    assert.match(config, /extraResources:/);
  });

  it("excludes every private content and application configuration boundary", function() {
    const config = read("electron-builder.alpha.yml");
    for (const pattern of [
      "!**/ai-provider.json",
      "!**/media-provider.json",
      "!**/hepan-geo-api-provider.json",
      "!**/platform-settings-migration.json",
      "!**/content-generation-batches/**",
      "!**/client-material-cache/**",
      "!**/.autopublish/**",
      "!**/submission-records/**",
      "!**/publications/**",
      "!**/research/**",
      "!generated/**",
      "!**/browser/**",
      "!**/doubao-diagnostics/**",
      "!**/tests/fixtures/**"
    ]) {
      assert.match(config, new RegExp("^\\s*-\\s+[\\\"']?" + escapeRegExp(pattern) + "[\\\"']?\\s*$", "m"), pattern);
    }
    assert.match(config, /!\*\*\/\.env/);
    assert.match(config, /- src\/\*\*\//);
    assert.match(config, /- media-workbench\/dist\/\*\*\//);
    assert.match(read("scripts/verify-alpha-package.js"), /auth\.db/);
    assert.match(read("scripts/verify-alpha-package.js"), /device-identity\.json/);
  });

  it("does not exclude dependency runtime generated files from the production app", function() {
    const config = read("electron-builder.alpha.yml");
    assert.match(config, /^\s*-\s+[\"']?!generated\/\*\*[\"']?\s*$/m);
    assert.doesNotMatch(
      config,
      /^\s*-\s+[\"']?!\*\*\/generated\/\*\*[\"']?\s*$/m,
    );
  });

  it("does not package the one-shot content library migration tool", function() {
    const config = read("electron-builder.alpha.yml");
    assert.match(config, /^\s*-\s+["']?!scripts\/migrate-content-library-v2\.js["']?\s*$/m);
  });

  it("rejects new private content and AI provider state in an app directory", function() {
    const verifier = require("../scripts/verify-alpha-package");
    const appDir = fs.mkdtempSync(path.join(os.tmpdir(), "alpha-package-content-boundary-"));
    try {
      for (const relativePath of [
        "config/ai-provider.json",
        "data/content-generation-batches/batch.json",
        "work/client-material-cache/client-1/material.json",
        "generated/client-1/article.md",
        "research/client-1/question.json",
        "browser/doubao/profile/marker",
        "logs/doubao-diagnostics/summary.json",
        "tests/fixtures/marker.json",
        "auth.db"
      ]) {
        const filename = path.join(appDir, relativePath);
        fs.mkdirSync(path.dirname(filename), { recursive: true });
        fs.writeFileSync(filename, "private\n");
      }

      const found = verifier.findPrivateEntries(appDir);
      for (const expectedBoundary of [
        "config/ai-provider.json",
        "data/content-generation-batches",
        "work/client-material-cache",
        "generated",
        "research/client-1/question.json",
        "browser/doubao",
        "logs/doubao-diagnostics",
        "tests/fixtures"
      ]) {
        assert.ok(found.some(function(entry) {
          return entry === expectedBoundary || entry.startsWith(expectedBoundary + "/");
        }), expectedBoundary + " must be rejected");
      }
    } finally {
      fs.rmSync(appDir, { recursive: true, force: true });
    }
  });

  it("keeps workspace AI assignments out of the environment contract", function() {
    const envExample = read(".env.example");
    assert.doesNotMatch(envExample, /^AI_[A-Z0-9_]+=/m, "workspace env must not configure AI provider");
  });

  it("does not create runtime or business services before workspace bootstrap is ready", async function() {
    const harness = loadMainWithStartupHarness({ state: "selection_required" }, { authenticated: false });
    await harness.ready();

    assert.deepEqual(harness.events.map(function(event) { return event[0]; }), ["window", "getPath", "auth-ipc"]);
    assert.equal(harness.events.some(function(event) { return event[0] === "runtime"; }), false);
    assert.equal(harness.events.some(function(event) { return event[0] === "task"; }), false);
    assert.equal(harness.events.some(function(event) { return event[0] === "doubao"; }), false);
    assert.equal(harness.events.some(function(event) { return event[0] === "business-ipc"; }), false);
    for (const request of [
      "./runtime-paths",
      "./runtime-config",
      "./services/desktop-task-service",
      "./services/doubao-collection-service",
      "./ipc/register"
    ]) assert.equal(harness.requires.includes(request), false, request + " must not be required");
  });

  it("keeps every non-ready bootstrap state free of runtime and business initialization", async function() {
    for (const state of ["checking", "selection_required", "invalid", "confirmation_required", "relaunching"]) {
      const harness = loadMainWithStartupHarness({ state: state }, { authenticated: false });
      await harness.ready();
      assert.equal(harness.events.some(function(event) { return event[0] === "runtime"; }), false, state);
      assert.equal(harness.events.some(function(event) { return event[0] === "task"; }), false, state);
      assert.equal(harness.events.some(function(event) { return event[0] === "doubao"; }), false, state);
      assert.equal(harness.events.some(function(event) { return event[0] === "business-ipc"; }), false, state);
    }
  });

  it("does not register workspace bootstrap IPC more than once across repeated auth activation", async function() {
    const harness = loadMainWithStartupHarness({ state: "invalid" }, { authenticated: false });
    await harness.ready();

    const authEvent = harness.events.find(function(event) { return event[0] === "auth-ipc"; });
    assert.ok(authEvent && authEvent[1] && typeof authEvent[1].onAuthenticated === "function");
    await authEvent[1].onAuthenticated();
    const firstRegistrationCount = harness.events.filter(function(event) { return event[0] === "handle"; }).length;
    assert.ok(firstRegistrationCount > 0);
    await authEvent[1].onAuthenticated();

    assert.equal(harness.events.filter(function(event) { return event[0] === "handle"; }).length, firstRegistrationCount);
  });

  it("fails closed when workspace bootstrap throws and activate does not create a window", async function() {
    const harness = loadMainWithStartupHarness({ state: "selection_required" }, {
      authenticated: false,
      bootstrapError: new Error("bootstrap leaked internal details")
    });
    await harness.ready();

    assert.equal(harness.events.some(function(event) { return event[0] === "window"; }), true);
    assert.equal(harness.events.some(function(event) { return event[0] === "bootstrap"; }), false);
    harness.listeners.get("activate")();
    assert.equal(harness.events.filter(function(event) { return event[0] === "window"; }).length, 2);
  });

  it("fails closed when runtime initialization throws", async function() {
    const harness = loadMainWithStartupHarness({ state: "ready", workspacePath: "C:\\workspace" }, {
      authenticated: false,
      runtimeError: new Error("runtime leaked internal details")
    });
    await harness.ready();

    assert.equal(harness.events.some(function(event) { return event[0] === "window"; }), true);
    assert.equal(harness.events.some(function(event) { return event[0] === "runtime"; }), false);
    harness.listeners.get("activate")();
    assert.equal(harness.events.filter(function(event) { return event[0] === "window"; }).length, 2);
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

  it("ships the read-only builtin content template resources", function() {
    const templatesRoot = path.resolve(__dirname, "..", "resources", "content-templates");
    assert.ok(fs.existsSync(templatesRoot));
    const templateFiles = childProcess.execFileSync(process.execPath, ["-e", [
      "const fs=require('fs'),path=require('path');",
      "function walk(d){return fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);}",
      "process.stdout.write(JSON.stringify(walk(process.argv[1]).filter(f=>f.endsWith('.md'))));"
    ].join(""), templatesRoot], { encoding: "utf8" });
    assert.ok(JSON.parse(templateFiles).length > 0);
    const config = read("electron-builder.alpha.yml");
    assert.match(config, /resources\/content-templates\/\*\*\/\*/);
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
      "!tests/**"
    ]) assert.equal(config.includes(redundantPattern), false, redundantPattern + " should not duplicate a parent boundary");
  });

  it("rejects private data in app-owned paths", function() {
    const verifier = path.resolve(__dirname, "..", "scripts", "verify-alpha-package.js");
    const cases = [
      ["nested/.env", ".env"],
      ["config/media-provider.json", "config/media-provider.json"],
      ["config/hepan-geo-api-provider.json", "config/hepan-geo-api-provider.json"],
      ["config/platform-settings-migration.json", "config/platform-settings-migration.json"],
      ["workspace-location.json", "workspace-location.json"],
      ["nested/.autopublish-workspace.json", "nested/.autopublish-workspace.json"],
      ["clients/client-1/questions.json", "questions.json"],
      ["research/client-1/question-1.json", "research/client-1/question-1.json"],
      ["browser/doubao/profile/marker", "browser/doubao"],
      ["work/playwright-cli/profiles/doubao/marker", "work/playwright-cli/profiles/doubao"],
      ["logs/doubao-diagnostics/marker.json", "doubao-diagnostics"],
      ["tests/fixtures/marker.json", "tests/fixtures"],
      ["nested/.autopublish/submission-records/publications/publication.json", "nested/.autopublish"]
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

  it("does not package retired publication ledger writers or scripts", function() {
    const config = read("electron-builder.alpha.yml");
    assert.doesNotMatch(config, /migrate-publication-ledger-v1|publication-ledger/);
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
      unsubscribeDoubaoQueue: function() { throw new Error("queue cleanup leaked details"); }
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

  it("exposes Doubao commands and the queue-state subscription capability", function() {
    const preload = read("desktop/preload.js");
    for (const channel of [
      "content:list-questions",
      "content:create-question",
      "content:update-question",
      "content:delete-question",
      "content:get-doubao-login-state",
      "content:open-doubao-login",
      "content:collect-doubao-one",
      "content:pause-doubao-batch",
      "content:resume-doubao-batch",
      "content:stop-doubao-batch",
      "content:retry-failed-doubao",
      "content:get-doubao-queue-state",
      "content:save-manual-research"
    ]) assert.match(preload, new RegExp(escapeRegExp(channel)), channel + " should be exposed");
    assert.match(preload, /onDoubaoQueueState/);
  });
});
