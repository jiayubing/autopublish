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

  it("closes temporary authentication failures to the typed business AUTH_REQUIRED error", async function() {
    let invoked = false;
    const guarded = createAuthenticatedIpcMain({ handle: (channel, handler) => handler }, () => {
      const error = new Error("认证服务暂时不可达，请检查网络后重试");
      error.code = "AUTH_SERVICE_UNAVAILABLE";
      throw error;
    });
    guarded.handle("platforms:get-state", () => { invoked = true; return { ok: true }; });
    const response = await guarded.lastHandler({}, undefined);
    assert.equal(response.ok, false);
    assert.deepEqual(response.error, {
      code: "AUTH_REQUIRED",
      category: "authentication",
      retryability: "never",
      userMessage: "请先完成登录后再继续。",
    });
    assert.equal(invoked, false);
  });
});
