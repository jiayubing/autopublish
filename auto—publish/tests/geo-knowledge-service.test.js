"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  createGeoKnowledgeService,
} = require("../desktop/services/geo-knowledge-service");
const { normalizeCandidate } = require("../src/content/geo-knowledge-merge");
test("desktop knowledge use cases persist generated facts, manual edits and export", async (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "geo-service-"));
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }));
  const service = createGeoKnowledgeService({
    workspaceRoot,
    getClient: () => ({ name: "合成客户" }),
    materialStore: { listMaterials: async () => [] },
    research: {
      extract: async () =>
        normalizeCandidate(
          { profile: { fields: { name: "合成客户" } } },
          [],
          "client-1",
        ),
    },
  });
  assert.equal(service.load({ clientId: "client-1" }).knowledge, null);
  const { knowledge } = await service.generate({ clientId: "client-1" });
  assert.equal(knowledge.revision, 1);
  service.edit({
    clientId: "client-1",
    revision: 1,
    section: "profile",
    id: knowledge.profile.id,
    changes: { fields: { name: "人工名称" } },
  });
  const markdown = service.exportMarkdown({ clientId: "client-1", revision: 2 }).markdown;
  assert.match(markdown, /人工名称/);
  const preview = service.previewConfirmation({ clientId: "client-1", revision: 2 }).model;
  assert.equal(preview.sections.length, 15);
  assert.equal(preview.knowledgeRevision, 2);
  for (const entry of preview.sections.flatMap((section) => section.entries).filter((entry) => entry.kind !== "gap")) {
    assert.match(markdown, new RegExp(entry.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.throws(
    () => service.previewConfirmation({ clientId: "client-1", revision: 1 }),
    { code: "GEO_REVISION_CONFLICT" },
  );
  assert.equal(
    service.load({ clientId: "client-1" }).knowledge.profile.locked,
    true,
  );
  service.dispose();
  await assert.rejects(service.generate({ clientId: "client-1" }), {
    code: "GEO_CANCELLED",
  });
});
