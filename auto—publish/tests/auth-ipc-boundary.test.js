const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const { registerAuthIpc } = require("../desktop/ipc/auth-ipc");

describe("auth IPC boundary", function() {
  it("exposes only auth operations and broadcasts state changes", async function() {
    const handlers = new Map();
    const events = [];
    registerAuthIpc({
      ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
      sendToRenderer: (channel, payload) => events.push([channel, payload]),
      authService: {
        getState: () => ({ authenticated: false }),
        login: async () => ({ authenticated: true, user: { loginName: "admin" } }),
        changePassword: async () => ({ authenticated: true, user: { loginName: "admin" } }),
        refresh: async () => ({ authenticated: true }),
        logout: async () => ({ authenticated: false }),
      },
    });
    assert.deepEqual([...handlers.keys()].sort(), ["auth:change-password", "auth:get-state", "auth:login", "auth:logout", "auth:refresh"]);
    const result = await handlers.get("auth:login")(null, { loginName: "admin", password: "password" });
    assert.equal(result.ok, true);
    assert.equal(events[0][0], "auth-state-changed");
  });

  it("does not publish authenticated state before the workspace runtime is ready", async function() {
    const events = [];
    let notify = null;
    let releaseRuntime;
    const runtimeReady = new Promise((resolve) => {
      releaseRuntime = resolve;
    });
    let state = { authenticated: false };
    registerAuthIpc({
      ipcMain: { handle: () => {} },
      sendToRenderer: (channel, payload) => events.push([channel, payload]),
      authService: {
        getState: () => state,
        onStateChanged: (listener) => {
          notify = listener;
          return () => {};
        },
      },
      onAuthenticated: () => runtimeReady,
    });

    state = { authenticated: true, user: { loginName: "admin" } };
    notify(state);
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(events, []);

    releaseRuntime();
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(events, [["auth-state-changed", state]]);
  });
});
