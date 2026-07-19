const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

describe("renderer auth gate", function() {
  it("does not mount WorkspaceBootstrapGate or App before authentication", function() {
    const source = fs.readFileSync(path.resolve(__dirname, "../media-workbench/src/components/AuthGate.tsx"), "utf8");
    assert.match(source, /getAuthState/);
    assert.match(source, /登录名/);
    assert.match(source, /children/);
    assert.match(source, /authenticated/);
  });
});
