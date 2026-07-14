const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createWorkspaceLocationStore } = require("../desktop/workspace-location-store");

function createTempDirectory(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function assertSafeError(result, code) {
  assert.equal(result.ok, false);
  assert.equal(result.error.code, code);
  assert.equal(Object.prototype.hasOwnProperty.call(result.error, "stack"), false);
}

describe("workspace location store", function() {
  it("rejects missing or invalid userData paths without falling back to cwd", function() {
    const workspacePath = createTempDirectory("autopublish-location-no-userdata-workspace-");
    try {
      for (const userDataPath of [undefined, null, "", "   ", "relative-user-data"]) {
        const store = createWorkspaceLocationStore({ userDataPath });
        assert.equal(store.userDataPath, null, JSON.stringify(userDataPath));
        assertSafeError(store.read(), "WORKSPACE_LOCATION_USER_DATA_INVALID");
        assertSafeError(store.write(workspacePath), "WORKSPACE_LOCATION_USER_DATA_INVALID");
      }
    } finally {
      fs.rmSync(workspacePath, { recursive: true, force: true });
    }
  });

  it("reports a missing configuration without creating one", function() {
    const userDataPath = createTempDirectory("autopublish-location-missing-");
    try {
      const result = createWorkspaceLocationStore({ userDataPath }).read();
      assert.deepEqual(result, { ok: true, value: null });
      assert.equal(fs.existsSync(path.join(userDataPath, "workspace-location.json")), false);
    } finally {
      fs.rmSync(userDataPath, { recursive: true, force: true });
    }
  });

  it("reads a strict version 1 configuration", function() {
    const userDataPath = createTempDirectory("autopublish-location-valid-");
    const config = { version: 1, workspacePath: path.join(userDataPath, "workspace") };
    try {
      fs.writeFileSync(path.join(userDataPath, "workspace-location.json"), JSON.stringify(config), "utf8");
      assert.deepEqual(createWorkspaceLocationStore({ userDataPath }).read(), { ok: true, value: config });
    } finally {
      fs.rmSync(userDataPath, { recursive: true, force: true });
    }
  });

  it("reports corrupted JSON with a stable error code", function() {
    const userDataPath = createTempDirectory("autopublish-location-json-");
    try {
      fs.writeFileSync(path.join(userDataPath, "workspace-location.json"), "{not-json", "utf8");
      const result = createWorkspaceLocationStore({ userDataPath }).read();
      assert.equal(result.ok, false);
      assert.equal(result.error.code, "WORKSPACE_LOCATION_INVALID_JSON");
      assert.equal(Object.prototype.hasOwnProperty.call(result.error, "stack"), false);
    } finally {
      fs.rmSync(userDataPath, { recursive: true, force: true });
    }
  });

  it("reports unknown versions separately from invalid schema fields", function() {
    const userDataPath = createTempDirectory("autopublish-location-schema-");
    const locationFile = path.join(userDataPath, "workspace-location.json");
    try {
      fs.writeFileSync(locationFile, JSON.stringify({ version: 2, workspacePath: "C:\\workspace" }), "utf8");
      let result = createWorkspaceLocationStore({ userDataPath }).read();
      assert.equal(result.ok, false);
      assert.equal(result.error.code, "WORKSPACE_LOCATION_VERSION_UNSUPPORTED");

      for (const value of [
        {},
        { version: 1 },
        { version: 1, workspacePath: "" },
        { version: 1, workspacePath: "   " },
        { version: 1, workspacePath: "relative\\workspace" },
        { version: 1, workspacePath: 42 },
        { version: 1, workspacePath: "C:\\workspace", extra: true },
        [],
        null
      ]) {
        fs.writeFileSync(locationFile, JSON.stringify(value), "utf8");
        result = createWorkspaceLocationStore({ userDataPath }).read();
        assert.equal(result.ok, false, JSON.stringify(value));
        assert.equal(result.error.code, "WORKSPACE_LOCATION_INVALID", JSON.stringify(value));
      }
    } finally {
      fs.rmSync(userDataPath, { recursive: true, force: true });
    }
  });

  it("atomically writes a version 1 configuration in userData only", function() {
    const userDataPath = createTempDirectory("autopublish-location-write-");
    const workspacePath = createTempDirectory("autopublish-business-");
    try {
      const store = createWorkspaceLocationStore({ userDataPath });
      const result = store.write(workspacePath);
      assert.deepEqual(result, { ok: true, value: { version: 1, workspacePath } });
      assert.deepEqual(JSON.parse(fs.readFileSync(path.join(userDataPath, "workspace-location.json"), "utf8")), result.value);
      assert.deepEqual(fs.readdirSync(userDataPath), ["workspace-location.json"]);
      assert.deepEqual(fs.readdirSync(workspacePath), []);
    } finally {
      fs.rmSync(userDataPath, { recursive: true, force: true });
      fs.rmSync(workspacePath, { recursive: true, force: true });
    }
  });

  it("preserves the old configuration when the atomic rename fails", function() {
    const userDataPath = createTempDirectory("autopublish-location-atomic-");
    const firstWorkspace = createTempDirectory("autopublish-old-workspace-");
    const secondWorkspace = createTempDirectory("autopublish-new-workspace-");
    try {
      const filePath = path.join(userDataPath, "workspace-location.json");
      fs.writeFileSync(filePath, JSON.stringify({ version: 1, workspacePath: firstWorkspace }), "utf8");
      const failingFs = Object.create(fs);
      failingFs.renameSync = function() {
        const error = new Error("simulated rename failure");
        error.code = "EIO";
        throw error;
      };

      const result = createWorkspaceLocationStore({ userDataPath, fs: failingFs }).write(secondWorkspace);
      assert.equal(result.ok, false);
      assert.equal(result.error.code, "WORKSPACE_LOCATION_WRITE_FAILED");
      assert.deepEqual(JSON.parse(fs.readFileSync(filePath, "utf8")), { version: 1, workspacePath: firstWorkspace });
      assert.deepEqual(fs.readdirSync(userDataPath), ["workspace-location.json"]);
    } finally {
      fs.rmSync(userDataPath, { recursive: true, force: true });
      fs.rmSync(firstWorkspace, { recursive: true, force: true });
      fs.rmSync(secondWorkspace, { recursive: true, force: true });
    }
  });

  it("rejects a symlink configuration file for both reads and writes", function(t) {
    const userDataPath = createTempDirectory("autopublish-location-link-");
    const workspacePath = createTempDirectory("autopublish-location-link-workspace-");
    const targetPath = path.join(userDataPath, "real-location.json");
    const locationPath = path.join(userDataPath, "workspace-location.json");
    try {
      fs.writeFileSync(targetPath, JSON.stringify({ version: 1, workspacePath }), "utf8");
      try {
        fs.symlinkSync(targetPath, locationPath, "file");
      } catch (error) {
        if (["EPERM", "EACCES", "ENOTSUP", "EINVAL"].includes(error.code)) {
          t.skip("symlinks are unavailable in this environment");
          return;
        }
        throw error;
      }
      assertSafeError(createWorkspaceLocationStore({ userDataPath }).read(), "WORKSPACE_LOCATION_INVALID");
      assertSafeError(createWorkspaceLocationStore({ userDataPath }).write(workspacePath), "WORKSPACE_LOCATION_INVALID");
      assert.equal(fs.lstatSync(locationPath).isSymbolicLink(), true);
    } finally {
      fs.rmSync(userDataPath, { recursive: true, force: true });
      fs.rmSync(workspacePath, { recursive: true, force: true });
    }
  });

  it("returns a stable error when a write input getter throws", function() {
    const userDataPath = createTempDirectory("autopublish-location-getter-");
    try {
      const input = {};
      Object.defineProperty(input, "version", {
        enumerable: true,
        get: function() { throw new Error("secret getter failure"); }
      });
      Object.defineProperty(input, "workspacePath", {
        enumerable: true,
        get: function() { throw new Error("secret getter failure"); }
      });
      const result = createWorkspaceLocationStore({ userDataPath }).write(input);
      assertSafeError(result, "WORKSPACE_LOCATION_INVALID");
      assert.equal(fs.existsSync(path.join(userDataPath, "workspace-location.json")), false);
    } finally {
      fs.rmSync(userDataPath, { recursive: true, force: true });
    }
  });
});
