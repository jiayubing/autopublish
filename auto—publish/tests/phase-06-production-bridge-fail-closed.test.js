const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const esbuild = require("../media-workbench/node_modules/esbuild");

const root = path.resolve(__dirname, "..");
const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "phase-06-bridge-"));
const bridges = {};

for (const name of [
  "account-profile",
  "content",
  "media",
  "platform",
  "publication",
  "settings",
  "workspace",
]) {
  const outfile = path.join(outputRoot, `${name}.cjs`);
  esbuild.buildSync({
    entryPoints: [
      path.join(root, "media-workbench", "src", "bridge", `${name}.ts`),
    ],
    outfile,
    bundle: true,
    format: "cjs",
    platform: "node",
    logLevel: "silent",
  });
  bridges[name] = require(outfile);
}

test.after(() => {
  delete global.window;
  fs.rmSync(outputRoot, { recursive: true, force: true });
});

function setDesktopConsole(desktopConsole) {
  global.window = desktopConsole === undefined ? {} : { desktopConsole };
}

function assertOperationalError(error, code) {
  assert.equal(error?.code, code);
  assert.equal(error?.category, "transport");
  assert.equal(error?.retryability, "safe");
  assert.equal(typeof error?.message, "string");
  assert.doesNotMatch(
    error.message,
    /[A-Z]:\\|https?:\/\/|Cookie|stack|payload/i,
  );
  return true;
}

async function rejectsCapability(action) {
  await assert.rejects(action, (error) =>
    assertOperationalError(error, "IPC_CAPABILITY_UNAVAILABLE"),
  );
}

async function rejectsResult(action) {
  await assert.rejects(action, (error) =>
    assertOperationalError(error, "IPC_RESULT_INVALID"),
  );
}

test("all production bridge namespaces fail closed without Electron transport", async () => {
  delete global.window;
  await rejectsCapability(() => bridges.media.scanArticles());
  await rejectsCapability(() => bridges.platform.getPlatformQueue());
  await rejectsCapability(() => bridges.settings.getAiProviderStatus());
  await rejectsCapability(() => bridges.workspace.getWorkspaceBootstrapState());
  await rejectsCapability(() =>
    bridges.publication.listArticleAttentionSnapshot(),
  );
  await rejectsCapability(() =>
    bridges["account-profile"].listAccountProfiles(),
  );
  await rejectsCapability(() => bridges.content.listContentClients());
});

test("missing desktopConsole and missing namespaces fail closed", async () => {
  setDesktopConsole(undefined);
  await rejectsCapability(() => bridges.media.getOrders());

  setDesktopConsole({});
  await rejectsCapability(() => bridges.media.getResourcePage({}));
  await rejectsCapability(() => bridges.platform.checkPlatformLogin("toutiao"));
  await rejectsCapability(() => bridges.settings.getStorageUsage());
  await rejectsCapability(() => bridges.workspace.getRuntimeDiagnostics());
  await rejectsCapability(() =>
    bridges.publication.listArticleAttentionSnapshot(),
  );
});

test("missing query and command capabilities fail closed instead of resolving business success", async () => {
  setDesktopConsole({
    media: {},
    orders: {},
    platforms: {},
    aiProvider: {},
    platformSettings: {},
    storageMaintenance: {},
    workspace: {},
    workspaceData: {},
    runtimeDiagnostics: {},
    content: {},
  });

  await rejectsCapability(() => bridges.media.getDrafts());
  await rejectsCapability(() =>
    bridges.media.setDraft("draft.md", {
      filename: "draft.md",
      title: "draft",
      content: "body",
      selectedResources: [],
    }),
  );
  await rejectsCapability(() => bridges.media.syncOrder("order-1"));
  await rejectsCapability(() => bridges.platform.openPlatformLogin("toutiao"));
  await rejectsCapability(() => bridges.platform.pausePlatformSubmit(null));
  await rejectsCapability(() =>
    bridges.settings.getLegacyPlatformSettingsStatus(),
  );
  await rejectsCapability(() => bridges.workspace.requestWorkspaceSwitch());
  await rejectsCapability(() => bridges.content.listContentClients());
});

test("missing event capability throws instead of returning a noop disposer", () => {
  setDesktopConsole({ platforms: {}, workspaceData: {} });
  assert.throws(
    () => bridges.platform.onPlatformState(() => {}),
    (error) => assertOperationalError(error, "IPC_CAPABILITY_UNAVAILABLE"),
  );
  assert.throws(
    () => bridges.workspace.onWorkspaceDataInvalidated(() => {}),
    (error) => assertOperationalError(error, "IPC_CAPABILITY_UNAVAILABLE"),
  );
});

test("successful query envelopes without data fail closed", async () => {
  setDesktopConsole({
    media: {
      scanArticles: async () => ({ ok: true, data: null }),
    },
    orders: {
      getOrders: async () => ({ ok: true }),
    },
    platforms: {
      getQueue: async () => ({ ok: true, data: null }),
      checkLogin: async () => ({ ok: true }),
    },
    aiProvider: {
      getStatus: async () => ({ ok: true, data: null }),
    },
    storageMaintenance: {
      getUsage: async () => ({ ok: true, data: null }),
    },
    workspace: {
      getBootstrapState: async () => ({ ok: true, data: null }),
    },
    workspaceData: {
      getRuntimeIdentity: async () => ({ ok: true, data: null }),
    },
    runtimeDiagnostics: {
      get: async () => ({ ok: true, data: null }),
    },
    content: {
      listArticleAttention: async () => ({ ok: true, data: null }),
    },
  });

  await rejectsResult(() => bridges.media.scanArticles());
  await rejectsResult(() => bridges.media.getOrders());
  await rejectsResult(() => bridges.platform.getPlatformQueue());
  await rejectsResult(() => bridges.platform.checkPlatformLogin("toutiao"));
  await rejectsResult(() => bridges.settings.getAiProviderStatus());
  await rejectsResult(() => bridges.settings.getStorageUsage());
  await rejectsResult(() => bridges.workspace.getWorkspaceBootstrapState());
  await rejectsResult(() => bridges.workspace.getWorkspaceRuntimeIdentity());
  await rejectsResult(() => bridges.workspace.getRuntimeDiagnostics());
  await rejectsResult(() => bridges.publication.listArticleAttentionSnapshot());
});

test("missing envelopes and command data fail closed", async () => {
  setDesktopConsole({
    media: {
      scanArticles: async () => undefined,
    },
    platforms: {
      openLogin: async () => ({ ok: true }),
      pauseSubmit: async () => ({ ok: true, data: null }),
      stopSubmit: async () => ({ ok: true }),
    },
    workspace: {
      openCurrent: async () => ({ ok: true }),
    },
  });

  await rejectsResult(() => bridges.media.scanArticles());
  await rejectsResult(() => bridges.platform.openPlatformLogin("toutiao"));
  await rejectsResult(() => bridges.platform.pausePlatformSubmit(null));
  await rejectsResult(() => bridges.platform.stopPlatformSubmit(null));
  await rejectsResult(() => bridges.workspace.openCurrentWorkspace());
});

test("event subscriptions reject a missing disposer", () => {
  setDesktopConsole({
    platforms: { onState: () => undefined },
    workspaceData: { onInvalidated: () => undefined },
  });

  assert.throws(
    () => bridges.platform.onPlatformState(() => {}),
    (error) => assertOperationalError(error, "IPC_RESULT_INVALID"),
  );
  assert.throws(
    () => bridges.workspace.onWorkspaceDataInvalidated(() => {}),
    (error) => assertOperationalError(error, "IPC_RESULT_INVALID"),
  );
});

test("explicit mock adapters provide test data without production bridge fallbacks", async () => {
  const mockAdapter = {
    scanArticles: async () => [{ filename: "fixture.md", title: "fixture" }],
  };
  assert.deepEqual(await mockAdapter.scanArticles(), [
    { filename: "fixture.md", title: "fixture" },
  ]);

  delete global.window;
  await rejectsCapability(() => bridges.media.scanArticles());
});

test("read-only contextBridge namespaces preserve their exact capability functions", async () => {
  const dispose = () => {};
  setDesktopConsole({
    workspaceData: Object.freeze({
      getRuntimeIdentity: async () => ({
        ok: true,
        data: { workspaceRuntimeId: "frozen-runtime", revision: 1 },
      }),
      onInvalidated: () => dispose,
    }),
  });

  assert.deepEqual(await bridges.workspace.getWorkspaceRuntimeIdentity(), {
    workspaceRuntimeId: "frozen-runtime",
    revision: 1,
  });
  assert.equal(
    bridges.workspace.onWorkspaceDataInvalidated(() => {}),
    dispose,
  );
});
