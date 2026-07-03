const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

function read(file) {
  return fs.readFileSync(path.resolve(__dirname, "..", file), "utf8");
}

describe("desktop alpha packaging", function() {
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
});