const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { describe, it } = require("node:test");

const root = path.resolve(__dirname, "..");
const loader = pathToFileURL(path.join(root, "media-workbench", "node_modules", "tsx", "dist", "loader.mjs")).href;
const article = (status = "saved") => ({ id: "article-1", clientId: "client-1", title: "文章", content: "正文", status });

function run(source) {
  return execFileSync(process.execPath, ["--import", loader, "--input-type=module", "-e", source], { cwd: root, encoding: "utf8" });
}

describe("article management filter model", () => {
  it("exposes exactly six mutually exclusive stages", () => {
    run(`
      import assert from 'node:assert/strict';
      import { ARTICLE_WORKFLOW_STAGES, deriveArticleManagementStatus } from './media-workbench/src/article-workflow.ts';
      assert.deepEqual(ARTICLE_WORKFLOW_STAGES.map((item) => item.id), ['pending_review', 'pending_submission', 'queued', 'published', 'failed', 'trash']);
      const values = [
        deriveArticleManagementStatus({ ...${JSON.stringify(article("generated"))} }),
        deriveArticleManagementStatus({ ...${JSON.stringify(article())} }),
        deriveArticleManagementStatus(${JSON.stringify(article())}, [], [{ id: 'batch', clientId: 'client-1', status: 'queued', createdAt: '', updatedAt: '', items: [{ articleId: 'article-1', targetPlatformId: 'p1', status: 'queued' }] }]),
        deriveArticleManagementStatus(${JSON.stringify(article())}, [{ articleId: 'article-1', status: 'published' }]),
        deriveArticleManagementStatus(${JSON.stringify(article())}, [{ articleId: 'article-1', status: 'uncertain' }]),
        deriveArticleManagementStatus({ ...${JSON.stringify(article())}, status: 'trashed' })
      ];
      assert.deepEqual(values, ['pending_review', 'pending_submission', 'queued', 'published', 'failed', 'trash']);
      assert.equal(new Set(values).size, values.length);
    `);
  });

  it("allows local cleanup only for terminal publication results", () => {
    run(`
      import assert from 'node:assert/strict';
      import { deriveArticleWorkflow } from './media-workbench/src/article-workflow.ts';
      const article = ${JSON.stringify(article())};
      assert.equal(deriveArticleWorkflow(article, [{ articleId: 'article-1', status: 'published' }]).locks.canTrash, true);
      assert.equal(deriveArticleWorkflow(article, [{ articleId: 'article-1', status: 'failed' }]).locks.canTrash, true);
      assert.equal(deriveArticleWorkflow(article, [{ articleId: 'article-1', status: 'uncertain' }]).locks.canTrash, false);
    `);
  });
});
