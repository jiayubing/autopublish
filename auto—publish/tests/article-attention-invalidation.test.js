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

describe('article attention invalidation and single snapshot', () => {
  it('merges concurrent refreshes, notifies once per accepted snapshot, and keeps one revision source', () => {
    runTs(`
      import assert from 'node:assert/strict';
      import { createArticleAttentionStore } from './media-workbench/src/article-attention-store.tsx';
      let calls = 0;
      let revision = 4;
      const store = createArticleAttentionStore('client-1', async () => {
        calls += 1;
        return { revision, items: [{ attentionId: String(revision), kind: 'failed_submission', allowedActions: ['open-publication'] }], counts: { total: 1, actionable: 0 } };
      });
      let notifications = 0;
      const stop = store.subscribe(() => { notifications += 1; });
      const first = store.refresh('mount');
      const merged = store.refresh('invalidation');
      assert.strictEqual(first, merged);
      await first;
      assert.equal(calls, 1);
      assert.equal(store.getSnapshot().revision, 4);
      assert.equal(store.getSnapshot().items[0].attentionId, '4');
      const before = notifications;
      revision = 5;
      await store.refresh('terminal');
      assert.equal(calls, 2);
      assert.equal(store.getSnapshot().revision, 5);
      assert.equal(store.getSnapshot().items[0].attentionId, '5');
      assert.ok(notifications > before);
      stop();
    `);
  });

  it('does not let an older snapshot replace a newer accepted revision', () => {
    runTs(`
      import assert from 'node:assert/strict';
      import { createArticleAttentionStore } from './media-workbench/src/article-attention-store.tsx';
      let resolve;
      const store = createArticleAttentionStore('client-1', () => new Promise((done) => { resolve = done; }));
      const pending = store.refresh('old');
      resolve({ revision: 2, items: [], counts: { total: 0, actionable: 0 } });
      await pending;
      assert.equal(store.getSnapshot().revision, 2);
      assert.equal(store.getSnapshot().loading, false);
    `);
  });
});
