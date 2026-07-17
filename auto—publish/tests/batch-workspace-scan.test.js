const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

describe("batch workspace scan", function() {
  it("scans media only from AUTO_PUBLISH_WORKSPACE input", async function() {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "batch-workspace-"));
    const oldWorkspace = process.env.AUTO_PUBLISH_WORKSPACE;
    const oldRoot = process.env.AUTO_PUBLISH_ROOT_DIR;
    try {
      const article = path.join(workspace, "input", "media", "workspace-only.txt");
      fs.mkdirSync(path.dirname(article), { recursive: true });
      fs.writeFileSync(article, "Workspace article", "utf8");
      process.env.AUTO_PUBLISH_WORKSPACE = workspace;
      process.env.AUTO_PUBLISH_ROOT_DIR = workspace;
      ["../scripts/config", "../src/core/platforms", "../src/platforms/media/adapter", "../src/app/publish-batch"].forEach(function(id) {
        delete require.cache[require.resolve(id)];
      });
      const plan = await require("../src/app/publish-batch").buildBatchPlan({ platformIds: ["media"] });
      assert.equal(plan.items[0].count, 1);
      assert.equal(plan.jobs[0].article.file, article);
    } finally {
      if (oldWorkspace === undefined) delete process.env.AUTO_PUBLISH_WORKSPACE; else process.env.AUTO_PUBLISH_WORKSPACE = oldWorkspace;
      if (oldRoot === undefined) delete process.env.AUTO_PUBLISH_ROOT_DIR; else process.env.AUTO_PUBLISH_ROOT_DIR = oldRoot;
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  });
});
