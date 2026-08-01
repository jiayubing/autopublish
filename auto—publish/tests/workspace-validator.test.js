const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createWorkspaceValidator } = require("../desktop/workspace-validator");

function createTempDirectory(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeMarker(directory, value) {
  fs.writeFileSync(
    path.join(directory, ".autopublish-workspace.json"),
    JSON.stringify(value),
    "utf8",
  );
}

function createValidator(root, overrides) {
  const protectedRoot = path.join(root, "protected");
  const appPath = path.join(protectedRoot, "app");
  const resourcesPath = path.join(appPath, "resources");
  const userDataPath = path.join(protectedRoot, "user-data");
  fs.mkdirSync(resourcesPath, { recursive: true });
  fs.mkdirSync(userDataPath, { recursive: true });
  return createWorkspaceValidator(
    Object.assign(
      {
        appPath,
        resourcesPath,
        userDataPath,
        systemPaths: [path.join(root, "system")],
      },
      overrides || {},
    ),
  );
}

describe("workspace validator", function () {
  it("classifies writable empty and nonempty directories without initializing them", function () {
    const root = createTempDirectory("autopublish-validator-classify-");
    const empty = path.join(root, "empty");
    const nonempty = path.join(root, "nonempty");
    fs.mkdirSync(empty);
    fs.mkdirSync(nonempty);
    fs.writeFileSync(path.join(nonempty, "keep.txt"), "keep", "utf8");
    try {
      const validator = createValidator(root);
      assert.equal(validator.validate(empty).kind, "empty_directory");
      assert.deepEqual(validator.validate(nonempty), {
        kind: "nonempty_directory",
        path: fs.realpathSync(nonempty),
      });
      assert.deepEqual(fs.readdirSync(empty), []);
      assert.deepEqual(fs.readdirSync(nonempty), ["keep.txt"]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("classifies a valid version 1 marker as an existing workspace", function () {
    const root = createTempDirectory("autopublish-validator-existing-");
    const workspace = path.join(root, "workspace");
    fs.mkdirSync(workspace);
    writeMarker(workspace, {
      version: 1,
      createdAt: "2026-07-14T00:00:00.000Z",
    });
    try {
      const result = createValidator(root).validate(workspace);
      assert.equal(result.kind, "existing_workspace");
      assert.equal(result.path, fs.realpathSync(workspace));
      assert.deepEqual(result.marker, {
        version: 1,
        createdAt: "2026-07-14T00:00:00.000Z",
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("validates a marker through a fixed path when its filename uses Windows casing", function (t) {
    if (process.platform !== "win32") {
      t.skip("case-insensitive marker semantics are Windows-specific");
      return;
    }
    const root = createTempDirectory("autopublish-validator-marker-case-");
    const workspace = path.join(root, "workspace");
    fs.mkdirSync(workspace);
    fs.writeFileSync(
      path.join(workspace, ".AUTOPUBLISH-WORKSPACE.JSON"),
      JSON.stringify({ version: 1, createdAt: "2026-07-14T00:00:00.000Z" }),
      "utf8",
    );
    try {
      const result = createValidator(root).validate(workspace);
      assert.equal(result.kind, "existing_workspace");
      assert.deepEqual(result.marker, {
        version: 1,
        createdAt: "2026-07-14T00:00:00.000Z",
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not classify a damaged case-variant marker as a nonempty directory", function (t) {
    if (process.platform !== "win32") {
      t.skip("case-insensitive marker semantics are Windows-specific");
      return;
    }
    const root = createTempDirectory(
      "autopublish-validator-marker-case-invalid-",
    );
    const workspace = path.join(root, "workspace");
    fs.mkdirSync(workspace);
    fs.writeFileSync(
      path.join(workspace, ".Autopublish-Workspace.Json"),
      "{not-json",
      "utf8",
    );
    try {
      const result = createValidator(root).validate(workspace);
      assert.equal(result.kind, "invalid");
      assert.equal(result.error.code, "WORKSPACE_MARKER_INVALID");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("returns stable invalid errors for missing paths and files", function () {
    const root = createTempDirectory("autopublish-validator-invalid-path-");
    const filePath = path.join(root, "file.txt");
    fs.writeFileSync(filePath, "file", "utf8");
    try {
      const validator = createValidator(root);
      for (const candidate of [
        path.join(root, "missing"),
        filePath,
        path.join("relative", "workspace"),
        "C:relative-workspace",
        "",
        null,
      ]) {
        const result = validator.validate(candidate);
        assert.equal(result.kind, "invalid");
        assert.equal(result.error.code, "WORKSPACE_PATH_INVALID");
        assert.equal(
          Object.prototype.hasOwnProperty.call(result.error, "stack"),
          false,
        );
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects roots, system paths, application paths, their parents, and userData", function () {
    const root = createTempDirectory("autopublish-validator-forbidden-");
    const systemGroup = path.join(root, "system");
    const systemPath = path.join(systemGroup, "Windows");
    fs.mkdirSync(systemPath, { recursive: true });
    try {
      const validator = createValidator(root);
      const protectedRoot = path.join(root, "protected");
      const cases = [
        path.parse(root).root,
        systemGroup,
        systemPath,
        protectedRoot,
        path.join(protectedRoot, "app"),
        path.join(protectedRoot, "app", "resources"),
        path.join(protectedRoot, "user-data"),
      ];
      cases.forEach(function (candidate) {
        const result = validator.validate(candidate);
        assert.equal(result.kind, "invalid", candidate);
        assert.equal(result.error.code, "WORKSPACE_PATH_FORBIDDEN", candidate);
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects a directory when the random write probe cannot create a file", function () {
    const root = createTempDirectory("autopublish-validator-write-");
    const candidate = path.join(root, "candidate");
    fs.mkdirSync(candidate);
    try {
      const blockedFs = Object.create(fs);
      blockedFs.openSync = function (filePath) {
        if (path.dirname(filePath) === path.resolve(candidate)) {
          const error = new Error("simulated access denial");
          error.code = "EACCES";
          throw error;
        }
        return fs.openSync.apply(fs, arguments);
      };
      const result = createValidator(root, { fs: blockedFs }).validate(
        candidate,
      );
      assert.equal(result.kind, "invalid");
      assert.equal(result.error.code, "WORKSPACE_NOT_WRITABLE");
      assert.deepEqual(fs.readdirSync(candidate), []);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects paths whose realpath cannot be resolved", function () {
    const root = createTempDirectory("autopublish-validator-realpath-");
    const candidate = path.join(root, "candidate");
    fs.mkdirSync(candidate);
    try {
      const failingFs = Object.create(fs);
      failingFs.realpathSync = function () {
        const error = new Error("simulated realpath failure");
        error.code = "EIO";
        throw error;
      };
      const result = createValidator(root, { fs: failingFs }).validate(
        candidate,
      );
      assert.equal(result.kind, "invalid");
      assert.equal(result.error.code, "WORKSPACE_PATH_INVALID");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails closed when a protected path realpath fails", function () {
    const root = createTempDirectory(
      "autopublish-validator-protected-realpath-",
    );
    const candidate = path.join(root, "candidate");
    const appPath = path.join(root, "protected", "app");
    fs.mkdirSync(candidate);
    fs.mkdirSync(appPath, { recursive: true });
    try {
      const failingFs = Object.create(fs);
      failingFs.realpathSync = function (value) {
        if (path.resolve(value) === path.resolve(appPath)) {
          const error = new Error("simulated protected realpath failure");
          error.code = "EIO";
          throw error;
        }
        return fs.realpathSync(value);
      };
      const result = createValidator(root, {
        fs: failingFs,
        appPath,
        resourcesPath: path.join(root, "protected", "resources"),
        userDataPath: path.join(root, "protected", "user-data"),
        systemPaths: [],
      }).validate(candidate);
      assert.equal(result.kind, "invalid");
      assert.equal(result.error.code, "WORKSPACE_PATH_INVALID");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("reports probe cleanup failures without claiming the directory is merely unwritable", function () {
    const root = createTempDirectory("autopublish-validator-cleanup-");
    const candidate = path.join(root, "candidate");
    fs.mkdirSync(candidate);
    try {
      const failingFs = Object.create(fs);
      failingFs.unlinkSync = function (filePath) {
        if (filePath.includes(".autopublish-write-probe-")) {
          const error = new Error("simulated probe cleanup failure");
          error.code = "EPERM";
          throw error;
        }
        return fs.unlinkSync(filePath);
      };
      const result = createValidator(root, { fs: failingFs }).validate(
        candidate,
      );
      assert.equal(result.kind, "invalid");
      assert.equal(result.error.code, "WORKSPACE_PROBE_CLEANUP_FAILED");
      fs.readdirSync(candidate)
        .filter(function (name) {
          return name.includes(".autopublish-write-probe-");
        })
        .forEach(function (name) {
          fs.unlinkSync(path.join(candidate, name));
        });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects damaged, unknown-version, and linked markers", function (t) {
    const root = createTempDirectory("autopublish-validator-marker-");
    const workspace = path.join(root, "workspace");
    const markerPath = path.join(workspace, ".autopublish-workspace.json");
    fs.mkdirSync(workspace);
    try {
      for (const content of [
        "{not-json",
        JSON.stringify({ version: 2, createdAt: "2026-07-14T00:00:00.000Z" }),
        JSON.stringify({ version: 1 }),
        JSON.stringify({ version: 1, createdAt: "not-a-date" }),
        JSON.stringify({
          version: 1,
          createdAt: "2026-07-14T00:00:00.000Z",
          extra: true,
        }),
      ]) {
        fs.writeFileSync(markerPath, content, "utf8");
        const result = createValidator(root).validate(workspace);
        assert.equal(result.kind, "invalid");
        assert.equal(
          result.error.code,
          content.includes('"version":2')
            ? "WORKSPACE_SCHEMA_FUTURE"
            : "WORKSPACE_MARKER_INVALID",
        );
      }

      fs.unlinkSync(markerPath);
      fs.mkdirSync(markerPath);
      let result = createValidator(root).validate(workspace);
      assert.equal(result.kind, "invalid");
      assert.equal(result.error.code, "WORKSPACE_MARKER_INVALID");
      fs.rmdirSync(markerPath);

      const linkedMarkerTarget = path.join(root, "marker-target.json");
      fs.writeFileSync(
        linkedMarkerTarget,
        JSON.stringify({ version: 1, createdAt: "2026-07-14T00:00:00.000Z" }),
        "utf8",
      );
      try {
        fs.symlinkSync(linkedMarkerTarget, markerPath, "file");
      } catch (error) {
        if (["EPERM", "EACCES", "ENOTSUP", "EINVAL"].includes(error.code)) {
          t.skip("symlinks are unavailable in this environment");
          return;
        }
        throw error;
      }
      result = createValidator(root).validate(workspace);
      assert.equal(result.kind, "invalid");
      assert.equal(result.error.code, "WORKSPACE_MARKER_INVALID");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
