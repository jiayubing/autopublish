import {
  createCommandOwner,
  createQueryIdentity,
} from "../../infrastructure/query-identity/query-identity.js";

const ERROR_MESSAGES = Object.freeze({
  AI_CONFIG_INVALID: "AI 配置无效，请检查 Base URL、模型和超时时间。",
  AI_CONFIG_BUSY: "生成批次正在运行或停止，暂时不能修改 AI 配置。",
  AI_CONFIG_ENV_OVERRIDE: "AI 配置由环境变量控制，当前页面为只读。",
  AI_CONFIG_NOT_SET: "尚未配置 AI 提供方。",
  AI_CONNECTION_FAILED: "连接测试失败，请检查地址、密钥和模型。",
  PLATFORM_CONFIG_INVALID: "配置无效，请检查输入项。",
  PLATFORM_CONFIG_BUSY: "投稿运行中，暂时不能修改配置。",
  PLATFORM_CONFIG_ENV_OVERRIDE: "配置由环境变量覆盖，当前页面只能查看。",
  PLATFORM_CONFIG_NOT_SET: "尚未配置服务提供方。",
  MEDIA_HTTP_CONFIRMATION_REQUIRED:
    "该地址使用 HTTP。请勾选“允许批准的 HTTP 地址”并确认传输风险。",
  MEDIA_ENDPOINT_REQUIRED: "尚未配置媒体服务 endpoint。",
  MEDIA_CONFIG_INVALID: "媒体服务配置无效，请检查 endpoint 和超时时间。",
  MEDIA_REDIRECT_REJECTED: "媒体服务重定向已拒绝，请配置最终 endpoint。",
  MEDIA_TLS_CERTIFICATE_ERROR: "媒体服务 TLS 证书校验失败，请检查证书链。",
  MEDIA_TLS_HOSTNAME_MISMATCH: "媒体服务 TLS 主机名校验失败，请检查 endpoint。",
  MEDIA_CONNECT_TIMEOUT: "媒体服务连接超时，请检查网络或 endpoint。",
  MEDIA_READ_TIMEOUT: "媒体服务读取超时，请检查服务状态。",
  MEDIA_NETWORK_ERROR: "媒体服务网络请求失败，请检查网络。",
  MEDIA_SERVER_ERROR: "媒体服务暂时异常，请稍后重试。",
  MEDIA_REMOTE_REJECTED: "媒体服务拒绝了请求，请检查配置和权限。",
  MEDIA_PROTOCOL_ERROR: "媒体服务响应格式无效，请检查供应商接口。",
  MEDIA_TRANSPORT_UNAVAILABLE: "媒体传输能力不可用，请检查运行环境。",
  MEDIA_CONNECTION_FAILED: "连接测试失败，请检查地址和 API Key。",
  HEPAN_CREDENTIALS_INVALID: "用户 ID 或登录密码错误。",
  HEPAN_PLAN_UNAVAILABLE: "蓝色河畔 GEO 套餐不可用或已到期。",
  HEPAN_QUOTA_EXHAUSTED: "蓝色河畔本周期发帖额度已用完。",
  HEPAN_PUBLISH_DISABLED: "蓝色河畔暂时不允许该账号发布，请联系平台管理员。",
  HEPAN_RATE_LIMITED: "蓝色河畔调用频率过高，请稍后重试。",
  HEPAN_CONTENT_REJECTED: "文章内容未通过蓝色河畔接口审核。",
  HEPAN_GEO_API_TIMEOUT: "蓝色河畔 GEO API 请求超时，请稍后重试。",
  HEPAN_GEO_API_UNAVAILABLE: "蓝色河畔 GEO API 暂时不可用，请检查网络。",
  HEPAN_GEO_API_PROTOCOL_ERROR: "蓝色河畔 GEO API 返回格式异常。",
  STORAGE_MAINTENANCE_BUSY: "任务运行期间不能清理缓存。",
});

function safeError(value, fallbackCode, fallbackMessage) {
  const code =
    value && typeof value.code === "string" ? value.code : fallbackCode;
  return Object.freeze({
    code,
    category: "internal",
    retryability: "safe",
    userMessage: ERROR_MESSAGES[code] || fallbackMessage,
  });
}

function emptyQuery() {
  return Object.freeze({ loading: false, error: null, reason: null });
}

const QUERY_DEFINITIONS = Object.freeze({
  ai: ["getAiStatus", "AI_SETTINGS_QUERY_FAILED", "无法读取 AI 配置。"],
  media: [
    "getMediaStatus",
    "MEDIA_SETTINGS_QUERY_FAILED",
    "无法读取付费媒体配置。",
  ],
  hepan: [
    "getHepanStatus",
    "HEPAN_SETTINGS_QUERY_FAILED",
    "无法读取蓝色河畔配置。",
  ],
  legacy: [
    "getLegacyStatus",
    "LEGACY_SETTINGS_QUERY_FAILED",
    "无法读取旧配置状态。",
  ],
  runtime: [
    "getRuntimeDiagnostics",
    "RUNTIME_DIAGNOSTICS_QUERY_FAILED",
    "无法读取运行环境状态。",
  ],
  storage: [
    "getStorageUsage",
    "STORAGE_USAGE_QUERY_FAILED",
    "无法读取存储用量。",
  ],
});

const COMMAND_NAMES = Object.freeze([
  "saveAi",
  "testAi",
  "clearAi",
  "saveMedia",
  "testMedia",
  "clearMedia",
  "saveHepan",
  "testHepan",
  "clearHepan",
  "importLegacy",
  "runBrowserSelfCheck",
  "cleanStorageCaches",
]);

export function createSettingsFeature(adapters = {}) {
  const listeners = new Set();
  const queries = Object.fromEntries(
    Object.keys(QUERY_DEFINITIONS).map((query) => [
      query,
      createQueryIdentity({ feature: "settings", query }),
    ]),
  );
  const owners = Object.fromEntries(
    COMMAND_NAMES.map((command) => [
      command,
      createCommandOwner({ feature: "settings", command }),
    ]),
  );
  let disposed = false;
  let scope = null;
  let loadedScope = null;
  let initialLoad = null;
  const values = Object.fromEntries(
    Object.keys(QUERY_DEFINITIONS).map((query) => [
      query,
      { data: null, query: emptyQuery() },
    ]),
  );
  let snapshot;

  function publish() {
    snapshot = Object.freeze({
      scope,
      ai: Object.freeze(values.ai),
      media: Object.freeze(values.media),
      hepan: Object.freeze(values.hepan),
      legacy: Object.freeze(values.legacy),
      runtime: Object.freeze(values.runtime),
      storage: Object.freeze(values.storage),
      commands: Object.freeze(
        Object.fromEntries(
          Object.entries(owners).map(([name, owner]) => [
            name,
            owner.getSnapshot(),
          ]),
        ),
      ),
    });
    listeners.forEach((listener) => listener());
  }

  async function runQuery(name, reason = "manual") {
    if (disposed || !scope) return undefined;
    const [adapterName, fallbackCode, fallbackMessage] =
      QUERY_DEFINITIONS[name];
    const identity = queries[name];
    const token = identity.begin(undefined, reason);
    values[name] = {
      ...values[name],
      query: Object.freeze({ loading: true, error: null, reason }),
    };
    publish();
    try {
      const data = await adapters[adapterName]();
      if (!identity.isCurrent(token)) return undefined;
      values[name] = {
        data,
        query: Object.freeze({ loading: false, error: null, reason }),
      };
      publish();
      return data;
    } catch (value) {
      if (!identity.isCurrent(token)) return undefined;
      values[name] = {
        ...values[name],
        query: Object.freeze({
          loading: false,
          error: safeError(value, fallbackCode, fallbackMessage),
          reason,
        }),
      };
      publish();
      return undefined;
    }
  }

  async function execute(
    owner,
    adapter,
    input,
    fallbackCode,
    fallbackMessage,
    afterSuccess,
  ) {
    if (disposed || !scope) return undefined;
    if (owner.getSnapshot().busy) return undefined;
    const token = owner.begin(scope);
    publish();
    try {
      const result = await adapter(input);
      if (!owner.isCurrent(token)) return undefined;
      if (afterSuccess) await afterSuccess(result, token, owner);
      if (!owner.isCurrent(token)) return undefined;
      owner.finalize(token, { result });
      publish();
      return result;
    } catch (value) {
      if (owner.isCurrent(token)) {
        owner.finalize(token, {
          error: safeError(value, fallbackCode, fallbackMessage),
        });
        publish();
      }
      return undefined;
    }
  }

  function setDirect(name, data) {
    values[name] = {
      data,
      query: Object.freeze({
        loading: false,
        error: null,
        reason: "command-result",
      }),
    };
    publish();
  }

  function refresh(reason = "manual") {
    return Promise.all([
      runQuery("ai", reason),
      runQuery("media", reason),
      runQuery("hepan", reason),
      runQuery("legacy", reason),
      runQuery("runtime", reason),
      runQuery("storage", reason),
    ]);
  }

  function ensureLoaded() {
    if (disposed || !scope || loadedScope === scope)
      return Promise.resolve(undefined);
    if (initialLoad?.scope === scope) return initialLoad.promise;

    const loadScope = scope;
    const result = refresh("initial");
    let promise;
    const settle = () => {
      if (!disposed && scope === loadScope && initialLoad?.promise === promise) {
        loadedScope = loadScope;
        initialLoad = null;
      }
    };
    promise = result.then(
      (value) => {
        settle();
        return value;
      },
      (error) => {
        settle();
        throw error;
      },
    );
    initialLoad = Object.freeze({ scope: loadScope, promise });
    return promise;
  }

  const feature = {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setScope(nextScope) {
      if (disposed) return;
      if (
        !nextScope ||
        typeof nextScope.installationId !== "string" ||
        !nextScope.installationId
      )
        throw new TypeError("Settings scope is invalid");
      if (scope?.installationId === nextScope.installationId) return;
      scope = Object.freeze({ installationId: nextScope.installationId });
      loadedScope = null;
      initialLoad = null;
      for (const identity of Object.values(queries)) identity.setScope(scope);
      for (const owner of Object.values(owners)) owner.invalidate();
      for (const name of Object.keys(values))
        values[name] = { data: null, query: emptyQuery() };
      publish();
    },
    ensureLoaded,
    refresh,
    refreshAi: (reason = "manual") => runQuery("ai", reason),
    refreshMedia: (reason = "manual") => runQuery("media", reason),
    refreshHepan: (reason = "manual") => runQuery("hepan", reason),
    refreshLegacy: (reason = "manual") => runQuery("legacy", reason),
    refreshRuntime: (reason = "manual") => runQuery("runtime", reason),
    refreshStorage: (reason = "manual") => runQuery("storage", reason),
    saveAi: (input) =>
      execute(
        owners.saveAi,
        adapters.saveAi,
        input,
        "AI_SETTINGS_SAVE_FAILED",
        "AI 配置保存失败。",
        (status) => setDirect("ai", status),
      ),
    testAi: (input) =>
      execute(
        owners.testAi,
        adapters.testAi,
        input,
        "AI_SETTINGS_TEST_FAILED",
        "AI 连接测试失败。",
        () => runQuery("ai", "command-result"),
      ),
    clearAi: () =>
      execute(
        owners.clearAi,
        adapters.clearAi,
        undefined,
        "AI_SETTINGS_CLEAR_FAILED",
        "AI 配置清理失败。",
        () => runQuery("ai", "command-result"),
      ),
    saveMedia: (input) =>
      execute(
        owners.saveMedia,
        adapters.saveMedia,
        input,
        "MEDIA_SETTINGS_SAVE_FAILED",
        "付费媒体配置保存失败。",
        (status) => setDirect("media", status),
      ),
    testMedia: (input) =>
      execute(
        owners.testMedia,
        adapters.testMedia,
        input,
        "MEDIA_SETTINGS_TEST_FAILED",
        "付费媒体连接测试失败。",
        () => runQuery("media", "command-result"),
      ),
    clearMedia: () =>
      execute(
        owners.clearMedia,
        adapters.clearMedia,
        undefined,
        "MEDIA_SETTINGS_CLEAR_FAILED",
        "付费媒体配置清理失败。",
        () => runQuery("media", "command-result"),
      ),
    saveHepan: (input) =>
      execute(
        owners.saveHepan,
        adapters.saveHepan,
        input,
        "HEPAN_SETTINGS_SAVE_FAILED",
        "蓝色河畔配置保存失败。",
        (status) => setDirect("hepan", status),
      ),
    testHepan: (input) =>
      execute(
        owners.testHepan,
        adapters.testHepan,
        input,
        "HEPAN_SETTINGS_TEST_FAILED",
        "蓝色河畔连接测试失败。",
        () => runQuery("hepan", "command-result"),
      ),
    clearHepan: () =>
      execute(
        owners.clearHepan,
        adapters.clearHepan,
        undefined,
        "HEPAN_SETTINGS_CLEAR_FAILED",
        "蓝色河畔配置清理失败。",
        () => runQuery("hepan", "command-result"),
      ),
    importLegacy: () =>
      execute(
        owners.importLegacy,
        adapters.importLegacy,
        undefined,
        "LEGACY_SETTINGS_IMPORT_FAILED",
        "旧配置导入失败。",
        async () => {
          await Promise.all([
            runQuery("ai", "command-result"),
            runQuery("media", "command-result"),
            runQuery("hepan", "command-result"),
            runQuery("legacy", "command-result"),
          ]);
        },
      ),
    runBrowserSelfCheck: () =>
      execute(
        owners.runBrowserSelfCheck,
        adapters.runBrowserSelfCheck,
        undefined,
        "RUNTIME_SELF_CHECK_FAILED",
        "浏览器自检失败，请检查运行环境。",
        () => runQuery("runtime", "command-result"),
      ),
    cleanStorageCaches: () =>
      execute(
        owners.cleanStorageCaches,
        adapters.cleanStorageCaches,
        undefined,
        "STORAGE_CLEAN_FAILED",
        "缓存清理失败，任务运行期间不能清理。",
        () => runQuery("storage", "command-result"),
      ),
    dispose() {
      if (disposed) return;
      disposed = true;
      loadedScope = null;
      initialLoad = null;
      for (const identity of Object.values(queries)) identity.dispose();
      for (const owner of Object.values(owners)) owner.dispose();
      publish();
      listeners.clear();
    },
  };
  publish();
  return Object.freeze(feature);
}
