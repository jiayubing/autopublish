import test from "node:test";
import assert from "node:assert/strict";

import { createContentWorkbenchFeature } from "../media-workbench/src/features/content/content-workbench-feature.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

function queueState(status = "idle", overrides = {}) {
  return {
    status,
    currentTaskId: null,
    completed: 0,
    total: 0,
    waitRemainingMs: 0,
    tasks: [],
    ...overrides,
  };
}

function adapters(overrides = {}) {
  return {
    listClients: async () => [
      { id: "client-a", name: "A" },
      { id: "client-b", name: "B" },
    ],
    listTemplateCatalog: async () => ({
      revision: "catalog-1",
      platforms: [],
      templates: [],
      diagnostics: [],
    }),
    listQuestions: async () => [],
    listResearch: async () => [],
    loadManagement: async () => ({
      articles: [],
      trash: [],
      submissionBatches: [],
      cancellationPlans: [],
      publicationRecords: [],
      workflowByArticle: {},
      submissionPlatforms: [],
    }),
    ...overrides,
  };
}

async function readyFeature(overrides = {}) {
  const feature = createContentWorkbenchFeature(adapters(overrides));
  feature.setScope({ workspaceRuntimeId: "runtime-1" });
  await feature.refresh("initial");
  return feature;
}

test("workspace queue command results survive a selected-client switch", async () => {
  const pending = deferred();
  let calls = 0;
  const feature = await readyFeature({
    startPreparedDoubaoBatch: async () => {
      calls += 1;
      return pending.promise;
    },
  });

  const command = feature.commands.startPreparedDoubaoBatch({ tasks: [] });
  await feature.selectClient("client-b");
  assert.equal(feature.getSnapshot().commands.startPreparedDoubaoBatch.busy, true);
  assert.deepEqual(
    await feature.commands.startPreparedDoubaoBatch({ tasks: [] }),
    { ignored: true },
  );
  assert.equal(calls, 1);
  pending.resolve(queueState("completed"));

  assert.equal((await command).status, "completed");
  assert.equal(feature.getSnapshot().selectedClientId, "client-b");
  assert.equal(feature.getSnapshot().doubaoQueue.status, "completed");
  feature.dispose();
});

test("workspace login command results survive a selected-client switch", async () => {
  const pending = deferred();
  const feature = await readyFeature({
    getDoubaoLoginStatus: async () => pending.promise,
  });

  const command = feature.commands.getDoubaoLoginStatus();
  await feature.selectClient("client-b");
  pending.resolve({ status: "authenticated" });

  assert.equal((await command).status, "authenticated");
  assert.deepEqual(feature.getSnapshot().doubaoLogin, { status: "authenticated" });
  assert.equal(feature.getSnapshot().doubaoLoginQuery.loading, false);
  feature.dispose();
});

test("scope-invalidated content commands resolve with an explicit stale result", async () => {
  const retryPending = deferred();
  const savePending = deferred();
  const feature = await readyFeature({
    retryMaterial: async () => retryPending.promise,
    saveArticle: async () => savePending.promise,
  });

  const retry = feature.commands.retryMaterial({ clientId: "client-a", materialId: "material-1" });
  const save = feature.commands.saveArticle({ clientId: "client-a", articleId: "article-1", title: "A" });
  await feature.selectClient("client-b");
  retryPending.resolve({ id: "material-1", name: "facts.docx", status: "ready", content: "converted" });
  savePending.resolve({ id: "article-1", clientId: "client-a", title: "A", status: "saved" });

  const stale = { stale: true, code: "CONTENT_COMMAND_STALE", reason: "scope-changed" };
  assert.deepEqual(await retry, stale);
  assert.deepEqual(await save, stale);
  feature.dispose();
});

test("retrying material refreshes the authoritative client source snapshot", async () => {
  let materialStatus = "error";
  let listClientsReads = 0;
  const feature = await readyFeature({
    listClients: async () => {
      listClientsReads += 1;
      return [
        {
          id: "client-a",
          name: "A",
          knowledgeFiles: [{ id: "material-1", name: "facts.docx", status: materialStatus, content: "" }],
        },
        { id: "client-b", name: "B", knowledgeFiles: [] },
      ];
    },
    retryMaterial: async () => {
      materialStatus = "ready";
      return { id: "material-1", name: "facts.docx", status: "ready", content: "converted" };
    },
  });
  const baselineReads = listClientsReads;

  await feature.commands.retryMaterial({ clientId: "client-a", materialId: "material-1" });

  assert.equal(listClientsReads, baselineReads + 1);
  assert.equal(feature.getSnapshot().clients[0].knowledgeFiles[0].status, "ready");
  feature.dispose();
});

test("content-source refresh does not reread the management projection", async () => {
  let managementReads = 0;
  const feature = await readyFeature({
    loadManagement: async () => {
      managementReads += 1;
      return {};
    },
  });
  const baselineReads = managementReads;

  assert.equal(await feature.refreshContentSources("invalidation"), true);
  assert.equal(managementReads, baselineReads);
  feature.dispose();
});

test("queue events supersede an older queue query", async () => {
  const pending = deferred();
  let queueListener;
  const feature = await readyFeature({
    getDoubaoQueueState: async () => pending.promise,
    subscribeDoubaoQueue: (listener) => {
      queueListener = listener;
      return () => {
        queueListener = null;
      };
    },
  });

  const refresh = feature.refreshDoubaoQueue("manual");
  queueListener(queueState("completed", { total: 1, completed: 1 }));
  pending.resolve(queueState("idle"));

  assert.equal(await refresh, false);
  assert.equal(feature.getSnapshot().doubaoQueue.status, "completed");
  feature.dispose();
});

test("completed queue refresh is deduplicated for repeated empty completions", async () => {
  let questionReads = 0;
  let researchReads = 0;
  let queueListener;
  const feature = await readyFeature({
    listQuestions: async () => {
      questionReads += 1;
      return [];
    },
    listResearch: async () => {
      researchReads += 1;
      return [];
    },
    subscribeDoubaoQueue: (listener) => {
      queueListener = listener;
      return () => {
        queueListener = null;
      };
    },
  });

  const baseline = { questionReads, researchReads };
  queueListener(queueState("running"));
  queueListener(queueState("completed"));
  await Promise.resolve();
  await Promise.resolve();
  const afterFirstCompletion = { questionReads, researchReads };
  queueListener(queueState("completed"));
  await Promise.resolve();
  await Promise.resolve();

  assert.ok(afterFirstCompletion.questionReads > baseline.questionReads);
  assert.ok(afterFirstCompletion.researchReads > baseline.researchReads);
  assert.deepEqual({ questionReads, researchReads }, afterFirstCompletion);
  feature.dispose();
});

test("a newer selected-client research read is not overwritten by an older index read", async () => {
  const oldIndexA = deferred();
  const oldIndexB = deferred();
  const freshClientA = deferred();
  let clientAResearchReads = 0;
  const feature = createContentWorkbenchFeature(adapters({
    listResearch: async (clientId) => {
      if (clientId === "client-a") {
        clientAResearchReads += 1;
        return clientAResearchReads === 1 ? oldIndexA.promise : freshClientA.promise;
      }
      return oldIndexB.promise;
    },
  }));
  feature.setScope({ workspaceRuntimeId: "runtime-1" });
  await feature.refreshSources("initial");

  const oldIndex = feature.refreshResearchIndex("old-index");
  const freshClient = feature.refreshClientData("fresh-client");
  freshClientA.resolve([{ id: "research-new", clientId: "client-a" }]);
  await freshClient;
  oldIndexA.resolve([{ id: "research-old", clientId: "client-a" }]);
  oldIndexB.resolve([{ id: "research-b", clientId: "client-b" }]);
  await oldIndex;

  assert.deepEqual(feature.getSnapshot().research.map((item) => item.id), ["research-new"]);
  assert.deepEqual(feature.getSnapshot().researchByClient["client-a"].map((item) => item.id), ["research-new"]);
  feature.dispose();
});

test("queue subscription and pending queue reads are disposed safely", async () => {
  const pending = deferred();
  let unsubscribeCalls = 0;
  let queueListener;
  const feature = await readyFeature({
    getDoubaoQueueState: async () => pending.promise,
    subscribeDoubaoQueue: (listener) => {
      queueListener = listener;
      return () => {
        unsubscribeCalls += 1;
        queueListener = null;
      };
    },
  });

  const refresh = feature.refreshDoubaoQueue("manual");
  feature.dispose();
  pending.resolve(queueState("completed"));

  assert.equal(await refresh, false);
  assert.equal(unsubscribeCalls, 1);
  assert.equal(queueListener, null);
});

test("terminal removal events trigger one management refresh per watch", async () => {
  const pending = deferred();
  let removalListener;
  let managementReads = 0;
  const committed = {
    transactionId: "removal-1",
    status: "committed",
    phase: "committed",
  };
  const staleQuery = {
    transactionId: "removal-1",
    status: "pending_recovery",
    phase: "recovery",
  };
  const feature = await readyFeature({
    loadManagement: async () => {
      managementReads += 1;
      return {};
    },
    getRemovalTransaction: async () => pending.promise,
    subscribeRemovalTransaction: (_transactionId, listener) => {
      removalListener = listener;
      return () => {
        removalListener = null;
      };
    },
  });
  const baselineReads = managementReads;

  const watch = feature.watchRemovalTransaction("removal-1");
  removalListener(committed);
  removalListener(committed);
  pending.resolve(staleQuery);

  assert.equal(await watch, true);
  await Promise.resolve();
  assert.equal(managementReads, baselineReads + 1);
  assert.equal(feature.getSnapshot().removal.transactionId, "removal-1");
  assert.equal(feature.getSnapshot().removal.transaction.status, "committed");
  feature.dispose();
});

test("a terminal removal query refreshes management when the initial event was missed", async () => {
  let managementReads = 0;
  const feature = await readyFeature({
    loadManagement: async () => {
      managementReads += 1;
      return {};
    },
    getRemovalTransaction: async () => ({
      transactionId: "removal-query-terminal",
      status: "committed",
      phase: "committed",
      revision: 1,
    }),
    subscribeRemovalTransaction: () => () => {},
  });
  const baselineReads = managementReads;

  assert.equal(await feature.watchRemovalTransaction("removal-query-terminal"), true);
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(managementReads, baselineReads + 1);
  assert.equal(feature.getSnapshot().removal.transaction.status, "committed");
  feature.dispose();
});

test("a terminal query and an equivalent later event share one management refresh", async () => {
  let removalListener;
  let managementReads = 0;
  const terminal = {
    transactionId: "removal-query-first",
    status: "committed",
    phase: "committed",
    updatedAt: "2026-08-04T05:00:00.000Z",
  };
  const feature = await readyFeature({
    loadManagement: async () => {
      managementReads += 1;
      return {};
    },
    getRemovalTransaction: async () => terminal,
    subscribeRemovalTransaction: (_transactionId, listener) => {
      removalListener = listener;
      return () => {};
    },
  });
  const baselineReads = managementReads;

  assert.equal(await feature.watchRemovalTransaction(terminal.transactionId), true);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(managementReads, baselineReads + 1);

  removalListener({ ...terminal, revision: 1 });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(managementReads, baselineReads + 1);
  feature.dispose();
});

test("a missing removal query unsubscribes and rejects late events", async () => {
  let removalListener;
  let staleRemovalListener;
  let unsubscribeCalls = 0;
  const feature = await readyFeature({
    getRemovalTransaction: async () => null,
    subscribeRemovalTransaction: (_transactionId, listener) => {
      removalListener = listener;
      staleRemovalListener = listener;
      return () => {
        unsubscribeCalls += 1;
        removalListener = null;
      };
    },
  });

  assert.equal(await feature.watchRemovalTransaction("missing"), false);
  staleRemovalListener({ transactionId: "missing", status: "committed", phase: "committed" });

  assert.equal(unsubscribeCalls, 1);
  assert.equal(removalListener, null);
  assert.equal(feature.getSnapshot().removal.transactionId, null);
  assert.equal(feature.getSnapshot().removal.transaction, null);
  feature.dispose();
});

test("content refresh reads each client source once", async () => {
  let questionReads = 0;
  let researchReads = 0;
  let managementReads = 0;
  const feature = createContentWorkbenchFeature(adapters({
    listQuestions: async () => {
      questionReads += 1;
      return [];
    },
    listResearch: async () => {
      researchReads += 1;
      return [];
    },
    loadManagement: async () => {
      managementReads += 1;
      return {};
    },
  }));

  feature.setScope({ workspaceRuntimeId: "runtime-1" });
  assert.equal(await feature.refresh("initial"), true);
  assert.equal(questionReads, 1);
  assert.equal(researchReads, 3);
  assert.equal(managementReads, 1);
  feature.dispose();
});

test("missing removal transactions do not leave destructive actions disabled", async () => {
  const feature = await readyFeature({
    getRemovalTransaction: async () => null,
  });

  assert.equal(await feature.watchRemovalTransaction("missing"), false);
  assert.equal(feature.getSnapshot().removal.transactionId, null);
  assert.equal(feature.getSnapshot().removal.transaction, null);
  assert.equal(feature.getSnapshot().removal.query.loading, false);
  assert.equal(feature.getSnapshot().removal.query.reason, "missing");
  feature.dispose();
});

test("a removal watch from a previous client cannot repopulate the new scope", async () => {
  const pending = deferred();
  let removalListener;
  const feature = await readyFeature({
    getRemovalTransaction: async () => pending.promise,
    subscribeRemovalTransaction: (_transactionId, listener) => {
      removalListener = listener;
      return () => {
        removalListener = null;
      };
    },
  });

  const watch = feature.watchRemovalTransaction("removal-old");
  await feature.selectClient("client-b");
  pending.resolve({ transactionId: "removal-old", status: "committed", phase: "committed" });

  assert.equal(await watch, false);
  assert.equal(feature.getSnapshot().selectedClientId, "client-b");
  assert.equal(feature.getSnapshot().removal.transactionId, null);
  assert.equal(removalListener, null);
  feature.dispose();
});

test("a late removal listener from an older watch cannot update the newer watch", async () => {
  const pending = new Map();
  const listeners = new Map();
  const feature = await readyFeature({
    getRemovalTransaction: async ({ transactionId }) => {
      const next = deferred();
      pending.set(transactionId, next);
      return next.promise;
    },
    subscribeRemovalTransaction: (transactionId, listener) => {
      listeners.set(transactionId, listener);
      return () => {};
    },
  });

  const oldWatch = feature.watchRemovalTransaction("removal-old");
  const newWatch = feature.watchRemovalTransaction("removal-new");
  listeners.get("removal-old")({ transactionId: "removal-old", status: "committed", phase: "committed" });
  assert.equal(feature.getSnapshot().removal.transactionId, "removal-new");
  assert.equal(feature.getSnapshot().removal.transaction, null);
  listeners.get("removal-new")({ transactionId: "removal-old", status: "committed", phase: "committed" });
  assert.equal(feature.getSnapshot().removal.transaction, null);
  listeners.get("removal-new")({ transactionId: "removal-new", status: "committed", phase: "committed" });
  assert.equal(feature.getSnapshot().removal.transactionId, "removal-new");
  assert.equal(feature.getSnapshot().removal.transaction.status, "committed");

  pending.get("removal-old").resolve({ transactionId: "removal-old", status: "committed", phase: "committed" });
  pending.get("removal-new").resolve({ transactionId: "removal-new", status: "committed", phase: "committed" });
  assert.equal(await oldWatch, false);
  assert.equal(await newWatch, true);
  feature.dispose();
});

test("refreshing sources after a removed client transitions the complete client scope", async () => {
  let clients = [
    { id: "client-a", name: "A" },
    { id: "client-b", name: "B" },
  ];
  const retryPending = deferred();
  const managementReads = [];
  const feature = await readyFeature({
    listClients: async () => clients,
    listQuestions: async (clientId) => [{ id: `question-${clientId}`, clientId, text: clientId, enabled: true }],
    listResearch: async (clientId) => [{ id: `research-${clientId}`, clientId, answerText: clientId }],
    loadManagement: async (clientId) => {
      managementReads.push(clientId);
      return { articles: [{ id: `article-${clientId}`, clientId }] };
    },
    retryMaterial: async () => retryPending.promise,
  });
  feature.setCurrentArticle({ id: "article-a", clientId: "client-a", title: "A" });
  const pendingCommand = feature.commands.retryMaterial({ clientId: "client-a", materialId: "material-a" });

  clients = [{ id: "client-b", name: "B" }];
  assert.equal(await feature.refreshContentSources("invalidation"), true);
  assert.equal(feature.getSnapshot().selectedClientId, "client-b");
  assert.equal(feature.getSnapshot().currentArticle, null);
  assert.deepEqual(feature.getSnapshot().questions.map((item) => item.id), ["question-client-b"]);
  assert.deepEqual(feature.getSnapshot().research.map((item) => item.id), ["research-client-b"]);
  assert.deepEqual(feature.getSnapshot().management.articles.map((item) => item.id), ["article-client-b"]);
  assert.equal(managementReads.at(-1), "client-b");

  retryPending.resolve({ id: "material-a", status: "ready" });
  assert.deepEqual(await pendingCommand, { stale: true, code: "CONTENT_COMMAND_STALE", reason: "scope-changed" });
  feature.dispose();
});

test("a client-scoped command becomes stale when its authoritative refresh changes client scope", async () => {
  let clients = [
    { id: "client-a", name: "A" },
    { id: "client-b", name: "B" },
  ];
  const feature = await readyFeature({
    listClients: async () => clients,
    retryMaterial: async () => {
      clients = [{ id: "client-b", name: "B" }];
      return { id: "material-a", status: "ready" };
    },
  });

  const result = await feature.commands.retryMaterial({ clientId: "client-a", materialId: "material-a" });
  assert.deepEqual(result, { stale: true, code: "CONTENT_COMMAND_STALE", reason: "scope-changed" });
  assert.equal(feature.getSnapshot().selectedClientId, "client-b");
  feature.dispose();
});

test("removal transaction events own terminal management refresh over command completion", async () => {
  let removalListener;
  let managementReads = 0;
  const committed = {
    transactionId: "removal-command",
    status: "committed",
    phase: "committed",
    revision: 1,
  };
  const feature = await readyFeature({
    loadManagement: async () => {
      managementReads += 1;
      return {};
    },
    subscribeRemovalTransaction: (_transactionId, listener) => {
      removalListener = listener;
      return () => {};
    },
    trashContentArticles: async () => {
      removalListener(committed);
      return committed;
    },
  });
  const baselineReads = managementReads;
  assert.equal(await feature.watchRemovalTransaction("removal-command"), true);

  const result = await feature.commands.trashContentArticles({
    clientId: "client-a",
    articles: [{ clientId: "client-a", articleId: "article-a" }],
    confirmed: true,
  });
  assert.equal(await feature.watchRemovalTransaction("removal-command"), true);
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(result, committed);
  assert.equal(managementReads, baselineReads + 1);
  feature.dispose();
});

test("a successful removal command refreshes management when its event is missed and its query fails", async () => {
  let managementReads = 0;
  const committed = {
    transactionId: "removal-command-fallback",
    status: "committed",
    phase: "committed",
    revision: 1,
  };
  const feature = await readyFeature({
    loadManagement: async () => {
      managementReads += 1;
      return {};
    },
    trashContentArticles: async () => committed,
    getRemovalTransaction: async () => {
      throw new Error("transaction query unavailable");
    },
    subscribeRemovalTransaction: () => () => {},
  });
  const baselineReads = managementReads;

  assert.deepEqual(
    await feature.commands.trashContentArticles({
      clientId: "client-a",
      articles: [{ clientId: "client-a", articleId: "article-a" }],
      confirmed: true,
    }),
    committed,
  );
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(managementReads, baselineReads + 1);
  assert.equal(await feature.watchRemovalTransaction(committed.transactionId), false);
  assert.equal(managementReads, baselineReads + 1);
  feature.dispose();
});
