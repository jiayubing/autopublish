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

describe('workspace data invalidation and shared snapshot', () => {
  it('merges same-scope refreshes, notifies subscribers, and ignores an older revision', () => {
    runTs(`
      import assert from 'node:assert/strict';
      import { createWorkspaceDataStore, PLATFORM_QUEUE_SCOPE } from './media-workbench/src/workspace-data-store.tsx';
      let calls = 0;
      let revision = 5;
      const store = createWorkspaceDataStore({ loadPlatformQueue: async () => {
        calls += 1;
        return { revision, platforms: [], queue: [{ filename: revision === 5 ? 'new.docx' : 'old.docx', filePath: 'fixture', title: 'fixture', platformId: 'fixture', sourcePlatformId: 'fixture' }] };
      }});
      let notifications = 0;
      const unsubscribe = store.subscribe(PLATFORM_QUEUE_SCOPE, () => { notifications += 1; });
      const first = store.refresh(PLATFORM_QUEUE_SCOPE, 'terminal');
      const merged = store.refresh(PLATFORM_QUEUE_SCOPE, 'event');
      assert.strictEqual(first, merged);
      await first;
      assert.equal(calls, 1);
      assert.equal(store.getSnapshot(PLATFORM_QUEUE_SCOPE).queue[0].filename, 'new.docx');
      const beforeUnsubscribe = notifications;
      unsubscribe();
      revision = 3;
      await store.refresh(PLATFORM_QUEUE_SCOPE, 'stale');
      assert.equal(store.getSnapshot(PLATFORM_QUEUE_SCOPE).queue[0].filename, 'new.docx');
      assert.equal(notifications, beforeUnsubscribe);
    `);
  });

  it('preserves loading, error, and explicit manual refresh behavior', () => {
    runTs(`
      import assert from 'node:assert/strict';
      import { createWorkspaceDataStore, PLATFORM_QUEUE_SCOPE } from './media-workbench/src/workspace-data-store.tsx';
      let calls = 0;
      let rejectFirst;
      const store = createWorkspaceDataStore({ loadPlatformQueue: () => {
        calls += 1;
        if (calls === 1) return new Promise((_, reject) => { rejectFirst = reject; });
        return Promise.resolve({ revision: 2, platforms: [], queue: [] });
      }});

      const first = store.refresh(PLATFORM_QUEUE_SCOPE, 'initial');
      assert.equal(store.getSnapshot(PLATFORM_QUEUE_SCOPE).loading, true);
      rejectFirst(new Error('fixture unavailable'));
      await assert.rejects(first, /fixture unavailable/);
      assert.equal(store.getSnapshot(PLATFORM_QUEUE_SCOPE).loading, false);
      assert.equal(store.getSnapshot(PLATFORM_QUEUE_SCOPE).error, 'fixture unavailable');

      const manual = store.refresh(PLATFORM_QUEUE_SCOPE, 'manual');
      assert.equal(store.getSnapshot(PLATFORM_QUEUE_SCOPE).loading, true);
      await manual;
      assert.equal(calls, 2);
      assert.equal(store.getSnapshot(PLATFORM_QUEUE_SCOPE).loading, false);
      assert.equal(store.getSnapshot(PLATFORM_QUEUE_SCOPE).error, null);
      assert.equal(store.getSnapshot(PLATFORM_QUEUE_SCOPE).revision, 2);
    `);
  });
});
