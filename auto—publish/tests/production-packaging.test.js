const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const {
  createRendererSmokeProbeSource,
} = require("../desktop/packaging/renderer-smoke-probe");

describe("production packaging contract", function () {
  it("inherits alpha boundaries while requiring signed ASAR production artifacts", function () {
    const config = fs.readFileSync(
      path.resolve(__dirname, "..", "electron-builder.production.yml"),
      "utf8",
    );
    assert.match(config, /extends:\s*\.\/electron-builder\.alpha\.yml/);
    assert.match(config, /^asar:\s*true$/m);
    assert.match(config, /forceCodeSigning:\s*true/);
    assert.match(config, /certificateFile:\s*"\$\{env\.WIN_CSC_LINK\}"/);
    assert.doesNotMatch(config, /asarUnpack:/);
  });

  it("provides an explicit packaged Electron smoke mode", function () {
    const main = fs.readFileSync(
      path.resolve(__dirname, "..", "desktop", "main.js"),
      "utf8",
    );
    assert.match(main, /--offline-packaging-smoke/);
    assert.match(main, /did-finish-load/);
    assert.match(main, /createRendererSmokeProbeSource/);
  });

  it("requires both preload and a mounted renderer root", async function () {
    const source = createRendererSmokeProbeSource({
      timeoutMs: 1,
      intervalMs: 1,
    });
    const preloadOnly = await vm.runInNewContext(source, {
      window: { desktopConsole: {} },
      document: {
        getElementById: () => ({ childElementCount: 0 }),
      },
      Date,
      Promise,
      setTimeout,
    });
    assert.deepEqual({ ...preloadOnly }, { preload: true, renderer: false });

    const mounted = await vm.runInNewContext(source, {
      window: { desktopConsole: {} },
      document: {
        getElementById: () => ({ childElementCount: 1 }),
      },
      Date,
      Promise,
      setTimeout,
    });
    assert.deepEqual({ ...mounted }, { preload: true, renderer: true });
  });
});
