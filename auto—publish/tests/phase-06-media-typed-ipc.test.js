const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const { registerMediaIpc } = require("../desktop/ipc/media-ipc");
const {
  createAuthenticatedIpcMain,
} = require("../desktop/ipc/register");
const {
  productionIpcRegistry,
} = require("../desktop/ipc/contracts/production-registry");

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
  "media:remove-draft",
  "media:scan-articles",
  "media:preview-article",
  "media:build-confirmation",
  "media:submit-selected",
  "media:stop-submit",
  "media:get-orders",
  "media:sync-order",
];

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
            exposeInMainWorld(name, api) { exposed[name] = api; },
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
    { resourceId: "resource-1", name: "Fixture resource", price: 12.5 },
  );
});

test("all 18 media invokes have versioned exact contracts", () => {
  const media = productionIpcRegistry
    .list()
    .filter((contract) => contract.feature === "media");
  assert.equal(media.length, 18);
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

  const search = productionIpcRegistry.byChannel(
    "media:search-resource-page",
  );
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
    () => productionIpcRegistry.encodeRequest(contract, { page: 1, pageSize: 101, resourceIds: [] }),
    { code: "IPC_REQUEST_INVALID" },
  );
  const result = productionIpcRegistry.success(contract, {
    items: [], memberResourceIds: ["resource-1"], total: 0, page: 1, pageSize: 50,
    totalPages: 0, hasPrev: false, hasNext: false,
  });
  assert.equal(result.data.items.length, 0);
  assert.equal(result.data.memberResourceIds.length, 1);
  assert.throws(
    () => productionIpcRegistry.success(contract, {
      items: Array.from({ length: 101 }, (_, index) => ({ resourceId: `r-${index}` })),
      memberResourceIds: [], total: 101, page: 1, pageSize: 100,
      totalPages: 2, hasPrev: false, hasNext: true,
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

test("media registrar projects resources and articles before typed success validation", async (t) => {
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
  fs.writeFileSync(path.join(mediaInput, "article.md"), "# Fixture article\nBody");

  const handlers = new Map();
  const ipcMain = createAuthenticatedIpcMain(
    { handle: (channel, handler) => handlers.set(channel, handler) },
    async () => {},
  );
  const client = {
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
  let paidSubmitCalls = 0;
  let publicationRecords = [];
  registerMediaIpc({
    ipcMain,
    paths: { data, mediaInput },
    rootDir: root,
    mediaClientProvider: () => client,
    operationalStore: {
      listPublicationRecords: ({ articleIds }) =>
        publicationRecords.filter((record) => articleIds.includes(record.articleId)),
    },
    platformWorkbenchService: {
      prepareMediaPublicationCommands: async (items) =>
        items.flatMap((item) =>
          item.selectedResources.map((resource) => ({
            articleId: "media-article-1",
            target: { kind: "media", mediaResourceId: resource.resourceId },
            postProcessingPayload: { filename: item.filename },
          })),
        ),
    },
    mediaPublicationSubmissionService: {
      submit: async () => {
        paidSubmitCalls += 1;
        throw new Error("paid submission must not run during preflight");
      },
    },
  });

  const pageContract = productionIpcRegistry.byChannel("media:get-resource-page");
  const page = await handlers.get(pageContract.channel)(
    {},
    productionIpcRegistry.encodeRequest(pageContract, { page: 1, pageSize: 50 }),
  );
  assert.equal(page.ok, true, JSON.stringify(page));
  assert.equal(page.schemaVersion, 1);
  assert.equal(page.data.items.length, 1);
  assert.equal("raw" in page.data.items[0], false);

  const articleContract = productionIpcRegistry.byChannel("media:scan-articles");
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

  const preflightContract = productionIpcRegistry.byChannel(
    "media:build-confirmation",
  );
  const preflight = await handlers.get(preflightContract.channel)(
    {},
    productionIpcRegistry.encodeRequest(preflightContract, {
      submissions: [
        { filename: "article.md", resourceIds: ["resource-1"] },
      ],
    }),
  );
  assert.equal(preflight.ok, true, JSON.stringify(preflight));
  assert.equal(preflight.data.articleCount, 1);
  assert.equal(preflight.data.resourceCount, 1);
  assert.equal(preflight.data.submitableResourceCount, 1);
  assert.equal(preflight.data.blockedResourceCount, 0);
  assert.equal(preflight.data.submitableResources.length, 1);
  assert.equal(preflight.data.submitableResources[0].resourceId, "resource-1");
  assert.equal(preflight.data.actualPrice, 12.5);
  assert.equal(paidSubmitCalls, 0);

  publicationRecords = [
    {
      publicationId: "publication-1",
      articleId: "media-article-1",
      targetKey: "media-resource:resource-1",
      status: "published",
      attempts: [],
    },
  ];
  const blockedPreflight = await handlers.get(preflightContract.channel)(
    {},
    productionIpcRegistry.encodeRequest(preflightContract, {
      submissions: [
        { filename: "article.md", resourceIds: ["resource-1"] },
      ],
    }),
  );
  assert.equal(blockedPreflight.ok, true, JSON.stringify(blockedPreflight));
  assert.equal(blockedPreflight.data.submitableResourceCount, 0);
  assert.equal(blockedPreflight.data.blockedResourceCount, 1);
  assert.equal(blockedPreflight.data.blockedResources[0].status, "published");
  assert.equal(blockedPreflight.data.actualPrice, 0);
  assert.equal(paidSubmitCalls, 0);

  const refreshContract = productionIpcRegistry.byChannel("media:refresh-resources");
  const refresh = await handlers.get(refreshContract.channel)(
    {},
    productionIpcRegistry.encodeRequest(refreshContract, {}),
  );
  assert.equal(refresh.ok, true);
  assert.equal(refresh.data.resourceCount, 1);
  assert.equal("resources" in refresh.data, false);
});
