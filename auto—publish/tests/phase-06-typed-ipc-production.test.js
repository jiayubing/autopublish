const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { createAuthenticatedIpcMain } = require("../desktop/ipc/register");
const {
  productionIpcRegistry,
} = require("../desktop/ipc/contracts/production-registry");
const {
  createWorkspaceDataInvalidation,
} = require("../desktop/workspace-data-invalidation");

test("production typed query and command reject legacy wire input and return versioned safe results", async () => {
  const handlers = new Map();
  const guarded = createAuthenticatedIpcMain(
    { handle: (channel, handler) => handlers.set(channel, handler) },
    async () => undefined,
  );
  guarded.handle("media:get-balance", async () => ({ ok: true, data: { balance: "12.50" } }));
  guarded.handle("media:stop-submit", async () => ({ ok: true, data: { stopped: true } }));

  const balance = productionIpcRegistry.byChannel("media:get-balance");
  const stop = productionIpcRegistry.byChannel("media:stop-submit");
  const rejected = await handlers.get(balance.channel)({});
  assert.equal(rejected.schemaVersion, 1);
  assert.equal(rejected.ok, false);
  assert.equal(rejected.error.code, "IPC_REQUEST_INVALID");

  assert.deepEqual(
    await handlers.get(balance.channel)({}, productionIpcRegistry.encodeRequest(balance, {})),
    { schemaVersion: 1, ok: true, data: { balance: "12.50" } },
  );
  assert.deepEqual(
    await handlers.get(stop.channel)({}, productionIpcRegistry.encodeRequest(stop, {})),
    { schemaVersion: 1, ok: true, data: { stopped: true } },
  );
});

test("production typed IPC converts authentication, handler, and result failures without raw details", async () => {
  const handlers = new Map();
  const guarded = createAuthenticatedIpcMain(
    { handle: (channel, handler) => handlers.set(channel, handler) },
    async () => {
      throw Object.assign(new Error("C:\\private\\auth.db"), { code: "AUTH_REQUIRED" });
    },
  );
  guarded.handle("media:get-balance", async () => ({ ok: true, data: { balance: "12", raw: "secret" } }));
  const contract = productionIpcRegistry.byChannel("media:get-balance");
  const response = await handlers.get(contract.channel)({}, productionIpcRegistry.encodeRequest(contract, {}));
  assert.equal(response.ok, false);
  assert.equal(response.error.category, "authentication");
  assert.doesNotMatch(JSON.stringify(response), /private|auth\.db/i);
});

test("workspace invalidation emits the versioned opaque runtime event", () => {
  const sent = [];
  const invalidation = createWorkspaceDataInvalidation({
    workspaceRuntimeId: "runtime-opaque-123",
    sendToRenderer: (channel, payload) => sent.push({ channel, payload }),
  });
  invalidation.invalidate("CONTENT_SOURCE_CHANGED");
  assert.deepEqual(invalidation.getRuntimeIdentity(), {
    workspaceRuntimeId: "runtime-opaque-123",
    revision: 1,
  });
  assert.deepEqual(sent, [{
    channel: "workspace:data-invalidated",
    payload: {
      schemaVersion: 1,
      workspaceRuntimeId: "runtime-opaque-123",
      revision: 1,
      scopes: ["contentSources"],
      reasonCode: "CONTENT_SOURCE_CHANGED",
    },
  }]);
  assert.doesNotMatch(JSON.stringify(sent), /[A-Z]:\\|workspacePath|filePath/);
});

test("workspace runtime identity is a versioned path-free query", async () => {
  const handlers = new Map();
  const guarded = createAuthenticatedIpcMain(
    { handle: (channel, handler) => handlers.set(channel, handler) },
    async () => undefined,
  );
  guarded.handle("workspace:get-runtime-identity", async () => ({
    ok: true,
    data: { workspaceRuntimeId: "runtime-opaque-123", revision: 4 },
  }));
  const contract = productionIpcRegistry.byCapability("workspace.getRuntimeIdentity");
  assert.ok(contract);
  assert.deepEqual(
    await handlers.get(contract.channel)({}, productionIpcRegistry.encodeRequest(contract, {})),
    {
      schemaVersion: 1,
      ok: true,
      data: { workspaceRuntimeId: "runtime-opaque-123", revision: 4 },
    },
  );
  assert.doesNotMatch(JSON.stringify(contract), /workspacePath|filePath|database|cookie/i);
});

test("preload consumes the shared registry without exposing invoke, on, or channel names", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "desktop", "preload.js"), "utf8");
  assert.match(source, /productionIpcRegistry/);
  assert.doesNotMatch(source, /exposeInMainWorld\([^)]*ipcRenderer/);
  assert.doesNotMatch(source, /\bdesktopConsole\s*\.\s*(invoke|on|channel)\b/);
});

test("preload raw transport is closed except for the explicit Phase 07 Auth exemption", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../desktop/preload.js"), "utf8");
  for (const channel of ["auth:get-state", "auth:login", "auth:change-password", "auth:refresh", "auth:logout", "auth-state-changed"])
    assert.match(source, new RegExp(`["']${channel}["']`), channel);
  assert.match(source, /AUTH_INVOKE_EXEMPTIONS/);
  assert.match(source, /AUTH_EVENT_EXEMPTIONS/);
  assert.doesNotMatch(source, /!contract\s*\|\|\s*contract\.kind\s*===\s*["']event["']\)\s*return electronIpcRenderer\.invoke/);
  assert.doesNotMatch(source, /!contract\s*\|\|\s*contract\.kind\s*!==\s*["']event["']\)\s*return electronIpcRenderer\.on/);
});

test("every production contract error closes to a parseable SafeOperationalError", () => {
  for (const contract of productionIpcRegistry.list()) {
    if (contract.kind === "event") continue;
    for (const code of contract.errorCodes) {
      const response = productionIpcRegistry.failure(contract, { code });
      const parsed = productionIpcRegistry.parseResult(contract, response);
      assert.equal(parsed.code, code, `${contract.channel}:${code}`);
      assert.doesNotMatch(
        JSON.stringify(response),
        /[A-Z]:\\|"stack"\s*:|"filePath"\s*:|"workspacePath"\s*:|"cookie"\s*:|"apiKey"\s*:/i,
      );
    }
  }
});

test("generation runtime events are versioned, exact, and redact task failures", () => {
  const contract = productionIpcRegistry.byCapability("generation.runtimeChanged");
  assert.ok(contract);
  const payload = {
    runtimeId: "runner-1",
    sequence: 7,
    batchId: "batch-1",
    status: "failed",
    counts: { total: 1, succeeded: 0, failed: 1, pending: 0, interrupted: 0, cancelled: 0 },
    updatedAt: "2026-07-26T00:00:00.000Z",
    batch: {
      id: "batch-1",
      status: "failed",
      clientSources: [],
      templates: [],
      tasks: [{ id: "task-1", clientId: "client-1", platform: "xhs", templateId: "guide", materialIds: [], researchQueryIds: [], status: "failed", attempts: 1, error: { code: "REMOTE_FAILED", message: "C:\\private\\secret.txt" } }],
      counts: { total: 1, succeeded: 0, failed: 1, pending: 0, interrupted: 0, cancelled: 0 },
    },
    capabilities: { canResume: true, canContinue: true, canRetry: true, canCancel: false },
  };
  const encoded = productionIpcRegistry.event(contract, payload);
  assert.equal(encoded.schemaVersion, 1);
  assert.equal(encoded.batch.tasks[0].error.code, "REMOTE_FAILED");
  assert.doesNotMatch(JSON.stringify(encoded), /private|secret\.txt/i);
  assert.throws(() => productionIpcRegistry.parseEvent(contract, { ...encoded, raw: "log" }), { code: "IPC_EVENT_INVALID" });
  assert.throws(() => productionIpcRegistry.event(contract, { ...payload, sequence: 7.5 }), { code: "IPC_EVENT_INVALID" });
});

test("production has no raw publish-log sender or consumer", () => {
  const productionRoots = ["desktop", path.join("media-workbench", "src"), "src"];
  const matches = [];
  function visit(target) {
    for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
      const full = path.join(target, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (/\.(?:js|ts|tsx)$/.test(entry.name) && fs.readFileSync(full, "utf8").includes("publish-log")) matches.push(full);
    }
  }
  productionRoots.forEach(visit);
  assert.deepEqual(matches, []);
});
