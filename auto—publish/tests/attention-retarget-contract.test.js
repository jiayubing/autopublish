"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { productionIpcRegistry } = require("../desktop/ipc/contracts/production-registry");
const { createPlatformWorkbenchApplication } = require("../desktop/services/platform-workbench-application");

test("retarget admission wire contract carries source identity and rejects multiple targets or forged fields", () => {
  const articleRef = { clientId: "client-a", articleId: "article-a" };
  for (const capability of ["content.previewRegularQueueAdmission", "content.admitRegularQueueItems"]) {
    const contract = productionIpcRegistry.byCapability(capability);
    const input = { articleRefs: [articleRef], retargetFrom: [{ articleRef, attentionId: "failed-source" }], platformId: "lieju", accountProfileId: "bound-profile", autoStart: false, ...(contract.kind === "command" ? { confirmed: true } : {}) };
    const encoded = productionIpcRegistry.encodeRequest(contract, input);
    assert.deepEqual(productionIpcRegistry.parseRequest(contract, encoded), input);
    for (const patch of [
      { platformId: ["lieju", "hepan"] },
      { targetPlatformIds: ["lieju", "hepan"] },
      { retargetFrom: [{ articleRef, attentionId: "failed-source", canRetarget: true }] },
      { retargetFrom: [] },
      { retargetFrom: [{ articleRef }] },
    ]) {
      assert.throws(() => productionIpcRegistry.encodeRequest(contract, { ...input, ...patch }));
    }
  }
});

test("platform catalog reports current local queue configuration without login or remote calls", async () => {
  let configured = false;
  const app = createPlatformWorkbenchApplication({
    directoryEntries: [
      { id: "hepan", displayName: "蓝色河畔", publicationTargetKind: "platform" },
      { id: "media", displayName: "网站媒体", publicationTargetKind: "resource" },
    ],
    platformSessionService: { supports: () => false },
    isRegularQueueConfigured: () => configured,
  });
  assert.deepEqual((await app.getQueue()).platforms, [{ id: "hepan", displayName: "蓝色河畔", loginAvailable: false, queueConfigured: false }]);
  configured = true;
  assert.equal((await app.getQueue()).platforms[0].queueConfigured, true);
});
