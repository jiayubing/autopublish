const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  publicationContracts,
} = require("../desktop/ipc/contracts/publication-contracts");
const {
  productionIpcRegistry,
} = require("../desktop/ipc/contracts/production-registry");
const { createAuthenticatedIpcMain } = require("../desktop/ipc/register");
const { registerPublicationIpc } = require("../desktop/ipc/publication-ipc");

const CHANNELS = ["publication:reconcile"];

function typedIpc() {
  const handlers = new Map();
  return {
    handlers,
    ipcMain: createAuthenticatedIpcMain(
      { handle: (channel, handler) => handlers.set(channel, handler) },
      async () => undefined,
    ),
    async invoke(channel, legacyArgs) {
      const contract = productionIpcRegistry.byChannel(channel);
      const payload = contract.fromArgs(legacyArgs);
      return handlers.get(channel)(
        null,
        productionIpcRegistry.encodeRequest(contract, payload),
      );
    },
  };
}

test("publication inventory keeps only the reconciler with a real feature consumer", () => {
  assert.equal(publicationContracts.length, 1);
  for (const channel of CHANNELS) {
    const contract = productionIpcRegistry.byChannel(channel);
    assert.ok(contract, channel);
    assert.equal(contract.schemaVersion, 1);
    assert.equal(contract.feature, "content");
  }
});

test("publication Renderer uses a fixed named API and SafeOperationalError message", () => {
  const bridge = fs.readFileSync(
    path.resolve(__dirname, "..", "media-workbench/src/bridge/publication.ts"),
    "utf8",
  );
  assert.match(bridge, /type PublicationApi/);
  assert.match(bridge, /ipcError\(error, fallback\)/);
  assert.match(bridge, /SafeOperationalErrorDto/);
  assert.doesNotMatch(bridge, /publication\s*\?\.\s*\[/);
});

test("publication reconcile preserves confirmation and returns SafeOperationalError", async () => {
  const ipc = typedIpc();
  registerPublicationIpc({
    ipcMain: ipc.ipcMain,
  });

  const response = await ipc.invoke(CHANNELS[0], [
    {
      publicationId: "publication-1",
      status: "failed",
      reasonCode: "CONFIRMED_NOT_PUBLISHED",
      confirmed: true,
    },
  ]);
  assert.equal(response.schemaVersion, 1);
  assert.equal(response.ok, false, JSON.stringify(response));
  assert.equal(response.error.code, "PUBLICATION_RECONCILE_EVIDENCE_REQUIRED");

  const failed = await ipc.invoke(CHANNELS[0], [
    {
      publicationId: "publication-1",
      status: "failed",
      reasonCode: "FORCE_FAILURE",
      confirmed: true,
    },
  ]);
  assert.equal(failed.schemaVersion, 1);
  assert.equal(failed.ok, false);
  assert.equal(failed.error.code, "PUBLICATION_RECONCILE_EVIDENCE_REQUIRED");
  assert.equal(typeof failed.error.userMessage, "string");
  assert.doesNotMatch(
    JSON.stringify(failed),
    /private|publication\.db|raw ledger/i,
  );
});

test("publication reconcile accepts a null client identity from OperationalStore", async () => {
  const ipc = typedIpc();
  let reads = 0;
  const uncertain = {
    version: 1,
    publicationId: "publication-null-client",
    clientId: null,
    articleId: "article-null-client",
    articleKey: "article-null-client",
    targetKey: "media-resource:resource-null-client",
    status: "uncertain",
    createdAt: "2026-08-03T00:00:00.000Z",
    updatedAt: "2026-08-03T00:00:01.000Z",
    attempts: [
      {
        attemptId: "attempt-null-client",
        status: "uncertain",
        createdAt: "2026-08-03T00:00:00.000Z",
        updatedAt: "2026-08-03T00:00:01.000Z",
      },
    ],
  };
  const published = {
    ...uncertain,
    status: "published",
    attempts: [{ ...uncertain.attempts[0], status: "published" }],
  };
  registerPublicationIpc({
    ipcMain: ipc.ipcMain,
    operationalStore: {
      listPublicationRecords: () => (++reads === 1 ? [uncertain] : [published]),
    },
    publicationWorkflow: { reconcile: async () => undefined },
  });

  const response = await ipc.invoke("publication:reconcile", [
    {
      publicationId: "publication-null-client",
      status: "published",
      reasonCode: "CONFIRMED_PUBLISHED",
      confirmed: true,
    },
  ]);
  assert.equal(response.ok, true, JSON.stringify(response));
  assert.equal(response.data.record.clientId, null);
});
