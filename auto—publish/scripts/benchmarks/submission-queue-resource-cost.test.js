const { it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { performance } = require("node:perf_hooks");
const { DatabaseSync } = require("node:sqlite");
const domain = require("../../src/domain");
const { createArticleStore } = require("../../src/content/article-store");
const { createContentStore } = require("../../src/content/content-store");
const { createArticleMutationCoordinator } = require("../../src/content/article-mutation-coordinator");
const { createOperationalStore } = require("../../src/infrastructure/operational-store/operational-store");
const { createRegularQueueApplication } = require("../../desktop/services/regular-queue-application");
const { createCrossClientRegularQueueApplication } = require("../../desktop/services/cross-client-regular-queue-application");
const { createRegularPlatformOutcomeService } = require("../../desktop/services/regular-platform-outcome-service");
const { createArticleManagementSnapshot } = require("../../desktop/services/article-management-snapshot");

// Synthetic local storage only. Counts are logical API I/O, not physical disk I/O.
// Timings include counter overhead; memory deltas are not peak RSS or leak evidence.
it("measures batch admission, local publication completion and queue refresh cost", async () => {
  const probe = new DatabaseSync(":memory:");
  const proto = Object.getPrototypeOf(probe.prepare("SELECT 1"));
  probe.close();
  const originals = Object.fromEntries(["all", "get", "run"].map((name) => [name, proto[name]]));
  let active = null;
  for (const name of Object.keys(originals)) proto[name] = function (...args) {
    const result = originals[name].apply(this, args);
    if (active) {
      active["sql_" + name] += 1;
      if (name !== "run") active.sqlRows += Array.isArray(result) ? result.length : result ? 1 : 0;
    }
    return result;
  };
  try {
    for (const [count, clientCount, historyPerClient] of [[50, 1, 0], [100, 1, 0], [50, 50, 0], [100, 100, 0], [50, 1, 450], [50, 50, 20]]) {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "submission-resource-cost-"));
      let store;
      try {
        const articleFs = new Proxy(fs, { get(target, name) {
          if (!["readFileSync", "writeFileSync", "readdirSync"].includes(name)) return target[name];
          return function (...args) {
            const result = target[name](...args);
            if (active) {
              active[name] += 1;
              if (name === "readFileSync") active.readBytes += Buffer.byteLength(result);
            }
            return result;
          };
        } });
        const ports = {};
        store = createOperationalStore({ workspaceRoot: root, transitionPorts: ports });
        const clients = Array.from({ length: clientCount }, (_, i) => "client-" + i);
        const articleStore = createArticleStore(root, { fs: articleFs });
        const contentStore = createContentStore({ articleStore, listClientIds: () => clients });
        const profile = store.createAccountProfile({ platformId: "hepan", displayName: "Synthetic" });
        const coordinator = createArticleMutationCoordinator({ articleStore, contentStore, regularQueueTransitions: ports.regularQueueTransitions, lifecycleFacts: ports.regularQueueTransitions });
        let revision = 0;
        const regular = createRegularQueueApplication({
          contentStore, articleMutationCoordinator: coordinator,
          regularQueueTransitions: ports.regularQueueTransitions,
          regularQueueGroupTransitions: ports.regularQueueGroupTransitions,
          accountProfileResolver: store.assertExecutableAccountProfile,
          clientSnapshotResolver: (clientId) => ({ version: 1, clientId, displayName: clientId }),
          platforms: [{ id: "hepan", publicationTargetKind: "platform", imagePublishing: false }],
          onDataInvalidated() { revision += 1; if (active) active.invalidations += 1; },
        });
        const app = createCrossClientRegularQueueApplication({ regularQueueApplication: regular });
        const management = createArticleManagementSnapshot({
          workspaceRoot: root, getRevision: () => revision,
          listArticles: contentStore.listArticles, listTrash: contentStore.listTrashedArticles,
          operationalStore: store, publishedArchiveQueries: ports.publishedArchiveQueries,
        });
        const add = (clientId, id) => contentStore.createArticle({ id, clientId, title: "Synthetic " + id, content: "x".repeat(4096), status: "generated", createdAt: "2026-09-10T00:00:00.000Z" });
        const refs = Array.from({ length: count }, (_, i) => ({ clientId: clients[i % clientCount], articleId: "article-" + i }));
        refs.forEach((ref) => add(ref.clientId, ref.articleId));
        clients.forEach((clientId) => { for (let i = 0; i < historyPerClient; i++) add(clientId, clientId + "-history-" + i); });
        const measurements = [];
        async function measure(phase, action) {
          const counters = { sql_all: 0, sql_get: 0, sql_run: 0, sqlRows: 0, readFileSync: 0, writeFileSync: 0, readdirSync: 0, readBytes: 0, invalidations: 0 };
          active = counters;
          const cpu = process.cpuUsage(), memory = process.memoryUsage(), started = performance.now();
          try {
            const result = await action();
            const elapsedMs = performance.now() - started, cpuDelta = process.cpuUsage(cpu);
            measurements.push({ phase, elapsedMs: +elapsedMs.toFixed(2), cpuMs: +((cpuDelta.user + cpuDelta.system) / 1000).toFixed(2), heapDeltaBytes: process.memoryUsage().heapUsed - memory.heapUsed, ...counters, resultBytes: Buffer.byteLength(JSON.stringify(result) || "") });
            return result;
          } finally { active = null; }
        }
        await measure("candidateSnapshots", () => Promise.all(clients.map((clientId) => management.get({ clientId }))));
        const input = { articleRefs: refs, platformId: "hepan", accountProfileId: profile.accountProfileId, queueConfig: { imageCount: 0, submissionIntervalSeconds: 0 } };
        assert.equal((await measure("preview", () => app.previewRegularQueueAdmission(input))).queueableCount, count);
        const admission = await measure("admit", () => app.admitRegularQueueItems(input));
        assert.equal(admission.admittedCount, count);
        await measure("queueRefresh", () => regular.listRegularQueueGroups({}));
        const groupId = admission.items[0].queueGroupId;
        ports.regularQueueGroupTransitions.setRegularQueueGroupRunIntent({ queueGroupId: groupId, running: true });
        const outcomes = createRegularPlatformOutcomeService({ regularOutcomeTransitions: ports.regularOutcomeTransitions });
        for (let i = 0; i < count; i++) {
          await measure("completeLocal", () => {
            const claim = ports.regularQueueGroupTransitions.claimRegularQueueGroupHead({ queueGroupId: groupId, claimToken: "claim-" + i, leaseMs: 30000 });
            assert.ok(claim);
            ports.regularQueueGroupTransitions.beginRegularRemoteSubmission({ regularPublicationAttemptId: claim.regularPublicationAttemptId, claimToken: claim.claimToken, preparedSubmissionEvidenceV1: domain.createTextOnlyPreparedSubmissionEvidenceV1(claim) });
            const result = outcomes.applyRegularOutcome({ regularPublicationAttemptId: claim.regularPublicationAttemptId, outcome: { status: "accepted", remoteId: "remote-" + i, remoteUrl: "https://example.test/" + i } });
            revision += 1;
            return result;
          });
          if ([0, Math.floor(count / 2), count - 1].includes(i)) {
            await measure("queueAfter-" + (i + 1), () => regular.listRegularQueueGroups({}));
            await measure("managementAfter-" + (i + 1), () => management.get({ clientId: clients[0] }));
          }
        }
        assert.equal(regular.listRegularQueueGroups({})[0].remaining.length, 0);
        for (const sample of measurements.filter((item) => item.phase.startsWith("queue"))) {
          assert.equal(sample.readFileSync, 0, "Queue summaries must not read article files");
          assert.equal(sample.writeFileSync, 0, "Queue summaries must not acquire article write locks");
        }
        const completions = measurements.filter((item) => item.phase === "completeLocal");
        const sorted = completions.map((item) => item.elapsedMs).sort((a, b) => a - b);
        const completionSummary = { count, medianMs: sorted[Math.floor(count / 2)], p95Ms: sorted[Math.ceil(count * .95) - 1], maxMs: sorted.at(-1), totalMs: +completions.reduce((sum, item) => sum + item.elapsedMs, 0).toFixed(2), sqlRuns: completions.reduce((sum, item) => sum + item.sql_run, 0) };
        console.log("SUBMISSION_RESOURCE_COST " + JSON.stringify({ node: process.version, count, clientCount, historyPerClient, bodyBytes: 4096, measurements: measurements.filter((item) => item.phase !== "completeLocal"), completionSummary }));
      } finally {
        if (store) store.close();
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
  } finally { Object.assign(proto, originals); }
});

it("measures overlapping renderer refresh requests without remote transport", async () => {
  const { createPlatformFeature } = await import(pathToFileURL(path.join(__dirname, "../../media-workbench/src/features/platform/platform-feature.js")));
  const { createSubmissionCenterFeature } = await import(pathToFileURL(path.join(__dirname, "../../media-workbench/src/features/submission-center/submission-center-feature.js")));
  const { createWorkspaceCoordinator } = await import(pathToFileURL(path.join(__dirname, "../../media-workbench/src/features/workspace/workspace-coordinator.js")));
  const counts = { catalog: 0, accounts: 0, groups: 0, submissionCenter: 0 };
  let release;
  let latestRevision = 0;
  const gate = new Promise((resolve) => { release = resolve; });
  const platform = createPlatformFeature({
    async loadQueue() { counts.catalog++; await gate; return { queue: [], platforms: [] }; },
    async listAccountProfiles() { counts.accounts++; await gate; return []; },
    async listRegularQueueGroups() { counts.groups++; await gate; return []; },
  });
  const center = createSubmissionCenterFeature({ async getSnapshot() { counts.submissionCenter++; const revision = latestRevision; await gate; return { clientId: null, revision }; } });
  platform.setScope({ workspaceRuntimeId: "synthetic-cost" });
  center.setScope({ workspaceRuntimeId: "synthetic-cost" });
  let consume;
  const coordinator = createWorkspaceCoordinator({ subscribe(listener) { consume = listener; return () => {}; } });
  coordinator.register("platformQueue", (event) => event.workspaceRuntimeId
    ? Promise.all([platform.refreshQueue(event.kind), platform.refreshAccountProfiles(event.kind), platform.refreshRegularQueueGroups(event.kind)]) : undefined);
  coordinator.register("submissionCenter", (event) => event.workspaceRuntimeId ? center.refresh(event.kind) : undefined);
  coordinator.start();
  for (let revision = 1; revision <= 50; revision++) {
    latestRevision = revision;
    consume({ schemaVersion: 1, workspaceRuntimeId: "synthetic-cost", revision, scopes: ["platformQueue", "submissionCenter"], reasonCode: "SUBMISSION_BATCH_CREATED" });
  }
  release();
  await new Promise(setImmediate);
  assert.equal(center.getSnapshot().data.revision, 50);
  assert.deepEqual(counts, { catalog: 2, accounts: 2, groups: 2, submissionCenter: 2 });
  console.log("SUBMISSION_REFRESH_BURST " + JSON.stringify({ events: 50, ...counts }));
  coordinator.dispose();
  platform.dispose();
  center.dispose();
});
