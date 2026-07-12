const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const os = require("os");
const path = require("path");

const {
  getContentWorkspace,
  getClientWorkspace
} = require("../src/core/files");

describe("content workspace", function() {
  it("generates the content directories under a temporary root", function() {
    const root = path.join(os.tmpdir(), "auto-publish-content-test");
    const workspace = getContentWorkspace(root);

    assert.deepStrictEqual(workspace, {
      root: path.resolve(root),
      clients: path.join(path.resolve(root), "clients"),
      research: path.join(path.resolve(root), "research"),
      templates: path.join(path.resolve(root), "templates"),
      generated: path.join(path.resolve(root), "generated"),
      published: path.join(path.resolve(root), "published"),
      logs: path.join(path.resolve(root), "logs")
    });
  });

  it("accepts arbitrary and Chinese client directory names", function() {
    const workspace = getContentWorkspace(path.join(os.tmpdir(), "content-workspace"));

    assert.equal(
      getClientWorkspace(workspace, "xxx"),
      path.join(workspace.clients, "xxx")
    );
    assert.equal(
      getClientWorkspace(workspace, "海棠住宿"),
      path.join(workspace.clients, "海棠住宿")
    );
  });

  it("rejects empty client names", function() {
    const workspace = getContentWorkspace(path.join(os.tmpdir(), "content-workspace"));

    assert.throws(function() {
      getClientWorkspace(workspace, "");
    }, /client name/i);
    assert.throws(function() {
      getClientWorkspace(workspace, "   ");
    }, /client name/i);
  });

  it("rejects absolute and directory traversal client names", function() {
    const workspace = getContentWorkspace(path.join(os.tmpdir(), "content-workspace"));

    assert.throws(function() {
      getClientWorkspace(workspace, path.resolve("outside"));
    }, /client name/i);
    assert.throws(function() {
      getClientWorkspace(workspace, "..\\outside");
    }, /client name/i);
    assert.throws(function() {
      getClientWorkspace(workspace, "nested/../../outside");
    }, /client name/i);
  });

  it("rejects Windows-illegal characters and NUL characters", function() {
    const workspace = getContentWorkspace(path.join(os.tmpdir(), "content-workspace"));
    const invalidNames = [
      "foo:bar",
      "foo<bar",
      "foo>bar",
      "foo\"bar",
      "foo|bar",
      "foo?bar",
      "foo*bar",
      "foo\u0001bar",
      "foo\0bar"
    ];

    invalidNames.forEach(function(name) {
      assert.throws(function() {
        getClientWorkspace(workspace, name);
      }, /client name/i);
    });
  });

  it("rejects names ending in spaces or periods", function() {
    const workspace = getContentWorkspace(path.join(os.tmpdir(), "content-workspace"));

    ["foo ", "foo.", "客户 ", "客户."].forEach(function(name) {
      assert.throws(function() {
        getClientWorkspace(workspace, name);
      }, /client name/i);
    });
  });

  it("rejects Windows reserved device names regardless of case or extension", function() {
    const workspace = getContentWorkspace(path.join(os.tmpdir(), "content-workspace"));
    const reservedNames = [
      "CON",
      "prn",
      "Aux.txt",
      "nul.backup",
      "Com1.log",
      "COM9.data",
      "lpt1.archive",
      "LPT9.txt"
    ];

    reservedNames.forEach(function(name) {
      assert.throws(function() {
        getClientWorkspace(workspace, name);
      }, /client name/i);
    });
  });
});
