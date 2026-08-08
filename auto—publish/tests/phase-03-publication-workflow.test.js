"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  createPublicationWorkflow,
} = require("../src/application/publication-workflow");
const {
  createOperationalStore,
} = require("../src/infrastructure/operational-store/operational-store");

function command(overrides) {
  return Object.assign(
    {
      articleId: "article-1",
      publicationId: "publication-1",
      attemptId: "attempt-1",
      target: {
        kind: "platform",
        platformId: "toutiao",
        accountProfileId: "account-1",
      },
      title: "title",
      body: "body",
    },
    overrides,
  );
}
function error(code) {
  return {
    code,
    category: "transport",
    retryability: "manual-check",
    userMessage: "Check the remote result",
  };
}

test("PublicationWorkflow durably reserves before publishing and commits an evidence-bound outcome", async () => {
  const calls = [];
  const workflow = createPublicationWorkflow({
    clock: () => new Date("2026-07-25T00:00:00.000Z"),
    operationalStore: {
      reservePublicationTarget: (value) => {
        calls.push(["reserve", value]);
        return {
          publicationId: value.publicationId,
          attemptId: value.attemptId,
        };
      },
      commitRemoteOutcome: (value) => {
        calls.push(["commit", value]);
        return { status: value.outcome.status };
      },
      listActionableRecovery: () => [],
      claimPostProcessing: () => null,
    },
    publisher: {
      inspectAccount: async () => ({}),
      publish: async (value) => ({
        status: "published",
        evidence: {
          articleId: value.articleId,
          attemptId: value.attemptId,
          targetKey: "platform:toutiao:account:account-1",
          accountProfileId: "account-1",
          remoteId: "remote-1",
          remoteUrl: "https://example.test/1",
        },
      }),
    },
  });
  const result = await workflow.publish(command());
  assert.equal(result.status, "published");
  assert.deepEqual(
    calls.map(([name]) => name),
    ["reserve", "commit"],
  );
  assert.equal(calls[1][1].outcome.evidence.remoteId, "remote-1");
});

test("PublicationWorkflow verifies the selected account before durable intent and publishes only after intent", async () => {
  const calls = [];
  const workflow = createPublicationWorkflow({
    clock: () => new Date(),
    operationalStore: {
      assertExecutableAccountProfile: () => calls.push("profile"),
      reservePublicationTarget: (value) => {
        calls.push("reserve");
        return {
          publicationId: value.publicationId,
          attemptId: value.attemptId,
        };
      },
      commitRemoteOutcome: () => {
        calls.push("commit");
      },
      listActionableRecovery: () => [],
      claimPostProcessing: () => null,
    },
    publisher: {
      inspectAccount: async () => {
        calls.push("inspect");
        return { verified: true, accountProfileId: "account-1" };
      },
      publish: async (value) => {
        calls.push("publish");
        return {
          status: "published",
          evidence: {
            articleId: value.articleId,
            attemptId: value.attemptId,
            targetKey: "platform:toutiao:account:account-1",
            accountProfileId: "account-1",
            remoteId: "remote-1",
            remoteUrl: "https://example.test/1",
          },
        };
      },
    },
  });
  await workflow.publish(command());
  assert.deepEqual(calls, [
    "profile",
    "inspect",
    "reserve",
    "publish",
    "commit",
  ]);
});

test("PublicationWorkflow converts a publisher crash to uncertain and never claims post-processing before outcome persistence", async () => {
  const calls = [];
  const workflow = createPublicationWorkflow({
    clock: () => new Date(),
    operationalStore: {
      reservePublicationTarget: (value) => {
        calls.push("reserve");
        return {
          publicationId: value.publicationId,
          attemptId: value.attemptId,
        };
      },
      commitRemoteOutcome: (value) => {
        calls.push(value.outcome.status);
        return { status: value.outcome.status };
      },
      listActionableRecovery: () => [],
      claimPostProcessing: () => {
        calls.push("claim");
        return null;
      },
    },
    publisher: {
      inspectAccount: async () => ({}),
      publish: async () => {
        throw new Error("timeout");
      },
    },
  });
  const result = await workflow.publish(command());
  assert.equal(result.status, "uncertain");
  assert.equal(result.error.retryability, "manual-check");
  assert.deepEqual(calls, ["reserve", "uncertain"]);
});

test("PublicationWorkflow rejects invalid input before writing a recovery intent", async () => {
  let reserved = false;
  const workflow = createPublicationWorkflow({
    clock: () => new Date(),
    operationalStore: {
      reservePublicationTarget: () => {
        reserved = true;
      },
      commitRemoteOutcome: () => {},
      listActionableRecovery: () => [],
      claimPostProcessing: () => null,
      markRecoveryUncertain: () => {},
    },
    publisher: {
      inspectAccount: async () => ({}),
      publish: async () => {
        throw new Error("not used");
      },
    },
  });
  await assert.rejects(() => workflow.publish(command({ title: "" })));
  assert.equal(reserved, false);
});

test("PublicationWorkflow recovery does not expose generic manual reconciliation", async () => {
  const workflow = createPublicationWorkflow({
    clock: () => new Date(),
    operationalStore: {
      reservePublicationTarget: () => {
        throw new Error("not used");
      },
      commitRemoteOutcome: () => {
        throw new Error("not used");
      },
      listActionableRecovery: () => [
        {
          attemptId: "attempt-1",
          publicationId: "publication-1",
          state: "remote_started",
        },
      ],
      markRecoveryUncertain: () => ({ status: "uncertain" }),
      claimPostProcessing: () => null,
    },
    publisher: {
      inspectAccount: async () => ({}),
      publish: async () => {
        throw new Error("not used");
      },
    },
  });
  assert.deepEqual(await workflow.recover(), {
    recoveryCount: 1,
    postProcessingCount: 0,
  });
  assert.equal(typeof workflow.reconcile, "undefined");
});

test("PublicationWorkflow leaves an uncertain attempt frozen for a named outcome resolver", async () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "phase-03-reconcile-evidence-"),
  );
  const store = createOperationalStore({ workspaceRoot: root });
  try {
    const profile = store.createAccountProfile({
      platformId: "toutiao",
      displayName: "Fixture account",
    });
    const target = {
      kind: "platform",
      platformId: "toutiao",
      accountProfileId: profile.accountProfileId,
    };
    store.reservePublicationTarget({
      articleId: "article-1",
      publicationId: "publication-1",
      attemptId: "attempt-1",
      target,
    });
    store.markRecoveryUncertain({
      attemptId: "attempt-1",
      error: error("REMOTE_RESULT_UNKNOWN"),
    });
    const workflow = createPublicationWorkflow({
      clock: () => new Date(),
      operationalStore: store,
      publisher: {
        inspectAccount: async () => ({}),
        publish: async () => {
          throw new Error("not used");
        },
      },
    });
    assert.equal(typeof workflow.reconcile, "undefined");
    assert.equal(
      store.listPublicationRecords({ publicationIds: ["publication-1"] })[0]
        .status,
      "uncertain",
    );
    assert.equal(store.claimPostProcessing({ claimToken: "post-1" }), null);
  } finally {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("legacy workflow appends only explicit failure attempts", async () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "phase-03-publication-retry-"),
  );
  const store = createOperationalStore({ workspaceRoot: root });
  try {
    const profile = store.createAccountProfile({
      platformId: "toutiao",
      displayName: "Fixture account",
    });
    const target = {
      kind: "platform",
      platformId: "toutiao",
      accountProfileId: profile.accountProfileId,
    };
    let publishCount = 0;
    const workflow = createPublicationWorkflow({
      clock: () => new Date(),
      operationalStore: store,
      publisher: {
        inspectAccount: async () => ({
          verified: true,
          accountProfileId: profile.accountProfileId,
        }),
        publish: async () => {
          publishCount += 1;
          return {
            status: "failed",
            error: error(
              publishCount === 1 ? "REMOTE_REJECTED" : "REMOTE_REJECTED_AGAIN",
            ),
          };
        },
      },
    });
    assert.equal(
      (await workflow.publish(command({ target }))).status,
      "failed",
    );
    const retried = await workflow.retry(
      command({ target, attemptId: "attempt-2" }),
    );
    assert.equal(retried.status, "failed");
    const record = store.listPublicationRecords({
      publicationIds: ["publication-1"],
    })[0];
    assert.equal(record.status, "failed");
    assert.deepEqual(
      record.attempts.map((attempt) => [attempt.attemptId, attempt.status]),
      [
        ["attempt-1", "failed"],
        ["attempt-2", "failed"],
      ],
    );
  } finally {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("PublicationWorkflow drains bounded recovery pages", async () => {
  const pages = [
    [{ attemptId: "attempt-1", state: "remote_started" }],
    [{ attemptId: "attempt-2", state: "outcome_pending" }],
  ];
  Object.defineProperty(pages[0], "hasMore", {
    value: true,
    enumerable: false,
  });
  const marked = [];
  let calls = 0;
  const workflow = createPublicationWorkflow({
    clock: () => new Date(),
    operationalStore: {
      listActionableRecovery: (options) => {
        assert.deepEqual(options, { includeManualCheck: false });
        calls += 1;
        return pages.shift() || [];
      },
      markRecoveryUncertain: (value) => {
        marked.push(value.attemptId);
        return { status: "uncertain" };
      },
      claimPostProcessing: () => null,
    },
    publisher: {
      inspectAccount: async () => ({}),
      publish: async () => ({ status: "failed", error: error("UNUSED") }),
    },
  });
  assert.deepEqual(await workflow.recover(), {
    recoveryCount: 2,
    postProcessingCount: 0,
  });
  assert.equal(calls, 2);
  assert.deepEqual(marked, ["attempt-1", "attempt-2"]);
});

test("PublicationWorkflow keeps a submitted outcome durable but does not archive it", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "phase-03-workflow-"));
  const store = createOperationalStore({ workspaceRoot: root });
  try {
    const profile = store.createAccountProfile({
      platformId: "toutiao",
      displayName: "Fixture account",
    });
    const workflow = createPublicationWorkflow({
      clock: () => new Date(),
      operationalStore: store,
      publisher: {
        inspectAccount: async () => ({
          accountProfileId: profile.accountProfileId,
          verified: true,
        }),
        publish: async (value) => ({
          status: "submitted",
          evidence: {
            articleId: value.articleId,
            attemptId: value.attemptId,
            targetKey: `platform:toutiao:account:${profile.accountProfileId}`,
            accountProfileId: profile.accountProfileId,
            remoteId: "receipt-1",
          },
        }),
      },
    });
    assert.equal(
      (
        await workflow.publish(
          command({
            target: {
              kind: "platform",
              platformId: "toutiao",
              accountProfileId: profile.accountProfileId,
            },
            postProcessingPayload: {
              sourcePlatformId: "toutiao",
              filename: "fixture.md",
            },
          }),
        )
      ).status,
      "submitted",
    );
    assert.equal(store.listActionableRecovery().length, 0);
    assert.equal(store.claimPostProcessing({ claimToken: "post-1" }), null);
  } finally {
    store.close();
  }
});

test("PublicationWorkflow recovery turns a stranded remote intent into a blocking uncertain record", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "phase-03-recovery-"));
  const store = createOperationalStore({ workspaceRoot: root });
  try {
    store.createAccountProfile({
      platformId: "toutiao",
      displayName: "Fixture account",
    });
    store.reservePublicationTarget({
      articleId: "article-1",
      publicationId: "publication-1",
      attemptId: "attempt-1",
      target: command().target,
    });
    const workflow = createPublicationWorkflow({
      clock: () => new Date(),
      operationalStore: store,
      publisher: {
        inspectAccount: async () => ({}),
        publish: async () => {
          throw new Error("not used");
        },
      },
    });
    assert.deepEqual(await workflow.recover(), {
      recoveryCount: 1,
      postProcessingCount: 0,
    });
    assert.equal(store.listActionableRecovery()[0].state, "manual_check");
    assert.throws(
      () =>
        store.reservePublicationTarget(
          command({ publicationId: "publication-2", attemptId: "attempt-2" }),
        ),
      { code: "PUBLICATION_UNCERTAIN" },
    );
  } finally {
    store.close();
  }
});

test("PublicationWorkflow rejects a missing or mismatched account profile before reserving", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "phase-03-account-"));
  const store = createOperationalStore({ workspaceRoot: root });
  try {
    const profile = store.createAccountProfile({
      platformId: "lieju",
      displayName: "Fixture account",
    });
    let inspected = 0;
    let published = 0;
    const workflow = createPublicationWorkflow({
      clock: () => new Date(),
      operationalStore: store,
      publisher: {
        inspectAccount: async () => {
          inspected += 1;
          return {};
        },
        publish: async () => {
          published += 1;
          return { status: "failed", error: error("UNUSED") };
        },
      },
    });
    await assert.rejects(() => workflow.publish(command()), {
      code: "ACCOUNT_PROFILE_NOT_FOUND",
    });
    await assert.rejects(
      () =>
        workflow.publish(
          command({
            target: {
              kind: "platform",
              platformId: "toutiao",
              accountProfileId: profile.accountProfileId,
            },
          }),
        ),
      { code: "ACCOUNT_PROFILE_PLATFORM_MISMATCH" },
    );
    assert.equal(inspected, 0);
    assert.equal(published, 0);
    assert.equal(store.listActionableRecovery().length, 0);
  } finally {
    store.close();
  }
});

test("PublicationWorkflow fails closed when the current account cannot be verified", async () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "phase-03-account-inspect-"),
  );
  const store = createOperationalStore({ workspaceRoot: root });
  try {
    const profile = store.createAccountProfile({
      platformId: "toutiao",
      displayName: "Fixture account",
    });
    let published = 0;
    const workflow = createPublicationWorkflow({
      clock: () => new Date(),
      operationalStore: store,
      publisher: {
        inspectAccount: async () => ({
          accountProfileId: "different-account",
          verified: true,
        }),
        publish: async () => {
          published += 1;
          throw new Error("must not publish");
        },
      },
    });
    await assert.rejects(
      () =>
        workflow.publish(
          command({
            target: {
              kind: "platform",
              platformId: "toutiao",
              accountProfileId: profile.accountProfileId,
            },
          }),
        ),
      { code: "ACCOUNT_PROFILE_INSPECTION_UNVERIFIED" },
    );
    assert.equal(published, 0);
    assert.equal(store.listActionableRecovery().length, 0);
  } finally {
    store.close();
  }
});

test("outcome transaction failure leaves a durable recovery intent and never starts post-processing", async () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "phase-03-outcome-transaction-"),
  );
  let transactions = 0;
  const store = createOperationalStore({
    workspaceRoot: root,
    internalBeforeCommit: () => {
      transactions += 1;
      if (transactions === 2) {
        const error = new Error("disk full");
        error.code = "SQLITE_FULL";
        throw error;
      }
    },
  });
  try {
    const profile = store.createAccountProfile({
      platformId: "toutiao",
      displayName: "Fixture account",
    });
    transactions = 0;
    let postProcessed = false;
    const workflow = createPublicationWorkflow({
      clock: () => new Date(),
      operationalStore: store,
      postProcessor: {
        process: async () => {
          postProcessed = true;
        },
      },
      publisher: {
        inspectAccount: async () => ({
          accountProfileId: profile.accountProfileId,
          verified: true,
        }),
        publish: async () => ({
          status: "failed",
          error: error("REMOTE_REJECTED"),
        }),
      },
    });
    await assert.rejects(
      () =>
        workflow.publish(
          command({
            target: {
              kind: "platform",
              platformId: "toutiao",
              accountProfileId: profile.accountProfileId,
            },
          }),
        ),
      { code: "SQLITE_FULL" },
    );
    assert.equal(postProcessed, false);
    assert.equal(store.listActionableRecovery()[0].state, "remote_started");
    assert.deepEqual(await workflow.recover(), {
      recoveryCount: 1,
      postProcessingCount: 0,
    });
    assert.equal(store.listActionableRecovery()[0].state, "manual_check");
  } finally {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
