const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createHepanSettingsAdapter, HEPAN_SITE_ORIGIN } = require("../desktop/services/platform-settings/hepan-settings-adapter");
const { createPlatformSettingsService } = require("../desktop/services/platform-settings-service");

function tempDirectory() { return fs.mkdtempSync(path.join(os.tmpdir(), "auto-publish-hepan-settings-")); }
function fakeStore(initial) {
  let value = initial || null;
  return { read: () => value, write: (next) => { value = Object.assign({}, next); return value; }, clear: () => { value = null; return { cleared: true }; } };
}

describe("Hepan provider settings", () => {
  it("accepts only a real Python file, keeps the site fixed and defaults category 121", () => {
    const root = tempDirectory();
    try {
      const pythonPath = path.join(root, "python.exe");
      fs.writeFileSync(pythonPath, "fixture python", "utf8");
      const adapter = createHepanSettingsAdapter({ localStateRoot: root });
      const config = adapter.validate({ pythonPath, cookie: "fixture-cookie" });
      assert.deepStrictEqual(config, { pythonPath, cookie: "fixture-cookie", categoryId: 121, vendorDir: "", publishIntervalSeconds: 30, siteOrigin: HEPAN_SITE_ORIGIN });
      const status = adapter.status(config, { source: "application", lastTest: null });
      assert.equal(status.siteOrigin, HEPAN_SITE_ORIGIN);
      assert.equal(status.cookieConfigured, true);
      assert.equal(JSON.stringify(status).includes("fixture-cookie"), false);
      assert.throws(() => adapter.validate({ pythonPath: root, cookie: "fixture-cookie" }), (error) => error.code === "PLATFORM_CONFIG_INVALID");
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  it("validates the publish interval and exposes the safe default", () => {
    const root = tempDirectory();
    try {
      const pythonPath = path.join(root, "python.exe");
      fs.writeFileSync(pythonPath, "fixture python", "utf8");
      const adapter = createHepanSettingsAdapter({ localStateRoot: root });
      assert.equal(adapter.validate({ pythonPath, cookie: "fixture-cookie" }).publishIntervalSeconds, 30);
      assert.equal(adapter.validate({ pythonPath, cookie: "fixture-cookie", publishIntervalSeconds: 0 }).publishIntervalSeconds, 0);
      assert.equal(adapter.validate({ pythonPath, cookie: "fixture-cookie", publishIntervalSeconds: 3600 }).publishIntervalSeconds, 3600);
      assert.throws(() => adapter.validate({ pythonPath, cookie: "fixture-cookie", publishIntervalSeconds: -1 }), (error) => error.code === "PLATFORM_CONFIG_INVALID");
      assert.throws(() => adapter.validate({ pythonPath, cookie: "fixture-cookie", publishIntervalSeconds: 3601 }), (error) => error.code === "PLATFORM_CONFIG_INVALID");
      assert.equal(adapter.status({ pythonPath, cookie: "fixture-cookie" }, { source: "application", lastTest: null }).publishIntervalSeconds, 30);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  it("reads a valid interval from the environment without exposing secrets", () => {
    const root = tempDirectory();
    try {
      const pythonPath = path.join(root, "python.exe");
      const cookiePath = path.join(root, "cookie.txt");
      fs.writeFileSync(pythonPath, "fixture python", "utf8");
      fs.writeFileSync(cookiePath, "fixture cookie", "utf8");
      const adapter = createHepanSettingsAdapter({ localStateRoot: root });
      const config = adapter.environment({ HEPAN_PYTHON: pythonPath, HEPAN_COOKIE_PATH: cookiePath, HEPAN_PUBLISH_INTERVAL_SECONDS: "45" });
      assert.equal(config.publishIntervalSeconds, 45);
      assert.equal(adapter.status(config, { source: "environment", lastTest: null }).publishIntervalSeconds, 45);
      assert.throws(() => adapter.environment({ HEPAN_PYTHON: pythonPath, HEPAN_COOKIE_PATH: cookiePath, HEPAN_PUBLISH_INTERVAL_SECONDS: "45.5" }), (error) => error.code === "PLATFORM_CONFIG_INVALID");
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  it("uses bundled vendor dependencies when no custom vendor directory is configured", async () => {
    const root = tempDirectory();
    const vendorDir = path.resolve(__dirname, "..", "resources", "hepan", "vendor-pure");
    let importEnvironment;
    try {
      const pythonPath = path.join(root, "python.exe");
      fs.writeFileSync(pythonPath, "fixture python", "utf8");
      const adapter = createHepanSettingsAdapter({
        localStateRoot: root,
        runCommand: async (command, args, options) => {
          if (args.includes("--validate-payload")) return { status: 0, stdout: '{"ok":true,"titleLength":24,"contentHtmlLength":25}\n', stderr: "" };
          if (args.includes("--version")) return { status: 0, stdout: "Python 3.12\n", stderr: "" };
          if (args.includes("-c")) {
            importEnvironment = options && options.env && options.env.PYTHONPATH;
            return { status: 0, stdout: "", stderr: "" };
          }
          return { status: 0, stdout: '{"ok":true,"code":"HEPAN_AUTH_OK","authenticated":true,"publishAccess":true,"uploadContext":"not_checked","stage":"publish_access"}\n', stderr: "" };
        }
      });
      const service = createPlatformSettingsService({ adapters: [Object.assign(adapter, { createStore: () => fakeStore() })] });
      await service.test("hepan", { pythonPath, cookie: "fixture-cookie" });
      assert.equal(importEnvironment, vendorDir);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  it("checks Python, imports, and login through a temporary cookie file that is always removed", async () => {
    const root = tempDirectory();
    const calls = [];
    try {
      const pythonPath = path.join(root, "python.exe");
      fs.writeFileSync(pythonPath, "fixture python", "utf8");
      const adapter = createHepanSettingsAdapter({
        localStateRoot: root,
        runCommand: async (command, args) => {
          calls.push({ command, args });
          if (args.includes("--validate-payload")) return { status: 0, stdout: '{"ok":true,"titleLength":24,"contentHtmlLength":25}\n', stderr: "" };
          if (args.includes("--check-login")) return { status: 0, stdout: '{"ok":true,"code":"HEPAN_AUTH_OK","authenticated":true,"publishAccess":true,"uploadContext":"not_checked","stage":"publish_access"}\n', stderr: "" };
          return { status: 0, stdout: "Python 3.12\n", stderr: "" };
        }
      });
      const service = createPlatformSettingsService({ adapters: [Object.assign(adapter, { createStore: () => fakeStore() })], now: () => "2026-07-17T03:00:00.000Z" });
      const result = await service.test("hepan", { pythonPath, cookie: "fixture-cookie", categoryId: 121 });
      assert.deepStrictEqual(result, { testedAt: "2026-07-17T03:00:00.000Z", ok: true, code: "HEPAN_AUTH_OK", authenticated: true, publishAccess: true, uploadContext: "not_checked", stage: "publish_access" });
      assert.equal(calls[0].args.includes("--validate-payload"), true);
      assert.equal(calls[0].args.includes("--cookie-path"), false);
      assert.equal(calls[0].args.includes("--image-dir"), false);
      assert.equal(calls.some((call) => call.args.includes("--version")), true);
      assert.equal(calls.some((call) => call.args.includes("--check-login")), true);
      assert.equal(calls.some((call) => call.args.includes("fixture-cookie")), false);
      assert.equal(fs.existsSync(path.join(root, "tmp")) ? fs.readdirSync(path.join(root, "tmp"), { withFileTypes: true }).length : 0, 0);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  it("recovers only expired, owned Hepan temporary regular files", () => {
    const root = tempDirectory();
    try {
      const tmp = path.join(root, "tmp");
      fs.mkdirSync(tmp);
      const expiredCookie = path.join(tmp, ".hepan-cookie-11111111-1111-1111-1111-111111111111.tmp");
      const expiredPayload = path.join(tmp, ".hepan-payload-22222222-2222-2222-2222-222222222222.json");
      const freshCookie = path.join(tmp, ".hepan-cookie-33333333-3333-3333-3333-333333333333.tmp");
      const unrelated = path.join(tmp, "notes.txt");
      fs.writeFileSync(expiredCookie, "synthetic secret", { mode: 0o600 });
      fs.writeFileSync(expiredPayload, "{}", { mode: 0o600 });
      fs.writeFileSync(freshCookie, "synthetic secret", { mode: 0o600 });
      fs.writeFileSync(unrelated, "preserve");
      const now = Date.now();
      fs.utimesSync(expiredCookie, new Date(now - 172800000), new Date(now - 172800000));
      fs.utimesSync(expiredPayload, new Date(now - 172800000), new Date(now - 172800000));
      const adapter = createHepanSettingsAdapter({ localStateRoot: root });
      const result = adapter.cleanupExpiredTemporaryFiles({ now: () => now, maxAgeMs: 86400000 });
      assert.deepStrictEqual(result.removed.sort(), [path.basename(expiredCookie), path.basename(expiredPayload)].sort());
      assert.equal(fs.existsSync(expiredCookie), false);
      assert.equal(fs.existsSync(expiredPayload), false);
      assert.equal(fs.existsSync(freshCookie), true);
      assert.equal(fs.existsSync(unrelated), true);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  it("maps a failed login to a stable error without leaking cookie or temp path", async () => {
    const root = tempDirectory();
    try {
      const pythonPath = path.join(root, "python.exe");
      fs.writeFileSync(pythonPath, "fixture python", "utf8");
      const adapter = createHepanSettingsAdapter({
        localStateRoot: root,
        runCommand: async (command, args) => {
          if (args.includes("--validate-payload")) return { status: 0, stdout: '{"ok":true}\n', stderr: "" };
          if (args.includes("--version")) return { status: 0, stdout: "Python 3.12\n", stderr: "" };
          if (args.includes("-c")) return { status: 0, stdout: "\n", stderr: "" };
          return { status: 0, stdout: '{"ok":false,"needsLogin":true,"error":"cookie rejected"}\n', stderr: "cookie rejected" };
        }
      });
      const service = createPlatformSettingsService({ adapters: [Object.assign(adapter, { createStore: () => fakeStore() })] });
      await assert.rejects(service.test("hepan", { pythonPath, cookie: "fixture-cookie" }), (error) => error.code === "HEPAN_CHECK_RUNTIME_FAILED" && !error.message.includes("fixture-cookie") && !error.message.includes(root));
      assert.equal(fs.existsSync(path.join(root, "tmp")), false);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  it("preserves safe warnings and account identity without carrying an error code on success", async () => {
    const root = tempDirectory();
    try {
      const pythonPath = path.join(root, "python.exe");
      fs.writeFileSync(pythonPath, "fixture python", "utf8");
      const adapter = createHepanSettingsAdapter({
        localStateRoot: root,
        runCommand: async (command, args) => {
          if (args.includes("--validate-payload")) return { status: 0, stdout: '{"ok":true}\n', stderr: "" };
          if (args.includes("--version")) return { status: 0, stdout: "Python 3.12\n", stderr: "" };
          if (args.includes("-c")) return { status: 0, stdout: "", stderr: "" };
          return { status: 0, stdout: JSON.stringify({ ok: true, code: "HEPAN_AUTH_OK", authenticated: true, publishAccess: true, uploadContext: "changed", stage: "upload_context", warnings: ["HEPAN_UPLOAD_CONTEXT_CHANGED"], errorCode: "HEPAN_UPLOAD_CONTEXT_CHANGED", account: { displayName: "\u0001fixture-user", uid: "2093208" } }), stderr: "" };
        }
      });
      const service = createPlatformSettingsService({ adapters: [Object.assign(adapter, { createStore: () => fakeStore() })], now: () => "2026-07-17T04:00:00.000Z" });
      const result = await service.test("hepan", { pythonPath, cookie: "fixture-cookie" });
      assert.deepStrictEqual(result, {
        testedAt: "2026-07-17T04:00:00.000Z",
        ok: true,
        code: "HEPAN_AUTH_OK",
        authenticated: true,
        publishAccess: true,
        uploadContext: "changed",
        stage: "upload_context",
        warnings: ["HEPAN_UPLOAD_CONTEXT_CHANGED"],
        account: { displayName: "fixture-user", uid: "2093208" }
      });
      assert.equal("errorCode" in result, false);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  it("uses a safe Python error code when the login command exits non-zero", async () => {
    const root = tempDirectory();
    try {
      const pythonPath = path.join(root, "python.exe");
      fs.writeFileSync(pythonPath, "fixture python", "utf8");
      const adapter = createHepanSettingsAdapter({
        localStateRoot: root,
        runCommand: async (command, args) => {
          if (args.includes("--validate-payload")) return { status: 0, stdout: '{"ok":true}\n', stderr: "" };
          if (args.includes("--version")) return { status: 0, stdout: "Python 3.12\n", stderr: "" };
          if (args.includes("-c")) return { status: 0, stdout: "", stderr: "" };
          return { status: 1, stdout: '{"ok":false,"authenticated":true,"publishAccess":false,"stage":"publish_access","errorCode":"HEPAN_CATEGORY_ACCESS_DENIED"}\n', stderr: "remote details omitted" };
        }
      });
      const service = createPlatformSettingsService({ adapters: [Object.assign(adapter, { createStore: () => fakeStore() })] });
      await assert.rejects(service.test("hepan", { pythonPath, cookie: "fixture-cookie" }), (error) => error.code === "HEPAN_CATEGORY_ACCESS_DENIED");
      assert.equal(service.getStatus("hepan").lastTest.code, "HEPAN_CATEGORY_ACCESS_DENIED");
      assert.equal(service.getStatus("hepan").lastTest.publishAccess, false);
      assert.equal(fs.existsSync(path.join(root, "tmp")), false);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  it("fails the payload self-test before dependency or login checks", async () => {
    const root = tempDirectory();
    const calls = [];
    try {
      const pythonPath = path.join(root, "python.exe");
      fs.writeFileSync(pythonPath, "fixture python", "utf8");
      const adapter = createHepanSettingsAdapter({
        localStateRoot: root,
        runCommand: async (command, args) => {
          calls.push(args.slice());
          if (args.includes("--validate-payload")) return { status: 1, stdout: '{"ok":false,"errorCode":"HEPAN_PAYLOAD_JSON_INVALID"}\n', stderr: "" };
          throw new Error("later checks must not run");
        }
      });
      const service = createPlatformSettingsService({ adapters: [Object.assign(adapter, { createStore: () => fakeStore() })] });

      await assert.rejects(service.test("hepan", { pythonPath, cookie: "fixture-cookie" }), (error) => error.code === "HEPAN_PAYLOAD_RUNTIME_FAILED");
      assert.equal(calls.length, 1);
      assert.equal(calls[0].includes("--validate-payload"), true);
      assert.equal(fs.existsSync(path.join(root, "tmp")), false);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

});
