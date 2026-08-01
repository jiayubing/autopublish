const fs = require("fs");
const path = require("path");
const { execSync, execFile, execFileSync } = require("child_process");

const { DIRS, PW } = require("../../scripts/config");
const { resolvePlaywrightRuntime } = require("../../desktop/services/runtime-diagnostics-service");
const { reportDiagnostic } = require("../diagnostics/diagnostic-producer");
const { quoteArg } = require("./files");

function unavailableError(code, message) {
  var error = new Error(message);
  error.code = code;
  return error;
}

function runtimeResolution() {
  return resolvePlaywrightRuntime({
    appRoot: process.env.AUTO_PUBLISH_APP_ROOT || path.resolve(__dirname, "..", ".."),
    env: process.env,
    packaged: process.env.AUTO_PUBLISH_PACKAGED === "1"
  });
}

function nodeExecPath() {
  var resolved = runtimeResolution();
  if (!resolved.playwrightNode.command) throw unavailableError("PLAYWRIGHT_NODE_UNAVAILABLE", "Playwright Node is unavailable");
  return resolved.playwrightNode.command;
}

// Each Platform Adapter owns its own Platform Session: an isolated daemon
// session name, browser profile directory, daemon directory, and state file.
// Adapters pass a session name (e.g. "lieju", "toutiao") to pwSessionConfig
// and pass the returned context to pwCmd/pwRun/runCode via opts.session.
// Omitting the session context falls back to the shared PW session, so legacy
// callers (e.g. scripts/explore-lieju.js) keep working unchanged.
function pwSessionConfig(name, options) {
  var input = name && typeof name === "object" ? name : Object.assign({}, options || {}, { session: name });
  var session = input.session || PW.session;
  var profileId = input.profileId === undefined ? "default" : String(input.profileId);
  if (!/^[A-Za-z0-9._-]+$/.test(profileId) || profileId === "." || profileId === "..") {
    var profileError = new Error("Playwright profileId is invalid");
    profileError.code = "PLAYWRIGHT_PROFILE_ID_INVALID";
    throw profileError;
  }
  var profileDir = session === PW.session && PW.profileDir ? PW.profileDir : path.join(PW.home, "profiles", session);
  var daemonDir = session === PW.session && PW.daemonDir ? PW.daemonDir : path.join(PW.home, "sessions", session);
  var stateFile = path.join(DIRS.stateDir, session + ".json");
  if (input.profileDir !== undefined) profileDir = input.profileDir;
  if (input.daemonDir !== undefined) daemonDir = input.daemonDir;
  if (input.stateFile !== undefined) stateFile = input.stateFile;
  if (profileId !== "default") {
    profileDir = path.join(profileDir, profileId);
    daemonDir = path.join(daemonDir, profileId);
    stateFile = path.join(DIRS.stateDir, session + "-" + profileId + ".json");
  }
  return { session: session, profileId: profileId, profileDir: profileDir, daemonDir: daemonDir, stateFile: stateFile };
}

function pwEnv(sessionCtx) {
  var env = {};
  Object.keys(process.env).forEach(function(key) {
    env[key] = process.env[key];
  });
  var ctx = sessionCtx || pwSessionConfig();
  env.PLAYWRIGHT_DAEMON_SESSION_DIR = ctx.daemonDir;
  env.BROWSER_CHANNEL = env.BROWSER_CHANNEL || PW.browserChannel || "msedge";
  return env;
}

function pwCmd(args, sessionCtx) {
  var ctx = sessionCtx || pwSessionConfig();
  var executable = playwrightExecutable();
  var launch = [executable.file].concat(executable.prefix).map(quoteArg).join(" ");
  return `chcp 65001 > nul && set PLAYWRIGHT_DAEMON_SESSION_DIR=${ctx.daemonDir} && ${launch} -s=${ctx.session} ${args}`;
}

function pwRun(args, opts) {
  var options = opts || {};
  var timeout = options.timeout || 30000;
  var sessionCtx = options.session || null;
  reportDiagnostic({
    code: "PLAYWRIGHT_COMMAND_STARTED",
    module: "core-playwright",
    category: "transport",
    operationId: "playwright-command",
    metadata: { action: "invoke" },
  });
  return (options.execSync || execSync)(pwCmd(args, sessionCtx), {
    encoding: "utf-8",
    timeout: timeout,
    env: pwEnv(sessionCtx)
  }).toString();
}

function extractResult(raw) {
  var text = String(raw || "");
  var marker = "### Result";
  var start = text.indexOf(marker);
  if (start === -1) return text.trim();
  var rest = text.slice(start + marker.length);
  var nextIdx = rest.indexOf("###");
  var block = nextIdx === -1 ? rest : rest.slice(0, nextIdx);
  var line = block.split(/\r?\n/).map(function(s){return s.trim();}).filter(Boolean)[0] || "";
  if (!line) return text.trim();
  try { return JSON.parse(line); } catch (e) { return line; }
}

function runCode(jsCode, opts) {
  var options = opts || {};
  if (typeof options === "number") {
    // legacy signature: runCode(jsCode, timeout)
    options = { timeout: options };
  }
  var sessionCtx = options.session || null;
  var filePath = path.join(DIRS.tmpDir, "run-" + Date.now() + ".js");
  var wrapped = "async page => {\n" + jsCode + "\n}";
  fs.mkdirSync(DIRS.tmpDir, { recursive: true });
  fs.writeFileSync(filePath, wrapped, "utf-8");
  try {
    return extractResult(pwRun("run-code --filename=" + quoteArg(filePath), {
      timeout: options.timeout || 60000,
      session: sessionCtx,
      execSync: options.execSync
    }));
  } finally {
    try { fs.unlinkSync(filePath); } catch (e) {}
  }
}

function execFileAsync(file, args, options, runner) {
  return new Promise(function(resolve, reject) {
    (runner || execFile)(file, args, options, function(error, stdout, stderr) {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout: stdout, stderr: stderr });
    });
  });
}

function mapRuntimeError(error) {
  var source = error instanceof Error ? error : new Error(String(error || "Playwright command failed"));
  if (source.code === "PLAYWRIGHT_NODE_UNAVAILABLE" || source.code === "PLAYWRIGHT_CLI_UNAVAILABLE" || source.code === "BROWSER_CHANNEL_UNAVAILABLE") {
    var unavailable = new Error(source.code === "PLAYWRIGHT_NODE_UNAVAILABLE" ? "Playwright Node is unavailable" :
      source.code === "PLAYWRIGHT_CLI_UNAVAILABLE" ? "Playwright CLI is unavailable" : "Browser channel is unavailable");
    unavailable.code = source.code;
    Object.defineProperty(unavailable, "cause", { value: source, enumerable: false, writable: true, configurable: true });
    return unavailable;
  }
  var timedOut = source.code === "ETIMEDOUT" || (source.killed && (source.signal === "SIGTERM" || source.signal === "SIGKILL"));
  var stdout = source.stdout || "";
  var stderr = source.stderr || "";
  var diagnostics = String(stdout) + "\n" + String(stderr);
  var sessionNotOpen = !timedOut && (
    /browser\s+['"][^'"]+['"]\s+is\s+not\s+open/i.test(diagnostics) ||
    /please\s+run\s+open\s+first/i.test(diagnostics)
  );
  var mapped = new Error(
    timedOut ? "Playwright command timed out" :
      sessionNotOpen ? "Playwright session is not open" : "Playwright command failed"
  );
  mapped.code = timedOut ? "PLAYWRIGHT_TIMEOUT" :
    sessionNotOpen ? "PLAYWRIGHT_SESSION_NOT_OPEN" : "PLAYWRIGHT_EXEC_FAILED";
  Object.defineProperty(mapped, "cause", {
    value: source,
    enumerable: false,
    writable: true,
    configurable: true
  });
  mapped.originalCode = source.code;
  Object.defineProperty(mapped, "stdout", {
    value: stdout,
    enumerable: false,
    writable: true,
    configurable: true
  });
  Object.defineProperty(mapped, "stderr", {
    value: stderr,
    enumerable: false,
    writable: true,
    configurable: true
  });
  return mapped;
}

function windowsNpmCliEntrypoint(cli) {
  if (process.platform !== "win32" || !cli) return null;
  var candidates = [cli];
  if (!path.isAbsolute(cli) && !path.win32.isAbsolute(cli) && !cli.includes("\\") && !cli.includes("/")) {
    try {
      var located = execFileSync("where.exe", [cli], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      candidates = candidates.concat(String(located).split(/\r?\n/).map(function(value) { return value.trim(); }).filter(Boolean));
    } catch (_) {}
  }
  for (var i = 0; i < candidates.length; i += 1) {
    var candidate = candidates[i];
    if (/\.js$/i.test(candidate)) return fs.existsSync(candidate) ? candidate : null;
    if (!/\.(?:cmd|bat)$/i.test(candidate) && path.extname(candidate)) continue;
    var entrypoint = path.join(path.dirname(candidate), "node_modules", "@playwright", "cli", "playwright-cli.js");
    if (fs.existsSync(entrypoint)) return entrypoint;
  }
  return null;
}

function playwrightExecutable(cliOverride) {
  var resolved = runtimeResolution();
  var cli = String(cliOverride || resolved.playwrightCli.command || "");
  if (!cli) throw unavailableError("PLAYWRIGHT_CLI_UNAVAILABLE", "Playwright CLI is unavailable");
  var node = nodeExecPath();
  if (/\.js$/i.test(cli)) return { file: node, prefix: [cli] };
  var windowsEntrypoint = windowsNpmCliEntrypoint(cli);
  if (windowsEntrypoint) return { file: node, prefix: [windowsEntrypoint] };
  return { file: cli || "playwright-cli", prefix: [] };
}

function runtimeArgs(sessionCtx, commandArgs) {
  var ctx = sessionCtx || pwSessionConfig();
  return ["-s=" + ctx.session].concat(commandArgs);
}

function createPlaywrightRuntime(options) {
  var opts = options || {};
  var sessionCtx = opts.session || pwSessionConfig();
  var execFileRunner = opts.execFile || execFile;
  var timeout = opts.timeout || 60000;
  var tempDir = opts.tempDir || DIRS.tmpDir;

  async function invoke(commandArgs, commandTimeout) {
    try {
      var executable = playwrightExecutable(opts.playwrightCli);
      var result = await execFileAsync(
        executable.file,
        executable.prefix.concat(runtimeArgs(sessionCtx, commandArgs)),
        { encoding: "utf8", timeout: commandTimeout || timeout, env: pwEnv(sessionCtx) },
        execFileRunner
      );
      return extractResult(result.stdout);
    } catch (error) {
      throw mapRuntimeError(error);
    }
  }

  async function open(input) {
    var value = input || {};
    var url = String(value.url || "");
    if (!url) throw new Error("Playwright open requires a URL");
    var args = ["open", url];
    if (value.browser) args.push("--browser=" + String(value.browser));
    if (value.headed !== false) args.push("--headed");
    if (value.persistent !== false) args.push("--persistent");
    if (sessionCtx.profileDir) args.push("--profile=" + sessionCtx.profileDir);
    return invoke(args, value.timeoutMs || value.timeout);
  }

  async function evaluate(input) {
    var value = input || {};
    var script = String(value.script || "");
    if (!script) throw new Error("Playwright evaluate requires a script");
    fs.mkdirSync(tempDir, { recursive: true });
    var filePath = path.join(tempDir, "runtime-evaluate-" + Date.now() + "-" + Math.random().toString(16).slice(2) + ".js");
    fs.writeFileSync(filePath, "async page => {\n" + script + "\n}", "utf8");
    try {
      return await invoke(["run-code", "--filename=" + filePath], value.timeoutMs || value.timeout);
    } finally {
      try { fs.unlinkSync(filePath); } catch (_) {}
    }
  }

  async function screenshot(input) {
    var value = input || {};
    var filePath = String(value.path || "");
    if (!filePath) throw new Error("Playwright screenshot requires a path");
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    return invoke(["screenshot", "--filename=" + filePath], value.timeoutMs || value.timeout);
  }

  async function close(input) {
    return invoke(["close"], input && (input.timeoutMs || input.timeout));
  }

  return { open: open, evaluate: evaluate, screenshot: screenshot, close: close };
}

module.exports = { pwSessionConfig, pwEnv, pwCmd, pwRun, runCode, createPlaywrightRuntime };
