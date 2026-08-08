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

const CHANNELS = [
  "publication:prepare-regular-uncertain-resolution",
  "publication:confirm-regular-accepted",
  "publication:confirm-regular-not-accepted",
];

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

test("publication inventory keeps only the three typed regular outcome commands", () => {
  assert.equal(publicationContracts.length, 3);
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

test("regular outcome IPC preserves named command identity and confirmation", async () => {
  const ipc = typedIpc();
  const calls = [];
  registerPublicationIpc({
    ipcMain: ipc.ipcMain,
    regularPlatformOutcomeService: {
      prepareRegularUncertainResolution: (input) => {
        calls.push(["prepare", input]);
        return {
          regularPublicationAttemptId: input.regularPublicationAttemptId,
          confirmationToken: "token-1",
          expiresAt: "2026-08-07T00:05:00.000Z",
          actions: ["confirm_accepted", "confirm_not_accepted"],
          observationFingerprint: "observation-1",
          preparedEvidenceFingerprint: "evidence-1",
        };
      },
      confirmRegularAccepted: (input) => {
        calls.push(["accepted", input]);
        return {
          attemptId: input.regularPublicationAttemptId,
          status: "published",
        };
      },
      confirmRegularNotAccepted: (input) => ({
        attemptId: input.regularPublicationAttemptId,
        status: "not_accepted",
      }),
    },
  });
  const prepared = await ipc.invoke(CHANNELS[0], [
    { regularPublicationAttemptId: "attempt-1" },
  ]);
  assert.equal(prepared.ok, true, JSON.stringify(prepared));
  const accepted = await ipc.invoke(CHANNELS[1], [
    {
      regularPublicationAttemptId: "attempt-1",
      confirmationToken: "token-1",
      manualPositiveEvidence: { observedAt: "2026-08-06T00:00:00.000Z" },
      confirmed: true,
    },
  ]);
  assert.equal(accepted.ok, true, JSON.stringify(accepted));
  assert.equal(calls[1][1].confirmed, true);
});
