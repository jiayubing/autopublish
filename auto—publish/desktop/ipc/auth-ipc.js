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
  function reportRuntimeLifecycleFailure(code, action) {
    reportDiagnostic({
      code,
      module: "auth-ipc",
      category: "lifecycle",
      operationId: "auth-state-broadcast",
      metadata: { action, outcome: "failed" },
    });
  }
  function kickRuntime(state) {
    if (state && state.authenticated === true) {
      if (typeof options.onAuthenticated === "function") {
        void Promise.resolve(options.onAuthenticated()).catch(() => {
          reportRuntimeLifecycleFailure(
            "AUTH_RUNTIME_START_FAILED",
            "runtime-start",
          );
        });
      }
      return;
    }
    if (typeof options.onUnauthenticated === "function") {
      void Promise.resolve(options.onUnauthenticated()).catch(() => {
        reportRuntimeLifecycleFailure(
          "AUTH_RUNTIME_DISPOSE_FAILED",
          "runtime-dispose",
        );
      });
    }
  }
  function publishAuth(state) {
    kickRuntime(state);
    broadcast();
    return state;
  }
  if (typeof service.onStateChanged === "function")
    service.onStateChanged((state) => {
      publishAuth(state);
    });

  ipcMain.handle("auth:get-state", async function(event, input) {
    try {
      if (input !== undefined) safeInput(input);
      if (typeof service.initialize === "function") await service.initialize();
      const state = service.getState();
      publishAuth(state);
      return ok(state);
    } catch (error) { return authFailure(error); }
  });
  ipcMain.handle("auth:login", async function(event, input) {
    try {
      const value = safeInput(input);
      if (typeof value.loginName !== "string" || typeof value.password !== "string") {
        const error = new Error("Authentication input is invalid"); error.code = "AUTH_INPUT_INVALID"; throw error;
      }
      const state = await service.login(value.loginName, value.password);
      publishAuth(state || service.getState());
      return ok(state || service.getState());
    } catch (error) { return authFailure(error); }
  });
  ipcMain.handle("auth:change-password", async function(event, input) {
    try {
      const value = safeInput(input);
      if (typeof value.loginName !== "string" || typeof value.currentPassword !== "string" || typeof value.newPassword !== "string") {
        const error = new Error("Authentication input is invalid"); error.code = "AUTH_INPUT_INVALID"; throw error;
      }
      const state = await service.changePassword(value.loginName, value.currentPassword, value.newPassword);
      publishAuth(state || service.getState());
      return ok(state || service.getState());
    } catch (error) { return authFailure(error); }
  });
  ipcMain.handle("auth:refresh", async function(event, input) {
    try {
      if (input !== undefined) safeInput(input);
      const state = await service.refresh();
      publishAuth(state || service.getState());
      return ok(state || service.getState());
    } catch (error) { return authFailure(error); }
  });
  ipcMain.handle("auth:logout", async function(event, input) {
    try {
      if (input !== undefined) safeInput(input);
      const state = await service.logout();
      publishAuth(state || service.getState());
      return ok(state || service.getState());
    } catch (error) { return authFailure(error); }
  });
}

module.exports = { registerAuthIpc, authFailure };
