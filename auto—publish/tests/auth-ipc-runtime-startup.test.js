const assert = require("node:assert/strict");
const { it } = require("node:test");

const { registerAuthIpc } = require("../desktop/ipc/auth-ipc");

it("keeps a successful login successful when workspace runtime startup fails", async function () {
  const handlers = new Map();
  const sent = [];
  const authenticatedState = {
    authenticated: true,
    user: { loginName: "fixture-user" },
    entitlements: [],
    errorCode: null,
    sessionStatus: "active",
  };
  const authService = {
    login: async function () {
      return authenticatedState;
    },
    getState: function () {
      return authenticatedState;
    },
  };

  registerAuthIpc({
    ipcMain: {
      handle: function (channel, handler) {
        handlers.set(channel, handler);
      },
    },
    authService,
    sendToRenderer: function (channel, state) {
      sent.push([channel, state]);
    },
    onAuthenticated: async function () {
      throw new Error("fixture workspace startup failure");
    },
  });

  const result = await handlers.get("auth:login")(null, {
    loginName: "fixture-user",
    password: "fixture-password",
  });

  assert.equal(result.ok, true);
  assert.strictEqual(result.data, authenticatedState);
  assert.deepEqual(sent, [["auth-state-changed", authenticatedState]]);
});
