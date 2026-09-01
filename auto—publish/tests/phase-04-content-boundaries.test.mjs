import test from "node:test";
import assert from "node:assert/strict";
import { createContentProductionFeature } from "../media-workbench/src/features/content/content-production-feature.js";

test("production boundary loads sources without submission or paid adapters", async () => {
  const calls = [];
  const feature = createContentProductionFeature({
    listClients: async () => [{ id: "client-1", name: "客户一" }],
    listTemplateCatalog: async () => ({ revision: "r1", platforms: [], templates: [], diagnostics: [] }),
    listQuestions: async () => [],
    listResearch: async () => [],
  });
  feature.setScope({ workspaceRuntimeId: "runtime-1" });
  assert.equal(await feature.refresh("initial"), true);
  assert.equal(feature.getSnapshot().selectedClientId, "client-1");
  assert.equal("previewPaidMediaPreflight" in feature.commands, false);
  assert.equal("startPaidMediaBatch" in feature.commands, false);
  assert.deepEqual(calls, []);
  feature.dispose();
});

test("production boundary keeps source failures local", async () => {
  const feature = createContentProductionFeature({
    listClients: async () => { throw Object.assign(new Error("sources down"), { code: "SOURCES_DOWN" }); },
    listTemplateCatalog: async () => ({ revision: "r1", platforms: [], templates: [], diagnostics: [] }),
    listQuestions: async () => [],
    listResearch: async () => [],
  });
  feature.setScope({ workspaceRuntimeId: "runtime-1" });
  assert.equal(await feature.refresh("manual"), false);
  assert.equal(feature.getSnapshot().query.error.code, "SOURCES_DOWN");
  feature.dispose();
});
