const { it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { verifyRuntimeSmoke } = require("../scripts/verify-alpha-package");

it("alpha smoke verifier initializes a disposable workspace and checks diagnostics", function() {
  assert.doesNotThrow(function() {
    verifyRuntimeSmoke(path.resolve(__dirname, ".."));
  });
});
