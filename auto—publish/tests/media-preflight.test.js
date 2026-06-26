const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { runPreflight } = require("../src/platforms/media/preflight");

describe("media preflight", function() {
  it("accepts selectedResources and expands task count", async function() {
    const result = await runPreflight({
      dryRun: true,
      articles: [{
        filename: "a.txt",
        title: "A",
        selectedResources: [
          { resourceId: "101", name: "Media One" },
          { resourceId: "102", name: "Media Two" }
        ]
      }]
    });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.taskCount, 2);
    assert.strictEqual(result.articles[0].resourceCount, 2);
  });

  it("blocks articles with no selected resources", async function() {
    const result = await runPreflight({
      dryRun: true,
      articles: [{ filename: "a.txt", title: "A", selectedResources: [] }]
    });

    assert.strictEqual(result.ok, false);
    assert.match(result.errors.join("\n"), /media resource|媒体资源/);
  });

  it("migrates old resourceId into selectedResources for validation", async function() {
    const result = await runPreflight({
      dryRun: true,
      articles: [{ filename: "a.txt", title: "A", resourceId: "999", resourceName: "Old" }]
    });

    assert.strictEqual(result.taskCount, 1);
    assert.strictEqual(result.ok, true);
  });
});
