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

describe('article workflow renderer contract', () => {
  it('exposes the six-stage renderer contract owned by the main-process projection', () => {
    runTs(`
      import assert from 'node:assert/strict';
      import { ARTICLE_WORKFLOW_STAGES } from './media-workbench/src/article-workflow.ts';
      assert.deepEqual(ARTICLE_WORKFLOW_STAGES.map((item) => item.id), ['pending_submission', 'queued', 'paid_processing', 'failed', 'published', 'trash']);
      assert.deepEqual(ARTICLE_WORKFLOW_STAGES.map((item) => item.label), ['待投稿', '投稿队列', '付费处理中', '需处理', '已发布', '回收站']);
    `);
  });
});
