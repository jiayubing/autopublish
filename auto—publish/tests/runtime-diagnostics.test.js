const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { createRuntimeDiagnosticsService } = require("../desktop/services/runtime-diagnostics-service");
const { createPlaywrightRuntime, pwSessionConfig, pwCmd, pwRun, runCode } = require("../src/core/playwright");
const { PLAYWRIGHT_CLI_JS } = require("../scripts/config");

describe("runtime diagnostics", function() {
  let workspace;
  let appRoot;
  const temporaryDirectories = [];

  beforeEach(function() {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), "runtime-diagnostics-workspace-"));
    appRoot = fs.mkdtempSync(path.join(os.tmpdir(), "runtime-diagnostics-app-"));
    fs.mkdirSync(path.join(workspace, "config"), { recursive: true });
  });
  afterEach(function() {
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

  it("prefers workspace tool configuration over environment and reports safe actionable missing tools", function() {
    const configured = path.join(workspace, "config", "markitdown.cmd");
    fs.writeFileSync(configured, "", "utf8");
    fs.writeFileSync(path.join(workspace, "config", "runtime-tools.json"), JSON.stringify({ markitdownCmd: configured }), "utf8");
    const diagnostics = createRuntimeDiagnosticsService({ workspaceRoot: workspace, appRoot: appRoot, env: { MARKITDOWN_CMD: "from-env" }, pathLookup: function() { return null; } }).diagnose();
    assert.equal(diagnostics.tools.markitdown.command, configured);
    assert.equal(diagnostics.tools.markitdown.source, "workspace-config");
    assert.deepStrictEqual(diagnostics.errors.map(function(error) { return error.code; }), ["PLAYWRIGHT_UNAVAILABLE", "HEPAN_PYTHON_UNAVAILABLE"]);
    assert.ok(diagnostics.errors.every(function(error) { return !error.message.includes(workspace) && !error.message.includes(appRoot); }));
  });

  it("exposes an async runtime while keeping Doubao on its own session paths", function() {
    const session = pwSessionConfig("doubao");
    const runtime = createPlaywrightRuntime({ session: session });

    assert.deepEqual(Object.keys(runtime).sort(), ["close", "evaluate", "open", "screenshot"]);
    assert.equal(session.session, "doubao");
    assert.match(session.profileDir, /profiles[\\/]doubao$/);
    assert.match(session.daemonDir, /sessions[\\/]doubao$/);
    assert.match(session.stateFile, /state[\\/]doubao\.json$/);
  });

  it("invokes execFile with structured Playwright arguments and the session environment", async function() {
    const calls = [];
    const session = {
      session: "doubao",
      profileDir: path.join(workspace, "profile"),
      daemonDir: path.join(workspace, "daemon"),
      stateFile: path.join(workspace, "state.json")
    };
    const runtime = createPlaywrightRuntime({
      session: session,
      timeout: 3210,
      execFile: function(file, args, options, callback) {
        calls.push({ file: file, args: args, options: options });
        callback(null, "### Result\n{\"opened\":true}\n", "");
      }
    });

    const result = await runtime.open({
      url: "https://www.doubao.com/chat/",
      browser: "msedge",
      headed: true,
      persistent: true
    });

    assert.deepEqual(result, { opened: true });
    assert.equal(calls.length, 1);
    if (process.platform === "win32" && !/\.js$/i.test(PLAYWRIGHT_CLI_JS)) assert.equal(calls[0].file, process.execPath);
    else assert.equal(calls[0].file, PLAYWRIGHT_CLI_JS);
    const expectedArgs = [
      "-s=doubao",
      "open",
      "https://www.doubao.com/chat/",
      "--browser=msedge",
      "--headed",
      "--persistent",
      "--profile=" + session.profileDir
    ];
    if (calls[0].file === process.execPath) {
      assert.match(calls[0].args[0], /[\\/]node_modules[\\/]@playwright[\\/]cli[\\/]playwright-cli\.js$/);
      assert.deepEqual(calls[0].args.slice(1), expectedArgs);
    } else {
      assert.deepEqual(calls[0].args, expectedArgs);
    }
    assert.equal(calls[0].options.encoding, "utf8");
    assert.equal(calls[0].options.timeout, 3210);
    assert.equal(calls[0].options.env.PLAYWRIGHT_DAEMON_SESSION_DIR, session.daemonDir);
  });

  it("resolves a Windows npm wrapper to the Playwright JavaScript entrypoint", async function() {
    if (process.platform !== "win32") return;
    const npmRoot = makeTemporaryDirectory("playwright-npm-");
    const wrapper = path.join(npmRoot, "playwright-cli.cmd");
    const entrypoint = path.join(npmRoot, "node_modules", "@playwright", "cli", "playwright-cli.js");
    fs.mkdirSync(path.dirname(entrypoint), { recursive: true });
    fs.writeFileSync(wrapper, "@echo off\r\n", "utf8");
    fs.writeFileSync(entrypoint, "", "utf8");
    const calls = [];
    const runtime = createPlaywrightRuntime({
      session: pwSessionConfig("doubao"),
      playwrightCli: wrapper,
      execFile: function(file, args, options, callback) {
        calls.push({ file: file, args: args, options: options });
        callback(null, "### Result\n{\"closed\":true}\n", "");
      }
    });

    await runtime.close();

    assert.equal(calls.length, 1);
    assert.equal(calls[0].file, process.execPath);
    assert.deepEqual(calls[0].args.slice(0, 2), [entrypoint, "-s=doubao"]);
  });

  it("passes evaluate timeoutMs through to the runtime process", async function() {
    const calls = [];
    const runtime = createPlaywrightRuntime({
      session: pwSessionConfig("doubao"),
      tempDir: makeTemporaryDirectory("runtime-evaluate-") ,
      timeout: 9000,
      execFile: function(file, args, options, callback) {
        calls.push({ file: file, args: args, options: options });
        callback(null, "### Result\n{\"evaluated\":true}\n", "");
      }
    });

    assert.deepEqual(await runtime.evaluate({ script: "return { evaluated: true };", timeoutMs: 1234 }), { evaluated: true });
    assert.equal(calls[0].options.timeout, 1234);
  });

  it("maps an execFile timeout to a stable runtime error", async function() {
    const sourceError = Object.assign(new Error("command timed out"), {
      code: "ETIMEDOUT",
      killed: true,
      signal: "SIGTERM"
    });
    const runtime = createPlaywrightRuntime({
      session: pwSessionConfig("doubao"),
      execFile: function(file, args, options, callback) {
        callback(sourceError, "browser 'msedge' is not open", "partial stderr");
      }
    });

    await assert.rejects(runtime.close(), function(error) {
      assert.equal(error.code, "PLAYWRIGHT_TIMEOUT");
      assert.equal(error.stdout, "browser 'msedge' is not open");
      assert.equal(error.stderr, "partial stderr");
      assert.equal(error.cause, sourceError);
      return true;
    });
  });

  it("maps browser session-not-open diagnostics from stdout or stderr", async function() {
    const diagnostics = [
      { stdout: "Error: browser 'msedge' is not open", stderr: "" },
      { stdout: "", stderr: "Please run open first" }
    ];

    for (const diagnostic of diagnostics) {
      const sourceError = Object.assign(new Error("playwright exited"), { code: 2 });
      const runtime = createPlaywrightRuntime({
        session: pwSessionConfig("doubao"),
        execFile: function(file, args, options, callback) {
          callback(sourceError, diagnostic.stdout, diagnostic.stderr);
        }
      });

      await assert.rejects(runtime.close(), function(error) {
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

  it("does not classify a session diagnostic from the source error message alone", async function() {
    const sourceError = Object.assign(new Error("browser 'msedge' is not open"), { code: 2 });
    const runtime = createPlaywrightRuntime({
      session: pwSessionConfig("doubao"),
      execFile: function(file, args, options, callback) {
        callback(sourceError, "unrelated stdout", "unrelated stderr");
      }
    });

    await assert.rejects(runtime.close(), function(error) {
      assert.equal(error.code, "PLAYWRIGHT_EXEC_FAILED");
      assert.equal(error.message, "Playwright command failed");
      return true;
    });
  });

  it("maps a failed execFile command without hiding its diagnostics", async function() {
    const sourceError = Object.assign(new Error("playwright exited"), { code: 2 });
    const runtime = createPlaywrightRuntime({
      session: pwSessionConfig("doubao"),
      execFile: function(file, args, options, callback) {
        callback(sourceError, "failed stdout", "failed stderr");
      }
    });

    await assert.rejects(runtime.close(), function(error) {
      assert.equal(error.code, "PLAYWRIGHT_EXEC_FAILED");
      assert.equal(error.originalCode, 2);
      assert.equal(error.stdout, "failed stdout");
      assert.equal(error.stderr, "failed stderr");
      assert.equal(error.cause, sourceError);
      return true;
    });
  });

  it("keeps the legacy synchronous pwCmd, pwRun, and runCode APIs working", function() {
    const calls = [];
    const session = pwSessionConfig("legacy");
    const fakeExecSync = function(command, options) {
      calls.push({ command: command, options: options });
      return "### Result\n{\"legacy\":true}\n";
    };

    const command = pwCmd("list", session);
    assert.match(command, /-s=legacy/);
    assert.match(command, new RegExp(session.daemonDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.equal(pwRun("list", { session: session, timeout: 4321, execSync: fakeExecSync }), "### Result\n{\"legacy\":true}\n");
    assert.deepEqual(runCode("return { legacy: true };", {
      session: session,
      timeout: 5432,
      execSync: fakeExecSync
    }), { legacy: true });
    assert.equal(calls.length, 2);
    assert.equal(calls[0].options.timeout, 4321);
    assert.equal(calls[1].options.timeout, 5432);
    assert.equal(calls[1].options.env.PLAYWRIGHT_DAEMON_SESSION_DIR, session.daemonDir);
    assert.match(calls[1].command, /run-code --filename=/);
  });
});
