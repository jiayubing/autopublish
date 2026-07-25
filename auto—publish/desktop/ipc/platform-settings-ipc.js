const { wrap } = require("../services/ipc-response");

const MESSAGES = {
  PLATFORM_CONFIG_INVALID: "平台配置无效，请检查输入项",
  PLATFORM_CONFIG_NOT_SET: "平台尚未配置",
  PLATFORM_CONFIG_ENV_OVERRIDE: "平台配置由环境变量覆盖，只能查看",
  PLATFORM_CONFIG_ENCRYPTION_UNAVAILABLE: "应用级加密存储不可用",
  PLATFORM_CONFIG_STORAGE_INVALID: "平台配置存储损坏或不安全",
  PLATFORM_CONFIG_STORAGE_WRITE_FAILED: "平台配置保存失败",
  PLATFORM_CONFIG_BUSY: "平台投稿任务运行中，暂时不能修改配置",
  PLATFORM_CONFIG_PLATFORM_NOT_FOUND: "不支持该平台配置",
  PLATFORM_CONNECTION_FAILED: "平台连接测试失败",
  MEDIA_CONNECTION_FAILED: "付费媒体连接测试失败",
  MEDIA_HTTP_CONFIRMATION_REQUIRED: "该媒体地址使用HTTP，请明确确认未加密传输风险",
  HEPAN_CONNECTION_FAILED: "蓝色河畔连接测试失败",
  HEPAN_PYTHON_UNAVAILABLE: "蓝色河畔 Python 不可用",
  HEPAN_DEPENDENCY_MISSING: "蓝色河畔 Python 依赖缺失",
  HEPAN_COOKIE_REJECTED: "蓝色河畔 Cookie 身份无效",
  HEPAN_AUTH_REDIRECTED: "蓝色河畔登录已跳转，请更新 Cookie",
  HEPAN_CATEGORY_ACCESS_DENIED: "蓝色河畔栏目无发文权限",
  HEPAN_PUBLISH_FORM_CHANGED: "蓝色河畔发文页面结构已变化",
  HEPAN_UPLOAD_CONTEXT_CHANGED: "蓝色河畔图片上传页面结构已变化",
  HEPAN_REMOTE_TIMEOUT: "蓝色河畔网络请求超时",
  HEPAN_REMOTE_HTTP_ERROR: "蓝色河畔服务暂时异常",
  HEPAN_CHECK_RUNTIME_FAILED: "蓝色河畔检查运行失败",
  PLATFORM_CONFIG_MIGRATION_CONFIRMATION_REQUIRED: "导入旧配置前需要明确确认",
  PLATFORM_CONFIG_MIGRATION_UNAVAILABLE: "旧配置导入暂不可用",
  HEPAN_COOKIE_IMPORT_INVALID: "旧 Cookie 文件不可用"
};

function safeFailure(error) {
  const code = error && typeof error.code === "string" ? error.code : "PLATFORM_CONFIG_FAILED";
  return { ok: false, error: { code, message: MESSAGES[code] || "平台配置操作失败" } };
}

function invoke(handler) {
  return Promise.resolve().then(handler).then((data) => ({ ok: true, data }), safeFailure);
}

function platformId(value) {
  if (typeof value !== "string" || !/^[a-z0-9-]+$/.test(value)) {
    const error = new Error("Invalid platform id");
    error.code = "PLATFORM_CONFIG_INVALID";
    throw error;
  }
  return value;
}

function draft(input) {
  if (input === undefined) return undefined;
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    const error = new Error("Invalid platform configuration");
    error.code = "PLATFORM_CONFIG_INVALID";
    throw error;
  }
  return input;
}

function registerPlatformSettingsIpc(deps) {
  const service = deps.platformSettingsService;
  if (!service) throw new Error("Platform settings service is required");
  deps.ipcMain.handle("platform-settings:get-status", function(event, input) { return invoke(() => service.getStatus(platformId(input && input.platformId))); });
  deps.ipcMain.handle("platform-settings:save", function(event, input) { return invoke(() => service.save(platformId(input && input.platformId), draft(input && input.draft))); });
  deps.ipcMain.handle("platform-settings:test", function(event, input) { return invoke(() => service.test(platformId(input && input.platformId), draft(input && input.draft))); });
  deps.ipcMain.handle("platform-settings:clear", function(event, input) { return invoke(() => service.clear(platformId(input && input.platformId))); });
  if (deps.legacyProviderSettings) {
    deps.ipcMain.handle("platform-settings:get-legacy-status", function() { return invoke(() => ({ discover: deps.legacyProviderSettings.discover(), record: deps.legacyProviderSettings.getRecord() })); });
    deps.ipcMain.handle("platform-settings:import-legacy", function(event, input) { return invoke(() => deps.legacyProviderSettings.importLegacy({ confirmed: Boolean(input && input.confirmed) })); });
  }
}

module.exports = { registerPlatformSettingsIpc };
