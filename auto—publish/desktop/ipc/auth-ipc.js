const { ok, fail } = require("../services/ipc-response");
const { AUTH_ERROR_CODES, AUTH_ERRORS } = require("../../src/contracts/auth-contract");
const { reportDiagnostic } = require("../../src/diagnostics/diagnostic-producer");

const AUTH_ERROR_CODES_SET = AUTH_ERROR_CODES;

function authFailure(error) {
  const code = error && AUTH_ERROR_CODES_SET.has(error.code) ? error.code : "AUTH_SERVER_ERROR";
  return { ok: false, error: { code, message: AUTH_ERRORS[code] } };
}

function safeInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    const error = new Error("Authentication input is invalid");
    error.code = "AUTH_INPUT_INVALID";
    throw error;
  }
  return input;
}

function registerAuthIpc(deps) {
  const options = deps || {};
  const ipcMain = options.ipcMain;
  const service = options.authService;
  const sendToRenderer = options.sendToRenderer || (() => {});
  if (!ipcMain || typeof ipcMain.handle !== "function" || !service) throw new Error("Auth IPC dependencies are required");

  function broadcast() { sendToRenderer("auth-state-changed", service.getState()); }
  async function broadcastStateAfterRuntime(state) {
    if (
      state &&
      state.authenticated &&
      typeof options.onAuthenticated === "function"
    ) {
      try {
        await options.onAuthenticated();
      } catch (_) {
        reportDiagnostic({
          code: "AUTH_RUNTIME_START_FAILED",
          module: "auth-ipc",
          category: "lifecycle",
          operationId: "auth-state-broadcast",
          metadata: { action: "runtime-start", outcome: "failed" },
        });
      }
    }
    broadcast();
    return state;
  }
  if (typeof service.onStateChanged === "function")
    service.onStateChanged((state) => {
      void broadcastStateAfterRuntime(state);
    });

  ipcMain.handle("auth:get-state", async function(event, input) {
    let state;
    try {
      if (input !== undefined) safeInput(input);
      if (typeof service.initialize === "function") await service.initialize();
      state = service.getState();
    } catch (error) { return authFailure(error); }
    return ok(await broadcastStateAfterRuntime(state));
  });
  ipcMain.handle("auth:login", async function(event, input) {
    let state;
    try {
      const value = safeInput(input);
      if (typeof value.loginName !== "string" || typeof value.password !== "string") {
        const error = new Error("Authentication input is invalid"); error.code = "AUTH_INPUT_INVALID"; throw error;
      }
      state = await service.login(value.loginName, value.password);
      state = state || service.getState();
    } catch (error) { return authFailure(error); }
    return ok(await broadcastStateAfterRuntime(state));
  });
  ipcMain.handle("auth:change-password", async function(event, input) {
    let state;
    try {
      const value = safeInput(input);
      if (typeof value.loginName !== "string" || typeof value.currentPassword !== "string" || typeof value.newPassword !== "string") {
        const error = new Error("Authentication input is invalid"); error.code = "AUTH_INPUT_INVALID"; throw error;
      }
      state = await service.changePassword(value.loginName, value.currentPassword, value.newPassword);
      state = state || service.getState();
    } catch (error) { return authFailure(error); }
    return ok(await broadcastStateAfterRuntime(state));
  });
  ipcMain.handle("auth:refresh", async function(event, input) {
    let state;
    try {
      if (input !== undefined) safeInput(input);
      state = await service.refresh();
      state = state || service.getState();
    } catch (error) { return authFailure(error); }
    return ok(await broadcastStateAfterRuntime(state));
  });
  ipcMain.handle("auth:logout", async function(event, input) {
    try {
      if (input !== undefined) safeInput(input);
      const state = await service.logout();
      broadcast();
      return ok(state || service.getState());
    } catch (error) { return authFailure(error); }
  });
}

module.exports = { registerAuthIpc, authFailure };
