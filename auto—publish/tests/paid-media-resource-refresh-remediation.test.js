"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { createMediaWorkbenchApplication } = require("../desktop/services/media-workbench-application");
const { registerMediaIpc } = require("../desktop/ipc/media-ipc");
const { createAuthenticatedIpcMain } = require("../desktop/ipc/register");
const { productionIpcRegistry } = require("../desktop/ipc/contracts/production-registry");
const { MediaClient } = require("../src/platforms/media/media-client");
const { createMediaSupplierAdapter } = require("../src/platforms/media/media-supplier-adapter");
const { createMediaResourceService } = require("../desktop/services/media-resource-service");
const { setDiagnosticReporter } = require("../src/diagnostics/diagnostic-producer");
const { runRendererModule } = require("./helpers/run-renderer-module");

const APIFOX_RESOURCE_LIST = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "fixtures", "media-resource-list-apifox-anonymized.json"),
    "utf8",
  ),
);

function response(value, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(value),
  };
}

function mediaClient(value, options = {}) {
  let callCount = 0;
  return new MediaClient({
    apiKey: "synthetic-key",
    baseUrl: "https://media.example.test",
    fetch: async (_url, request) => {
      callCount += 1;
      const next = typeof options.responseForCall === "function"
        ? options.responseForCall(callCount, request)
        : value;
      return response(next, options.status || 200);
    },
  });
}

function typedMediaApplication(application) {
  const handlers = new Map();
  const ipcMain = createAuthenticatedIpcMain(
    { handle: (channel, handler) => handlers.set(channel, handler) },
    async () => undefined,
  );
  registerMediaIpc({ ipcMain, mediaApplication: application });

  return {
    async invoke(capability, input = {}) {
      const contract = productionIpcRegistry.byCapability(capability);
      const request = productionIpcRegistry.encodeRequest(contract, input);
      return handlers.get(contract.channel)(null, request);
    },
  };
}

function applicationWithClient(client, setAll = () => {}) {
  const clientProvider = typeof client === "function" ? client : () => client;
  return createMediaWorkbenchApplication({
    mediaClientProvider: clientProvider,
    resourceStore: { getAll: () => null, setAll },
    poolStore: { getAll: () => [] },
    mediaOrderService: { listOrderViews: () => [] },
  });
}

test("Apifox website-media resource response refreshes through persistence and typed IPC", async () => {
  const writes = [];
  const app = applicationWithClient(mediaClient(APIFOX_RESOURCE_LIST, {
    responseForCall: (callCount) => callCount === 1
      ? APIFOX_RESOURCE_LIST
      : { code: 1, msg: "success", time: "0", data: [] },
  }), (...args) => {
    writes.push(args);
  });
  const ipc = typedMediaApplication(app);

  const result = await ipc.invoke("media.refreshResources");

  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.data.status, "complete");
  assert.equal(result.data.resourceCount, 2);
  assert.equal(writes.length, 1);
  assert.deepEqual(
    writes[0][0].map((item) => [item.resourceId, item.available]),
    [["101", true], ["102", false]],
  );
});

test("resource-list request uses the documented page and page_size contract", async () => {
  const requests = [];
  const client = new MediaClient({
    apiKey: "synthetic-key",
    baseUrl: "https://media.example.test",
    fetch: async (url, options) => {
      requests.push({ url, body: options.body.toString("utf8") });
      return response(APIFOX_RESOURCE_LIST);
    },
  });

  await createMediaSupplierAdapter({ client }).refreshMediaResources({
    page: 2,
    pageSize: 20,
  });

  assert.deepEqual(requests.map((item) => item.url), [
    "https://media.example.test/api/media/media_list",
  ]);
  assert.match(requests[0].body, /name="page"\r?\n\r?\n2/);
  assert.match(requests[0].body, /name="page_size"\r?\n\r?\n20/);
  assert.doesNotMatch(requests[0].body, /name="pageSize"/);
});

test("fetchAll does not stop after one page when the website-media response omits pagination metadata", async () => {
  const pages = [
    {
      code: 1,
      msg: "success",
      time: "0",
      data: [{ resource_id: 201, title: "example-page-one", status: 1, price: "1.00" }],
    },
    {
      code: 1,
      msg: "success",
      time: "0",
      data: [{ resource_id: 202, title: "example-page-two", status: 1, price: "2.00" }],
    },
    { code: 1, msg: "success", time: "0", data: [] },
  ];
  let calls = 0;
  const writes = [];
  const adapter = createMediaSupplierAdapter({
    client: {
      refreshMediaResources: async ({ page }) => {
        calls += 1;
        return pages[page - 1];
      },
    },
  });
  const service = createMediaResourceService({
    resourceStore: {
      getAll: () => null,
      setAll: (resources) => writes.push(resources),
    },
    supplierProvider: () => adapter,
  });

  const result = await service.refreshResources({ fetchAll: true, pageSizeHint: 1 });

  assert.equal(result.status, "complete");
  assert.equal(result.resourceCount, 2);
  assert.equal(calls, 3);
  assert.deepEqual(writes[0].map((resource) => resource.resourceId), ["201", "202"]);
});

test("known resource refresh failures keep stable typed IPC categories and safe diagnostics", async () => {
  const cases = [
    {
      name: "configuration",
      client: () => { throw Object.assign(new Error("missing provider config"), { code: "MEDIA_CONFIG_NOT_SET" }); },
      code: "MEDIA_CONFIG_NOT_SET",
    },
    {
      name: "timeout",
      client: { refreshMediaResources: async () => { throw Object.assign(new Error("upstream secret"), { code: "MEDIA_READ_TIMEOUT" }); } },
      code: "MEDIA_READ_TIMEOUT",
    },
    {
      name: "remote rejection",
      client: mediaClient({ code: 0, msg: "private supplier rejection", time: "0", data: [] }),
      code: "MEDIA_RESOURCE_REMOTE_REJECTED",
    },
    {
      name: "protocol",
      client: mediaClient({ code: 1, msg: "success", time: "0", data: { list: [] } }),
      code: "MEDIA_RESOURCE_SUPPLIER_PROTOCOL_ERROR",
    },
    {
      name: "normalization",
      client: mediaClient({ code: 1, msg: "success", time: "0", data: [{ title: "missing id" }] }),
      code: "MEDIA_RESOURCE_NORMALIZATION_FAILED",
    },
    {
      name: "persistence",
      client: mediaClient(APIFOX_RESOURCE_LIST),
      setAll: () => { throw new Error("C:\\private\\media-resources.json"); },
      code: "MEDIA_RESOURCE_PERSISTENCE_FAILED",
    },
  ];

  for (const item of cases) {
    const records = [];
    const restore = setDiagnosticReporter((record) => {
      records.push(record);
      return true;
    });
    try {
      const app = applicationWithClient(item.client, item.setAll);
      const result = await typedMediaApplication(app).invoke("media.refreshResources");
      assert.equal(result.ok, false, item.name);
      assert.equal(result.error.code, item.code, item.name);
      assert.notEqual(result.error.code, "IPC_INTERNAL", item.name);
      assert.doesNotMatch(JSON.stringify(result), /secret|private|api.?key|authorization|cookie/i, item.name);
      assert.doesNotMatch(JSON.stringify(records), /secret|private|api.?key|authorization|cookie/i, item.name);
      assert.ok(records.length >= 1, item.name);
    } finally {
      restore();
    }
  }
});

test("renderer bridge preserves every stable refresh error as a safe user-facing error", () => {
  runRendererModule(
    "bridge/media",
    `
      import assert from "node:assert/strict";
      const cases = [
        ["MEDIA_CONFIG_NOT_SET", "请先配置付费媒体服务。"],
        ["MEDIA_READ_TIMEOUT", "媒体资源列表读取超时，请稍后重试或检查诊断信息。"],
        ["MEDIA_RESOURCE_REMOTE_REJECTED", "媒体服务拒绝获取资源列表，请检查权限或账号能力。"],
        ["MEDIA_RESOURCE_SUPPLIER_PROTOCOL_ERROR", "媒体服务资源列表响应格式无法识别，请检查诊断信息。"],
        ["MEDIA_RESOURCE_NORMALIZATION_FAILED", "媒体服务返回的资源数据无法识别，请检查诊断信息。"],
        ["MEDIA_RESOURCE_PERSISTENCE_FAILED", "媒体资源库保存失败，请检查本地存储和诊断信息。"],
      ];
      globalThis.window = { desktopConsole: { media: {
        refreshResources: async () => ({
          ok: false,
          error: {
            code: cases[0][0],
            category: "validation",
            retryability: "manual-check",
            userMessage: cases[0][1],
          },
        }),
      } } };
      const bridge = await __M05_RENDERER_MODULE__;
      for (const [code, message] of cases) {
        globalThis.window.desktopConsole.media.refreshResources = async () => ({
          ok: false,
          error: { code, category: "internal", retryability: "manual-check", userMessage: message },
        });
        await assert.rejects(bridge.refreshResources(), (error) =>
          error.code === code && error.message === message && error.userMessage === message,
        );
      }
    `,
  );
});
