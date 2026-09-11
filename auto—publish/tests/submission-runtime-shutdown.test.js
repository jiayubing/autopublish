"use strict";
const { admitFixtureItem } = require("./fixtures/regular-queue-admission");

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const domain = require("../src/domain");
const storeModule = require("../src/infrastructure/operational-store/operational-store");
const preparation = require("../desktop/services/regular-platform-preparation-port");
const playwright = require("../src/core/playwright");
const {
  createWorkspaceRuntimeComposition,
} = require("../desktop/composition/workspace-runtime-composition");
const {
  createWorkspaceDataInvalidation,
} = require("../desktop/workspace-data-invalidation");

function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

for (const phase of ["remote", "preparation", "interval"])
  test(`workspace shutdown drains ${phase} and blocks settings while publishing`, async (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "submission-shutdown-"));
    const originalOpen = storeModule.createOperationalStore;
    let ports, store;
    t.mock.method(storeModule, "createOperationalStore", (options) => {
      ports = options.transitionPorts;
      store = originalOpen(options);
      return store;
    });
    t.mock.method(playwright, "pwInvokeSync", () => {
      throw Object.assign(new Error("Synthetic closed session"), {
        code: "PLAYWRIGHT_SESSION_NOT_OPEN",
      });
    });
    t.mock.method(playwright, "runCode", () => {
      throw new Error("Unexpected browser access");
    });
    t.mock.method(globalThis, "fetch", () => {
      throw new Error("Unexpected network access");
    });
    const started = deferred(),
      outcome = deferred();
    let submissions = 0;
    t.mock.method(preparation, "createRegularPlatformPreparationPort", () => ({
      async preparePlatformSubmission(claim) {
        if (phase === "preparation") {
          started.resolve();
          await outcome.promise;
        }
        return {
          preparedSubmissionEvidenceV1:
            domain.createTextOnlyPreparedSubmissionEvidenceV1(claim),
          async submitPreparedPublication() {
            submissions += 1;
            if (phase === "interval") setImmediate(() => started.resolve());
            if (phase === "remote") {
              started.resolve();
              await outcome.promise;
            }
            return { status: "accepted", remoteId: "synthetic-accepted" };
          },
        };
      },
    }));
    const workspaceRoot = path.join(root, "workspace");
    let composition, run;
    try {
      composition = await createWorkspaceRuntimeComposition({
        options: {
          appRoot: path.resolve(__dirname, ".."),
          userDataPath: path.join(root, "config"),
          sessionDataPath: path.join(root, "local"),
          safeStorage: {
            isEncryptionAvailable: () => true,
            encryptString: (s) => Buffer.from(s),
            decryptString: (b) => b.toString(),
          },
        },
        bootstrapState: { workspacePath: workspaceRoot },
        sendToRenderer: () => {},
        invalidation: createWorkspaceDataInvalidation({
          sendToRenderer: () => {},
        }),
      });
      const profile = store.createAccountProfile({
        platformId: "hepan",
        displayName: "Synthetic",
      });
      let group;
      for (const articleId of ["first", "second"]) {
        group = admitFixtureItem(ports.regularQueueTransitions, {
          clientId: "synthetic-client",
          articleId,
          publicationId: `publication-${articleId}`,
          attemptId: `attempt-${articleId}`,
          target: {
            kind: "platform",
            platformId: "hepan",
            accountProfileId: profile.accountProfileId,
          },
          queueConfig: { submissionIntervalSeconds: 3600 },
          publicationSnapshot: {
            articleId,
            title: articleId,
            body: "Synthetic body",
            fingerprint: "a".repeat(64),
          },
        });
      }
      run = composition.modules.regularQueueGroupOrchestrator.startGroup({
        queueGroupId: group.queueGroupId,
      });
      // Install a rejection handler before fault assertions can trigger cleanup.
      run.catch(() => {});
      await started.promise;
      assert.equal(
        composition.modules.taskService.getState().isPlatformRunning,
        true,
      );
      assert.throws(
        () =>
          composition.modules.platformSettingsService.save("hepan", {
            uid: 12345,
            password: "synthetic",
          }),
        { code: "PLATFORM_CONFIG_BUSY" },
      );
      let closed = false;
      const draining = composition.dispose();
      assert.equal(composition.dispose(), draining);
      const disposal = draining.then(() => {
        closed = true;
      });
      await new Promise((resolve) => setImmediate(resolve));
      if (phase !== "interval") assert.equal(closed, false);
      if (phase !== "interval")
        assert.ok(
          store
            .listAccountProfiles()
            .some((item) => item.accountProfileId === profile.accountProfileId),
        );
      else await disposal;
      outcome.resolve();
      await run;
      await disposal;
      assert.equal(submissions, phase === "preparation" ? 0 : 1);
      const reopened = originalOpen({ workspaceRoot });
      try {
        assert.equal(
          reopened.listArticleLifecycleFacts({ articleIds: ["first"] })
            .publications[0].status,
          phase === "preparation" ? "queued" : "published",
        );
        assert.equal(
          reopened.listArticleLifecycleFacts({ articleIds: ["second"] })
            .publications[0].status,
          "queued",
        );
      } finally {
        reopened.close();
      }
    } finally {
      outcome.resolve();
      if (run) await Promise.allSettled([run]);
      if (composition) await composition.dispose();
      // root is the exact isolated directory returned by mkdtemp, never a workspace input.
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
