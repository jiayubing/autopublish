const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const {
  registerAccountProfileIpc,
} = require("../desktop/ipc/account-profile-ipc");
const { registerPlatformIpc } = require("../desktop/ipc/platform-ipc");
const {
  createAuthenticatedIpcMain,
} = require("../desktop/ipc/register");
const {
  encodePlatformStateEvent,
} = require("../desktop/services/desktop-task-service");
const {
  createContractRegistry,
} = require("../desktop/ipc/contracts/registry");
const {
  platformContracts,
} = require("../desktop/ipc/contracts/platform-contracts");
const {
  productionIpcRegistry,
} = require("../desktop/ipc/contracts/production-registry");

const INVOKE_CHANNELS = [
  "platforms:get-queue",
  "platforms:list-account-profiles",
  "platforms:confirm-account-profile",
  "platforms:open-login",
  "platforms:check-login",
  "platforms:submit-selected",
  "platforms:pause-submit",
  "platforms:stop-submit",
  "platforms:get-state",
];

const registry = createContractRegistry(platformContracts);

test("public preload platform login methods encode one exact platform identity", async () => {
  const calls = [];
  const exposed = {};
  const source = fs.readFileSync(
    path.join(__dirname, "..", "desktop", "preload.js"),
    "utf8",
  );
  vm.runInNewContext(source, {
    require(name) {
      if (name === "electron") {
        return {
          contextBridge: {
            exposeInMainWorld(name, api) { exposed[name] = api; },
          },
          ipcRenderer: {
            invoke(channel, request) {
              calls.push([channel, request]);
              const contract = productionIpcRegistry.byChannel(channel);
              return Promise.resolve(
                productionIpcRegistry.success(
                  contract,
                  channel === "platforms:open-login"
                    ? { platformId: "toutiao", status: "opened" }
                    : { platformId: "toutiao", authenticated: true },
                ),
              );
            },
            on() {},
            removeListener() {},
          },
        };
      }
      if (name === "./ipc/contracts/production-registry")
        return { productionIpcRegistry };
      throw new Error("Unexpected preload dependency: " + name);
    },
  });

  const opened = await exposed.desktopConsole.platforms.openLogin("toutiao");
  const checked = await exposed.desktopConsole.platforms.checkLogin("toutiao");

  assert.equal(opened.ok, true, JSON.stringify(opened));
  assert.equal(checked.ok, true, JSON.stringify(checked));
  assert.equal(calls.length, 2);
  for (const [channel, request] of calls) {
    const contract = productionIpcRegistry.byChannel(channel);
    assert.deepEqual(
      { ...productionIpcRegistry.parseRequest(contract, request) },
      { platformId: "toutiao" },
    );
  }
});

test("platform domain defines nine invokes and one versioned state event", () => {
  assert.equal(platformContracts.length, 10);
  assert.deepEqual(
    platformContracts
      .filter((contract) => contract.kind !== "event")
      .map((contract) => contract.channel)
      .sort(),
    [...INVOKE_CHANNELS].sort(),
  );
  const event = registry.byChannel("platform-state");
  assert.equal(event.kind, "event");
  for (const channel of INVOKE_CHANNELS) {
    const contract = registry.byChannel(channel);
    assert.equal(contract.schemaVersion, 1, channel);
    assert.ok(contract.errorCodes.includes("AUTH_REQUIRED"), channel);
    assert.ok(contract.errorCodes.includes("IPC_REQUEST_INVALID"), channel);
    assert.ok(contract.errorCodes.includes("IPC_RESULT_INVALID"), channel);
  }
});

test("platform queue contract rejects scanDir and submission results reject paths", () => {
  const queue = registry.byChannel("platforms:get-queue");
  assert.throws(
    () =>
      registry.success(queue, {
        platforms: [
          { id: "toutiao", loginAvailable: true, scanDir: "C:\\private" },
        ],
        queue: [],
      }),
    { code: "IPC_UNKNOWN_FIELD" },
  );

  const submit = registry.byChannel("platforms:submit-selected");
  assert.throws(
    () =>
      registry.success(submit, {
        ok: 1,
        fail: 0,
        uncertain: 0,
        skipped: 0,
        results: [
          {
            task: {
              sourcePlatformId: "toutiao",
              filename: "fixture.md",
              targetPlatformId: "toutiao",
              filePath: "C:\\private\\fixture.md",
            },
            status: "published",
            publicationStatus: "published",
            errorCode: null,
            archiveErrorCode: null,
          },
        ],
        archiveSummary: { attempted: 0, succeeded: 0, failed: 0 },
        trashDisposition: "keep_local",
        trashSummary: {
          offeredCount: 0,
          requestedCount: 0,
          movedCount: 0,
          recoveryCount: 0,
          blockedCount: 0,
          failedCount: 0,
          reasonCodes: [],
        },
      }),
    { code: "IPC_UNKNOWN_FIELD" },
  );
});

test("platform-state accepts a safe snapshot and rejects raw errors", () => {
  const contract = registry.byChannel("platform-state");
  const snapshot = {
    workspaceRuntimeId: "runtime-1",
    runId: "run-1",
    phase: "running",
    total: 1,
    processed: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    uncertain: 0,
    currentTask: {
      sourcePlatformId: "toutiao",
      filename: "fixture.md",
      targetPlatformId: "toutiao",
    },
    nextTask: null,
    waitRemainingMs: 0,
    startedAt: "2026-07-26T00:00:00.000Z",
    updatedAt: "2026-07-26T00:00:01.000Z",
    terminalResult: null,
    isBatchRunning: false,
    isStopPending: false,
    isPlatformRunning: true,
    queueRevision: null,
  };
  assert.deepEqual(registry.parseEvent(contract, registry.event(contract, snapshot)), snapshot);
  assert.throws(
    () =>
      registry.event(contract, {
        ...snapshot,
        currentTask: { ...snapshot.currentTask, filePath: "C:\\private" },
        error: new Error("provider secret"),
      }),
    { code: "IPC_UNKNOWN_FIELD" },
  );
});

test("authenticated platform and account registrars return path-free typed projections", async () => {
  const handlers = new Map();
  const ipcMain = createAuthenticatedIpcMain(
    { handle: (channel, handler) => handlers.set(channel, handler) },
    async () => {},
  );
  registerPlatformIpc({
    ipcMain,
    loadedPlatforms: [
      { id: "toutiao", scanDir: "C:\\private\\queue" },
    ],
    platformSessionService: { supports: () => true },
    platformWorkbenchService: {
      scanQueue: () => [
        {
          platformId: "toutiao",
          articles: [
            {
              filename: "fixture.md",
              title: "Fixture",
              filePath: "C:\\private\\fixture.md",
              archiveError: Object.assign(new Error("private path"), {
                code: "ARCHIVE_FAILED",
              }),
            },
          ],
        },
      ],
      buildSelectedSubmissionsPlan: () => ({ tasks: [] }),
      taskKey: () => "",
    },
    taskService: {
      pausePlatformSubmit: () => ({ ok: true }),
      stopPlatformSubmit: () => ({ alreadyStopped: true }),
      getState: () => ({}),
    },
  });
  registerAccountProfileIpc({
    ipcMain,
    operationalStore: {
      listAccountProfiles: () => [
        {
          accountProfileId: "account-1",
          platformId: "toutiao",
          displayName: "Fixture account",
        },
      ],
      createAccountProfile: (input) => ({
        accountProfileId: "account-2",
        ...input,
      }),
    },
  });

  const queueContract = productionIpcRegistry.byChannel("platforms:get-queue");
  const queue = await handlers.get(queueContract.channel)(
    {},
    productionIpcRegistry.encodeRequest(queueContract, {}),
  );
  assert.equal(queue.ok, true, JSON.stringify(queue));
  assert.deepEqual(queue.data.platforms, [
    { id: "toutiao", loginAvailable: true },
  ]);
  assert.equal(queue.data.queue[0].archiveErrorCode, "ARCHIVE_FAILED");
  assert.equal("filePath" in queue.data.queue[0], false);

  const profilesContract = productionIpcRegistry.byChannel(
    "platforms:list-account-profiles",
  );
  const profiles = await handlers.get(profilesContract.channel)(
    {},
    productionIpcRegistry.encodeRequest(profilesContract, {}),
  );
  assert.equal(profiles.ok, true, JSON.stringify(profiles));
  assert.equal(profiles.data.profiles.length, 1);
});

test("desktop task service encodes every platform-state payload through the shared contract", () => {
  const payload = encodePlatformStateEvent({ workspaceRuntimeId: "runtime-1", isPlatformRunning: false });
  assert.equal(payload.schemaVersion, 1);
  const event = productionIpcRegistry.byChannel("platform-state");
  assert.equal(
    productionIpcRegistry.parseEvent(event, payload).phase,
    "idle",
  );
});
