const test = require("node:test");
const assert = require("node:assert/strict");

const { createContractRegistry } = require("../desktop/ipc/contracts/registry");
const {
  submissionMaintenanceContracts,
  submissionMaintenanceContractFixtures,
} = require("../desktop/ipc/contracts/submission-maintenance-contracts");
const {
  submissionRegularContracts,
  submissionRegularContractFixtures,
} = require("../desktop/ipc/contracts/submission-regular-contracts");
const {
  submissionPaidMediaContracts,
  submissionPaidMediaContractFixtures,
} = require("../desktop/ipc/contracts/submission-paid-media-contracts");
const {
  registerContentSubmissionIpc,
} = require("../desktop/ipc/content-submission-ipc");

const submissionContracts = Object.freeze([
  ...submissionMaintenanceContracts,
  ...submissionRegularContracts,
  ...submissionPaidMediaContracts,
]);
const submissionContractFixtures = Object.freeze([
  ...submissionMaintenanceContractFixtures,
  ...submissionRegularContractFixtures,
  ...submissionPaidMediaContractFixtures,
]);

const registry = createContractRegistry(submissionContracts);

test("submission query contracts have independent legal fixtures and ownership records", () => {
  const queryChannels = new Set([
    "content:list-paid-media-batches",
  ]);
  const fixtures = submissionContractFixtures.filter((entry) =>
    queryChannels.has(entry.channel),
  );
  assert.equal(fixtures.length, 1);
  for (const fixture of fixtures) {
    const contract = registry.byChannel(fixture.channel);
    assert.ok(contract, fixture.channel);
    assert.equal(contract.schemaVersion, 1);
    assert.equal(contract.kind, "query");
    assert.equal(fixture.owner, "content");
    assert.match(fixture.productionCaller, /^desktopConsole\.content\./);
    assert.deepEqual(
      registry.parseRequest(
        contract,
        registry.encodeRequest(contract, fixture.request),
      ),
      fixture.request,
    );
    assert.deepEqual(
      registry.parseSuccess(
        contract,
        registry.success(contract, fixture.result),
      ),
      fixture.result,
    );
  }
});

test("ordinary submission mutations have independent legal fixtures", () => {
  const channels = new Set([
    "content:start-paid-media-batch",
    "content:pause-paid-media-batch",
    "content:cancel-remaining-paid-media-batch-items",
  ]);
  const fixtures = submissionContractFixtures.filter((entry) =>
    channels.has(entry.channel),
  );
  assert.equal(fixtures.length, 3);
  for (const fixture of fixtures) {
    const contract = registry.byChannel(fixture.channel);
    assert.ok(contract, fixture.channel);
    assert.equal(contract.kind, "command");
    assert.equal(fixture.owner, "content");
    assert.match(fixture.productionCaller, /^desktopConsole\.content\./);
    assert.deepEqual(
      registry.parseRequest(
        contract,
        registry.encodeRequest(contract, fixture.request),
      ),
      fixture.request,
    );
    assert.deepEqual(
      registry.parseSuccess(
        contract,
        registry.success(contract, fixture.result),
      ),
      fixture.result,
    );
  }
});

test("destructive submission prepare-execute capabilities have independent fixtures", () => {
  const channels = new Set([
    "content:preview-trashed-article-queue-residue",
    "content:cleanup-trashed-article-queue-residue",
  ]);
  const fixtures = submissionContractFixtures.filter((entry) =>
    channels.has(entry.channel),
  );
  assert.equal(fixtures.length, 2);
  for (const fixture of fixtures) {
    const contract = registry.byChannel(fixture.channel);
    assert.ok(contract, fixture.channel);
    assert.equal(fixture.owner, "content");
    assert.match(fixture.productionCaller, /^desktopConsole\.content\./);
    assert.deepEqual(
      registry.parseRequest(
        contract,
        registry.encodeRequest(contract, fixture.request),
      ),
      fixture.request,
    );
    assert.deepEqual(
      registry.parseSuccess(
        contract,
        registry.success(contract, fixture.result),
      ),
      fixture.result,
    );
  }
});

test("residue public contracts reject retired cleanup vocabulary", () => {
  const previewFixture = submissionContractFixtures.find(
    (entry) => entry.channel === "content:preview-trashed-article-queue-residue",
  );
  const contract = registry.byChannel(previewFixture.channel);
  const retiredAction = structuredClone(previewFixture.result);
  retiredAction.items[0].repairAction = "cleanupPublishedLocal";
  assert.throws(
    () => registry.success(contract, retiredAction),
    (error) =>
      ["IPC_RESULT_INVALID", "IPC_UNKNOWN_FIELD"].includes(error.code),
  );

  const retiredResult = structuredClone(previewFixture.result);
  retiredResult.items[0].resultStatus = "published-cleaned";
  assert.throws(
    () => registry.success(contract, retiredResult),
    (error) =>
      ["IPC_RESULT_INVALID", "IPC_UNKNOWN_FIELD"].includes(error.code),
  );
});
