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
  it('lets a newer invalidation refresh supersede an older initial query', () => {
    runTs(`
      import assert from 'node:assert/strict';
      import { createAttentionFeature } from './media-workbench/src/features/attention/attention-feature.js';
      let calls = 0;
      let resolveOld;
      let resolveNew;
      const feature = createAttentionFeature({
        list: () => new Promise((resolve) => { calls += 1; if (calls === 1) resolveOld = resolve; else resolveNew = resolve; }),
        preview: async () => ({}),
        execute: async () => ({}),
      });
      feature.setScope({ workspaceRuntimeId: 'workspace-1', clientId: 'client-1' });
      let notifications = 0;
      const stop = feature.subscribe(() => { notifications += 1; });
      const first = feature.refresh('initial');
      const newer = feature.refresh('invalidation');
      assert.notStrictEqual(first, newer);
      resolveNew({ revision: 5, items: [{ attentionId: 'new', kind: 'failed_submission', allowedActions: ['open-publication'] }], counts: { total: 1, actionable: 0 } });
      await newer;
      resolveOld({ revision: 4, items: [{ attentionId: 'old', kind: 'failed_submission', allowedActions: ['open-publication'] }], counts: { total: 1, actionable: 0 } });
      await first;
      assert.equal(calls, 2);
      assert.equal(feature.getSnapshot().revision, 5);
      assert.equal(feature.getSnapshot().items[0].attentionId, 'new');
      assert.ok(notifications >= 3);
      stop();
    `);
  });

  it('does not let an old client response replace the current scope', () => {
    runTs(`
      import assert from 'node:assert/strict';
      import { createAttentionFeature } from './media-workbench/src/features/attention/attention-feature.js';
      let resolveOld;
      const feature = createAttentionFeature({
        list: (clientId) => clientId === 'client-1'
          ? new Promise((resolve) => { resolveOld = resolve; })
          : Promise.resolve({ revision: 9, items: [{ attentionId: clientId, kind: 'failed_submission', allowedActions: [] }], counts: { total: 1, actionable: 0 } }),
        preview: async () => ({}),
        execute: async () => ({}),
      });
      feature.setScope({ workspaceRuntimeId: 'workspace-1', clientId: 'client-1' });
      const pending = feature.refresh('initial');
      feature.setScope({ workspaceRuntimeId: 'workspace-1', clientId: 'client-2' });
      await feature.refresh('initial');
      resolveOld({ revision: 2, items: [{ attentionId: 'client-1', kind: 'failed_submission', allowedActions: [] }], counts: { total: 1, actionable: 0 } });
      await pending;
      assert.equal(feature.getSnapshot().revision, 9);
      assert.equal(feature.getSnapshot().items[0].attentionId, 'client-2');
    `);
  });
});
