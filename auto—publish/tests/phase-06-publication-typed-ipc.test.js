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

const recordFixture = {
  version: 1,
  publicationId: "publication-1",
  clientId: "client-1",
  articleId: "article-1",
  articleKey: "generated:client-1:article-1",
  targetKey: "platform:toutiao",
  platformId: "toutiao",
  mediaResourceId: null,
  displayName: "头条",
  status: "uncertain",
  createdAt: "2026-07-26T00:00:00.000Z",
  updatedAt: "2026-07-26T00:01:00.000Z",
  attempts: [
    {
      attemptId: "attempt-1",
      status: "uncertain",
      createdAt: "2026-07-26T00:00:00.000Z",
      updatedAt: "2026-07-26T00:01:00.000Z",
      startedAt: "2026-07-26T00:00:10.000Z",
      finishedAt: null,
      remoteId: "remote-1",
      remoteUrl:
        "https://publisher.example/posts/remote-1?token=secret-query#private",
      errorCode: "REMOTE_RESULT_UNKNOWN",
      reasonCode: null,
      rawResponse: "provider secret",
      stack: "provider stack",
    },
  ],
  accountFingerprint: "private-account-fingerprint",
  contentHash: "private-content-hash",
  workspacePath: "C:\\private\\workspace",
};

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
  const calls = [];
  registerPublicationIpc({
    ipcMain: ipc.ipcMain,
    publicationLedger: {
      reconcile(publicationId, decision) {
        calls.push({ publicationId, decision });
        if (decision.reasonCode === "FORCE_FAILURE") {
          throw new Error("C:\\private\\publication.db raw ledger failure");
        }
        return {
          ...recordFixture,
          status: decision.status,
          attempts: recordFixture.attempts.map((attempt) => ({
            ...attempt,
            status: decision.status,
            reasonCode: decision.reasonCode,
          })),
        };
      },
    },
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
  assert.equal(response.ok, true, JSON.stringify(response));
  assert.equal(response.data.record.status, "failed");
  assert.equal(response.data.record.reasonCode, "CONFIRMED_NOT_PUBLISHED");
  assert.deepEqual(calls[0], {
    publicationId: "publication-1",
    decision: { status: "failed", reasonCode: "CONFIRMED_NOT_PUBLISHED" },
  });

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
  assert.equal(failed.error.code, "IPC_INTERNAL");
  assert.equal(typeof failed.error.userMessage, "string");
  assert.doesNotMatch(
    JSON.stringify(failed),
    /private|publication\.db|raw ledger/i,
  );
});
