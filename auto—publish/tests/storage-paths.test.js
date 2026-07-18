const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  createStoragePaths,
  validateStoragePaths,
  ensureContentLibrary
} = require("../desktop/storage-paths");

function roots() {
  return {
    installation: fs.mkdtempSync(path.join(os.tmpdir(), "storage-install-")),
    roamingConfig: fs.mkdtempSync(path.join(os.tmpdir(), "storage-roaming-")),
    localState: fs.mkdtempSync(path.join(os.tmpdir(), "storage-local-")),
    contentLibrary: fs.mkdtempSync(path.join(os.tmpdir(), "storage-content-"))
  };
}

describe("storage paths", function() {
  it("classifies every mutable path into the correct storage root", function() {
    const input = roots();
    try {
      const paths = createStoragePaths(input);
      assert.deepEqual(
        [paths.installation, paths.roamingConfig, paths.localState, paths.contentLibrary],
        [path.resolve(input.installation), path.resolve(input.roamingConfig), path.resolve(input.localState), path.resolve(input.contentLibrary)]
      );
      assert.equal(paths.clients, path.join(paths.contentLibrary, "clients"));
      assert.equal(paths.generated, path.join(paths.contentLibrary, "generated"));
      assert.equal(paths.templates, path.join(paths.contentLibrary, "templates"));
      [paths.research, paths.generationBatches, paths.queue, paths.submissionRecords, paths.publications].forEach(function(value) {
        assert.equal(value === paths.contentLibrary || value.startsWith(paths.contentLibrary + path.sep), true);
        assert.equal(value.startsWith(paths.contentLibrary + path.sep + ".autopublish"), true);
      });
      [paths.logs, paths.cache, paths.tmp, paths.browser, paths.doubaoBrowser, paths.doubaoDiagnostics].forEach(function(value) {
        assert.equal(value.startsWith(paths.localState + path.sep), true);
      });
      assert.equal(paths.aiProviderConfig, path.join(paths.roamingConfig, "ai-provider.json"));
      assert.equal(paths.runtimeConfig, path.join(paths.roamingConfig, "runtime-config.json"));
      assert.equal(validateStoragePaths(paths), paths);
    } finally {
      Object.values(input).forEach(function(root) { fs.rmSync(root, { recursive: true, force: true }); });
    }
  });

  it("rejects relative roots and roots that mix storage categories", function() {
    assert.throws(function() {
      createStoragePaths({ installation: ".", roamingConfig: "C:\\roaming", localState: "C:\\local", contentLibrary: "C:\\content" });
    }, /absolute/);
    const input = roots();
    try {
      assert.throws(function() {
        createStoragePaths(Object.assign({}, input, { contentLibrary: input.localState }));
      }, /distinct|overlap|different/);
    } finally {
      Object.values(input).forEach(function(root) { fs.rmSync(root, { recursive: true, force: true }); });
    }
  });

  it("creates only the marker, visible folders, and managed portable records", function() {
    const input = roots();
    try {
      const paths = createStoragePaths(input);
      ensureContentLibrary(paths);
      assert.ok(fs.lstatSync(paths.marker).isFile());
      [paths.clients, paths.generated, paths.templates, paths.autopublish, paths.research,
        paths.generationBatches, paths.queue, paths.submissionRecords, paths.publications].forEach(function(directory) {
        assert.ok(fs.lstatSync(directory).isDirectory(), directory);
      });
      assert.equal(fs.existsSync(paths.logs), false);
      assert.equal(fs.existsSync(paths.browser), false);
      assert.equal(fs.existsSync(paths.tmp), false);
      assert.equal(fs.existsSync(path.join(paths.installation, "clients")), false);
    } finally {
      Object.values(input).forEach(function(root) { fs.rmSync(root, { recursive: true, force: true }); });
    }
  });

  it("keeps application configuration separate from portable content", function() {
    const input = roots();
    try {
      const paths = createStoragePaths(input);
      assert.equal(paths.runtimeConfig.startsWith(paths.roamingConfig + path.sep), true);
      assert.equal(paths.runtimeConfig.startsWith(paths.contentLibrary + path.sep), false);
      assert.equal(paths.aiProviderConfig.startsWith(paths.roamingConfig + path.sep), true);
    } finally {
      Object.values(input).forEach(function(root) { fs.rmSync(root, { recursive: true, force: true }); });
    }
  });
});
