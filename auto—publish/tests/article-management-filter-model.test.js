const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { describe, it } = require("node:test");

const root = path.resolve(__dirname, "..");
const loader = pathToFileURL(path.join(root, "media-workbench", "node_modules", "tsx", "dist", "loader.mjs")).href;
const article = (status = "saved") => ({ id: "article-1", clientId: "client-1", title: "文章", content: "正文", status });
const { deriveArticleLifecycle } = require("../src/content/article-lifecycle-projection");

function run(source) {
  return execFileSync(process.execPath, ["--import", loader, "--input-type=module", "-e", source], { cwd: root, encoding: "utf8" });
}

describe("article management filter model", () => {
  it("exposes exactly six mutually exclusive stages", () => {
    run(`
      import assert from 'node:assert/strict';
      import { ARTICLE_WORKFLOW_STAGES } from './media-workbench/src/article-workflow.ts';
      assert.deepEqual(ARTICLE_WORKFLOW_STAGES.map((item) => item.id), ['pending_submission', 'queued', 'paid_processing', 'failed', 'published', 'trash']);
      assert.equal(new Set(ARTICLE_WORKFLOW_STAGES.map((item) => item.id)).size, 6);
    `);
  });

  it("allows local cleanup only for terminal publication results", () => {
    const base = { article: article(), attentionItems: [], removalTransactions: [] };
    assert.equal(deriveArticleLifecycle({ ...base, publications: [{ articleId: "article-1", status: "published", targetKey: "platform:p1" }] }).locks.canTrash, false);
    assert.equal(deriveArticleLifecycle({ ...base, publications: [{ articleId: "article-1", status: "failed", targetKey: "platform:p1" }] }).locks.canTrash, true);
    assert.equal(deriveArticleLifecycle({ ...base, publications: [{ articleId: "article-1", status: "uncertain", targetKey: "platform:p1" }] }).locks.canTrash, false);
  });
});
