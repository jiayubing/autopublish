const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { describe, it } = require('node:test');

const root = path.resolve(__dirname, '..');
const loader = pathToFileURL(path.join(root, 'media-workbench', 'node_modules', 'tsx', 'dist', 'loader.mjs')).href;

function runTs(source) {
  return execFileSync(process.execPath, ['--import', loader, '--input-type=module', '-e', source], { cwd: root, encoding: 'utf8' });
}

const article = (status = 'saved') => ({ id: 'article-1', clientId: 'client-1', title: '测试文章', content: '正文', status, researchQueryIds: [], platform: 'fixture', scenario: 'fixture', templateId: 'template', source: { client_material: true, doubao_answer: true, references: false, template: true }, createdAt: '2026-07-19T00:00:00.000Z' });

describe('article workflow pure derivation', () => {
  it('derives the requested stages and preserves attention priority', () => {
    runTs(`
      import assert from 'node:assert/strict';
      import { deriveArticleWorkflow } from './media-workbench/src/article-workflow.ts';
      const article = ${JSON.stringify(article())};
      assert.equal(deriveArticleWorkflow({ ...article, status: 'generated' }).stage, 'pending_review');
      assert.equal(deriveArticleWorkflow(article).stage, 'pending_submission');
      assert.equal(deriveArticleWorkflow(article, [], [{ id: 'batch', clientId: 'client-1', status: 'queued', createdAt: '', updatedAt: '', items: [{ articleId: 'article-1', targetPlatformId: 'fixture', status: 'queued', contentHash: 'hash' }] }]).stage, 'submitting');
      assert.equal(deriveArticleWorkflow(article, [{ articleId: 'article-1', status: 'failed' }]).stage, 'attention');
      assert.equal(deriveArticleWorkflow({ ...article, status: 'generated' }, [{ articleId: 'article-1', status: 'failed' }]).stage, 'attention');
      assert.equal(deriveArticleWorkflow({ ...article, status: 'saved' }, [{ articleId: 'article-1', status: 'published' }]).stage, 'completed');
      assert.equal(deriveArticleWorkflow({ ...article, status: 'trashed' }).primaryAction, 'restore');
    `);
  });
});
