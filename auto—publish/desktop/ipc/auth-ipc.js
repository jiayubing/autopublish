const { ok, fail } = require("../services/ipc-response");

const AUTH_ERROR_CODES = new Set(["AUTH_REQUIRED", "AUTH_INVALID_CREDENTIALS", "AUTH_ACCOUNT_DISABLED", "AUTH_ACCOUNT_LOCKED", "AUTH_LICENSE_EXPIRED", "AUTH_SESSION_EXPIRED", "AUTH_NOT_ENTITLED", "AUTH_DEVICE_LIMIT_REACHED", "AUTH_DEVICE_REVOKED", "AUTH_PASSWORD_CHANGE_REQUIRED", "AUTH_TOKEN_REUSE_DETECTED", "AUTH_RATE_LIMITED", "AUTH_SERVICE_UNAVAILABLE", "AUTH_SERVER_ERROR", "AUTH_INPUT_INVALID"]);

function authFailure(error) {
  const code = error && AUTH_ERROR_CODES.has(error.code) ? error.code : "AUTH_SERVER_ERROR";
  const messages = {
    AUTH_REQUIRED: "请先登录",
    AUTH_INVALID_CREDENTIALS: "登录名或密码错误",
    AUTH_ACCOUNT_DISABLED: "账号已禁用",
    AUTH_ACCOUNT_LOCKED: "登录失败次数过多，请稍后重试",
    AUTH_LICENSE_EXPIRED: "AutoPublish 授权已到期，请联系管理员续期",
    AUTH_SESSION_EXPIRED: "登录已失效，请重新登录",
    AUTH_NOT_ENTITLED: "当前账号没有 AutoPublish 使用授权",
    AUTH_DEVICE_LIMIT_REACHED: "设备名额已用满，请联系管理员释放旧设备",
    AUTH_DEVICE_REVOKED: "当前设备已被撤销，请联系管理员重新授权",
    AUTH_PASSWORD_CHANGE_REQUIRED: "首次登录需要先修改密码",
    AUTH_TOKEN_REUSE_DETECTED: "检测到异常会话，请重新登录",
    AUTH_RATE_LIMITED: "请求过于频繁，请稍后重试",
    AUTH_SERVICE_UNAVAILABLE: "认证服务暂时不可达，请检查网络后重试",
    AUTH_SERVER_ERROR: "认证服务暂时不可用，请稍后重试",
    AUTH_INPUT_INVALID: "登录信息无效",
  };
  return { ok: false, error: { code, message: messages[code] } };
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
  if (typeof service.onStateChanged === "function") service.onStateChanged((state) => sendToRenderer("auth-state-changed", state));

  ipcMain.handle("auth:get-state", async function(event, input) {
    try {
      if (input !== undefined) safeInput(input);
      if (typeof service.initialize === "function") await service.initialize();
      const state = service.getState();
      if (state && state.authenticated && typeof options.onAuthenticated === "function") await options.onAuthenticated();
      broadcast();
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
      if (typeof options.onAuthenticated === "function") await options.onAuthenticated();
      broadcast();
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
      if (typeof options.onAuthenticated === "function") await options.onAuthenticated();
      broadcast();
      return ok(state || service.getState());
    } catch (error) { return authFailure(error); }
  });
  ipcMain.handle("auth:refresh", async function(event, input) {
    try {
      if (input !== undefined) safeInput(input);
      const state = await service.refresh();
      if (typeof options.onAuthenticated === "function") await options.onAuthenticated();
      broadcast();
      return ok(state || service.getState());
    } catch (error) { return authFailure(error); }
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
