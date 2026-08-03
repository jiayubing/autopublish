const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const {
  createAuthenticatedIpcMain,
  registerIpc,
} = require("../desktop/ipc/register");
const {
  productionIpcRegistry,
} = require("../desktop/ipc/contracts/production-registry");
const {
  createWorkspaceDataInvalidation,
} = require("../desktop/workspace-data-invalidation");

function loadPreloadEventHarness() {
  const exposed = {};
  const listeners = new Map();
  const source = fs.readFileSync(
    path.resolve(__dirname, "../desktop/preload.js"),
    "utf8",
  );
  vm.runInNewContext(source, {
    require(name) {
      if (name === "electron")
        return {
          contextBridge: {
            exposeInMainWorld(name, api) {
              exposed[name] = api;
            },
          },
          ipcRenderer: {
            invoke() {},
            on(channel, listener) {
              listeners.set(channel, listener);
            },
            removeListener() {},
          },
        };
      if (name === "./ipc/contracts/production-registry")
        return { productionIpcRegistry };
      throw new Error(`Unexpected preload dependency: ${name}`);
    },
  });
  return { api: exposed.desktopConsole, listeners };
}

test("production typed query and command reject legacy wire input and return versioned safe results", async () => {
  const handlers = new Map();
  const guarded = createAuthenticatedIpcMain(
    { handle: (channel, handler) => handlers.set(channel, handler) },
    async () => undefined,
  );
  guarded.handle("media:get-balance", async () => ({ ok: true, data: { balance: "12.50" } }));

  const balance = productionIpcRegistry.byChannel("media:get-balance");
  const rejected = await handlers.get(balance.channel)({});
  assert.equal(rejected.schemaVersion, 1);
  assert.equal(rejected.ok, false);
  assert.equal(rejected.error.code, "IPC_REQUEST_INVALID");

  assert.deepEqual(
    await handlers.get(balance.channel)({}, productionIpcRegistry.encodeRequest(balance, {})),
    { schemaVersion: 1, ok: true, data: { balance: "12.50" } },
  );
});

test("authenticated registrar rejects an unregistered non-Auth channel before handler installation", () => {
  const guarded = createAuthenticatedIpcMain(
    { handle: () => { throw new Error("must not register"); } },
    async () => undefined,
  );
  assert.throws(
    () => guarded.handle("media:typo", async () => ({ ok: true, data: {} })),
    { code: "IPC_CONTRACT_REQUIRED" },
  );
});

test("authenticated IPC registration removes handlers when a later registrar fails", () => {
  const handlers = new Map();
  const accountProfilePath = require.resolve("../desktop/ipc/account-profile-ipc");
  const originalAccountProfileModule = require.cache[accountProfilePath];
  require.cache[accountProfilePath] = {
    id: accountProfilePath,
    filename: accountProfilePath,
    loaded: true,
    exports: {
      registerAccountProfileIpc() {
        throw new Error("account profile registrar failed");
      },
    },
  };
  try {
    assert.throws(
      () => registerIpc({
        ipcMain: {
          handle(channel, handler) {
            handlers.set(channel, handler);
          },
          removeHandler(channel) {
            handlers.delete(channel);
          },
        },
        operationalStore: { listPublicationRecords() { return []; } },
        getWorkspaceRuntimeIdentity() {
          return { workspaceRuntimeId: "runtime-1", revision: 0 };
        },
      }),
      /account profile registrar failed/,
    );
    assert.deepEqual([...handlers.keys()], []);
  } finally {
    if (originalAccountProfileModule) require.cache[accountProfilePath] = originalAccountProfileModule;
    else delete require.cache[accountProfilePath];
  }
});

test("production typed IPC converts authentication, handler, and result failures without raw details", async () => {
  const handlers = new Map();
  const guarded = createAuthenticatedIpcMain(
    { handle: (channel, handler) => handlers.set(channel, handler) },
    async () => {
      throw Object.assign(new Error("C:\\private\\auth.db"), { code: "AUTH_REQUIRED" });
    },
  );
  guarded.handle("media:get-balance", async () => ({ ok: true, data: { balance: "12", raw: "secret" } }));
  const contract = productionIpcRegistry.byChannel("media:get-balance");
  const response = await handlers.get(contract.channel)({}, productionIpcRegistry.encodeRequest(contract, {}));
  assert.equal(response.ok, false);
  assert.equal(response.error.category, "authentication");
  assert.doesNotMatch(JSON.stringify(response), /private|auth\.db/i);
});

test("workspace invalidation emits the versioned opaque runtime event", () => {
  const sent = [];
  const invalidation = createWorkspaceDataInvalidation({
    workspaceRuntimeId: "runtime-opaque-123",
    sendToRenderer: (channel, payload) => sent.push({ channel, payload }),
  });
  invalidation.invalidate("CONTENT_SOURCE_CHANGED");
  assert.deepEqual(invalidation.getRuntimeIdentity(), {
    workspaceRuntimeId: "runtime-opaque-123",
    revision: 1,
  });
  assert.deepEqual(sent, [{
    channel: "workspace:data-invalidated",
    payload: {
      schemaVersion: 1,
      workspaceRuntimeId: "runtime-opaque-123",
      revision: 1,
      scopes: ["contentSources"],
      reasonCode: "CONTENT_SOURCE_CHANGED",
    },
  }]);
  assert.doesNotMatch(JSON.stringify(sent), /[A-Z]:\\|workspacePath|filePath/);
});

test("workspace runtime identity is a versioned path-free query", async () => {
  const handlers = new Map();
  const guarded = createAuthenticatedIpcMain(
    { handle: (channel, handler) => handlers.set(channel, handler) },
    async () => undefined,
  );
  guarded.handle("workspace:get-runtime-identity", async () => ({
    ok: true,
    data: { workspaceRuntimeId: "runtime-opaque-123", revision: 4 },
  }));
  const contract = productionIpcRegistry.byCapability("workspace.getRuntimeIdentity");
  assert.ok(contract);
  assert.deepEqual(
    await handlers.get(contract.channel)({}, productionIpcRegistry.encodeRequest(contract, {})),
    {
      schemaVersion: 1,
      ok: true,
      data: { workspaceRuntimeId: "runtime-opaque-123", revision: 4 },
    },
  );
  assert.doesNotMatch(JSON.stringify(contract), /workspacePath|filePath|database|cookie/i);
});

test("workspace runtime identity retains its established safe error messages", () => {
  const contract = productionIpcRegistry.byCapability("workspace.getRuntimeIdentity");
  assert.deepEqual(
    Object.fromEntries([
      "AUTH_REQUIRED",
      "IPC_REQUEST_INVALID",
      "IPC_RESULT_INVALID",
      "IPC_INTERNAL",
    ].map((code) => [code, contract.errors[code].userMessage])),
    {
      AUTH_REQUIRED: "请先完成登录后再继续。",
      IPC_REQUEST_INVALID: "请求数据无效，请刷新页面后重试。",
      IPC_RESULT_INVALID: "操作结果未通过安全校验，请刷新后重试。",
      IPC_INTERNAL: "无法读取当前工作区运行身份，请刷新后重试。",
    },
  );
});

test("preload consumes the shared registry without exposing invoke, on, or channel names", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "desktop", "preload.js"), "utf8");
  assert.match(source, /productionIpcRegistry/);
  assert.doesNotMatch(source, /exposeInMainWorld\([^)]*ipcRenderer/);
  assert.doesNotMatch(source, /\bdesktopConsole\s*\.\s*(invoke|on|channel)\b/);
});

test("preload raw transport is closed except for the explicit Phase 07 Auth exemption", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../desktop/preload.js"), "utf8");
  for (const channel of ["auth:get-state", "auth:login", "auth:change-password", "auth:refresh", "auth:logout", "auth-state-changed"])
    assert.match(source, new RegExp(`["']${channel}["']`), channel);
  assert.match(source, /AUTH_INVOKE_EXEMPTIONS/);
  assert.match(source, /AUTH_EVENT_EXEMPTIONS/);
  assert.doesNotMatch(source, /!contract\s*\|\|\s*contract\.kind\s*===\s*["']event["']\)\s*return electronIpcRenderer\.invoke/);
  assert.doesNotMatch(source, /!contract\s*\|\|\s*contract\.kind\s*!==\s*["']event["']\)\s*return electronIpcRenderer\.on/);
});

test("preload drops malformed typed content events before public listeners", () => {
  const { api, listeners } = loadPreloadEventHarness();
  const received = [];
  api.content.onDoubaoQueueState((payload) => received.push(payload));
  api.content.onGenerationBatchState((payload) => received.push(payload));
  api.content.onArticleRemovalTransaction((payload) => received.push(payload));
  for (const channel of [
    "content:doubao-queue-state",
    "content:generation-batch-state",
    "content:article-removal-transaction",
  ])
    listeners.get(channel)({}, { schemaVersion: 1 });
  assert.deepEqual(received, []);
});

test("preload invokes a throwing typed event listener exactly once", () => {
  const { api, listeners } = loadPreloadEventHarness();
  const failure = new Error("listener failed");
  let calls = 0;
  api.workspaceData.onInvalidated(() => {
    calls += 1;
    throw failure;
  });
  const payload = {
    schemaVersion: 1,
    workspaceRuntimeId: "runtime-1",
    revision: 1,
    scopes: ["contentSources"],
    reasonCode: "CONTENT_SOURCE_CHANGED",
  };
  assert.throws(
    () => listeners.get("workspace:data-invalidated")({}, payload),
    (error) => error === failure,
  );
  assert.equal(calls, 1);
});

test("every production contract error closes to a parseable SafeOperationalError", () => {
  for (const contract of productionIpcRegistry.list()) {
    if (contract.kind === "event") continue;
    for (const code of contract.errorCodes) {
      const response = productionIpcRegistry.failure(contract, { code });
      const parsed = productionIpcRegistry.parseResult(contract, response);
      assert.equal(parsed.code, code, `${contract.channel}:${code}`);
      assert.doesNotMatch(
        JSON.stringify(response),
        /[A-Z]:\\|"stack"\s*:|"filePath"\s*:|"workspacePath"\s*:|"cookie"\s*:|"apiKey"\s*:/i,
      );
    }
  }
});

test("every production capability rejects semantically sensitive but shape-valid safe error text", () => {
  const sensitive = [
    "C:\\private\\workspace\\data.sqlite",
    "https://user:password@example.test/published?token=secret#cookie",
    "Cookie: session=secret; API key=secret",
    "Error: remote failed\n    at publish (C:\\private\\worker.js:1:1)",
    "原始投稿正文：仅供内部使用",
  ];
  for (const contract of productionIpcRegistry.list()) {
    if (contract.kind === "event" || contract.errorCodes.length === 0) continue;
    const code = contract.errorCodes[0];
    for (const userMessage of sensitive) {
      const response = productionIpcRegistry.failure(contract, {
        code,
        category: "internal",
        retryability: "manual-check",
        userMessage,
        diagnosticId: "diag-unsafe-path",
      });
      assert.doesNotMatch(JSON.stringify(response), /private|password|cookie|api key|原始投稿正文/i, `${contract.channel}:${userMessage}`);
      assert.deepEqual(response.error, { code, ...contract.errors[code], diagnosticId: "diag-unsafe-path" });
    }
  }
});

test("generation runtime events are versioned, exact, and redact task failures", () => {
  const contract = productionIpcRegistry.byCapability("generation.runtimeChanged");
  assert.ok(contract);
  const payload = {
    runtimeId: "runner-1",
    sequence: 7,
    batchId: "batch-1",
    status: "failed",
    counts: { total: 1, succeeded: 0, failed: 1, pending: 0, interrupted: 0, cancelled: 0 },
    updatedAt: "2026-07-26T00:00:00.000Z",
    batch: {
      id: "batch-1",
      status: "failed",
      clientSources: [],
      templates: [],
      tasks: [{ id: "task-1", clientId: "client-1", platform: "xhs", templateId: "guide", materialIds: [], researchQueryIds: [], status: "failed", attempts: 1, error: { code: "REMOTE_FAILED", message: "C:\\private\\secret.txt" } }],
      counts: { total: 1, succeeded: 0, failed: 1, pending: 0, interrupted: 0, cancelled: 0 },
    },
    capabilities: { canResume: true, canContinue: true, canRetry: true, canCancel: false },
  };
  const encoded = productionIpcRegistry.event(contract, payload);
  assert.equal(encoded.schemaVersion, 1);
  assert.equal(encoded.batch.tasks[0].error.code, "REMOTE_FAILED");
  assert.doesNotMatch(JSON.stringify(encoded), /private|secret\.txt/i);
  assert.throws(() => productionIpcRegistry.parseEvent(contract, { ...encoded, raw: "log" }), { code: "IPC_EVENT_INVALID" });
  assert.throws(() => productionIpcRegistry.event(contract, { ...payload, sequence: 7.5 }), { code: "IPC_EVENT_INVALID" });
});

test("production has no raw publish-log sender or consumer", () => {
  const productionRoots = ["desktop", path.join("media-workbench", "src"), "src"];
  const matches = [];
  function visit(target) {
    for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
      const full = path.join(target, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (/\.(?:js|ts|tsx)$/.test(entry.name) && fs.readFileSync(full, "utf8").includes("publish-log")) matches.push(full);
    }
  }
  productionRoots.forEach(visit);
  assert.deepEqual(matches, []);
});
