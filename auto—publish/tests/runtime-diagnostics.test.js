const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  createRuntimeDiagnosticsService,
} = require("../desktop/services/runtime-diagnostics-service");
const {
  readBuildInfo,
  probeBundledMammoth,
} = require("../desktop/services/runtime-diagnostics-probes");

it("retains safe runtime diagnostic events reported by lifecycle services", () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "runtime-diagnostics-event-workspace-"),
  );
  const appRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "runtime-diagnostics-event-app-"),
  );
  try {
    const service = createRuntimeDiagnosticsService({
      workspaceRoot: workspace,
      appRoot,
    });
    assert.equal(
      service.report({
        code: "ARTICLE_REMOVAL_RECOVERY_FAILED",
        module: "article-removal-recovery",
        category: "storage",
        operationId: "article-removal-recovery",
        metadata: { outcome: "failed" },
      }),
      true,
    );
    const events = service.diagnose().runtimeEvents;
    assert.equal(events.length, 1);
    assert.equal(events[0].code, "ARTICLE_REMOVAL_RECOVERY_FAILED");
    assert.equal(events[0].module, "article-removal-recovery");
    assert.equal(events[0].metadata.outcome, "failed");
    assert.equal("message" in events[0], false);
    const safe = service.safeDiagnostics();
    assert.equal(safe.runtimeEvents[0].code, "ARTICLE_REMOVAL_RECOVERY_FAILED");
    assert.equal("workspaceRoot" in safe, false);
    assert.equal("appRoot" in safe, false);
    assert.equal(JSON.stringify(safe).includes(workspace), false);
    assert.equal(JSON.stringify(safe).includes(appRoot), false);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
    fs.rmSync(appRoot, { recursive: true, force: true });
  }
});

it("exposes sink degradation without recursively recording sink failures", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "runtime-diagnostics-sink-workspace-"));
  const appRoot = fs.mkdtempSync(path.join(os.tmpdir(), "runtime-diagnostics-sink-app-"));
  try {
    const service = createRuntimeDiagnosticsService({
      workspaceRoot: workspace,
      appRoot,
      initializeFileSink: false,
      fileSink: {
        append() {
          throw Object.assign(new Error("C:\\private\\diagnostic.log"), {
            code: "DIAGNOSTIC_FILE_WRITE_FAILED",
          });
        },
      },
    });
    assert.equal(service.report({
      code: "RUNTIME_EVENT_TEST",
      module: "runtime-test",
      category: "internal",
      operationId: "runtime-test",
      metadata: { action: "test" },
    }), true);
    const safe = service.safeDiagnostics();
    assert.equal(safe.diagnosticSink.status, "degraded");
    assert.equal(safe.diagnosticSink.fileFailureCount, 1);
    assert.equal(safe.diagnosticSink.lastFailureCode, "DIAGNOSTIC_FILE_WRITE_FAILED");
    assert.equal(safe.runtimeEvents.length, 1);
    assert.doesNotMatch(JSON.stringify(safe), /private|diagnostic\.log/i);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
    fs.rmSync(appRoot, { recursive: true, force: true });
  }
});

it("reports fallback sources for malformed optional build metadata", () => {
  const appRoot = fs.mkdtempSync(path.join(os.tmpdir(), "runtime-diagnostics-build-info-"));
  try {
    fs.mkdirSync(path.join(appRoot, "config"), { recursive: true });
    fs.writeFileSync(path.join(appRoot, "config", "build-info.json"), "{malformed", "utf8");
    fs.writeFileSync(path.join(appRoot, "package.json"), JSON.stringify({ version: "fixture-version" }), "utf8");
    assert.deepEqual(readBuildInfo(appRoot, {}), {
      version: "fixture-version",
      commit: "unknown",
      dirty: false,
      source: "package",
      observation: "partial",
    });
    assert.deepEqual(probeBundledMammoth(appRoot, false), {
      available: false,
      observation: "override",
    });
  } finally {
    fs.rmSync(appRoot, { recursive: true, force: true });
  }
});

it("marks a valid secondary build metadata source as fallback after primary read failure", () => {
  const appRoot = fs.mkdtempSync(path.join(os.tmpdir(), "runtime-diagnostics-build-fallback-"));
  try {
    fs.mkdirSync(path.join(appRoot, "config"), { recursive: true });
    fs.writeFileSync(path.join(appRoot, "config", "build-info.json"), "{malformed", "utf8");
    fs.writeFileSync(path.join(appRoot, "build-info.json"), JSON.stringify({ version: "root-version" }), "utf8");
    assert.deepEqual(readBuildInfo(appRoot, {}), {
      version: "root-version",
      commit: "unknown",
      dirty: false,
      source: "root",
      observation: "fallback",
    });
  } finally {
    fs.rmSync(appRoot, { recursive: true, force: true });
  }
});
const {
  createPlaywrightRuntime,
  pwSessionConfig,
  pwInvokeSync,
  runCode,
} = require("../src/core/playwright");

describe("runtime diagnostics", function () {
  let workspace;
  let appRoot;
  const temporaryDirectories = [];

  beforeEach(function () {
    workspace = fs.mkdtempSync(
      path.join(os.tmpdir(), "runtime-diagnostics-workspace-"),
    );
    appRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "runtime-diagnostics-app-"),
    );
    fs.mkdirSync(path.join(workspace, "config"), { recursive: true });
  });
  afterEach(function () {
    fs.rmSync(workspace, { recursive: true, force: true });
    fs.rmSync(appRoot, { recursive: true, force: true });
    while (temporaryDirectories.length) {
      fs.rmSync(temporaryDirectories.pop(), { recursive: true, force: true });
    }
  });

  function makeTemporaryDirectory(prefix) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    temporaryDirectories.push(directory);
    return directory;
  }

  function createBundledPlaywrightFiles() {
    const node = path.join(appRoot, "tools", "node", "node.exe");
    const cli = path.join(
      appRoot,
      "node_modules",
      "@playwright",
      "cli",
      "playwright-cli.js",
    );
    fs.mkdirSync(path.dirname(node), { recursive: true });
    fs.mkdirSync(path.dirname(cli), { recursive: true });
    fs.writeFileSync(node, "bundled node", "utf8");
    fs.writeFileSync(cli, "bundled cli", "utf8");
  }

  it("keeps a configured browser channel in not_checked and isolates optional Hepan", function () {
    createBundledPlaywrightFiles();
    const service = createRuntimeDiagnosticsService({
      workspaceRoot: workspace,
      appRoot: appRoot,
      packaged: true,
      env: { BROWSER_CHANNEL: "msedge" },
      pathLookup: function () {
        return null;
      },
      docxAvailable: true,
    });

    const diagnostics = service.safeDiagnostics();
    assert.equal(diagnostics.browserChannel.configured, true);
    assert.equal(diagnostics.browserChannel.state, "not_checked");
    assert.equal(diagnostics.ok, true);
    assert.equal(
      diagnostics.errors.some(function (error) {
        return error.code === "HEPAN_PYTHON_UNAVAILABLE";
      }),
      false,
    );
    assert.equal(
      diagnostics.warnings.some(function (warning) {
        return warning.code === "HEPAN_PYTHON_UNAVAILABLE";
      }),
      true,
    );
  });

  it("retains a successful browser smoke result for the next diagnostic read", async function () {
    createBundledPlaywrightFiles();
    const service = createRuntimeDiagnosticsService({
      workspaceRoot: workspace,
      appRoot: appRoot,
      packaged: true,
      env: { BROWSER_CHANNEL: "msedge" },
      pathLookup: function () {
        return null;
      },
      execFile: function (file, args, options, callback) {
        callback(null, "", "");
      },
    });

    assert.equal(service.safeDiagnostics().browserChannel.state, "not_checked");
    const smoke = await service.probeBrowser();
    assert.equal(smoke.ok, true);
    const after = service.safeDiagnostics();
    assert.equal(after.browserChannel.state, "ready");
    assert.equal(after.browserChannel.probed, true);
  });

  it("recovers from a failed browser smoke and resets when the channel changes", async function () {
    createBundledPlaywrightFiles();
    const env = { BROWSER_CHANNEL: "msedge" };
    let shouldFail = true;
    const service = createRuntimeDiagnosticsService({
      workspaceRoot: workspace,
      appRoot: appRoot,
      packaged: true,
      env: env,
      pathLookup: function () {
        return null;
      },
      docxAvailable: true,
      execFile: function (file, args, options, callback) {
        if (shouldFail)
          callback(Object.assign(new Error("failed"), { code: 2 }), "", "");
        else callback(null, "", "");
      },
    });

    await assert.rejects(service.probeBrowser(), function (error) {
      return error.code === "PLAYWRIGHT_EXEC_FAILED";
    });
    assert.equal(service.safeDiagnostics().browserChannel.state, "unavailable");
    shouldFail = false;
    await service.probeBrowser();
    assert.equal(service.safeDiagnostics().browserChannel.state, "ready");
    env.BROWSER_CHANNEL = "chrome";
    const changed = service.safeDiagnostics();
    assert.equal(changed.browserChannel.channel, "chrome");
    assert.equal(changed.browserChannel.state, "not_checked");
  });

  it("prefers application browser configuration and reports independent capability failures", function () {
    fs.mkdirSync(path.join(appRoot, "config"), { recursive: true });
    fs.writeFileSync(
      path.join(appRoot, "config", "runtime-tools.json"),
      JSON.stringify({ browserChannel: "chrome" }),
      "utf8",
    );
    const diagnostics = createRuntimeDiagnosticsService({
      workspaceRoot: workspace,
      appRoot: appRoot,
      packaged: true,
      env: { BROWSER_CHANNEL: "msedge" },
      pathLookup: function () {
        return null;
      },
      docxAvailable: true,
    }).diagnose();
    assert.equal(diagnostics.tools.browserChannel.channel, "chrome");
    assert.equal(diagnostics.tools.browserChannel.source, "application-config");
    assert.deepStrictEqual(
      diagnostics.errors.map(function (error) {
        return error.code;
      }),
      ["PLAYWRIGHT_NODE_UNAVAILABLE", "PLAYWRIGHT_CLI_UNAVAILABLE"],
    );
    assert.equal(
      diagnostics.warnings.some(function (warning) {
        return warning.code === "HEPAN_PYTHON_UNAVAILABLE";
      }),
      true,
    );
    assert.ok(
      diagnostics.errors.every(function (error) {
        return (
          !error.message.includes(workspace) && !error.message.includes(appRoot)
        );
      }),
    );
  });

  it("resolves bundled Node and CLI without PATH or external overrides", function () {
    const node = path.join(appRoot, "tools", "node", "node.exe");
    const cli = path.join(
      appRoot,
      "node_modules",
      "@playwright",
      "cli",
      "playwright-cli.js",
    );
    fs.mkdirSync(path.dirname(node), { recursive: true });
    fs.mkdirSync(path.dirname(cli), { recursive: true });
    fs.writeFileSync(node, "bundled node", "utf8");
    fs.writeFileSync(cli, "bundled cli", "utf8");
    const diagnostics = createRuntimeDiagnosticsService({
      workspaceRoot: workspace,
      appRoot: appRoot,
      packaged: true,
      env: {
        PLAYWRIGHT_CLI_JS: "missing-cli",
        AUTO_PUBLISH_NODE_EXEC_PATH: "missing-node",
      },
      pathLookup: function () {
        throw new Error("PATH must not be consulted");
      },
    }).diagnose();
    assert.equal(diagnostics.tools.playwrightNode.command, node);
    assert.equal(diagnostics.tools.playwrightCli.command, cli);
    assert.equal(diagnostics.tools.playwrightNode.source, "bundled");
    assert.equal(diagnostics.tools.playwrightCli.source, "bundled");
    assert.equal(
      diagnostics.errors.some(function (error) {
        return error.code === "PLAYWRIGHT_NODE_UNAVAILABLE";
      }),
      false,
    );
    assert.equal(
      diagnostics.errors.some(function (error) {
        return error.code === "PLAYWRIGHT_CLI_UNAVAILABLE";
      }),
      false,
    );
  });

  it("resolves extraResources Node beside app.asar.unpacked in a packaged layout", function () {
    const resourcesPath = makeTemporaryDirectory(
      "runtime-diagnostics-resources-",
    );
    const unpackedRoot = path.join(resourcesPath, "app.asar.unpacked");
    const node = path.join(resourcesPath, "tools", "node", "node.exe");
    const cli = path.join(
      unpackedRoot,
      "node_modules",
      "@playwright",
      "cli",
      "playwright-cli.js",
    );
    fs.mkdirSync(path.dirname(node), { recursive: true });
    fs.mkdirSync(path.dirname(cli), { recursive: true });
    fs.writeFileSync(node, "bundled node", "utf8");
    fs.writeFileSync(cli, "bundled cli", "utf8");

    const diagnostics = createRuntimeDiagnosticsService({
      workspaceRoot: workspace,
      appRoot: unpackedRoot,
      resourcesPath: resourcesPath,
      packaged: true,
      env: {},
      applicationTools: {},
      pathLookup: function () {
        throw new Error("PATH must not be consulted");
      },
    }).diagnose();

    assert.equal(diagnostics.tools.playwrightNode.command, node);
    assert.equal(diagnostics.tools.playwrightCli.command, cli);
    assert.equal(
      diagnostics.errors.some(function (error) {
        return error.code === "PLAYWRIGHT_NODE_UNAVAILABLE";
      }),
      false,
    );
  });

  it("exposes an async runtime while keeping Doubao on its own session paths", function () {
    const session = pwSessionConfig("doubao");
    const runtime = createPlaywrightRuntime({ session: session });

    assert.deepEqual(Object.keys(runtime).sort(), [
      "close",
      "evaluate",
      "open",
    ]);
    assert.equal(session.session, "doubao");
    assert.equal(session.profileId, "default");
    assert.match(session.profileDir, /profiles[\\/]doubao$/);
    assert.match(session.daemonDir, /sessions[\\/]doubao$/);
    assert.match(session.stateFile, /state[\\/]doubao\.json$/);
  });

  it("accepts an explicit Doubao profileId while defaulting to the application profile", function () {
    const defaultSession = pwSessionConfig({ session: "doubao" });
    const namedSession = pwSessionConfig({
      session: "doubao",
      profileId: "editor-2",
    });

    assert.equal(defaultSession.profileId, "default");
    assert.equal(namedSession.profileId, "editor-2");
    assert.notEqual(namedSession.profileDir, defaultSession.profileDir);
    assert.notEqual(namedSession.stateFile, defaultSession.stateFile);
  });

  it("invokes execFile with structured Playwright arguments and the session environment", async function () {
    const calls = [];
    const session = {
      session: "doubao",
      profileDir: path.join(workspace, "profile"),
      daemonDir: path.join(workspace, "daemon"),
      stateFile: path.join(workspace, "state.json"),
    };
    const runtime = createPlaywrightRuntime({
      session: session,
      timeout: 3210,
      execFile: function (file, args, options, callback) {
        calls.push({ file: file, args: args, options: options });
        callback(null, '### Result\n{"opened":true}\n', "");
      },
    });

    const result = await runtime.open({
      url: "https://www.doubao.com/chat/",
      browser: "msedge",
      headed: true,
      persistent: true,
    });

    assert.deepEqual(result, { opened: true });
    assert.equal(calls.length, 1);
    assert.match(calls[0].file, /[\\/]node\.exe$/i);
    const expectedArgs = [
      "-s=doubao",
      "open",
      "https://www.doubao.com/chat/",
      "--browser=msedge",
      "--headed",
      "--persistent",
      "--profile=" + session.profileDir,
    ];
    assert.match(
      calls[0].args[0],
      /[\\/]node_modules[\\/]@playwright[\\/]cli[\\/]playwright-cli\.js$/,
    );
    assert.deepEqual(calls[0].args.slice(1), expectedArgs);
    assert.equal(calls[0].options.encoding, "utf8");
    assert.equal(calls[0].options.timeout, 3210);
    assert.equal(
      calls[0].options.env.PLAYWRIGHT_DAEMON_SESSION_DIR,
      session.daemonDir,
    );
  });

  it("resolves a Windows npm wrapper to the Playwright JavaScript entrypoint", async function () {
    if (process.platform !== "win32") return;
    const npmRoot = makeTemporaryDirectory("playwright-npm-");
    const wrapper = path.join(npmRoot, "playwright-cli.cmd");
    const entrypoint = path.join(
      npmRoot,
      "node_modules",
      "@playwright",
      "cli",
      "playwright-cli.js",
    );
    fs.mkdirSync(path.dirname(entrypoint), { recursive: true });
    fs.writeFileSync(wrapper, "@echo off\r\n", "utf8");
    fs.writeFileSync(entrypoint, "", "utf8");
    const calls = [];
    const runtime = createPlaywrightRuntime({
      session: pwSessionConfig("doubao"),
      playwrightCli: wrapper,
      execFile: function (file, args, options, callback) {
        calls.push({ file: file, args: args, options: options });
        callback(null, '### Result\n{"closed":true}\n', "");
      },
    });

    await runtime.close();

    assert.equal(calls.length, 1);
    assert.match(calls[0].file, /[\\/]node\.exe$/i);
    assert.deepEqual(calls[0].args.slice(0, 2), [entrypoint, "-s=doubao"]);
  });

  it("passes evaluate timeoutMs through to the runtime process", async function () {
    const calls = [];
    const runtime = createPlaywrightRuntime({
      session: pwSessionConfig("doubao"),
      tempDir: makeTemporaryDirectory("runtime-evaluate-"),
      timeout: 9000,
      execFile: function (file, args, options, callback) {
        calls.push({ file: file, args: args, options: options });
        callback(null, '### Result\n{"evaluated":true}\n', "");
      },
    });

    assert.deepEqual(
      await runtime.evaluate({
        script: "return { evaluated: true };",
        timeoutMs: 1234,
      }),
      { evaluated: true },
    );
    assert.equal(calls[0].options.timeout, 1234);
  });

  it("maps an execFile timeout to a stable runtime error", async function () {
    const sourceError = Object.assign(new Error("command timed out"), {
      code: "ETIMEDOUT",
      killed: true,
      signal: "SIGTERM",
    });
    const runtime = createPlaywrightRuntime({
      session: pwSessionConfig("doubao"),
      execFile: function (file, args, options, callback) {
        callback(sourceError, "browser 'msedge' is not open", "partial stderr");
      },
    });

    await assert.rejects(runtime.close(), function (error) {
      assert.equal(error.code, "PLAYWRIGHT_TIMEOUT");
      assert.equal(error.stdout, "browser 'msedge' is not open");
      assert.equal(error.stderr, "partial stderr");
      assert.equal(error.cause, sourceError);
      return true;
    });
  });

  it("maps browser session-not-open diagnostics from stdout or stderr", async function () {
    const diagnostics = [
      { stdout: "Error: browser 'msedge' is not open", stderr: "" },
      { stdout: "", stderr: "Please run open first" },
    ];

    for (const diagnostic of diagnostics) {
      const sourceError = Object.assign(new Error("playwright exited"), {
        code: 2,
      });
      const runtime = createPlaywrightRuntime({
        session: pwSessionConfig("doubao"),
        execFile: function (file, args, options, callback) {
          callback(sourceError, diagnostic.stdout, diagnostic.stderr);
        },
      });

      await assert.rejects(runtime.close(), function (error) {
        assert.equal(error.code, "PLAYWRIGHT_SESSION_NOT_OPEN");
        assert.equal(error.message, "Playwright session is not open");
        assert.equal(error.stdout, diagnostic.stdout);
        assert.equal(error.stderr, diagnostic.stderr);
        assert.equal(error.cause, sourceError);
        assert.equal(Object.keys(error).includes("cause"), false);
        assert.equal(Object.keys(error).includes("stdout"), false);
        assert.equal(Object.keys(error).includes("stderr"), false);
        return true;
      });
    }
  });

  it("does not classify a session diagnostic from the source error message alone", async function () {
    const sourceError = Object.assign(
      new Error("browser 'msedge' is not open"),
      { code: 2 },
    );
    const runtime = createPlaywrightRuntime({
      session: pwSessionConfig("doubao"),
      execFile: function (file, args, options, callback) {
        callback(sourceError, "unrelated stdout", "unrelated stderr");
      },
    });

    await assert.rejects(runtime.close(), function (error) {
      assert.equal(error.code, "PLAYWRIGHT_EXEC_FAILED");
      assert.equal(error.message, "Playwright command failed");
      return true;
    });
  });

  it("maps a failed execFile command without hiding its diagnostics", async function () {
    const sourceError = Object.assign(new Error("playwright exited"), {
      code: 2,
    });
    const runtime = createPlaywrightRuntime({
      session: pwSessionConfig("doubao"),
      execFile: function (file, args, options, callback) {
        callback(sourceError, "failed stdout", "failed stderr");
      },
    });

    await assert.rejects(runtime.close(), function (error) {
      assert.equal(error.code, "PLAYWRIGHT_EXEC_FAILED");
      assert.equal(error.originalCode, 2);
      assert.equal(error.stdout, "failed stdout");
      assert.equal(error.stderr, "failed stderr");
      assert.equal(error.cause, sourceError);
      return true;
    });
  });

  it("passes synchronous commands, session environment, and filenames as literal argv values", function () {
    const calls = [];
    const session = {
      session: "literal-session",
      profileDir: "C:\\profile space & (100%) !#",
      daemonDir: "C:\\daemon space & (100%) !#",
      stateFile: "C:\\state space & (100%) !#\\state.json",
    };
    const literalArgument =
      "https://example.invalid/?value=a&b|c<d>e^f(g)%h!i#j";
    const tempDir = path.join(
      makeTemporaryDirectory("runtime-sync-"),
      "path space & (100%) !#",
    );
    const fakeExecFileSync = function (file, args, options) {
      calls.push({ file: file, args: args, options: options });
      return '### Result\n{"ok":true}\n';
    };

    assert.equal(
      pwInvokeSync(["goto", literalArgument], {
        session: session,
        timeout: 4321,
        execFileSync: fakeExecFileSync,
      }),
      '### Result\n{"ok":true}\n',
    );
    assert.deepEqual(
      runCode("return { ok: true };", {
        session: session,
        timeout: 5432,
        tempDir: tempDir,
        execFileSync: fakeExecFileSync,
      }),
      { ok: true },
    );
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0].args.slice(-3), [
      "-s=literal-session",
      "goto",
      literalArgument,
    ]);
    assert.equal(calls[0].options.timeout, 4321);
    assert.equal(
      calls[0].options.env.PLAYWRIGHT_DAEMON_SESSION_DIR,
      session.daemonDir,
    );
    assert.equal(Object.hasOwn(calls[0].options, "shell"), false);
    assert.equal(calls[1].options.timeout, 5432);
    assert.equal(
      calls[1].options.env.PLAYWRIGHT_DAEMON_SESSION_DIR,
      session.daemonDir,
    );
    assert.equal(calls[1].args.at(-2), "run-code");
    assert.equal(
      calls[1].args.at(-1).startsWith("--filename=" + tempDir),
      true,
    );
    assert.equal(Object.hasOwn(calls[1].options, "shell"), false);

    runCode("return { second: true };", {
      session: session,
      tempDir: tempDir,
      execFileSync: fakeExecFileSync,
    });
    assert.equal(calls.length, 3);
    assert.notEqual(calls[1].args.at(-1), calls[2].args.at(-1));
  });

  it("rejects string command construction at the synchronous runtime boundary", function () {
    assert.throws(
      () => pwInvokeSync("list", { execFileSync: () => "" }),
      function (error) {
        assert.equal(error.code, "PLAYWRIGHT_ARGUMENTS_INVALID");
        return true;
      },
    );
  });
});
