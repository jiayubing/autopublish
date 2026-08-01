const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { it } = require("node:test");
const { createWorkspaceDataInvalidation, scopesForReason } = require("../desktop/workspace-data-invalidation");
const { createWorkspaceRuntime } = require("../desktop/workspace-runtime");

function replaceModules(replacements) {
  const originals = replacements.map(function(replacement) {
    const resolved = require.resolve(replacement.request);
    const original = require.cache[resolved];
    require.cache[resolved] = {
      id: resolved,
      filename: resolved,
      loaded: true,
      exports: replacement.exports
    };
    return { resolved: resolved, original: original };
  });
  return function restore() {
    originals.forEach(function(item) {
      if (item.original) require.cache[item.resolved] = item.original;
      else delete require.cache[item.resolved];
    });
  };
}

function lifecycleService(name, events, extra) {
  return Object.assign({
    dispose: function() { events.push(name); }
  }, extra || {});
}

function workspaceRuntimeOptions(root) {
  return {
    ipcMain: {},
    sendToRenderer: function() {},
    safeStorage: { isEncryptionAvailable: function() { return false; } },
    appRoot: path.resolve(__dirname, ".."),
    userDataPath: path.join(root, "user-data"),
    sessionDataPath: path.join(root, "session-data")
  };
}

function generatedArticle(id, title) {
  return {
    id: id,
    clientId: "shared-client",
    researchQueryIds: ["query-1"],
    researchSnapshots: [{
      questionId: "query-1",
      question: "Synthetic question",
      answerText: "Synthetic answer",
      references: [],
      collectedAt: "2026-07-27T00:00:00.000Z",
      collectionMethod: "automatic"
    }],
    platform: "ctrip",
    scenario: "guide",
    templateId: "template-1",
    title: title,
    content: "Synthetic article body.",
    status: "generated",
    source: { client_material: true, doubao_answer: true, references: false, template: true },
    createdAt: "2026-07-27T00:00:00.000Z",
    updatedAt: "2026-07-27T00:00:00.000Z"
  };
}

function syntheticIpcMain() {
  const handlers = new Map();
  return {
    handlers: handlers,
    handle: function(channel, handler) { handlers.set(channel, handler); },
    removeHandler: function(channel) { handlers.delete(channel); }
  };
}

it("workspace invalidation owns reason-to-scope policy and emits safe monotonic payloads", function() {
  const sent = [];
  const invalidation = createWorkspaceDataInvalidation({ workspaceRuntimeId: "runtime-fixture-1", sendToRenderer: function(channel, payload) { sent.push([channel, payload]); } });
  assert.equal(invalidation.invalidate("PUBLICATION_RECONCILED"), 1);
  assert.equal(invalidation.invalidate("PUBLICATION_RECONCILED"), 2);
  assert.deepEqual(sent[0], ["workspace:data-invalidated", {
    schemaVersion: 1,
    workspaceRuntimeId: "runtime-fixture-1",
    revision: 1,
    scopes: ["articleManagement", "articleAttention", "platformQueue"],
    reasonCode: "PUBLICATION_RECONCILED"
  }]);
  assert.equal(sent[1][1].revision, 2);
  assert.deepEqual(invalidation.scopesForReason("MEDIA_SUBMIT_COMPLETED"), ["articleManagement", "articleAttention", "platformQueue", "orders"]);
});

it("maps every production workspace mutation reason explicitly without a broad fallback", function() {
  const submissionScopes = ["articleManagement", "articleAttention", "platformQueue"];
  [
    "SUBMISSION_BATCH_CANCELLED",
    "SUBMISSION_BATCH_CREATED",
    "SUBMISSION_QUEUE_CANCELLED",
    "SUBMISSION_QUEUE_CLEANED",
    "PUBLICATION_RECONCILED",
    "PLATFORM_AUTO_TRASH_APPLIED",
    "PLATFORM_SUBMIT_COMPLETED",
    "PLATFORM_SUBMIT_FAILED",
    "PLATFORM_SUBMIT_STOPPED",
    "ARTICLE_REMOVAL_TRANSACTION_CHANGED",
    "GENERATION_SUBMISSION_HANDOFF_COMMITTED",
    "ARTICLE_ATTENTION_RESOLVED",
    "TRASHED_QUEUE_RESIDUE_RESOLVED",
    "FAILED_QUEUE_ITEMS_CLEANED"
  ].forEach(function(reasonCode) {
    assert.deepEqual(scopesForReason(reasonCode), submissionScopes, reasonCode);
  });
  assert.deepEqual(scopesForReason("CONTENT_EXPORT_QUEUED"), [...submissionScopes, "mediaWorkbench"]);
  assert.deepEqual(scopesForReason("MEDIA_SUBMIT_COMPLETED"), [...submissionScopes, "orders"]);
  [
    "CONTENT_SOURCE_CHANGED",
    "CONTENT_QUESTION_CREATED",
    "CONTENT_QUESTION_UPDATED",
    "CONTENT_QUESTION_DELETED",
    "CONTENT_RESEARCH_COLLECTED",
    "CONTENT_RESEARCH_MANUAL_SAVED"
  ].forEach(function(reasonCode) {
    assert.deepEqual(scopesForReason(reasonCode), ["contentSources"], reasonCode);
  });
  ["GENERATION_BATCH_CREATED", "GENERATION_BATCH_TERMINAL", "GENERATION_PENDING_TASKS_CANCELLED", "GENERATION_BATCH_CHANGED", "ARTICLE_SAVED", "ARTICLES_REVIEWED"].forEach(function(reasonCode) {
    assert.deepEqual(scopesForReason(reasonCode), ["articleManagement"], reasonCode);
  });
  assert.deepEqual(scopesForReason("PLATFORM_SUBMIT_UNMAPPED"), []);
  assert.deepEqual(scopesForReason("UNKNOWN_MUTATION"), []);
});

it("workspace runtime validates lifecycle dependencies before a workspace can start", function() {
  assert.throws(function() { createWorkspaceRuntime({}); }, /ipcMain/);
  assert.throws(function() { createWorkspaceRuntime({ ipcMain: {} }); }, /sendToRenderer/);
});

it("article management reads only the newly started workspace when client ids overlap", async function() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-runtime-isolation-"));
  const workspaceA = path.join(root, "workspace-a");
  const workspaceB = path.join(root, "workspace-b");
  const { createContentLifecycleComposition } = require("../desktop/composition/content-lifecycle-composition");
  const ipcMain = syntheticIpcMain();
  const options = Object.assign(workspaceRuntimeOptions(root), {
    ipcMain: ipcMain,
    authService: { requireAuthenticated: async function() {} }
  });
  fs.mkdirSync(workspaceA, { recursive: true });
  fs.mkdirSync(workspaceB, { recursive: true });
  createContentLifecycleComposition({ workspaceRoot: workspaceA }).contentStore.saveArticle(generatedArticle("article-a", "Workspace A"));
  createContentLifecycleComposition({ workspaceRoot: workspaceB }).contentStore.saveArticle(generatedArticle("article-b", "Workspace B"));

  let runtime = createWorkspaceRuntime(options);
  try {
    await runtime.start({ workspacePath: workspaceA });
    runtime.registerIpc();
    let response = await ipcMain.handlers.get("content:get-article-management-snapshot")(null, {
      schemaVersion: 1,
      payload: { clientId: "shared-client" }
    });
    assert.equal(response.ok, true, JSON.stringify(response));
    assert.deepEqual(response.data.articles.map(function(article) { return article.id; }), ["article-a"]);
    await runtime.dispose();

    runtime = createWorkspaceRuntime(options);
    await runtime.start({ workspacePath: workspaceB });
    runtime.registerIpc();
    response = await ipcMain.handlers.get("content:get-article-management-snapshot")(null, {
      schemaVersion: 1,
      payload: { clientId: "shared-client" }
    });
    assert.equal(response.ok, true, JSON.stringify(response));
    assert.deepEqual(response.data.articles.map(function(article) { return article.id; }), ["article-b"]);
  } finally {
    await runtime.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

it("workspace runtime gives the Hepan task service its configured platform settings", async function() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-runtime-hepan-"));
  const taskServicePath = require.resolve("../desktop/services/desktop-task-service");
  const originalTaskServiceModule = require.cache[taskServicePath];
  const originalPython = process.env.HEPAN_PYTHON;
  const originalCookie = process.env.HEPAN_COOKIE_PATH;
  const cookiePath = path.join(root, "hepan-cookie.txt");
  let taskServiceOptions = null;
  fs.writeFileSync(cookiePath, "sessionid=test-session");
  process.env.HEPAN_PYTHON = process.execPath;
  process.env.HEPAN_COOKIE_PATH = cookiePath;
  require.cache[taskServicePath] = {
    id: taskServicePath,
    filename: taskServicePath,
    loaded: true,
    exports: {
      createDesktopTaskService: function(options) {
        taskServiceOptions = options;
        return { getState: function() { return {}; }, dispose: function() {} };
      }
    }
  };
  try {
    const runtime = createWorkspaceRuntime({
      ipcMain: {},
      sendToRenderer: function() {},
      safeStorage: { isEncryptionAvailable: function() { return false; } },
      appRoot: path.resolve(__dirname, ".."),
      userDataPath: path.join(root, "user-data"),
      sessionDataPath: path.join(root, "session-data")
    });
    await runtime.start({ workspacePath: path.join(root, "workspace") });
    const hepanRuntime = taskServiceOptions.platformSettingsService.getAdapterForRuntime("hepan");
    assert.ok(hepanRuntime.adapter);
    assert.equal(hepanRuntime.config.pythonPath, process.execPath);
    assert.equal(hepanRuntime.config.cookiePath, cookiePath);
    await runtime.dispose();
  } finally {
    if (originalTaskServiceModule) require.cache[taskServicePath] = originalTaskServiceModule;
    else delete require.cache[taskServicePath];
    if (originalPython === undefined) delete process.env.HEPAN_PYTHON;
    else process.env.HEPAN_PYTHON = originalPython;
    if (originalCookie === undefined) delete process.env.HEPAN_COOKIE_PATH;
    else process.env.HEPAN_COOKIE_PATH = originalCookie;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

it("disposes services already created when a middle workspace factory fails", async function() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-runtime-factory-failure-"));
  const events = [];
  const restore = replaceModules([
    { request: "../desktop/services/desktop-task-service", exports: { createDesktopTaskService: function() { return lifecycleService("task", events, { getState: function() { return {}; } }); } } },
    { request: "../desktop/services/doubao-collection-service", exports: { createDoubaoCollectionDesktopService: function() { return lifecycleService("doubao", events, { getQueueState: function() { return {}; }, subscribe: function() { return function() { events.push("collection-unsubscribe"); }; } }); } } },
    { request: "../desktop/services/ai-provider-service", exports: { createAiProviderService: function() { return lifecycleService("provider", events, { createClient: function() {} }); } } },
    { request: "../desktop/services/content-submission-service", exports: { createContentSubmissionService: function() { return lifecycleService("submission", events); } } },
    { request: "../desktop/services/ai-content-service", exports: { createAiContentService: function() { return lifecycleService("content", events); } } },
    { request: "../desktop/services/content-generation-batch-service", exports: { createContentGenerationBatchService: function() { throw new Error("generation factory failed"); } } }
  ]);
  try {
    const runtime = createWorkspaceRuntime(workspaceRuntimeOptions(root));
    await assert.rejects(runtime.start({ workspacePath: path.join(root, "workspace") }), /generation factory failed/);
    assert.deepEqual(events, ["content", "submission", "provider", "doubao", "task"]);
    assert.equal(runtime.getState().phase, "stopped");
    assert.equal(runtime.getState().task, null);
    assert.throws(function() { runtime.registerIpc(); }, /not started/);
  } finally {
    restore();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

it("unsubscribes and disposes all started workspace resources when post-subscription setup fails", async function() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-runtime-subscription-failure-"));
  const events = [];
  const restore = replaceModules([
    { request: "../desktop/services/desktop-task-service", exports: { createDesktopTaskService: function() { return lifecycleService("task", events, { getState: function() { return {}; } }); } } },
    { request: "../desktop/services/doubao-collection-service", exports: { createDoubaoCollectionDesktopService: function() { return lifecycleService("doubao", events, { getQueueState: function() { return {}; }, subscribe: function() { return function() { events.push("collection-unsubscribe"); throw new Error("collection unsubscribe failed"); }; } }); } } },
    { request: "../desktop/services/ai-provider-service", exports: { createAiProviderService: function() { return lifecycleService("provider", events, { createClient: function() {} }); } } },
    { request: "../desktop/services/content-submission-service", exports: { createContentSubmissionService: function() { return lifecycleService("submission", events); } } },
    { request: "../desktop/services/ai-content-service", exports: { createAiContentService: function() { return lifecycleService("content", events); } } },
    { request: "../desktop/services/content-generation-batch-service", exports: { createContentGenerationBatchService: function() { return lifecycleService("generation", events, { getState: function() { return {}; } }); } } },
    { request: "../desktop/services/platform-workbench-service", exports: { createPlatformWorkbenchService: function() { return lifecycleService("workbench", events); } } },
    { request: "../desktop/services/generation-submission-handoff-service", exports: { createGenerationSubmissionHandoffService: function() { throw new Error("handoff setup failed"); } } }
  ]);
  try {
    const runtime = createWorkspaceRuntime(workspaceRuntimeOptions(root));
    await assert.rejects(runtime.start({ workspacePath: path.join(root, "workspace") }), /handoff setup failed/);
    assert.deepEqual(events, ["collection-unsubscribe", "workbench", "generation", "content", "submission", "provider", "doubao", "task"]);
    assert.equal(runtime.getState().phase, "stopped");
    assert.equal(runtime.getState().task, null);
    assert.throws(function() { runtime.registerIpc(); }, /not started/);
  } finally {
    restore();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
