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

describe('platform queue invalidation and shared feature snapshot', () => {
  it('uses one query identity so a newer invalidation supersedes an older initial response', () => {
    runTs(`
      import assert from 'node:assert/strict';
      import { createPlatformFeature } from './media-workbench/src/features/platform/platform-feature.js';
      const pending = [];
      const feature = createPlatformFeature({ loadQueue: () => new Promise((resolve, reject) => pending.push({ resolve, reject })) });
      feature.setScope({ workspaceRuntimeId: 'runtime-1' });
      let notifications = 0;
      const unsubscribe = feature.subscribe(() => { notifications += 1; });
      const first = feature.refreshQueue('initial');
      const newer = feature.refreshQueue('invalidation');
      assert.notStrictEqual(first, newer);
      assert.equal(pending.length, 2);
      pending[1].resolve({ revision: 5, platforms: [], queue: [{ filename: 'new.docx', title: 'fixture', platformId: 'fixture', sourcePlatformId: 'fixture' }] });
      await newer;
      pending[0].resolve({ revision: 3, platforms: [], queue: [{ filename: 'old.docx', title: 'fixture', platformId: 'fixture', sourcePlatformId: 'fixture' }] });
      await first;
      assert.equal(feature.getSnapshot().queue.queue[0].filename, 'new.docx');
      const beforeUnsubscribe = notifications;
      unsubscribe();
      feature.dispose();
      assert.equal(notifications, beforeUnsubscribe);
    `);
  });

  it('preserves loading, error, and explicit manual refresh behavior', () => {
    runTs(`
      import assert from 'node:assert/strict';
      import { createPlatformFeature } from './media-workbench/src/features/platform/platform-feature.js';
      let calls = 0;
      let rejectFirst;
      const feature = createPlatformFeature({ loadQueue: () => {
        calls += 1;
        if (calls === 1) return new Promise((_, reject) => { rejectFirst = reject; });
        return Promise.resolve({ revision: 2, platforms: [], queue: [] });
      }});

      feature.setScope({ workspaceRuntimeId: 'runtime-1' });
      const first = feature.refreshQueue('initial');
      assert.equal(feature.getSnapshot().queue.loading, true);
      rejectFirst(new Error('fixture unavailable'));
      await assert.rejects(first, /fixture unavailable/);
      assert.equal(feature.getSnapshot().queue.loading, false);
      assert.equal(feature.getSnapshot().queue.error, 'fixture unavailable');

      const manual = feature.refreshQueue('manual');
      assert.equal(feature.getSnapshot().queue.loading, true);
      await manual;
      assert.equal(calls, 2);
      assert.equal(feature.getSnapshot().queue.loading, false);
      assert.equal(feature.getSnapshot().queue.error, null);
      assert.equal(feature.getSnapshot().queue.revision, 2);
    `);
  });
});
