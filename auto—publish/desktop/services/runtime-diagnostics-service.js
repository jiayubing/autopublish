const fs = require("fs");
const path = require("path");

function readWorkspaceTools(workspaceRoot) {
  try {
    return JSON.parse(fs.readFileSync(path.join(workspaceRoot, "config", "runtime-tools.json"), "utf8"));
  } catch (_) { return {}; }
}

function existing(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function createRuntimeDiagnosticsService(options) {
  var opts = options || {};
  var workspaceRoot = path.resolve(opts.workspaceRoot || process.env.AUTO_PUBLISH_WORKSPACE || process.cwd());
  var appRoot = path.resolve(opts.appRoot || process.env.AUTO_PUBLISH_APP_ROOT || path.resolve(__dirname, "..", ".."));
  var env = opts.env || process.env;
  var pathLookup = opts.pathLookup || function(command) {
    try { return require("child_process").execFileSync(process.platform === "win32" ? "where" : "which", [command], { encoding: "utf8" }).trim().split(/\r?\n/)[0] || null; } catch (_) { return null; }
  };
  var configured = readWorkspaceTools(workspaceRoot);

  function resolve(name, envName, bundledRelative, pathCommand) {
    var value = existing(configured[name]);
    if (value) return { command: value, source: "workspace-config" };
    value = existing(env[envName]);
    if (value) return { command: value, source: "environment" };
    var bundled = bundledRelative && path.join(appRoot, bundledRelative);
    if (bundled && fs.existsSync(bundled)) return { command: bundled, source: "bundled" };
    value = pathCommand && pathLookup(pathCommand);
    if (value) return { command: value, source: "PATH" };
    return { command: null, source: null };
  }

  function diagnose() {
    var tools = {
      markitdown: resolve("markitdownCmd", "MARKITDOWN_CMD", path.join("tools", "markitdown", "markitdown.cmd"), "markitdown"),
      playwright: resolve("playwrightCliJs", "PLAYWRIGHT_CLI_JS", path.join("tools", "playwright-cli", "playwright-cli.js"), "playwright-cli"),
      hepanPython: resolve("hepanPython", "HEPAN_PYTHON", path.join("tools", "python", "python.exe"), "python")
    };
    var errors = [];
    if (!tools.markitdown.command) errors.push({ code: "MARKITDOWN_UNAVAILABLE", message: "MarkItDown is unavailable. Configure MARKITDOWN_CMD or config/runtime-tools.json." });
    if (!tools.playwright.command) errors.push({ code: "PLAYWRIGHT_UNAVAILABLE", message: "Playwright CLI is unavailable. Configure PLAYWRIGHT_CLI_JS or config/runtime-tools.json." });
    if (!tools.hepanPython.command) errors.push({ code: "HEPAN_PYTHON_UNAVAILABLE", message: "Python is unavailable for Hepan. Configure HEPAN_PYTHON or config/runtime-tools.json." });
    return { ok: errors.length === 0, workspaceRoot: workspaceRoot, tools: tools, errors: errors };
  }

  return { diagnose: diagnose };
}

module.exports = { createRuntimeDiagnosticsService };
