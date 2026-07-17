const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { createMediaOrderService } = require("../desktop/services/media-order-service");

function read(file) {
  return fs.readFileSync(path.resolve(__dirname, "..", file), "utf-8");
}

describe("media-order-service", function() {
  it("returns renderer-ready order view DTOs from raw submission history", function() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "media-order-service-"));
    const storePath = path.join(root, "submission-orders.jsonl");

    try {
      fs.writeFileSync(storePath, [
        JSON.stringify({
          ts: "2026-06-25T15:00:03.783Z",
          command: "submit",
          dryRun: false,
          params: {
            resource_id: "874630",
            title: "Sample Title",
            content_file: "F:\\work\\auto-publish\\input\\media\\sample.docx"
          },
          result: {
            success: true,
            data: {
              article: {
                filename: "sample.docx",
                title: "Sample Title",
                filePath: "F:\\work\\auto-publish\\input\\media\\sample.docx"
              },
              resource: {
                resourceId: "874630",
                name: "Media Source",
                price: "17.00"
              },
              submittedAt: "2026-06-25T15:00:03.783Z",
              result: { data: { order_nid: "2026062523000300181659" } }
            },
            syncedAt: "2026-06-26T13:21:42.426Z",
            syncStatus: "2",
            syncRaw: {
              data: [{
                resource_id: "874630",
                order_nid: "2026062523000300181659",
                status: 2,
                price: "17.00",
                title: "Sample Title",
                order_url: "http://news.example.test/article.html"
              }]
            }
          }
        }),
        JSON.stringify({
          ts: "2026-06-25T18:00:03.783Z",
          command: "submit",
          dryRun: false,
          params: {
            resource_id: "874631",
            title: "Second Title",
            content_file: "second.md"
          },
          result: {
            success: true,
            data: {
              article: {
                filename: "second.md",
                title: "Second Title"
              },
              resource: {
                resourceId: "874631",
                name: "Second Resource",
                price: "9.00"
              },
              submittedAt: "2026-06-25T18:00:03.783Z"
            }
          }
        })
      ].join("\n") + "\n", "utf-8");

      const service = createMediaOrderService({ storePath: storePath });
      const views = service.listOrderViews();

      assert.equal(views.length, 2);
      assert.equal(views[0].title, "Sample Title");
      assert.equal(views[0].filename, "sample.docx");
      assert.equal(views[0].orderNid, "2026062523000300181659");
      assert.equal(views[0].statusCode, "2");
      assert.equal(views[0].statusLabel, "已发布");
      assert.equal(views[0].submittedAt, "2026-06-25 15:00:03");
      assert.equal(views[0].publishedAt, "2026-06-26 13:21:42");
      assert.equal(views[0].resourceId, "874630");
      assert.equal(views[0].resourceName, "Media Source");
      assert.equal(views[0].price, "17.00");
      assert.equal(views[0].orderUrl, "http://news.example.test/article.html");
      assert.equal(views[0].raw.ts, "2026-06-25T15:00:03.783Z");
      assert.equal(views[1].title, "Second Title");
      assert.equal(views[1].filename, "second.md");
      assert.equal(views[1].submittedAt, "2026-06-25 18:00:03");
      assert.equal(views[1].publishedAt, "");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("lets the React orders view consume order view DTOs directly", function() {
    const source = read("media-workbench/src/components/OrdersView.tsx");

    [
      "order.title",
      "statusInfo.label",
      "order.publishedAt",
      "order.orderNid"
    ].forEach(function(snippet) {
      assert.ok(source.includes(snippet), "missing DTO usage: " + snippet);
    });

    [
      "syncRaw",
      "params.title",
      "params.content_file"
    ].forEach(function(snippet) {
      assert.equal(source.includes(snippet), false, "drawer still parses raw order shape: " + snippet);
    });
  });
});
