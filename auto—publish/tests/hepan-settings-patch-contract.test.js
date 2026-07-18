const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createHepanSettingsAdapter, HEPAN_SITE_ORIGIN } = require("../desktop/services/platform-settings/hepan-settings-adapter");
const { createPlatformSettingsService } = require("../desktop/services/platform-settings-service");

function tempDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "auto-publish-hepan-settings-patch-"));
}

function createStore(initial) {
  let value = initial ? Object.assign({}, initial) : null;
  const writes = [];
  return {
    writes,
    read: () => value && Object.assign({}, value),
    write: (next) => {
      value = Object.assign({}, next);
      writes.push(Object.assign({}, value));
      return Object.assign({}, value);
    },
    clear: () => {
      const existed = Boolean(value);
      value = null;
      return { cleared: existed };
    }
  };
}

function createFixture(options) {
  const values = options || {};
  const root = tempDirectory();
  const fixtureDir = path.join(root, "fixtures");
  const vendorDir = path.join(fixtureDir, "vendor-existing");
  const paths = {
    existingPython: path.join(fixtureDir, "python-existing.exe"),
    replacementPython: path.join(fixtureDir, "python-replacement.exe"),
    existingCookieFile: path.join(fixtureDir, "cookie-existing.txt"),
    environmentPython: path.join(fixtureDir, "python-environment.exe"),
    environmentCookieFile: path.join(fixtureDir, "cookie-environment.txt"),
    environmentVendorDir: path.join(fixtureDir, "vendor-environment")
  };
  fs.mkdirSync(vendorDir, { recursive: true });
  fs.mkdirSync(paths.environmentVendorDir, { recursive: true });
  fs.writeFileSync(paths.existingPython, "fixture python existing", "utf8");
  fs.writeFileSync(paths.replacementPython, "fixture python replacement", "utf8");
  fs.writeFileSync(paths.environmentPython, "fixture python environment", "utf8");
  fs.writeFileSync(paths.existingCookieFile, "fixture cookie file", "utf8");
  fs.writeFileSync(paths.environmentCookieFile, "fixture environment cookie file", "utf8");

  const existingCookie = "fixture-cookie-existing=secret-value";
  const initial = {
    pythonPath: paths.existingPython,
    cookie: existingCookie,
    categoryId: 121,
    vendorDir,
    siteOrigin: HEPAN_SITE_ORIGIN
  };
  const store = createStore(initial);
  const commands = [];
  const baseAdapter = createHepanSettingsAdapter({
    localStateRoot: path.join(root, "local-state"),
    runCommand: async (command, args, commandOptions) => {
      commands.push({ command, args: Array.from(args), commandOptions: commandOptions || {} });
      if (args.includes("--version")) return { status: 0, stdout: "Python 3.12\n", stderr: "" };
      if (args.includes("-c")) return { status: 0, stdout: "", stderr: "" };
      if (args.includes("--check-login")) return { status: 0, stdout: '{"ok":true}\n', stderr: "" };
      return { status: 0, stdout: "", stderr: "" };
    }
  });
  const adapter = Object.assign({}, baseAdapter, { createStore: () => store });
  const service = createPlatformSettingsService({
    adapters: [adapter],
    env: values.env || {},
    now: () => "2026-07-18T00:00:00.000Z"
  });

  return {
    root,
    paths,
    vendorDir,
    existingCookie,
    replacementCookie: "fixture-cookie-replacement=rotated-secret",
    initial,
    store,
    commands,
    service
  };
}

function assertSafeStatus(status, forbiddenValues) {
  assert.equal(status.pythonPath, undefined);
  assert.equal(status.cookie, undefined);
  assert.equal(status.cookiePath, undefined);
  const serialized = JSON.stringify(status);
  for (const value of forbiddenValues) assert.equal(serialized.includes(value), false);
}

function cleanup(fixture) {
  fs.rmSync(fixture.root, { recursive: true, force: true });
}

describe("Hepan settings patch contract", () => {
  it("preserves stored Python, Cookie, and vendor when only categoryId is saved", () => {
    const fixture = createFixture();
    try {
      const status = fixture.service.save("hepan", { categoryId: 808 });

      assert.equal(status.categoryId, 808);
      assert.equal(fixture.store.read().pythonPath, fixture.initial.pythonPath);
      assert.equal(fixture.store.read().cookie, fixture.existingCookie);
      assert.equal(fixture.store.read().vendorDir, fixture.vendorDir);
      assert.equal(fixture.store.writes.length, 1);
      assertSafeStatus(status, [fixture.existingCookie, fixture.paths.existingPython, fixture.vendorDir]);
    } finally {
      cleanup(fixture);
    }
  });

  it("preserves an old configuration without an interval and defaults it on patch", () => {
    const fixture = createFixture();
    try {
      delete fixture.initial.publishIntervalSeconds;
      fixture.store.write(fixture.initial);
      const status = fixture.service.save("hepan", { categoryId: 808 });
      assert.equal(status.publishIntervalSeconds, 30);
      assert.equal(fixture.store.read().publishIntervalSeconds, 30);
    } finally {
      cleanup(fixture);
    }
  });

  it("allows changing only the interval, including zero, without replacing secrets", () => {
    const fixture = createFixture();
    try {
      const status = fixture.service.save("hepan", { publishIntervalSeconds: 0 });
      const saved = fixture.store.read();
      assert.equal(status.publishIntervalSeconds, 0);
      assert.equal(saved.publishIntervalSeconds, 0);
      assert.equal(saved.pythonPath, fixture.initial.pythonPath);
      assert.equal(saved.cookie, fixture.existingCookie);
    } finally {
      cleanup(fixture);
    }
  });

  it("allows replacing only Python while retaining Cookie, categoryId, and vendor", () => {
    const fixture = createFixture();
    try {
      fixture.service.save("hepan", { pythonPath: fixture.paths.replacementPython });
      const saved = fixture.store.read();

      assert.equal(saved.pythonPath, fixture.paths.replacementPython);
      assert.equal(saved.cookie, fixture.existingCookie);
      assert.equal(saved.categoryId, fixture.initial.categoryId);
      assert.equal(saved.vendorDir, fixture.vendorDir);
    } finally {
      cleanup(fixture);
    }
  });

  it("allows replacing only Cookie while retaining Python, categoryId, and vendor", () => {
    const fixture = createFixture();
    try {
      fixture.service.save("hepan", { cookie: fixture.replacementCookie });
      const saved = fixture.store.read();

      assert.equal(saved.pythonPath, fixture.initial.pythonPath);
      assert.equal(saved.cookie, fixture.replacementCookie);
      assert.equal(saved.categoryId, fixture.initial.categoryId);
      assert.equal(saved.vendorDir, fixture.vendorDir);
    } finally {
      cleanup(fixture);
    }
  });

  it("does not treat an empty vendor field as an implicit clear", () => {
    const fixture = createFixture();
    try {
      fixture.service.save("hepan", { vendorDir: "" });

      assert.equal(fixture.store.read().vendorDir, fixture.vendorDir);
    } finally {
      cleanup(fixture);
    }
  });

  it("clears vendor only through the explicit clearVendorDir patch", () => {
    const fixture = createFixture();
    try {
      const status = fixture.service.save("hepan", { clearVendorDir: true });
      const saved = fixture.store.read();

      assert.equal(saved.vendorDir, "");
      assert.equal(saved.clearVendorDir, undefined);
      assert.equal(status.vendorConfigured, false);
      assert.equal(saved.pythonPath, fixture.initial.pythonPath);
      assert.equal(saved.cookie, fixture.existingCookie);
      assert.equal(saved.categoryId, fixture.initial.categoryId);
    } finally {
      cleanup(fixture);
    }
  });

  it("uses the same patch merge for save and test without persisting a test patch", async () => {
    const fixture = createFixture();
    try {
      fixture.service.save("hepan", { categoryId: 909 });
      const saveSnapshot = fixture.store.read();
      const result = await fixture.service.test("hepan", { categoryId: 910 });
      const loginCall = fixture.commands.find((call) => call.args.includes("--check-login"));

      assert.deepStrictEqual(result, { testedAt: "2026-07-18T00:00:00.000Z", ok: true, code: "HEPAN_LOGIN_OK" });
      assert.equal(loginCall.command, fixture.paths.existingPython);
      assert.equal(loginCall.args[loginCall.args.indexOf("--category-id") + 1], "910");
      assert.equal(loginCall.args[loginCall.args.indexOf("--vendor-dir") + 1], fixture.vendorDir);
      assert.equal(JSON.stringify(fixture.commands).includes(fixture.existingCookie), false);
      assert.deepStrictEqual(fixture.store.read(), saveSnapshot);
      assert.equal(fs.existsSync(path.join(fixture.root, "local-state", "tmp")), false);
      assertSafeStatus(fixture.service.getStatus("hepan"), [fixture.existingCookie, fixture.paths.existingPython, fixture.vendorDir]);
    } finally {
      cleanup(fixture);
    }
  });

  it("applies explicit vendor clearing to test patches without writing it", async () => {
    const fixture = createFixture();
    try {
      const result = await fixture.service.test("hepan", { categoryId: 707, clearVendorDir: true });
      const loginCall = fixture.commands.find((call) => call.args.includes("--check-login"));

      assert.deepStrictEqual(result, { testedAt: "2026-07-18T00:00:00.000Z", ok: true, code: "HEPAN_LOGIN_OK" });
      assert.equal(loginCall.args.includes("--vendor-dir"), false);
      assert.equal(loginCall.commandOptions.env, undefined);
      assert.deepStrictEqual(fixture.store.read(), fixture.initial);
      assert.equal(fs.existsSync(path.join(fixture.root, "local-state", "tmp")), false);
    } finally {
      cleanup(fixture);
    }
  });

  it("keeps environment configuration read-only and exposes only safe status", async () => {
    const fixtureSeed = createFixture();
    const envFixture = createFixture({
      env: {
        HEPAN_PYTHON: fixtureSeed.paths.environmentPython,
        HEPAN_COOKIE_PATH: fixtureSeed.paths.environmentCookieFile,
        HEPAN_CATEGORY_ID: "606",
        HEPAN_VENDOR_DIR: fixtureSeed.paths.environmentVendorDir,
        HEPAN_PUBLISH_INTERVAL_SECONDS: "12"
      }
    });
    try {
      const status = envFixture.service.getStatus("hepan");
      const serialized = JSON.stringify(status);

      assert.equal(status.source, "environment");
      assert.equal(status.configured, true);
      assert.equal(status.categoryId, 606);
      assert.equal(status.pythonConfigured, true);
      assert.equal(status.cookieConfigured, true);
      assert.equal(status.vendorConfigured, true);
      assert.equal(status.publishIntervalSeconds, 12);
      assertSafeStatus(status, [envFixture.paths.environmentPython, envFixture.paths.environmentCookieFile, envFixture.paths.environmentVendorDir]);
      assert.equal(serialized.includes("fixture environment cookie"), false);

      assert.throws(() => envFixture.service.save("hepan", { categoryId: 999 }), (error) => error.code === "PLATFORM_CONFIG_ENV_OVERRIDE");
      await assert.rejects(envFixture.service.test("hepan", { categoryId: 999 }), (error) => error.code === "PLATFORM_CONFIG_ENV_OVERRIDE");
      assert.throws(() => envFixture.service.clear("hepan"), (error) => error.code === "PLATFORM_CONFIG_ENV_OVERRIDE");
      assert.deepStrictEqual(envFixture.store.read(), envFixture.initial);
      assert.equal(envFixture.store.writes.length, 0);
    } finally {
      cleanup(envFixture);
      cleanup(fixtureSeed);
    }
  });
});
