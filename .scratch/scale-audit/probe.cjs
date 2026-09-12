"use strict";
// Synthetic, disposable SQLite fixtures only. Never pass an existing workspace.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { performance } = require("node:perf_hooks");
const { DatabaseSync } = require("node:sqlite");
const app = path.resolve(__dirname, "../../auto—publish");
const { createOperationalStore } = require(path.join(app, "src/infrastructure/operational-store/operational-store"));
const { createRegularQueueGroupQuery } = require(path.join(app, "desktop/services/regular-queue-group-query"));
const { createSubmissionCenterSnapshot } = require(path.join(app, "desktop/services/submission-center-snapshot"));
const { createArticleManagementSnapshot } = require(path.join(app, "desktop/services/article-management-snapshot"));
const { createWorkspaceDataInvalidation } = require(path.join(app, "desktop/workspace-data-invalidation"));
const mode = process.argv[2];
const n = Number(process.argv[3] || 1000);
const groups = Number(process.argv[4] || 10);
const kind = process.argv[5] || "regular";
const root = process.argv[6];
const { createArticleAttentionQuery } = require(path.join(app,"desktop/services/article-attention-query"));
const emit = value => console.log(JSON.stringify({ mode, n, groups, kind, ...value }));
const byteSize = value => Buffer.byteLength(JSON.stringify(value) || "");

function seed() {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "autopublish-scale-audit-"));
  const ports = {};
  const store = createOperationalStore({ workspaceRoot: workspace, transitionPorts: ports });
  const body = "x".repeat(4096);
  const input = { clientId: "CLIENTSEED", articleId: "ARTICLESEED", batchId: "BATCHSEED", itemId: "ITEMSEED",
    publicationId: "PUBLICATIONSEED", attemptId: "ATTEMPTSEED", payload: { clientId: "CLIENTSEED" },
    publicationSnapshot: { articleId: "ARTICLESEED", title: "Synthetic title", body, fingerprint: "a".repeat(64) } };
  let accountId, groupId;
  if (kind === "regular") {
    accountId = store.createAccountProfile({ platformId: "hepan", displayName: "Synthetic account" }).accountProfileId;
    input.target = { kind: "platform", platformId: "hepan", accountProfileId: accountId };
    const result = ports.regularQueueTransitions.admitRegularQueueItems([input])[0];
    if (result.error) throw result.error;
    groupId = result.result.queueGroupId;
    if (ports.regularQueueGroupTransitions.listRegularQueueGroupSnapshots({})[0].remaining.length !== 1) throw new Error("SEED_QUERY_INVALID");
  } else {
    input.articleRef = { clientId: input.clientId, articleId: input.articleId };
    input.customerSnapshotV1 = { version: 1, clientId: input.clientId, displayName: "Synthetic customer" };
    ports.paidAdmissionTransitions.admitPaidBatch({ batchId: "BATCHSEED", articleCount: 1,
      target: { kind: "media", mediaResourceId: "MEDIASEED" }, confirmationFingerprint: "b".repeat(64),
      confirmation: { version: 1, articleRefs: [input.articleRef], mediaResourceId: "MEDIASEED", quotedPrice: 12.5, confirmedAt: "2026-09-12T00:00:00.000Z" },
      systemSubmissionCode: "SYSTEMSEED", quotedPrice: 12.5, estimatedTotal: 12.5, items: [input] });
    if (store.listPaidSubmissionBatchSnapshots({})[0].items.length !== 1) throw new Error("SEED_QUERY_INVALID");
  }
  const filename = store.databasePath;
  store.close();
  const db = new DatabaseSync(filename);
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(x => x.name);
  const template = Object.fromEntries(tables.map(t => [t, db.prepare(`SELECT * FROM "${t}"`).all()]));
  const perTask = ["submission_batches", "publication_records", "publication_attempts", "submission_items", "recovery_intents", "article_active_targets", "submission_queue_items"];
  if (kind === "paid") perTask.push("paid_submission_batches");
  const groupTables = kind === "regular" ? ["account_profiles", "submission_queue_groups"] : [];
  const generatedIds = [...new Set(perTask.flatMap(t => (template[t] || []).flatMap(row => Object.entries(row).filter(([key,value]) => key.endsWith("_id") && typeof value === "string" && value !== accountId && value !== groupId && !value.includes("SEED")).map(([,value]) => value))))];
  const replace = (v, i, g) => {
    if (typeof v !== "string") return v;
    const replacements = { CLIENTSEED: `client-${i % Number(process.env.AUDIT_CLIENTS || 10)}`, ARTICLESEED: `article-${i}`, BATCHSEED: `batch-${i}`, ITEMSEED: `item-${i}`,
      PUBLICATIONSEED: `publication-${i}`, ATTEMPTSEED: `attempt-${i}`, SYSTEMSEED: `system-${i}`, MEDIASEED: `media-${g}` };
    if (kind === "regular" && process.env.AUDIT_PLATFORMS === "2") replacements.hepan = g % 2 ? "lieju" : "hepan";
    generatedIds.forEach((id,index) => { replacements[id] = `generated-${index}-${i}`; });
    if (accountId) replacements[accountId] = `account-${g}`;
    if (groupId) replacements[groupId] = `group-${String(g).padStart(6, "0")}`;
    for (const [from, to] of Object.entries(replacements)) v = v.split(from).join(to);
    return v;
  };
  const insert = t => {
    const columns = Object.keys(template[t]?.[0] || {});
    if (!columns.length) return null;
    return { columns, statement: db.prepare(`INSERT INTO "${t}" (${columns.map(x => `"${x}"`).join(",")}) VALUES (${columns.map(() => "?").join(",")})`) };
  };
  const statements = Object.fromEntries([...groupTables, ...perTask].map(t => [t, insert(t)]));
  db.exec("PRAGMA foreign_keys=OFF; BEGIN");
  for (const t of [...groupTables, ...perTask]) db.exec(`DELETE FROM "${t}"`);
  const add = (t, i, g) => {
    const stmt = statements[t];
    if (!stmt) return;
    for (const row of template[t]) stmt.statement.run(...stmt.columns.map(c => {
      if (t === "submission_queue_items" && c === "position") return Math.floor(i / groups) + 1;
      return replace(row[c], i, g);
    }));
  };
  for (let g = 0; g < groups; g++) for (const t of groupTables) add(t, g, g);
  for (let i = 0; i < n; i++) for (const t of perTask) add(t, i, i % groups);
  db.exec("COMMIT; PRAGMA foreign_keys=ON");
  const violations = db.prepare("PRAGMA foreign_key_check").all();
  const census = Object.fromEntries([...groupTables, ...perTask].map(t => [t, db.prepare(`SELECT COUNT(*) n FROM "${t}"`).get().n]));
  db.close();
  emit({ event: "seed", workspace, bodyBytes: body.length, census, clients:Number(process.env.AUDIT_CLIENTS || 10), platforms:Number(process.env.AUDIT_PLATFORMS || 1), foreignKeyViolations: violations.length });
}

async function probe() {
  if (!root || !path.basename(root).startsWith("autopublish-scale-audit-")) throw new Error("SYNTHETIC_WORKSPACE_REQUIRED");
  let active = null;
  const prepare = DatabaseSync.prototype.prepare;
  const sample = new DatabaseSync(":memory:");
  const proto = Object.getPrototypeOf(sample.prepare("SELECT 1"));
  sample.close();
  const statements = new WeakMap();
  DatabaseSync.prototype.prepare = function(sql) { const statement = prepare.call(this, sql); statements.set(statement, sql); return statement; };
  for (const method of ["all", "get", "run"]) {
    const original = proto[method];
    proto[method] = function(...args) {
      if (!active || process.env.SCALE_TIMING_ONLY === "1") return original.apply(this, args);
      const sql = statements.get(this) || "unknown";
      const started = performance.now();
      const result = original.apply(this, args);
      const elapsed = performance.now() - started;
      const q = active.queries[sql] ||= { calls: 0, rows: 0, bytes: 0, ms: 0, method, args: args.slice(0, 4) };
      q.calls++; q.rows += method === "run" ? 0 : Array.isArray(result) ? result.length : result ? 1 : 0;
      q.bytes += byteSize(result); q.ms += elapsed;
      return result;
    };
  }
  const turn = () => new Promise(resolve => setImmediate(resolve));
  async function measure(label, fn) {
    if (process.argv[7] && label !== "store-open" && label !== process.argv[7]) return undefined;
    await turn();
    let ticks = 0, maximumGap = 0, last = performance.now();
    const timer = setInterval(() => { const now = performance.now(); maximumGap = Math.max(maximumGap, now-last); last = now; ticks++; }, 1);
    active = { queries: {} };
    const mem = process.memoryUsage().heapUsed;
    const started = performance.now();
    emit({ event: "begin", label });
    let result, error;
    try { result = await fn(); } catch(e) { error = e.code || e.message; }
    const durationMs = performance.now()-started;
    const queries = active.queries; active = null;
    await turn(); maximumGap = Math.max(maximumGap, performance.now()-last); clearInterval(timer);
    const values = Object.values(queries);
    emit({ event: "measurement", label, durationMs, error, timerTicks: ticks, maxEventLoopGapMs: maximumGap,
      heapDelta: process.memoryUsage().heapUsed-mem, resultBytes: byteSize(result),
      sqlCalls: values.reduce((n,q)=>n+q.calls,0), sqlRows: values.reduce((n,q)=>n+q.rows,0), sqlBytes: values.reduce((n,q)=>n+q.bytes,0),
      sqlMs: values.reduce((n,q)=>n+q.ms,0), queries,
      ...(Array.isArray(result) ? { resultCount: result.length } : {}),
      ...(result?.counts ? { counts: result.counts, hasMore: result.hasMore, failures: result.failures } : {}),
    });
    return result;
  }
  let store, ports = {};
  await measure("store-open", () => { store = createOperationalStore({ workspaceRoot: root, transitionPorts: ports }); return { opened: true }; });
  if (!store) return;
  try {
    if (mode === "attention") {
      const query = createArticleAttentionQuery({ operationalStore:store, getRevision:()=>0, readers:{ getArticle: (clientId,id)=>({id,clientId,title:"Synthetic",summaryVersion:1,hasContent:true}), listTransactions:()=>[], listOrderAttention:()=>[] } });
      await measure("attention-all",()=>query.list({}));
      await measure("attention-one-client",()=>query.list({clientId:"client-0"}));
    } else if (mode === "queue") {
      const query = createRegularQueueGroupQuery({ groupTransitions: ports.regularQueueGroupTransitions });
      const result = await measure("regular-all", () => query.listRegularQueueGroups({}));
      emit({ event: "queue-census", shown: result?.reduce((s,g)=>s+g.remaining.length+(g.current?1:0),0), expected: n });
      await measure("regular-one-client", () => query.listRegularQueueGroups({ clientId: "client-0" }));
    } else if (mode === "paid") {
      await measure("paid-batches", () => store.listPaidSubmissionBatchSnapshots({}));
    } else if (mode === "startup") {
      await measure("pause-regular-on-startup", () => ports.regularQueueGroupTransitions.pauseRegularQueueGroupsOnStartup());
      await measure("pause-paid-on-startup", () => ports.paidExecutionTransitions.pausePaidSubmissionBatchesOnStartup());
      await measure("recovery-page", () => store.listActionableRecovery({}));
    } else if (mode === "article" || mode === "article-dense") {
      const ids = Array.from({length:n},(_,i)=>`article-${i}`);
      await measure("lifecycle-whole-client", () => store.listArticleLifecycleFacts({ articleIds: ids }));
      await measure("lifecycle-one-client", () => store.listArticleLifecycleFacts({ articleIds: ids.filter((_,i)=>i%10===0) }));
      const invalidation = createWorkspaceDataInvalidation({ workspaceRuntimeId: "scale-audit" });
      let summaryCalls = 0;
      const articles = ids.map((id,i)=>({ id, clientId:mode === "article-dense" ? "client-0" : `client-${i%10}`, title:"Synthetic title", status:"saved", summaryVersion:1, hasContent:true, createdAt:"2026-09-12T00:00:00.000Z" }));
      const service = createArticleManagementSnapshot({ getRevision: invalidation.getRevision, getCacheRevision: invalidation.getArticleReadRevision,
        listArticles: clientId => { summaryCalls++; return articles.filter(a=>a.clientId===clientId); }, listTrash:()=>[],
        operationalStore:store, publishedArchiveQueries:ports.publishedArchiveQueries });
      const snap = await measure("article-one-client-cold",()=>service.get("client-0"));
      if (snap) {
        const {createContractRegistry}=require(path.join(app,"desktop/ipc/contracts/registry"));
        const {articleManagementContracts,projectManagementSnapshot}=require(path.join(app,"desktop/ipc/contracts/article-management-contracts"));
        const registry=createContractRegistry(articleManagementContracts);
        await measure("article-wire",()=>registry.success(registry.byChannel("content:get-article-management-snapshot"),projectManagementSnapshot(snap)));
      }
      await measure("article-one-client-hot",()=>service.get("client-0"));
      invalidation.invalidate("ARTICLE_SAVED");
      await measure("article-unrelated-client-save",()=>service.get("client-0"));
      emit({event:"summary-calls",summaryCalls,summarySource:"in-memory summaries; excludes file reads"});
    } else if (mode === "center" || mode === "center-full") {
      const query = createRegularQueueGroupQuery({ groupTransitions: ports.regularQueueGroupTransitions });
      const invalidation = createWorkspaceDataInvalidation({ workspaceRuntimeId:"scale-audit" });
      const attentionQuery = createArticleAttentionQuery({ operationalStore:store, getRevision:invalidation.getRevision, getCacheRevision:invalidation.getArticleReadRevision, readers:{ listTransactions:()=>[], listOrderAttention:()=>[] } });
      const service = createSubmissionCenterSnapshot({ getRevision:invalidation.getRevision, getCacheRevision:invalidation.getArticleReadRevision,
        getWorkspaceRuntimeId:invalidation.getWorkspaceRuntimeId, validateClient:()=>{}, listRegularQueueGroups:query.listRegularQueueGroups,
        listPaidMediaBatches:()=>store.listPaidSubmissionBatchSnapshots({}), listAttention: mode === "center-full" ? attentionQuery.list : ()=>({items:[]}) });
      const snap=await measure("center-page1",()=>service.get({page:1,pageSize:10}));
      if(snap) {
        const {createContractRegistry}=require(path.join(app,"desktop/ipc/contracts/registry"));
        const {submissionCenterContracts}=require(path.join(app,"desktop/ipc/contracts/submission-center-contracts"));
        const registry=createContractRegistry(submissionCenterContracts);
        await measure("center-wire",()=>registry.success(registry.byChannel("content:get-submission-center-snapshot"),snap));
      }
      await measure("center-page1-hot",()=>service.get({page:1,pageSize:10}));
      await measure("center-page2",()=>service.get({page:2,pageSize:10}));
      await measure("center-page1-return",()=>service.get({page:1,pageSize:10}));
      invalidation.invalidate("ARTICLE_SAVED");
      await measure("center-after-article-save",()=>service.get({page:1,pageSize:10}));
      await measure("center-page2001",()=>service.get({page:2001,pageSize:10}));
    } else if (mode === "explain") {
      const db = new DatabaseSync(store.databasePath,{readOnly:true});
      emit({event:"indexes",indexes:db.prepare("SELECT name,sql FROM sqlite_master WHERE type='index'").all()});
      await measure("queue-group-plan-source",()=>ports.regularQueueGroupTransitions.listRegularQueueGroupSnapshots({ queueGroupId:"group-000000" }));
      db.close();
    }
  } finally { store.close(); }
}
(mode === "seed" ? Promise.resolve().then(seed) : probe()).catch(error=>{ emit({event:"fatal",code:error.code,message:error.message});process.exitCode=1; });
