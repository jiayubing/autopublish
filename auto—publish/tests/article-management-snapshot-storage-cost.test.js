const { it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const { DatabaseSync } = require("node:sqlite");
const domain = require("../src/domain");
const { createArticleStore } = require("../src/content/article-store");
const { createContentStore } = require("../src/content/content-store");
const { createOperationalStore } = require("../src/infrastructure/operational-store/operational-store");
const { createRegularPlatformOutcomeService } = require("../desktop/services/regular-platform-outcome-service");
const { createArticleManagementSnapshot } = require("../desktop/services/article-management-snapshot");
const { createWorkspaceDataInvalidation } = require("../desktop/workspace-data-invalidation");

const TIME = "2026-09-06T00:00:00.000Z";
const BODY = "x".repeat(4096);
const CLIENTS = ["none", "failed", "published"];
const stringify = JSON.stringify;
const bytes = (value) => Buffer.byteLength(stringify(value) || "", "utf8");
const idFor = (clientId, index) => `article-${clientId}-${String(index).padStart(4, "0")}`;

function fixture(articleCount) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "article-snapshot-cost-"));
  let active = null;
  let store;
  // Observe real reads through ArticleStore's fs, including its lock bookkeeping.
  // File reads are not physical disk/cache misses. Keep payload and lock I/O separate.
  const articleFs = new Proxy(fs, {
    get(target, property) {
      if (property !== "readFileSync") return target[property];
      return function(...args) {
        const result = target.readFileSync(...args);
        if (active) {
          const size = Buffer.byteLength(result, "utf8");
          active.fileReads += 1;
          active.fileBytes += size;
          const kind = path.basename(String(args[0])) === "owner.json" ? "lock" : "article";
          active[`${kind}FileReads`] += 1;
          active[`${kind}FileBytes`] += size;
        }
        return result;
      };
    },
  });
  const content = createContentStore({
    articleStore: createArticleStore(root, { fs: articleFs }),
    listClientIds: () => CLIENTS,
  });
  const ports = {};
  let stamp = Date.parse(TIME);
  try {
    store = createOperationalStore({ workspaceRoot: root, transitionPorts: ports, clock: () => new Date(stamp) });
    const outcomes = createRegularPlatformOutcomeService({ regularOutcomeTransitions: ports.regularOutcomeTransitions, clock: () => new Date(stamp) });
    for (const clientId of CLIENTS) {
      const profile = clientId === "none" ? null : store.createAccountProfile({ platformId: "hepan", displayName: `Synthetic ${clientId}` });
      for (let index = 0; index < articleCount; index += 1) {
        const articleId = idFor(clientId, index);
        const title = index === articleCount - 1 ? "Editable version A" : `Synthetic title ${String(index).padStart(4, "0")}`;
        content.createArticle({ id: articleId, clientId, title, content: BODY, status: "generated", createdAt: TIME });
        // Leave one editable article in every client for a legal save/refresh.
        if (clientId === "none" || index === articleCount - 1) continue;
        stamp += 120000;
        const admitted = ports.regularQueueTransitions.admitRegularQueueItem({
          clientId, articleId, batchId: `batch-${articleId}`, itemId: `item-${articleId}`,
          publicationId: `publication-${articleId}`, attemptId: `attempt-${articleId}`,
          target: { kind: "platform", platformId: "hepan", accountProfileId: profile.accountProfileId },
          publicationSnapshot: { articleId, title, body: BODY, fingerprint: "a".repeat(64) },
          payload: { clientId },
        });
        ports.regularQueueGroupTransitions.setRegularQueueGroupRunIntent({ queueGroupId: admitted.queueGroupId, running: true });
        const claim = ports.regularQueueGroupTransitions.claimRegularQueueGroupHead({ queueGroupId: admitted.queueGroupId, claimToken: `claim-${articleId}`, leaseMs: 30000 });
        assert.equal(claim.articleIdentityV1.articleId, articleId);
        ports.regularQueueGroupTransitions.beginRegularRemoteSubmission({
          regularPublicationAttemptId: claim.regularPublicationAttemptId,
          claimToken: claim.claimToken,
          preparedSubmissionEvidenceV1: domain.createTextOnlyPreparedSubmissionEvidenceV1(claim),
        });
        outcomes.applyRegularOutcome({
          regularPublicationAttemptId: claim.regularPublicationAttemptId,
          outcome: clientId === "published"
            ? { status: "accepted", remoteId: `remote-${articleId}`, remoteUrl: `https://example.test/${articleId}` }
            : { status: "article_rejected", errorCode: "CONTENT_REJECTED" },
        });
      }
    }
  } catch (error) {
    if (store) store.close();
    fs.rmSync(root, { recursive: true, force: true });
    throw error;
  }

  // Native SQLite row reads are observed separately from article filesystem I/O.
  // This is not a count of SQLite physical page/cache misses.
  const probe = new DatabaseSync(":memory:");
  const statementPrototype = Object.getPrototypeOf(probe.prepare("SELECT 1"));
  probe.close();
  const originalAll = statementPrototype.all;
  const originalGet = statementPrototype.get;
  function observeRows(result) {
    active.sqlReads += 1;
    active.sqlRows += Array.isArray(result) ? result.length : result ? 1 : 0;
    active.sqlResultBytes += bytes(result);
    return result;
  }
  function query(name, action) {
    const result = action();
    if (active) {
      active.queries[name] += 1;
      active.queryResultBytes += bytes(result);
    }
    return result;
  }
  function openSnapshot() {
    const invalidation = createWorkspaceDataInvalidation({ workspaceRuntimeId: "snapshot-cost" });
    const service = createArticleManagementSnapshot({
      workspaceRoot: root, getRevision: invalidation.getRevision,
      listArticles: (clientId) => query("articles", () => content.listArticles(clientId)),
      listTrash: (clientId) => query("trash", () => content.listTrashedArticles(clientId)),
      operationalStore: { listArticleLifecycleFacts: (input) => query("facts", () => store.listArticleLifecycleFacts(input)) },
      publishedArchiveQueries: { listPublishedArchives: (input) => query("archives", () => ports.publishedArchiveQueries.listPublishedArchives(input)) },
    });
    return { service, invalidation };
  }
  function saveProbe(clientId, version) {
    const article = content.getArticle(clientId, idFor(clientId, articleCount - 1));
    content.saveArticle({ ...article, title: `Editable version ${version}` });
  }
  async function measure(action, instrument) {
    const counters = { queries: { articles: 0, trash: 0, facts: 0, archives: 0 }, queryResultBytes: 0, fileReads: 0, fileBytes: 0, articleFileReads: 0, articleFileBytes: 0, lockFileReads: 0, lockFileBytes: 0, sqlReads: 0, sqlRows: 0, sqlResultBytes: 0, serializations: 0, serializedBytes: 0 };
    if (instrument) {
      active = counters;
      statementPrototype.all = function(...args) { return observeRows(originalAll.apply(this, args)); };
      statementPrototype.get = function(...args) { return observeRows(originalGet.apply(this, args)); };
      JSON.stringify = function(...args) {
        const result = stringify(...args);
        counters.serializations += 1;
        counters.serializedBytes += Buffer.byteLength(result || "", "utf8");
        return result;
      };
    }
    const started = performance.now();
    try {
      const snapshot = await action();
      const elapsedMs = performance.now() - started;
      return { snapshot, counters: { ...counters, returnBytes: bytes(snapshot) }, elapsedMs };
    } finally {
      active = null;
      JSON.stringify = stringify;
      statementPrototype.all = originalAll;
      statementPrototype.get = originalGet;
    }
  }
  return { root, store, openSnapshot, saveProbe, measure, close() { store.close(); fs.rmSync(root, { recursive: true, force: true }); } };
}

for (const articleCount of [100, 1000]) {
  it(`measures real article snapshot storage costs for ${articleCount} articles per client`, async () => {
    const f = fixture(articleCount);
    try {
      // Verify the actual fixture census; setup is outside all read measurements.
      const census = new DatabaseSync(f.store.databasePath, { readOnly: true });
      try {
        assert.equal(census.prepare("SELECT COUNT(*) AS n FROM publication_records").get().n, 2 * (articleCount - 1));
        assert.equal(census.prepare("SELECT COUNT(*) AS n FROM publication_attempts").get().n, 2 * (articleCount - 1));
      } finally { census.close(); }
      for (const [clientIndex, clientId] of CLIENTS.entries()) {
        const nextClient = CLIENTS[(clientIndex + 1) % CLIENTS.length];
        const costs = {};
        const times = {};
        // One instrumented pass, then three uninstrumented timing passes.
        // "first" is a service-cache miss, not an OS/SQLite cold-cache claim.
        for (let repeat = 0; repeat < 4; repeat += 1) {
          f.saveProbe(clientId, "A");
          f.saveProbe(nextClient, "A");
          const { service, invalidation } = f.openSnapshot();
          async function read(phase, scope) {
            const result = await f.measure(() => service.get({ clientId: scope }), repeat === 0);
            assert.equal(result.snapshot.clientId, scope);
            assert.equal(result.snapshot.articles.length, articleCount);
            assert.ok(result.snapshot.articles.every((article) => article.clientId === scope && article.content === BODY));
            const historyCount = scope === "none" ? 0 : articleCount - 1;
            assert.equal(result.snapshot.publicationRecords.length, historyCount);
            assert.equal(result.snapshot.publishedArchives.length, scope === "published" ? articleCount - 1 : 0);
            assert.ok(result.snapshot.publicationRecords.every((record) => record.status === (scope === "published" ? "published" : "failed")));
            if (repeat === 0) costs[phase] = result.counters;
            else (times[phase] ||= []).push(Number(result.elapsedMs.toFixed(3)));
            return result.snapshot;
          }
          const first = await read("first", clientId);
          assert.deepEqual(await read("hit", clientId), first);
          f.saveProbe(clientId, "B");
          invalidation.invalidate("ARTICLE_SAVED");
          const refreshed = await read("refresh", clientId);
          assert.equal(refreshed.articles.find((article) => article.id === idFor(clientId, articleCount - 1)).title, "Editable version B");
          await read("switch", nextClient);
          assert.deepEqual(await read("switchBack", clientId), refreshed);
        }
        // Stable list reads validate JSON + Markdown without a write lock.
        assert.equal(costs.first.articleFileReads, articleCount * 2);
        assert.equal(costs.first.lockFileReads, 0);
        assert.equal(costs.first.fileReads, costs.first.articleFileReads + costs.first.lockFileReads);
        assert.ok(costs.first.sqlReads > 0);
        assert.equal(costs.hit.fileReads, 0);
        assert.equal(costs.hit.sqlReads, 0);
        assert.deepEqual(costs.hit.queries, { articles: 0, trash: 0, facts: 0, archives: 0 });
        assert.deepEqual(costs.refresh.queries, costs.first.queries);
        assert.equal(costs.refresh.articleFileBytes, costs.first.articleFileBytes);
        const timing = Object.fromEntries(Object.entries(times).map(([phase, samples]) => {
          const sorted = [...samples].sort((a, b) => a - b);
          return [phase, { samples, medianMs: sorted[1], minMs: sorted[0], maxMs: sorted[2] }];
        }));
        console.log("R3_SNAPSHOT_COST " + stringify({ node: process.version, platform: process.platform, articleCount, bodyBytes: Buffer.byteLength(BODY), clientId, switchClient: nextClient, publicationRecords: clientId === "none" ? 0 : articleCount - 1, attempts: clientId === "none" ? 0 : articleCount - 1, archives: clientId === "published" ? articleCount - 1 : 0, totalWorkspaceArticles: 3 * articleCount, costs, timing }));
      }
    } finally { f.close(); }
  });
}
