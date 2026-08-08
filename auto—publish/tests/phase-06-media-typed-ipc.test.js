const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const { registerMediaIpc } = require("../desktop/ipc/media-ipc");
const { createAuthenticatedIpcMain } = require("../desktop/ipc/register");
const {
  productionIpcRegistry,
} = require("../desktop/ipc/contracts/production-registry");
const {
  projectMediaDraft,
  projectMediaOrder,
  projectMediaResource,
} = require("../desktop/ipc/contracts/media-contracts");
const {
  createMediaWorkbenchApplication,
} = require("../desktop/services/media-workbench-application");

const MEDIA_CHANNELS = [
  "media:refresh-resources",
  "media:get-resource-page",
  "media:search-resource-page",
  "media:get-pool",
  "media:add-to-pool",
  "media:remove-from-pool",
  "media:get-balance",
  "media:get-drafts",
  "media:get-draft",
  "media:set-draft",
  "media:scan-articles",
  "media:preview-article",
  "media:get-orders",
  "media:sync-order",
  "media:sync-all-orders",
  "media:prepare-order-cancellation",
  "media:cancel-order",
  "media:prepare-cancellation-resolution",
  "media:confirm-cancellation-succeeded",
  "media:confirm-cancellation-not-applied",
  "media:prepare-order-status-anomaly-resolution",
  "media:resume-order-tracking",
  "media:confirm-order-published",
  "media:confirm-order-not-published",
  "media:open-published-url",
  "media:prepare-bind-paid-order-number",
  "media:bind-paid-order-number",
  "media:prepare-confirm-paid-order-absent",
  "media:confirm-paid-order-absent",
];

test("media projections and draft requests preserve all supported resource types", () => {
  const types = ["image", "video", "audio", "document"];
  assert.deepEqual(
    types.map((type) => projectMediaResource({ resourceId: type, type }).type),
    types,
  );
  assert.deepEqual(
    projectMediaDraft("article.md", {
      title: "Fixture",
      remark: "",
      ignoreImages: false,
      selectedResources: types.map((type) => ({ resourceId: type, type })),
    }).selectedResources.map((resource) => resource.type),
    types,
  );

  const contract = productionIpcRegistry.byChannel("media:set-draft");
  const request = productionIpcRegistry.encodeRequest(contract, {
    filename: "article.md",
    draft: {
      selectedResources: [{ resourceId: "audio", type: "audio" }],
    },
  });
  assert.equal(request.payload.draft.selectedResources[0].type, "audio");
});

test("media order IPC projection preserves a zero actual amount", () => {
  assert.equal(
    projectMediaOrder({
      orderNid: "order-zero",
      actualAmount: 0,
    }).actualAmount,
    "0",
  );
});

test("paid-media confirmation establishes a paused batch without starting order creation", async () => {
  let starts = 0;
  const application = createMediaWorkbenchApplication({
    mediaClientProvider: () => ({}),
    mediaResourceService: {},
    mediaOrderService: { listOrderViews: () => [] },
    resourceStore: { getAll: () => ({ resources: [] }) },
    poolStore: { getAll: () => [] },
    draftStore: { get: () => null },
    mediaWorkbenchService: {
      scanArticles: async () => [],
      resolveSubmissionFile: (filename) => filename,
    },
    paidMediaPreflightService: {
      confirm: async () => ({
        batchId: "paid-batch-paused",
        status: "queued",
      }),
    },
    paidMediaBatchOrchestrator: {
      startBatch: async () => {
        starts += 1;
        return { status: "submitted" };
      },
    },
  });

  const result = await application.confirmPaidMedia({
    confirmationToken: "confirmation-1",
    confirmed: true,
  });

  assert.equal(result.batchId, "paid-batch-paused");
  assert.equal(result.execution, undefined);
  assert.equal(starts, 0);
});

test("public media pool command projects a full Renderer resource to its exact selection DTO", async () => {
  const calls = [];
  const exposed = {};
  const source = fs.readFileSync(
    path.join(__dirname, "..", "desktop", "preload.js"),
    "utf8",
  );
  vm.runInNewContext(source, {
    require(name) {
      if (name === "electron") {
        return {
          contextBridge: {
            exposeInMainWorld(name, api) {
              exposed[name] = api;
            },
          },
          ipcRenderer: {
            invoke(channel, request) {
              calls.push([channel, request]);
              const contract = productionIpcRegistry.byChannel(channel);
              return Promise.resolve(
                productionIpcRegistry.success(contract, {
                  resource: {
                    resourceId: "resource-1",
                    name: "Fixture resource",
                    price: 12.5,
                    type: "image",
                    createdAt: "2026-07-27T00:00:00.000Z",
                  },
                }),
              );
            },
            on() {},
            removeListener() {},
          },
        };
      }
      if (name === "./ipc/contracts/production-registry")
        return { productionIpcRegistry };
      throw new Error("Unexpected preload dependency: " + name);
    },
  });

  const result = await exposed.desktopConsole.media.addToPool({
    resourceId: "resource-1",
    name: "Fixture resource",
    price: 12.5,
    type: "image",
    url: "https://example.com/resource-1",
    createdAt: "2026-07-27T00:00:00.000Z",
  });

  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(calls.length, 1);
  const contract = productionIpcRegistry.byChannel("media:add-to-pool");
  assert.deepEqual(
    { ...productionIpcRegistry.parseRequest(contract, calls[0][1]).resource },
    {
      resourceId: "resource-1",
      name: "Fixture resource",
      price: 12.5,
      type: "image",
    },
  );
});

test("order query DTO exposes only the published-link fact and never raw evidence or workflow identifiers", () => {
  const contract = productionIpcRegistry.byCapability("media.getOrders");
  const payload = productionIpcRegistry.success(contract, {
    items: [
      {
        title: "Fixture",
        orderNid: "order-1",
        statusCode: "2",
        createdAt: "2026-07-28T00:00:00.000Z",
        submittedAt: "2026-07-28T00:00:00.000Z",
        publishedAt: "2026-07-28T00:01:00.000Z",
        resourceName: "媒体",
        price: "1",
        actualAmount: "1",
        hasPublishedUrl: true,
        anomaly: null,
        cancellation: null,
      },
    ],
  });
  const order = payload.data.items[0];
  for (const key of [
    "orderUrl",
    "publicationId",
    "attemptId",
    "publicationStatus",
    "resourceId",
    "filename",
    "errorCode",
  ])
    assert.equal(key in order, false, key);
  assert.equal(order.hasPublishedUrl, true);
});

test("all 29 consumed media invokes have versioned exact contracts", () => {
  const media = productionIpcRegistry
    .list()
    .filter((contract) => contract.feature === "media");
  assert.equal(media.length, 29);
  assert.deepEqual(
    media.map((contract) => contract.channel).sort(),
    [...MEDIA_CHANNELS].sort(),
  );
  for (const channel of MEDIA_CHANNELS) {
    const contract = productionIpcRegistry.byChannel(channel);
    assert.equal(contract.schemaVersion, 1, channel);
    assert.ok(contract.request, channel);
    assert.ok(contract.success, channel);
    assert.ok(contract.errorCodes.includes("AUTH_REQUIRED"), channel);
    assert.ok(contract.errorCodes.includes("IPC_REQUEST_INVALID"), channel);
    assert.ok(contract.errorCodes.includes("IPC_RESULT_INVALID"), channel);
  }
});

test("open order-status anomaly errors round-trip through the production registry with a safe descriptor", () => {
  const contract = productionIpcRegistry.byChannel("media:sync-order");
  const response = productionIpcRegistry.failure(
    contract,
    Object.assign(new Error("raw provider details must not cross IPC"), {
      code: "ORDER_STATUS_ANOMALY_OPEN",
    }),
  );
  assert.deepEqual(response.error, {
    code: "ORDER_STATUS_ANOMALY_OPEN",
    category: "conflict",
    retryability: "manual-check",
    userMessage: "订单状态异常尚未收口，请先完成人工核对。",
  });
  assert.deepEqual(productionIpcRegistry.parseResult(contract, response), {
    code: "ORDER_STATUS_ANOMALY_OPEN",
    category: "conflict",
    retryability: "manual-check",
    userMessage: "订单状态异常尚未收口，请先完成人工核对。",
  });
});

test("media page contracts fail closed above 100 and on unknown fields", () => {
  const page = productionIpcRegistry.byChannel("media:get-resource-page");
  assert.throws(
    () => productionIpcRegistry.encodeRequest(page, { page: 1, pageSize: 101 }),
    { code: "IPC_REQUEST_INVALID" },
  );
  assert.throws(
    () =>
      productionIpcRegistry.encodeRequest(page, {
        page: 1,
        pageSize: 50,
        maxResources: 99999,
      }),
    { code: "IPC_UNKNOWN_FIELD" },
  );

  const search = productionIpcRegistry.byChannel("media:search-resource-page");
  assert.deepEqual(search.toArgs({ query: "hotel", page: 2, pageSize: 50 }), [
    { keyword: "hotel", page: 2, pageSize: 50 },
  ]);
});

test("media pool is a bounded page plus membership projection, never a full resource clone", () => {
  const contract = productionIpcRegistry.byChannel("media:get-pool");
  const encoded = productionIpcRegistry.encodeRequest(contract, {
    page: 1,
    pageSize: 50,
    resourceIds: ["resource-1"],
  });
  assert.equal(encoded.payload.pageSize, 50);
  assert.deepEqual(encoded.payload.resourceIds, ["resource-1"]);
  assert.throws(
    () =>
      productionIpcRegistry.encodeRequest(contract, {
        page: 1,
        pageSize: 101,
        resourceIds: [],
      }),
    { code: "IPC_REQUEST_INVALID" },
  );
  const result = productionIpcRegistry.success(contract, {
    items: [],
    memberResourceIds: ["resource-1"],
    total: 0,
    page: 1,
    pageSize: 50,
    totalPages: 0,
    hasPrev: false,
    hasNext: false,
  });
  assert.equal(result.data.items.length, 0);
  assert.equal(result.data.memberResourceIds.length, 1);
  assert.throws(
    () =>
      productionIpcRegistry.success(contract, {
        items: Array.from({ length: 101 }, (_, index) => ({
          resourceId: `r-${index}`,
        })),
        memberResourceIds: [],
        total: 101,
        page: 1,
        pageSize: 100,
        totalPages: 2,
        hasPrev: false,
        hasNext: true,
      }),
    { code: "IPC_RESULT_INVALID" },
  );
});

test("media refresh and projections reject full resources, paths, and raw provider data", () => {
  const refresh = productionIpcRegistry.byChannel("media:refresh-resources");
  assert.throws(
    () =>
      productionIpcRegistry.success(refresh, {
        status: "complete",
        complete: true,
        truncated: false,
        truncationReason: null,
        pageCount: 1,
        resourceCount: 1,
        diagnostics: [],
        refreshedAt: "2026-07-26T00:00:00.000Z",
        resources: [{ resourceId: "resource-1" }],
      }),
    { code: "IPC_UNKNOWN_FIELD" },
  );

  const articles = productionIpcRegistry.byChannel("media:scan-articles");
  assert.throws(
    () =>
      productionIpcRegistry.success(articles, {
        items: [
          {
            filename: "article.md",
            title: "Article",
            autoTitle: "Article",
            remark: "",
            hasImages: false,
            imageCount: 0,
            ignoreImages: false,
            selectedResources: [],
            filePath: "C:\\private\\article.md",
          },
        ],
      }),
    { code: "IPC_UNKNOWN_FIELD" },
  );

  const orders = productionIpcRegistry.byChannel("media:get-orders");
  assert.throws(
    () => productionIpcRegistry.success(orders, { items: [{ raw: "secret" }] }),
    { code: "IPC_UNKNOWN_FIELD" },
  );
});

test("media registrar projects resources and articles without exposing legacy paid-submit commands", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "phase-06-media-ipc-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const data = path.join(root, "data");
  const mediaInput = path.join(root, "input", "media");
  fs.mkdirSync(data, { recursive: true });
  fs.mkdirSync(mediaInput, { recursive: true });
  fs.writeFileSync(
    path.join(data, "media-resources.json"),
    JSON.stringify({
      resources: [
        {
          resourceId: "resource-1",
          name: "Fixture resource",
          price: 12.5,
          raw: { apiKey: "provider-secret", path: "C:\\private" },
        },
      ],
    }),
  );
  fs.writeFileSync(
    path.join(mediaInput, "article.md"),
    "# Fixture article\nBody",
  );

  const handlers = new Map();
  const ipcMain = createAuthenticatedIpcMain(
    { handle: (channel, handler) => handlers.set(channel, handler) },
    async () => {},
  );
  const client = {
    endpointPolicy: { hostname: "api.supplier.example" },
    mediaList: async () => ({
      data: [
        {
          resource_id: "resource-2",
          name: "Remote fixture",
          price: 20,
          apiKey: "provider-secret",
        },
      ],
      total: 1,
      hasNext: false,
    }),
    getBalance: async () => ({ balance: "100" }),
  };
  const openedUrls = [];
  registerMediaIpc({
    ipcMain,
    paths: { data, mediaInput },
    rootDir: root,
    mediaClientProvider: () => client,
    orderObservationTransitions: {
      listOrderObservationViews: () => [
        {
          orderId: "order-published",
          statusCode: "2",
          remoteUrl: "https://publisher.example/article/1",
        },
      ],
      getOrderObservationContext: () => ({
        orderSnapshotFingerprint: "a".repeat(64),
        remoteUrl: "https://publisher.example/article/1",
      }),
      recordOrderObservation: () => ({}),
      recordOrderStatusAnomaly: () => ({}),
      prepareOrderStatusAnomalyResolution: () => ({}),
      resumeOrderTracking: () => ({}),
      confirmOrderPublished: () => ({}),
      confirmOrderNotPublished: () => ({}),
    },
    openExternal: async (url) => openedUrls.push(url),
  });

  const pageContract = productionIpcRegistry.byChannel(
    "media:get-resource-page",
  );
  const page = await handlers.get(pageContract.channel)(
    {},
    productionIpcRegistry.encodeRequest(pageContract, {
      page: 1,
      pageSize: 50,
    }),
  );
  assert.equal(page.ok, true, JSON.stringify(page));
  assert.equal(page.schemaVersion, 1);
  assert.equal(page.data.items.length, 1);
  assert.equal("raw" in page.data.items[0], false);

  const articleContract = productionIpcRegistry.byChannel(
    "media:scan-articles",
  );
  const articles = await handlers.get(articleContract.channel)(
    {},
    productionIpcRegistry.encodeRequest(articleContract, {}),
  );
  assert.equal(articles.ok, true);
  assert.equal(articles.data.items[0].filename, "article.md");
  assert.equal("filePath" in articles.data.items[0], false);

  const previewContract = productionIpcRegistry.byChannel(
    "media:preview-article",
  );
  const preview = await handlers.get(previewContract.channel)(
    {},
    productionIpcRegistry.encodeRequest(previewContract, {
      filename: "article.md",
    }),
  );
  assert.equal(preview.ok, true, JSON.stringify(preview));
  assert.equal(preview.data.article.content, "# Fixture article\nBody");

  assert.equal(
    productionIpcRegistry.byChannel("media:build-confirmation"),
    null,
  );
  assert.equal(productionIpcRegistry.byChannel("media:submit-selected"), null);

  const openContract = productionIpcRegistry.byChannel(
    "media:open-published-url",
  );
  const opened = await handlers.get(openContract.channel)(
    {},
    productionIpcRegistry.encodeRequest(openContract, {
      orderNid: "order-published",
    }),
  );
  assert.equal(opened.ok, true, JSON.stringify(opened));
  assert.deepEqual(openedUrls, ["https://publisher.example/article/1"]);

  const refreshContract = productionIpcRegistry.byChannel(
    "media:refresh-resources",
  );
  const refresh = await handlers.get(refreshContract.channel)(
    {},
    productionIpcRegistry.encodeRequest(refreshContract, {}),
  );
  assert.equal(refresh.ok, true);
  assert.equal(refresh.data.resourceCount, 1);
  assert.equal("resources" in refresh.data, false);
});
