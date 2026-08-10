const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

test("phase 1 composition is injected and is not a second production runtime", () => {
  const {
    createPhaseOneComposition,
  } = require("../desktop/composition/phase-01-composition");
  const composition = createPhaseOneComposition({
    operationalStore: {},
    publisher: {},
    clock: () => new Date(),
  });
  assert.equal(typeof composition.publicationWorkflow.publish, "function");
  assert.doesNotMatch(read("desktop/main.js"), /phase-01-composition/);
  assert.doesNotMatch(
    read("desktop/workspace-runtime.js"),
    /phase-01-composition/,
  );
});

test("phase 1 contracts stay pure while renderer and worker load only shared definitions", () => {
  const forbidden =
    /require\([^)]*(?:desktop|media-workbench|platforms|operational-store)|from\s+[^;]*(?:desktop|media-workbench|platforms|operational-store)/;
  for (const relative of [
    "src/domain/identities.js",
    "src/domain/publication-target.js",
    "src/domain/safe-operational-error.js",
    "src/domain/publisher-contract.js",
    "src/domain/dto.js",
    "src/application/publication-workflow.js",
  ]) {
    assert.doesNotMatch(read(relative), forbidden, relative);
  }
  assert.doesNotMatch(
    read("media-workbench/src/contracts/phase-01-domain.ts"),
    /node:|desktop|src\/infrastructure/,
  );
  assert.equal(
    typeof require("../desktop/worker/phase-01-contract-smoke")
      .parseWorkerPublishDto,
    "function",
  );
});

test("two platform fixtures and the fake publisher validate the common contract without remote calls", async () => {
  const {
    createFakePublisher,
    parsePublishInput,
    parsePublishOutcome,
    validatePublisher,
  } = require("../src/domain");
  const input = parsePublishInput({
    version: 1,
    articleId: "a1",
    attemptId: "t1",
    target: {
      kind: "platform",
      platformId: "toutiao",
      accountProfileId: "acct1",
    },
    title: "title",
    body: "body",
  });
  const fixtures = ["toutiao", "lieju"].map((platformId) =>
    validatePublisher(
      createFakePublisher({
        outcome: {
          status: "failed",
          error: {
            code: `${platformId.toUpperCase()}_FIXTURE`,
            category: "remote",
            retryability: "safe",
            userMessage: "fixture",
          },
        },
      }),
    ),
  );
  for (const fixture of fixtures)
    assert.equal(
      (await fixture.publish(input, new AbortController().signal)).status,
      "failed",
    );
  for (const platformId of ["toutiao", "lieju"]) {
    const legacyAdapter = require(`../src/platforms/${platformId}/adapter`);
    assert.equal(legacyAdapter.id, platformId);
    assert.equal(legacyAdapter.publicationTarget.kind, "platform");
    assert.equal(legacyAdapter.publicationTarget.granularity, "platform");
    assert.equal(typeof legacyAdapter.publishArticle, "function");
    assert.equal(typeof legacyAdapter.preparePlatformSubmission, "function");
  }
  assert.equal(
    parsePublishOutcome(
      {
        status: "uncertain",
        error: {
          code: "TIMEOUT",
          category: "transport",
          retryability: "manual-check",
          userMessage: "Check remote result",
        },
      },
      input,
    ).status,
    "uncertain",
  );
});
