const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
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

  it('keeps the invalidation event payload minimal and uses one shared provider seam', () => {
    const source = fs.readFileSync(path.join(root, 'media-workbench/src/workspace-data-store.tsx'), 'utf8');
    const api = fs.readFileSync(path.join(root, 'media-workbench/src/electron-api.ts'), 'utf8');
    assert.match(source, /getSnapshot\(scope/);
    assert.match(source, /refresh\(scope/);
    assert.match(source, /subscribe\(scope/);
    assert.match(source, /onWorkspaceDataInvalidated/);
    assert.match(api, /revision/);
    const types = fs.readFileSync(path.join(root, 'media-workbench/src/types.ts'), 'utf8');
    assert.match(types, /WorkspaceDataInvalidatedEvent/);
    assert.match(types, /scopes/);
    assert.match(api, /articleAttention/);
  });
});
