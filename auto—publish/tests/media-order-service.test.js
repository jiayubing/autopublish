const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { createMediaOrderService } = require("../desktop/services/media-order-service");
const { SubmissionOrderStore } = require("../src/platforms/media/submission-order-store");
const { createPublicationLedger } = require("../src/publication/publication-ledger");
const { resolveArticleIdentity } = require("../src/publication/article-identity");
const { resolvePublicationTarget } = require("../src/publication/publication-targets");

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

  it("syncs an accepted order to published through its publicationId", async function() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "media-order-ledger-"));
    try {
      const storePath = path.join(root, "submission-orders.jsonl");
      const ledger = createPublicationLedger({ workspaceRoot: root });
      const article = resolveArticleIdentity({ clientId: "media", title: "Sync title", content: "Body" });
      const publication = ledger.reserve(article, resolvePublicationTarget({ mediaResourceId: "9001" }));
      ledger.markSubmitting(publication.publicationId, publication.attemptId);
      ledger.recordOutcome(publication.publicationId, publication.attemptId, { status: "submitted", remoteId: "order-9001" });
      await new SubmissionOrderStore({ storePath }).record({
        publicationId: publication.publicationId,
        attemptId: publication.attemptId,
        command: "submit",
        dryRun: false,
        params: { resource_id: "9001", title: "Sync title", order_nid: "order-9001" },
        result: { success: true, data: { publicationId: publication.publicationId, attemptId: publication.attemptId, result: { data: { order_nid: "order-9001" } } } }
      });

      const service = createMediaOrderService({
        storePath: storePath,
        publicationLedger: ledger,
        clientProvider: function() {
          return { orderInfo: async function() {
            return { data: [{ order_nid: "order-9001", resource_id: "9001", status: 2, order_url: "https://example.test/published" }] };
          } };
        }
      });

      await service.syncOrder("order-9001");

      assert.equal(ledger.get(publication.publicationId).status, "published");
      assert.equal(service.listOrderViews()[0].publicationId, publication.publicationId);
      assert.equal(service.listOrderViews()[0].publicationStatus, "published");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("automatically reconciles an uncertain order when a later sync proves publication", async function() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "media-order-uncertain-"));
    try {
      const storePath = path.join(root, "submission-orders.jsonl");
      const ledger = createPublicationLedger({ workspaceRoot: root });
      const article = resolveArticleIdentity({ clientId: "media", title: "Uncertain title", content: "Body" });
      const publication = ledger.reserve(article, resolvePublicationTarget({ mediaResourceId: "9002" }));
      ledger.markSubmitting(publication.publicationId, publication.attemptId);
      ledger.recordOutcome(publication.publicationId, publication.attemptId, { status: "uncertain", errorCode: "MEDIA_RESULT_UNKNOWN" });
      await new SubmissionOrderStore({ storePath }).record({
        publicationId: publication.publicationId,
        attemptId: publication.attemptId,
        command: "submit",
        dryRun: false,
        params: { resource_id: "9002", title: "Uncertain title", order_nid: "order-9002" },
        result: { success: true, data: { publicationId: publication.publicationId, attemptId: publication.attemptId } }
      });

      const service = createMediaOrderService({
        storePath,
        publicationLedger: ledger,
        clientProvider: function() {
          return { orderInfo: async function() {
            return { data: [{ order_nid: "order-9002", resource_id: "9002", status: 2, order_url: "https://example.test/uncertain-published" }] };
          } };
        }
      });
      await service.syncOrder("order-9002");

      const reconciled = ledger.get(publication.publicationId);
      assert.equal(reconciled.status, "published");
      assert.equal(reconciled.attempts[0].reasonCode, "MEDIA_ORDER_CONFIRMED_PUBLISHED");
      assert.equal(reconciled.attempts[0].remoteId, "order-9002");
      assert.equal(reconciled.attempts[0].remoteUrl, "https://example.test/uncertain-published");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
