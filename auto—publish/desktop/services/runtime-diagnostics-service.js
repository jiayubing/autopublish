const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const childProcess = require("node:child_process");

function existing(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readApplicationTools(appRoot, options) {
  const opts = options || {};
  const paths = opts.paths || {};
  const filename = opts.applicationToolsPath ||
    (paths.config && path.join(paths.config, "runtime-tools.json")) ||
    path.join(appRoot, "config", "runtime-tools.json");
  try {
    const value = JSON.parse(fs.readFileSync(filename, "utf8"));
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch (_) {
    return {};
  }
}

function regularFile(filename) {
  if (!filename || typeof filename !== "string") return false;
  try {
    const stat = fs.lstatSync(filename);
    return stat.isFile() && !stat.isSymbolicLink();
  } catch (_) {
    return false;
  }
}

function defaultPathLookup(command) {
  try {
    const lookup = process.platform === "win32" ? "where.exe" : "which";
    return childProcess.execFileSync(lookup, [command], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
      .trim().split(/\r?\n/).filter(Boolean)[0] || null;
  } catch (_) {
    return null;
  }
}

function configuredValue(config, applicationValues, name, envName) {
  return existing(config[name]) || existing(applicationValues && applicationValues[envName]) || null;
}

function resolveExecutable(options) {
  const opts = options || {};
  const configured = configuredValue(opts.config || {}, opts.applicationValues || {}, opts.configName, opts.envName);
  if (configured && regularFile(configured)) return { command: configured, source: "application-config" };
  const environment = existing((opts.env || process.env)[opts.envName]);
  if (environment && regularFile(environment)) return { command: environment, source: "environment" };
  const bundled = (opts.bundled || []).find(regularFile);
  if (bundled) return { command: bundled, source: "bundled" };
  if (!opts.packaged && opts.pathCommand) {
    const fromPath = existing((opts.pathLookup || defaultPathLookup)(opts.pathCommand));
    if (fromPath && regularFile(fromPath)) return { command: fromPath, source: "PATH" };
  }
  return { command: null, source: null };
}

function resolveBrowserChannel(options) {
  const opts = options || {};
  const config = opts.config || {};
  const env = opts.env || process.env;
  const configured = configuredValue(config, opts.applicationValues || {}, "browserChannel", "BROWSER_CHANNEL");
  const channel = configured || existing(env.BROWSER_CHANNEL) || "msedge";
  if (!/^[A-Za-z0-9._-]+$/.test(channel)) {
    return { channel: null, source: null, configured: false, errorCode: "BROWSER_CHANNEL_INVALID" };
  }
  return {
    channel: channel,
    source: configured ? "application-config" : (existing(env.BROWSER_CHANNEL) ? "environment" : "default"),
    configured: true
  };
}

function resolvePlaywrightRuntime(options) {
  const opts = options || {};
  const appRoot = path.resolve(opts.appRoot || process.env.AUTO_PUBLISH_APP_ROOT || path.resolve(__dirname, "..", ".."));
  const config = opts.applicationTools || readApplicationTools(appRoot, opts);
  const env = opts.env || process.env;
  const packaged = opts.packaged === undefined ? env.AUTO_PUBLISH_PACKAGED === "1" : opts.packaged === true;
  const nodeBundled = [path.join(appRoot, "tools", "node", "node.exe")];
  const cliBundled = [path.join(appRoot, "node_modules", "@playwright", "cli", "playwright-cli.js")];
  if (!packaged) nodeBundled.push(path.join(appRoot, "build", "runtime-tools", "node", "node.exe"));
  const playwrightNode = resolveExecutable({
    config: config,
    applicationValues: opts.applicationValues,
    configName: "nodeExecPath",
    envName: "AUTO_PUBLISH_NODE_EXEC_PATH",
    env: env,
    bundled: nodeBundled,
    pathCommand: "node",
    pathLookup: opts.pathLookup,
    packaged: packaged
  });
  const playwrightCli = resolveExecutable({
    config: config,
    applicationValues: opts.applicationValues,
    configName: "playwrightCliJs",
    envName: "PLAYWRIGHT_CLI_JS",
    env: env,
    bundled: cliBundled,
    pathCommand: "playwright-cli",
    pathLookup: opts.pathLookup,
    packaged: packaged
  });
  const hepanPython = resolveExecutable({
    config: config,
    applicationValues: opts.applicationValues,
    configName: "hepanPython",
    envName: "HEPAN_PYTHON",
    env: env,
    bundled: [path.join(appRoot, "tools", "python", "python.exe")],
    pathCommand: "python",
    pathLookup: opts.pathLookup,
    packaged: packaged
  });
  return {
    appRoot: appRoot,
    packaged: packaged,
    playwrightNode: playwrightNode,
    playwrightCli: playwrightCli,
    browserChannel: resolveBrowserChannel({ config: config, applicationValues: opts.applicationValues, env: env }),
    hepanPython: hepanPython
  };
}

function hasBundledMammoth(appRoot, override) {
  if (override !== undefined) return override === true;
  try {
    require.resolve("mammoth", { paths: [appRoot] });
    return true;
  } catch (_) {
    return false;
  }
}

function readBuildInfo(appRoot, environment) {
  const env = environment || process.env;
  let value = {};
  try { value = JSON.parse(fs.readFileSync(path.join(appRoot, "config", "build-info.json"), "utf8")); } catch (_) {
    try { value = JSON.parse(fs.readFileSync(path.join(appRoot, "build-info.json"), "utf8")); } catch (_) {}
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) value = {};
  let version = existing(value.version);
  if (!version) {
    try { version = existing(JSON.parse(fs.readFileSync(path.join(appRoot, "package.json"), "utf8")).version); } catch (_) {}
  }
  return {
    version: version || "unknown",
    commit: existing(value.commit) || existing(env.AUTO_PUBLISH_COMMIT_SHA) || "unknown",
    dirty: value.dirty === true || env.AUTO_PUBLISH_DIRTY === "1"
  };
}

function capability(state, source, errorCode, lastCheckedAt) {
  return {
    state: state,
    source: source || null,
    errorCode: errorCode || null,
    lastCheckedAt: lastCheckedAt || null
  };
}

function diagnosticErrors(tools, capabilities) {
  const errors = [];
  if (!tools.playwrightNode.command) errors.push({ code: "PLAYWRIGHT_NODE_UNAVAILABLE", message: "Bundled Playwright Node is unavailable" });
  if (!tools.playwrightCli.command) errors.push({ code: "PLAYWRIGHT_CLI_UNAVAILABLE", message: "Bundled Playwright CLI is unavailable" });
  if (!tools.browserChannel.configured) errors.push({ code: tools.browserChannel.errorCode || "BROWSER_CHANNEL_INVALID", message: "Browser channel configuration is invalid" });
  if (capabilities.browserChannel.state === "unavailable") errors.push({ code: capabilities.browserChannel.errorCode || "BROWSER_CHANNEL_UNAVAILABLE", message: "Browser channel is unavailable" });
  if (capabilities.docx.state === "unavailable") errors.push({ code: "DOCX_RUNTIME_UNAVAILABLE", message: "Built-in DOCX parsing is unavailable" });
  return errors;
}

function diagnosticWarnings(tools, capabilities) {
  const warnings = [];
  if (capabilities.browserChannel.state === "not_checked") warnings.push({ code: "BROWSER_CHANNEL_NOT_CHECKED", message: "Browser channel has not been checked in this process" });
  if (!tools.hepanPython.command) warnings.push({ code: "HEPAN_PYTHON_UNAVAILABLE", message: "Hepan is not configured; only Hepan publishing is affected" });
  return warnings;
}

function safeTool(tool) {
  const available = Boolean(tool && (tool.command || tool.available));
  return { state: available ? "ready" : "unavailable", available: available, source: tool && tool.source || null, errorCode: available ? null : null, lastCheckedAt: null };
}

function safeDiagnostics(diagnostics) {
  const source = diagnostics || {};
  const tools = source.tools || {};
  const capabilities = source.capabilities || {};
  const browser = capabilities.browserChannel || source.browserChannel || {};
  const safeBrowser = {
    channel: browser.channel || null,
    configured: browser.configured === true,
    state: browser.state || (browser.probed ? "ready" : "not_checked"),
    probed: browser.state === "ready" || browser.probed === true,
    source: browser.source || null,
    errorCode: browser.errorCode || null,
    lastCheckedAt: browser.lastCheckedAt || null
  };
  const safeCapabilities = {
    playwrightNode: capabilities.playwrightNode || safeTool(tools.playwrightNode),
    playwrightCli: capabilities.playwrightCli || safeTool(tools.playwrightCli),
    browserChannel: safeBrowser,
    docx: capabilities.docx || capability("unavailable", "bundled", "DOCX_RUNTIME_UNAVAILABLE"),
    hepan: capabilities.hepan || capability("optional_unconfigured", "optional", "HEPAN_PYTHON_UNAVAILABLE")
  };
  return {
    ok: source.ok === true,
    buildInfo: { version: source.buildInfo && source.buildInfo.version || "unknown", commit: source.buildInfo && source.buildInfo.commit || "unknown", dirty: Boolean(source.buildInfo && source.buildInfo.dirty === true) },
    capabilities: safeCapabilities,
    browserChannel: safeBrowser,
    tools: {
      playwrightNode: safeCapabilities.playwrightNode,
      playwrightCli: safeCapabilities.playwrightCli,
      hepanPython: safeCapabilities.hepan
    },
    errors: Array.isArray(source.errors) ? source.errors.map(function(error) { return { code: error.code, message: error.message }; }) : [],
    warnings: Array.isArray(source.warnings) ? source.warnings.map(function(warning) { return { code: warning.code, message: warning.message }; }) : []
  };
}

function safeProbeError(code) {
  const messages = {
    PLAYWRIGHT_NODE_UNAVAILABLE: "Bundled Playwright Node is unavailable",
    PLAYWRIGHT_CLI_UNAVAILABLE: "Bundled Playwright CLI is unavailable",
    BROWSER_CHANNEL_UNAVAILABLE: "Browser channel is unavailable; check Edge or Chrome",
    PLAYWRIGHT_TIMEOUT: "Browser self-check timed out",
    PLAYWRIGHT_EXEC_FAILED: "Browser self-check failed"
  };
  const error = new Error(messages[code] || messages.PLAYWRIGHT_EXEC_FAILED);
  error.code = code;
  return error;
}

function execFileAsync(executor, file, args, options) {
  return new Promise(function(resolve, reject) {
    executor(file, args, options, function(error, stdout, stderr) {
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

function createRuntimeDiagnosticsService(options) {
  const opts = options || {};
  const workspaceValue = opts.workspaceRoot || process.env.AUTO_PUBLISH_WORKSPACE;
  const appValue = opts.appRoot || process.env.AUTO_PUBLISH_APP_ROOT;
  if (typeof workspaceValue !== "string" || !workspaceValue.trim()) throw new Error("workspaceRoot is required");
  if (typeof appValue !== "string" || !appValue.trim()) throw new Error("appRoot is required");
  const workspaceRoot = path.resolve(workspaceValue);
  const appRoot = path.resolve(appValue);
  const execFile = opts.execFile || childProcess.execFile;
  let browserProbe = { channel: null, state: "not_checked", lastCheckedAt: null, errorCode: null };

  function currentBrowserCapability(browserChannel) {
    if (!browserChannel.configured) {
      browserProbe = { channel: null, state: "unavailable", lastCheckedAt: null, errorCode: browserChannel.errorCode || "BROWSER_CHANNEL_INVALID" };
      return Object.assign({}, capability("unavailable", browserChannel.source, browserChannel.errorCode || "BROWSER_CHANNEL_INVALID"), browserChannel);
    }
    if (browserProbe.channel !== browserChannel.channel) {
      browserProbe = { channel: browserChannel.channel, state: "not_checked", lastCheckedAt: null, errorCode: null };
    }
    return Object.assign({}, browserProbe, browserChannel);
  }

  function diagnose() {
    const tools = resolvePlaywrightRuntime(Object.assign({}, opts, { appRoot: appRoot }));
    const capabilities = {
      playwrightNode: capability(tools.playwrightNode.command ? "ready" : "unavailable", tools.playwrightNode.source, tools.playwrightNode.command ? null : "PLAYWRIGHT_NODE_UNAVAILABLE"),
      playwrightCli: capability(tools.playwrightCli.command ? "ready" : "unavailable", tools.playwrightCli.source, tools.playwrightCli.command ? null : "PLAYWRIGHT_CLI_UNAVAILABLE"),
      browserChannel: currentBrowserCapability(tools.browserChannel),
      docx: capability(hasBundledMammoth(appRoot, opts.docxAvailable) ? "ready" : "unavailable", "bundled", hasBundledMammoth(appRoot, opts.docxAvailable) ? null : "DOCX_RUNTIME_UNAVAILABLE"),
      hepan: capability(tools.hepanPython.command ? "ready" : "optional_unconfigured", tools.hepanPython.source || "optional", tools.hepanPython.command ? null : "HEPAN_PYTHON_UNAVAILABLE")
    };
    const errors = diagnosticErrors(tools, capabilities);
    const warnings = diagnosticWarnings(tools, capabilities);
    return { ok: errors.length === 0, workspaceRoot: workspaceRoot, appRoot: appRoot, buildInfo: readBuildInfo(appRoot, opts.env), tools: tools, capabilities: capabilities, errors: errors, warnings: warnings };
  }

  async function probeBrowser() {
    const diagnostics = diagnose();
    const node = diagnostics.tools.playwrightNode.command;
    const cli = diagnostics.tools.playwrightCli.command;
    const browser = diagnostics.tools.browserChannel.channel;
    if (!node) throw safeProbeError("PLAYWRIGHT_NODE_UNAVAILABLE");
    if (!cli) throw safeProbeError("PLAYWRIGHT_CLI_UNAVAILABLE");
    if (!browser) throw safeProbeError("BROWSER_CHANNEL_UNAVAILABLE");
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "autopublish-runtime-self-check-"));
    const daemonDirectory = path.join(temporaryRoot, "daemon");
    const profileDirectory = path.join(temporaryRoot, "profile");
    const env = Object.assign({}, process.env, {
      PATH: process.env.PATH || "",
      PLAYWRIGHT_DAEMON_SESSION_DIR: daemonDirectory,
      AUTO_PUBLISH_NODE_EXEC_PATH: node,
      PLAYWRIGHT_CLI_JS: cli,
      BROWSER_CHANNEL: browser
    });
    let opened = false;
    async function invoke(args, timeout) {
      try {
        return await execFileAsync(execFile, node, [cli].concat(args), { encoding: "utf8", timeout: timeout || 30000, windowsHide: true, env: env });
      } catch (error) {
        const text = String(error && (error.stdout || "")) + "\n" + String(error && (error.stderr || ""));
        if (error && (error.code === "ETIMEDOUT" || error.killed)) throw safeProbeError("PLAYWRIGHT_TIMEOUT");
        if (/browser|channel|executable|msedge|chrome/i.test(text) && /not found|does not exist|unable|launch|executable/i.test(text)) throw safeProbeError("BROWSER_CHANNEL_UNAVAILABLE");
        throw safeProbeError("PLAYWRIGHT_EXEC_FAILED");
      }
    }
    try {
      await invoke(["-s=runtime-self-check", "open", "about:blank", "--browser=" + browser, "--headed", "--persistent", "--profile=" + profileDirectory], 60000);
      opened = true;
      await invoke(["-s=runtime-self-check", "list"], 30000);
      await invoke(["-s=runtime-self-check", "close"], 30000);
      opened = false;
      browserProbe = { channel: browser, state: "ready", lastCheckedAt: new Date().toISOString(), errorCode: null };
      return { ok: true, browserChannel: browser, session: "runtime-self-check", capability: safeDiagnostics(diagnose()).browserChannel };
    } catch (error) {
      const safe = error && error.code ? error : safeProbeError("PLAYWRIGHT_EXEC_FAILED");
      browserProbe = { channel: browser, state: "unavailable", lastCheckedAt: new Date().toISOString(), errorCode: safe.code };
      throw safe;
    } finally {
      if (opened) {
        try { await invoke(["-s=runtime-self-check", "close"], 10000); } catch (_) {}
      }
      fs.rmSync(temporaryRoot, { recursive: true, force: true });
    }
  }

  return {
    diagnose: diagnose,
    probeBrowser: probeBrowser,
    resolvePlaywrightRuntime: function() { return resolvePlaywrightRuntime(Object.assign({}, opts, { appRoot: appRoot })); },
    safeDiagnostics: function() { return safeDiagnostics(diagnose()); }
  };
}

module.exports = { createRuntimeDiagnosticsService, resolvePlaywrightRuntime, safeDiagnostics };
