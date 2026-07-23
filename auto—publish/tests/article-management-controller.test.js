const assert = require('node:assert/strict');
const { it } = require('node:test');

async function controller() { return await import('../media-workbench/src/article-management-controller.js'); }

it('article management controller rejects a stale client snapshot and clears client-local selection', async function() {
  const { createArticleManagementController } = await controller();
  const pending = [];
  const snapshots = [];
  const state = createArticleManagementController({ loadSnapshot(clientId) { return new Promise((resolve) => pending.push({ clientId, resolve })); }, onSnapshot(snapshot) { snapshots.push(snapshot); } });
  state.setClient('client-a'); state.setSelection(['article-a']); const first = state.refresh();
  state.setClient('client-b'); assert.deepEqual(state.selection(), []); const second = state.refresh();
  pending[0].resolve({ clientId: 'client-a' }); pending[1].resolve({ clientId: 'client-b' });
  await Promise.all([first, second]);
  assert.deepEqual(snapshots, [{ clientId: 'client-b' }]);
});
