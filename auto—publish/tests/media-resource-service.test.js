const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");

const { createMediaResourceService } = require("../desktop/services/media-resource-service");

describe("media-resource-service", function() {
  let root;
  let service;
  let resourceStorePath;
  let poolStorePath;

  beforeEach(function() {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "media-resource-service-"));
    resourceStorePath = path.join(root, "data", "media-resources.json");
    poolStorePath = path.join(root, "data", "media-pool.json");
    service = createMediaResourceService({
      resourceStorePath: resourceStorePath,
      poolStorePath: poolStorePath
    });
  });

  afterEach(function() {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("normalizes api resource fields into the stable dto", function() {
    assert.deepStrictEqual(service.normalizeResource({
      resource_id: "101",
      title: "媒体一号",
      price: "88",
      remarks: "备注",
      publish_rate: "日更",
      publish_time: "09:30",
      case_link: "https://example.com/case",
      extra: "kept"
    }), {
      resourceId: "101",
      name: "媒体一号",
      price: "88",
      remarks: "备注",
      publishRate: "日更",
      publishTime: "09:30",
      caseLink: "https://example.com/case",
      raw: {
        resource_id: "101",
        title: "媒体一号",
        price: "88",
        remarks: "备注",
        publish_rate: "日更",
        publish_time: "09:30",
        case_link: "https://example.com/case",
        extra: "kept"
      }
    });
  });

  it("pages cached resources with metadata", function() {
    const store = {
      getAll: function() {
        return {
          resources: Array.from({ length: 23 }, function(_, index) {
            return {
              resource_id: String(index + 1),
              title: "Resource " + (index + 1)
            };
          })
        };
      }
    };
    const paged = createMediaResourceService({ resourceStore: store }).getCachedResourcePage({
      page: 2,
      pageSize: 20
    });

    assert.strictEqual(paged.page, 2);
    assert.strictEqual(paged.pageSize, 20);
    assert.strictEqual(paged.total, 23);
    assert.strictEqual(paged.totalPages, 2);
    assert.strictEqual(paged.items.length, 3);
    assert.strictEqual(paged.items[0].resourceId, "21");
  });

  it("rejects page sizes above 100 and renderer-controlled refresh limits", async function() {
    const bounded = createMediaResourceService({
      resourceStore: { getAll: function() { return { resources: [] }; } },
      client: { mediaList: async function() { return { data: [] }; } }
    });

    assert.throws(
      function() { bounded.getCachedResourcePage({ page: 1, pageSize: 101 }); },
      function(error) { return error.code === "MEDIA_RESOURCE_PAGE_SIZE_INVALID"; }
    );
    assert.throws(
      function() { bounded.searchResourcePage({ keyword: "x", page: 1, pageSize: 99999 }); },
      function(error) { return error.code === "MEDIA_RESOURCE_PAGE_SIZE_INVALID"; }
    );
    await assert.rejects(
      bounded.refreshResources({ fetchAll: true, pageSizeHint: 101 }),
      function(error) { return error.code === "MEDIA_RESOURCE_PAGE_SIZE_INVALID"; }
    );
    await assert.rejects(
      bounded.refreshResources({ fetchAll: true, maxPages: 201 }),
      function(error) { return error.code === "MEDIA_RESOURCE_REFRESH_OPTIONS_INVALID"; }
    );
  });

  it("searches cached resources by keyword and paginates the matches", function() {
    const store = {
      getAll: function() {
        return {
          resources: [
            { resource_id: "1", title: "Alpha News", remarks: "Daily" },
            { resource_id: "2", title: "Beta Sports", remarks: "Weekly" },
            { resource_id: "3", title: "Alpha Finance", remarks: "Monthly" }
          ]
        };
      }
    };
    const paged = createMediaResourceService({ resourceStore: store }).searchResourcePage({
      keyword: "alpha",
      page: 1,
      pageSize: 1
    });

    assert.strictEqual(paged.total, 2);
    assert.strictEqual(paged.totalPages, 2);
    assert.strictEqual(paged.items.length, 1);
    assert.strictEqual(paged.items[0].resourceId, "1");
  });

  it("refreshes all pages until the api returns a short page and writes the cache", async function() {
    const written = [];
    const resourceStore = {
      getAll: function() {
        return null;
      },
      setAll: function(resources, meta) {
        written.push({ resources: resources, meta: meta });
      }
    };
    const client = {
      mediaList: async function(opts) {
        if (opts.page === 1) {
          return {
            data: [
              { resource_id: "1", title: "Alpha", remarks: "R1" },
              { resource_id: "2", title: "Beta", remarks: "R2" }
            ]
          };
        }
        return { data: [] };
      }
    };

    const result = await createMediaResourceService({
      resourceStore: resourceStore,
      client: client
    }).refreshResources({ fetchAll: true, pageSizeHint: 2 });

    assert.strictEqual(result.resourceCount, 2);
    assert.strictEqual(written.length, 1);
    assert.deepStrictEqual(written[0].resources.map(function(resource) {
      return resource.resourceId;
    }), ["1", "2"]);
    assert.strictEqual(written[0].meta.total, 2);
  });

  it("refreshes 13,000 synthetic resources in 130 bounded provider pages", async function() {
    let requestCount = 0;
    let cached = null;
    const total = 13000;
    const result = await createMediaResourceService({
      resourceStore: {
        getAll: function() { return cached; },
        setAll: function(resources, meta) { cached = { resources: resources, meta: meta }; }
      },
      client: {
        mediaList: async function(input) {
          requestCount += 1;
          const start = (input.page - 1) * 100;
          return {
            data: Array.from({ length: Math.max(0, Math.min(100, total - start)) }, function(_, index) {
              return { resource_id: String(start + index + 1), title: "Synthetic " + (start + index + 1) };
            }),
            total: total
          };
        }
      }
    }).refreshResources({ fetchAll: true, pageSizeHint: 100 });

    assert.equal(requestCount, 130);
    assert.equal(result.status, "complete");
    assert.equal(result.complete, true);
    assert.equal(result.truncated, false);
    assert.equal(result.resourceCount, 13000);
    assert.equal(cached.resources.length, 13000);
  });

  it("never reports one default 20-item provider page as a complete full refresh", async function() {
    let requestCount = 0;
    let cached = null;
    const result = await createMediaResourceService({
      resourceStore: {
        getAll: function() { return cached; },
        setAll: function(resources, meta) { cached = { resources: resources, meta: meta }; }
      },
      client: {
        mediaList: async function(input) {
          requestCount += 1;
          const start = (input.page - 1) * 20;
          return { data: Array.from({ length: 20 }, function(_, index) { return { id: String(start + index + 1) }; }) };
        }
      }
    }).refreshResources({ fetchAll: true, pageSizeHint: 100 });

    assert.equal(requestCount, 200);
    assert.equal(result.status, "truncated");
    assert.equal(result.complete, false);
    assert.equal(result.truncationReason, "max-pages");
    assert.equal(result.resourceCount, 4000);
    assert.equal(cached.meta.truncated, true);
  });

  it("deduplicates by resource ID and reports a repeated remote page as truncated", async function() {
    let cached = null;
    const resourceStore = {
      getAll: function() { return cached; },
      setAll: function(resources, meta) { cached = { resources: resources, meta: meta, updatedAt: meta.refreshedAt }; }
    };
    const pages = {
      1: [{ id: "1" }, { id: "2" }],
      2: [{ id: "2" }, { id: "3" }],
      3: [{ id: "2" }, { id: "3" }]
    };
    const result = await createMediaResourceService({
      resourceStore: resourceStore,
      client: { mediaList: async function(input) { return { data: pages[input.page] || [] }; } }
    }).refreshResources({ fetchAll: true, pageSizeHint: 2 });

    assert.equal(result.status, "truncated");
    assert.equal(result.complete, false);
    assert.equal(result.truncated, true);
    assert.equal(result.truncationReason, "repeated-page");
    assert.equal(result.pageCount, 3);
    assert.equal(result.resourceCount, 3);
    assert.deepEqual(result.diagnostics.map(function(item) { return item.code; }), [
      "MEDIA_RESOURCE_DUPLICATE_IDS",
      "MEDIA_RESOURCE_REPEATED_PAGE"
    ]);
    assert.deepEqual(
      createMediaResourceService({ resourceStore: resourceStore }).getCachedResourcePage({ page: 1, pageSize: 100 }).items.map(function(item) { return item.resourceId; }),
      ["1", "2", "3"]
    );
  });

  it("reports total, hasNext, and short-page contradictions without claiming a complete refresh", async function() {
    let cached = null;
    const result = await createMediaResourceService({
      resourceStore: {
        getAll: function() { return cached; },
        setAll: function(resources, meta) { cached = { resources: resources, meta: meta }; }
      },
      client: {
        mediaList: async function() {
          return {
            data: { list: [{ id: "1" }, { id: "2" }], total: 5, hasNext: false }
          };
        }
      }
    }).refreshResources({ fetchAll: true, pageSizeHint: 3 });

    assert.equal(result.status, "truncated");
    assert.equal(result.complete, false);
    assert.equal(result.truncationReason, "provider-metadata-conflict");
    assert.equal(result.pageCount, 1);
    assert.equal(result.resourceCount, 2);
    assert.deepEqual(result.diagnostics.map(function(item) { return item.code; }), [
      "MEDIA_RESOURCE_SHORT_PAGE_CONTRADICTION",
      "MEDIA_RESOURCE_HAS_NEXT_CONTRADICTION",
      "MEDIA_RESOURCE_TOTAL_CONTRADICTION"
    ]);
    assert.equal(cached.meta.truncated, true);
  });

  it("truncates explicitly at the 20,001st unique resource without returning the full cache payload", async function() {
    let cached = null;
    const oversizedPage = Array.from({ length: 20001 }, function(_, index) {
      return { id: String(index + 1), title: "Synthetic " + (index + 1) };
    });
    const serviceWithCapacity = createMediaResourceService({
      resourceStore: {
        getAll: function() { return cached; },
        setAll: function(resources, meta) { cached = { resources: resources, meta: meta }; }
      },
      client: { mediaList: async function() { return { data: oversizedPage }; } }
    });

    const result = await serviceWithCapacity.refreshResources({ fetchAll: true, pageSizeHint: 100 });

    assert.equal(result.status, "truncated");
    assert.equal(result.complete, false);
    assert.equal(result.truncated, true);
    assert.equal(result.truncationReason, "max-resources");
    assert.equal(result.resourceCount, 20000);
    assert.equal(Object.hasOwn(result, "resources"), false);
    assert.equal(result.diagnostics.at(-1).code, "MEDIA_RESOURCE_MAX_RESOURCES_REACHED");
    assert.equal(cached.resources.length, 20000);
    assert.equal(cached.resources[0].resourceId, "1");
    assert.equal(cached.resources[19999].resourceId, "20000");
  });

  it("stops after 200 full remote pages and marks the cache as truncated", async function() {
    let requestCount = 0;
    let cached = null;
    const result = await createMediaResourceService({
      resourceStore: {
        getAll: function() { return cached; },
        setAll: function(resources, meta) { cached = { resources: resources, meta: meta }; }
      },
      client: {
        mediaList: async function(input) {
          requestCount += 1;
          const start = (input.page - 1) * 100;
          return { data: Array.from({ length: 100 }, function(_, index) { return { id: String(start + index + 1) }; }) };
        }
      }
    }).refreshResources({ fetchAll: true, pageSizeHint: 100 });

    assert.equal(requestCount, 200);
    assert.equal(result.pageCount, 200);
    assert.equal(result.resourceCount, 20000);
    assert.equal(result.status, "truncated");
    assert.equal(result.complete, false);
    assert.equal(result.truncationReason, "max-pages");
    assert.equal(result.diagnostics.at(-1).code, "MEDIA_RESOURCE_MAX_PAGES_REACHED");
    assert.equal(cached.meta.truncated, true);
  });

  it("pages a 20,000-entry pool without normalizing or cloning entries outside the requested page", function() {
    var normalizations = 0;
    var entries = Array.from({ length: 20000 }, function(_, index) {
      return {
        resourceId: String(index + 1),
        name: "Pool " + (index + 1),
        raw: {
          toJSON: function() {
            normalizations += 1;
            return { entry: index + 1 };
          }
        }
      };
    });
    var serviceWithLargePool = createMediaResourceService({
      resourceStore: { getAll: function() { return { resources: [] }; } },
      poolStore: { getAll: function() { return entries; } }
    });

    var page = serviceWithLargePool.getPoolPage({
      page: 2,
      pageSize: 50,
      resourceIds: ["1", "51", "20000"]
    });

    assert.equal(page.total, 20000);
    assert.equal(page.items.length, 50);
    assert.equal(page.items[0].resourceId, "51");
    assert.deepEqual(page.memberResourceIds, ["1", "51", "20000"]);
    assert.equal(normalizations, 50);
  });

  it("adds a normalized resource and returns a bounded pool page", function() {
    const serviceWithRealStores = createMediaResourceService({
      resourceStorePath: resourceStorePath,
      poolStorePath: poolStorePath
    });

    serviceWithRealStores.addToPool({
      resource_id: "501",
      title: "Pool Resource",
      price: 200,
      remarks: "Pool note"
    });

    var page = serviceWithRealStores.getPoolPage({ page: 1, pageSize: 50, resourceIds: ["501"] });
    assert.deepStrictEqual(page.items, [
      {
        resourceId: "501",
        name: "Pool Resource",
        price: 200,
        remarks: "Pool note",
        publishRate: undefined,
        publishTime: undefined,
        caseLink: undefined,
        raw: {
          resourceId: "501",
          name: "Pool Resource",
          price: 200,
          category: "",
          addedAt: page.items[0].raw.addedAt,
          updatedAt: page.items[0].raw.updatedAt,
          note: "Pool note",
          tags: [],
          enabled: true
        }
      }
    ]);
    assert.deepStrictEqual(page.memberResourceIds, ["501"]);
  });

  it("returns a normalized balance dto from the api client", async function() {
    const serviceWithClient = createMediaResourceService({
      resourceStore: {
        getAll: function() {
          return null;
        }
      },
      client: {
        getBalance: async function() {
          return { code: 0, data: { balance: "123.45" } };
        }
      }
    });

    await assert.deepStrictEqual(await serviceWithClient.getBalance(), {
      balance: "123.45"
    });
  });
});
