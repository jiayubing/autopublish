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
    }).refreshResources({ fetchAll: true, pageSizeHint: 2, maxPages: 4 });

    assert.strictEqual(result.resourceCount, 2);
    assert.strictEqual(written.length, 1);
    assert.deepStrictEqual(written[0].resources.map(function(resource) {
      return resource.resourceId;
    }), ["1", "2"]);
    assert.strictEqual(written[0].meta.total, 2);
  });

  it("adds a normalized resource to the pool and returns pool dto entries", function() {
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

    assert.deepStrictEqual(serviceWithRealStores.getPool(), [
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
          addedAt: serviceWithRealStores.getPool()[0].raw.addedAt,
          updatedAt: serviceWithRealStores.getPool()[0].raw.updatedAt,
          note: "Pool note",
          tags: [],
          enabled: true
        }
      }
    ]);
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
      balance: "123.45",
      raw: { code: 0, data: { balance: "123.45" } }
    });
  });
});
