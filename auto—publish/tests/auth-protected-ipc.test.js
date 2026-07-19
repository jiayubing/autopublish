const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const { createAuthenticatedIpcMain } = require("../desktop/ipc/register");

describe("protected business IPC", function() {
  it("returns AUTH_REQUIRED before invoking a business handler", async function() {
    let invoked = false;
    const guarded = createAuthenticatedIpcMain({ handle: (channel, handler) => handler }, () => {
      const error = new Error("Authentication required");
      error.code = "AUTH_REQUIRED";
      throw error;
    });
    let handler;
    guarded.handle("platforms:get-state", () => { invoked = true; return { ok: true }; });
    handler = guarded.lastHandler;
    const response = await handler({}, undefined);
    assert.equal(response.ok, false);
    assert.equal(response.error.code, "AUTH_REQUIRED");
    assert.equal(invoked, false);
  });
});
