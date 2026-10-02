const { it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createAiContentService } = require("../desktop/services/ai-content-service");
const { getClient } = require("../src/content/client-knowledge");
const { createClientMaterialStore } = require("../src/content/client-material-store");
const { createArticleManagementSnapshot } = require("../desktop/services/article-management-snapshot");
const { createArticleAttentionQuery } = require("../desktop/services/article-attention-query");
const { createSubmissionCenterSnapshot } = require("../desktop/services/submission-center-snapshot");

it("customer catalog reads metadata once per customer and details read only the selected customer's text", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "page-entry-regression-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (let i = 0; i < 100; i++) {
    const dir = path.join(root, "clients", `physical-${i}`);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "client.json"), JSON.stringify({ id: `client-${i}`, name: `Client ${i}` }));
    fs.writeFileSync(path.join(dir, "facts.md"), `Synthetic ${i}`);
  }
  let metadataReads = 0;
  const bodyReads = [];
  const read = fs.readFileSync;
  t.mock.method(fs, "readFileSync", function (filename, ...args) {
    if (path.basename(String(filename)) === "client.json") metadataReads++;
    if (path.basename(String(filename)) === "facts.md") bodyReads.push(String(filename));
    return read.call(fs, filename, ...args);
  });
  const service = createAiContentService({ workspaceRoot: root });
  t.after(() => service.dispose());
  const catalog = await service.listClients();
  assert.equal(catalog.length, 100);
  assert.equal(metadataReads, 100);
  assert.deepEqual(bodyReads, []);
  assert.ok(catalog.every(client => client.knowledgeFiles.length === 1 && !('content' in client.knowledgeFiles[0]) && !('directory' in client)));
  const target = getClient(root, "client-50");
  assert.equal(target.knowledgeFiles[0].content, "Synthetic 50");
  assert.deepEqual(bodyReads, [path.join(root, "clients", "physical-50", "facts.md")]);
  fs.writeFileSync(path.join(root, "clients", "physical-50", "facts.md"), "Edited externally");
  assert.equal(getClient(root, "client-50").knowledgeFiles[0].content, "Edited externally");
  const store = createClientMaterialStore({ workspaceRoot: root });
  assert.throws(() => store.listMaterialMetadata("client-50", root), { code: "CLIENT_PATH_OUT_OF_BOUNDS" });
  fs.writeFileSync(path.join(root, "clients", "physical-99", "client.json"), JSON.stringify({ id: "client-50" }));
  await assert.rejects(service.listClients(), { code: "CLIENT_IDENTITY_CONFLICT" });
  assert.throws(() => getClient(root, "client-50"), { code: "CLIENT_IDENTITY_CONFLICT" });
});

it("article snapshots evict least-recently used clients and bypass oversized cache entries", async () => {
  const reads = new Map();
  const service = createArticleManagementSnapshot({ listArticles: clientId => {
    reads.set(clientId, (reads.get(clientId) || 0) + 1);
    return [{ id: "article", clientId, title: clientId === "large" ? "x".repeat(17 * 1024 * 1024) : clientId, status: "generated" }];
  } });
  for (let i = 0; i < 64; i++) await service.get(`c${i}`);
  await service.get("c0");
  await service.get("c64");
  await service.get("c0");
  assert.equal(reads.get("c0"), 1);
  await service.get("c1");
  assert.equal(reads.get("c1"), 2);
  assert.equal(service.cacheSize(), 64);
  await service.get("large");
  await service.get("large");
  assert.equal(reads.get("large"), 2);
  service.invalidate();
  assert.equal(service.cacheSize(), 0);
  assert.equal((await service.get("c0")).articles[0].title, "c0");
});

it("attention pages preserve full totals, client scope and actions through the submission center", async () => {
  const query = createArticleAttentionQuery({ readers: { listTransactions: () => Array.from({ length: 205 }, (_, i) => ({
    id: `t${i}`, transactionId: `t${i}`, clientId: i === 204 ? "other" : "c", articleId: `a${i}`, status: "needs_repair", phase: "needs_repair",
  })) }, articleRemovalService: { retryArticleRemovalTransaction() {} } });
  const full = query.list({ clientId: "c" });
  const service = createSubmissionCenterSnapshot({
    getRevision: () => 1, getWorkspaceRuntimeId: () => "synthetic", validateClient() {},
    listRegularQueueGroups: () => [], listPaidMediaBatches: () => ({ items: [] }), listAttention: query.list,
  });
  const page = await service.get({ clientId: "c", page: 3, pageSize: 100 });
  assert.equal(page.counts.attentionItems, 204);
  assert.equal(page.hasMore, false);
  assert.deepEqual(page.attention.items.map(item => item.attentionId), full.items.slice(200).map(item => item.attentionId));
  assert.deepEqual(page.attention.items[0].allowedActions, full.items[200].allowedActions);
  assert.equal((await service.get({ clientId: "c", page: 4, pageSize: 100 })).attention.items.length, 0);
  assert.throws(() => query.list({ page: -1 }), { code: "ARTICLE_ATTENTION_PAGE_INVALID" });
});
