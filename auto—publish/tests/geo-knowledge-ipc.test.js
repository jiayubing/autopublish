"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createTypedIpcMain } = require("../desktop/ipc/register");
const { registerGeoKnowledgeIpc } = require("../desktop/ipc/geo-knowledge-ipc");
const { loadPreloadHarness } = require("./helpers/preload-harness");
const {
  geoKnowledgeIpcContractFixtures,
} = require("./fixtures/geo-knowledge-ipc-contract-fixtures");
const { normalizeCandidate } = require("../src/content/geo-knowledge-merge");
const { buildCustomerConfirmationModel } = require("../src/content/geo-confirmation-model");

test("knowledge preload and authenticated transport roundtrip all capabilities", async () => {
  const handlers = new Map();
  let authorized = true;
  let calls = 0;
  const geoKnowledgeService = Object.fromEntries(
    geoKnowledgeIpcContractFixtures.map((f) => [
      f.channel.split(":")[1],
      (input) => {
        calls++;
        assert.deepEqual(input, f.request);
        return f.result;
      },
    ]),
  );
  registerGeoKnowledgeIpc({
    ipcMain: createTypedIpcMain(
      { handle: (channel, fn) => handlers.set(channel, fn) },
      async () => {
        if (!authorized) throw new Error("private auth message");
      },
    ),
    geoKnowledgeService,
  });
  const harness = loadPreloadHarness({
    invoke: (channel, input) => handlers.get(channel)(null, input),
  });
  for (const fixture of geoKnowledgeIpcContractFixtures) {
    const reply = await harness.api.geoKnowledge[fixture.channel.split(":")[1]](
      fixture.request,
    );
    assert.equal(reply.ok, true, fixture.channel);
    assert.deepEqual(reply.data, fixture.result);
  }
  const previousCalls = calls;
  authorized = false;
  assert.equal(
    (await harness.api.geoKnowledge.generate({ clientId: "client-1" })).error
      .code,
    "AUTH_REQUIRED",
  );
  assert.equal(calls, previousCalls);
  assert.equal(
    (
      await harness.api.geoKnowledge.edit({
        clientId: "client-1",
        injectedPath: "secret",
      })
    ).ok,
    false,
  );
});

test("actual fifteen-section confirmation passes preview IPC contract", async () => {
  const knowledge = normalizeCandidate({
    profile: { fields: { name: "合成眼镜店" }, basis: "fact", sourceIds: ["client"] },
    offerings: [{ name: "验光配镜", description: "提供验光与配镜服务。", basis: "fact", sourceIds: ["client"] }],
    scenarios: [{ name: "学生配镜", description: "适用于学生配镜需求。", basis: "derived", sourceIds: ["client"] }],
  }, [{ id: "client", type: "client_input", title: "客户资料" }], "client-1");
  const handlers = new Map();
  registerGeoKnowledgeIpc({
    ipcMain: createTypedIpcMain({ handle: (channel, fn) => handlers.set(channel, fn) }, async () => {}),
    geoKnowledgeService: { previewConfirmation: () => ({ model: buildCustomerConfirmationModel(knowledge) }) },
  });
  const reply = await handlers.get("geo-knowledge:previewConfirmation")(null, { schemaVersion: 1, payload: { clientId: "client-1", revision: 0 } });
  assert.equal(reply.ok, true, reply.error?.code);
  assert.equal(reply.data.model.sections.length, 15);
});
