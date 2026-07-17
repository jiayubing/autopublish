const fs = require("node:fs");
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
  if (!/^[A-Za-z0-9._-]+$/.test(channel)) return { channel: null, source: null, available: false };
  return { channel: channel, source: configured ? "application-config" : (existing(env.BROWSER_CHANNEL) ? "environment" : "default"), available: true, probed: false };
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
  const result = {
    appRoot: appRoot,
    packaged: packaged,
    playwrightNode: playwrightNode,
    playwrightCli: playwrightCli,
    browserChannel: resolveBrowserChannel({ config: config, applicationValues: opts.applicationValues, env: env }),
    markitdown: resolveExecutable({
      config: config,
      applicationValues: opts.applicationValues,
      configName: "markitdownCmd",
      envName: "MARKITDOWN_CMD",
      env: env,
      bundled: [path.join(appRoot, "tools", "markitdown", "markitdown.cmd")],
      pathCommand: "markitdown",
      pathLookup: opts.pathLookup,
      packaged: packaged
    }),
    hepanPython: resolveExecutable({
      config: config,
      applicationValues: opts.applicationValues,
      configName: "hepanPython",
      envName: "HEPAN_PYTHON",
      env: env,
      bundled: [path.join(appRoot, "tools", "python", "python.exe")],
      pathCommand: "python",
      pathLookup: opts.pathLookup,
      packaged: packaged
    })
  };
  // Keep the old internal property for callers that only need the CLI while
  // exposing the new capability-level name to diagnostics and UI code.
  result.playwright = result.playwrightCli;
  return result;
}

function diagnosticErrors(tools) {
  const errors = [];
  if (!tools.playwrightNode.command) errors.push({ code: "PLAYWRIGHT_NODE_UNAVAILABLE", message: "内置 Playwright Node 不可用，请重新安装应用或检查应用级运行时配置。" });
  if (!tools.playwrightCli.command) errors.push({ code: "PLAYWRIGHT_CLI_UNAVAILABLE", message: "内置 Playwright CLI 不可用，请重新安装应用或检查应用级运行时配置。" });
  if (!tools.browserChannel.available) errors.push({ code: "BROWSER_CHANNEL_UNAVAILABLE", message: "浏览器通道配置不可用，请选择 msedge 或可用的 Chrome 通道。" });
  if (!tools.markitdown.command) errors.push({ code: "MARKITDOWN_UNAVAILABLE", message: "MarkItDown 不可用，纯 Markdown 流程仍可继续。" });
  if (!tools.hepanPython.command) errors.push({ code: "HEPAN_PYTHON_UNAVAILABLE", message: "Hepan Python 不可用，豆包和普通文章流程仍可继续。" });
  return errors;
}

function safeDiagnostics(diagnostics) {
  const source = diagnostics || {};
  const tools = source.tools || {};
  function safeTool(tool) {
    return { available: Boolean(tool && (tool.command || tool.available)), source: tool && tool.source || null };
  }
  return {
    ok: source.ok === true,
    browserChannel: tools.browserChannel ? {
      channel: tools.browserChannel.channel || null,
      source: tools.browserChannel.source || null,
      available: tools.browserChannel.available === true,
      probed: tools.browserChannel.probed === true
    } : null,
    tools: {
      playwrightNode: safeTool(tools.playwrightNode),
      playwrightCli: safeTool(tools.playwrightCli),
      markitdown: safeTool(tools.markitdown),
      hepanPython: safeTool(tools.hepanPython)
    },
    errors: Array.isArray(source.errors) ? source.errors.map(function(error) { return { code: error.code, message: error.message }; }) : []
  };
}

function createRuntimeDiagnosticsService(options) {
  const opts = options || {};
  const workspaceValue = opts.workspaceRoot || process.env.AUTO_PUBLISH_WORKSPACE;
  const appValue = opts.appRoot || process.env.AUTO_PUBLISH_APP_ROOT;
  if (typeof workspaceValue !== "string" || !workspaceValue.trim()) throw new Error("workspaceRoot is required");
  if (typeof appValue !== "string" || !appValue.trim()) throw new Error("appRoot is required");
  const workspaceRoot = path.resolve(workspaceValue);
  const appRoot = path.resolve(appValue);

  function diagnose() {
    const tools = resolvePlaywrightRuntime(Object.assign({}, opts, { appRoot: appRoot }));
    const errors = diagnosticErrors(tools);
    return { ok: errors.length === 0, workspaceRoot: workspaceRoot, appRoot: appRoot, tools: tools, errors: errors };
  }

  return { diagnose: diagnose, resolvePlaywrightRuntime: function() { return resolvePlaywrightRuntime(Object.assign({}, opts, { appRoot: appRoot })); }, safeDiagnostics: function() { return safeDiagnostics(diagnose()); } };
}

module.exports = { createRuntimeDiagnosticsService, resolvePlaywrightRuntime, safeDiagnostics };
