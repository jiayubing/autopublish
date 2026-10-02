"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createTypedIpcMain } = require("../desktop/ipc/register");
const { registerGeoKnowledgeIpc } = require("../desktop/ipc/geo-knowledge-ipc");
const { loadPreloadHarness } = require("./helpers/preload-harness");
const {
  geoKnowledgeIpcContractFixtures,
} = require("./fixtures/geo-knowledge-ipc-contract-fixtures");

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
