const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { createRuntimeDiagnosticsService } = require("../desktop/services/runtime-diagnostics-service");

describe("runtime diagnostics", function() {
  let workspace;
  let appRoot;

  beforeEach(function() {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), "runtime-diagnostics-workspace-"));
    appRoot = fs.mkdtempSync(path.join(os.tmpdir(), "runtime-diagnostics-app-"));
    fs.mkdirSync(path.join(workspace, "config"), { recursive: true });
  });
  afterEach(function() { fs.rmSync(workspace, { recursive: true, force: true }); fs.rmSync(appRoot, { recursive: true, force: true }); });

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
});
