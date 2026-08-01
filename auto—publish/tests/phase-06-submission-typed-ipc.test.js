const test = require("node:test");
const assert = require("node:assert/strict");

const { createContractRegistry } = require("../desktop/ipc/contracts/registry");
const {
  submissionContracts,
  submissionContractFixtures,
} = require("../desktop/ipc/contracts/submission-contracts");
const { registerContentSubmissionIpc } = require("../desktop/ipc/content-submission-ipc");

const registry = createContractRegistry(submissionContracts);

test("submission query contracts have independent legal fixtures and ownership records", () => {
  const queryChannels = new Set([
    "content:preview-export",
    "content:preview-submission-batch",
    "content:list-submission-platforms",
  ]);
  const fixtures = submissionContractFixtures.filter((entry) => queryChannels.has(entry.channel));
  assert.equal(fixtures.length, 3);
  for (const fixture of fixtures) {
    const contract = registry.byChannel(fixture.channel);
    assert.ok(contract, fixture.channel);
    assert.equal(contract.schemaVersion, 1);
    assert.equal(contract.kind, "query");
    assert.equal(fixture.owner, "content");
    assert.match(fixture.productionCaller, /^desktopConsole\.content\./);
    assert.deepEqual(registry.parseRequest(contract, registry.encodeRequest(contract, fixture.request)), fixture.request);
    assert.deepEqual(registry.parseSuccess(contract, registry.success(contract, fixture.result)), fixture.result);
  }
});

test("ordinary submission mutations have independent legal fixtures", () => {
  const channels = new Set(["content:export-article", "content:create-submission-batch"]);
  const fixtures = submissionContractFixtures.filter((entry) => channels.has(entry.channel));
  assert.equal(fixtures.length, 2);
  for (const fixture of fixtures) {
    const contract = registry.byChannel(fixture.channel);
    assert.ok(contract, fixture.channel);
    assert.equal(contract.kind, "command");
    assert.equal(fixture.owner, "content");
    assert.match(fixture.productionCaller, /^desktopConsole\.content\./);
    assert.deepEqual(registry.parseRequest(contract, registry.encodeRequest(contract, fixture.request)), fixture.request);
    assert.deepEqual(registry.parseSuccess(contract, registry.success(contract, fixture.result)), fixture.result);
  }
});

test("submission account bindings are bounded wire data and reconstruct the main-process map", () => {
  const contract = registry.byChannel("content:create-submission-batch");
  const payload = contract.fromArgs([{
    clientId: "client-1", articleIds: ["article-1"], targetPlatformIds: ["toutiao"],
    accountProfiles: { toutiao: "profile-1" }, confirmed: true,
  }]);
  assert.deepEqual(payload.accountBindings, [{ platformId: "toutiao", accountProfileId: "profile-1" }]);
  assert.equal(Object.hasOwn(payload, "accountProfiles"), false);
  assert.deepEqual(contract.toArgs(payload), [{
    clientId: "client-1", articleIds: ["article-1"], targetPlatformIds: ["toutiao"],
    accountProfiles: { toutiao: "profile-1" }, confirmed: true,
  }]);
});

test("destructive submission prepare-execute capabilities have independent fixtures", () => {
  const channels = new Set([
    "content:cancel-submission-batch",
    "content:preview-cleanup-failed-submission-items", "content:cleanup-failed-submission-items",
    "content:preview-trashed-article-queue-residue", "content:cleanup-trashed-article-queue-residue",
  ]);
  const fixtures = submissionContractFixtures.filter((entry) => channels.has(entry.channel));
  assert.equal(fixtures.length, 5);
  for (const fixture of fixtures) {
    const contract = registry.byChannel(fixture.channel);
    assert.ok(contract, fixture.channel);
    assert.equal(fixture.owner, "content");
    assert.match(fixture.productionCaller, /^desktopConsole\.content\./);
    assert.deepEqual(registry.parseRequest(contract, registry.encodeRequest(contract, fixture.request)), fixture.request);
    assert.deepEqual(registry.parseSuccess(contract, registry.success(contract, fixture.result)), fixture.result);
  }
});

test("destructive execution requires confirmation and preserves only preview identity", async () => {
  const handlers = new Map();
  let received;
  registerContentSubmissionIpc({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    contentSubmissionService: {
      cancelBatch: (input) => { received = input; return { batchId: "batch-1", planId: "plan-1", cancelledCount: 1, idempotentCount: 0, skippedCount: 0, batchStatus: "cancelled", changedScopes: ["articleManagement"], items: [] }; },
    },
  });
  const denied = await handlers.get("content:cancel-submission-batch")(null, { batchId: "batch-1", planId: "plan-1", confirmed: false });
  const executed = await handlers.get("content:cancel-submission-batch")(null, { batchId: "batch-1", planId: "plan-1", confirmed: true });
  assert.equal(denied.ok, false);
  assert.deepEqual(received, { batchId: "batch-1", planId: "plan-1", confirmed: true });
  assert.equal(executed.ok, true);
});
