const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const { translate } = require("../scripts/apctl");

describe("short auth administration commands", () => {
  it("maps common account lifecycle commands to authctl", () => {
    assert.deepEqual(translate(["create", "jia", "--expires-at", "2027-07-19T00:00:00.000Z"]), ["user", "create", "--login-name", "jia", "--expires-at", "2027-07-19T00:00:00.000Z"]);
    assert.deepEqual(translate(["revoke", "jia"]), ["user", "disable", "--login-name", "jia"]);
    assert.deepEqual(translate(["renew", "jia", "permanent"]), ["user", "set-expiry", "--login-name", "jia", "--permanent"]);
    assert.deepEqual(translate(["limit", "jia", "2"]), ["user", "set-device-limit", "--login-name", "jia", "--max-devices", "2"]);
  });

  it("rejects missing or unsupported commands", () => {
    assert.throws(() => translate([]), { code: "AUTH_ADMIN_COMMAND_INVALID" });
    assert.throws(() => translate(["revoke"]), { code: "AUTH_ADMIN_COMMAND_INVALID" });
    assert.throws(() => translate(["unknown"]), { code: "AUTH_ADMIN_COMMAND_INVALID" });
  });
});
