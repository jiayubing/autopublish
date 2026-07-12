const { it } = require("node:test"); const assert = require("node:assert/strict");
const { createMediaWorkbenchService } = require("../desktop/services/media-workbench-service");
it("preflight failure makes no media request and no submission order", async function() {
  let calls = 0; let records = 0;
  const service = createMediaWorkbenchService({ inputDir: process.cwd() });
  const result = await service.submitTasksSerially([{ filename: "a.txt", title: "A", hasImages: true, ignoreImages: false, selectedResources: [{ resourceId: "1" }] }], { client: { sendArticle: async () => { calls++; } }, orderStore: { record: async () => { records++; } } });
  assert.equal(result.fail, 0); assert.equal(calls, 0); assert.equal(records, 0);
});
