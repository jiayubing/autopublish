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

it('article management controller resets client facts atomically but retains workspace target preferences', async function() {
  const { createArticleManagementController } = await controller();
  const state = createArticleManagementController({ loadSnapshot: async (clientId) => ({ clientId, articles: [{ id: clientId }], trash: [{ articleId: clientId }], submissionBatches: [{ id: clientId }], cancellationPlans: [{ batchId: clientId }], publicationRecords: [{ articleId: clientId }], workflowByArticle: { [clientId]: { stage: 'failed' } }, attention: { items: [{ articleId: clientId }] } }) });
  state.setTargetPlatformIds(['platform-a']);
  await state.refresh('client-a');
  state.setSelection(['article-a']);
  state.setClient('client-b');
  assert.deepEqual(state.getState().management.articles, []);
  assert.deepEqual(state.getState().management.trash, []);
  assert.deepEqual(state.getState().management.submissionBatches, []);
  assert.deepEqual(state.getState().management.cancellationPlans, []);
  assert.deepEqual(state.getState().management.publicationRecords, []);
  assert.deepEqual(state.getState().management.workflowByArticle, {});
  assert.deepEqual(state.getState().management.attention.items, []);
  assert.deepEqual(state.getState().selected, []);
  assert.deepEqual(state.getState().targetPlatformIds, ['platform-a']);
});

it('article management controller deduplicates a cancellation mutation and ignores its old-client completion', async function() {
  const { createArticleManagementController } = await controller();
  let resolveCancel;
  let calls = 0;
  const state = createArticleManagementController({
    loadSnapshot: async (clientId) => ({ clientId }),
    cancel: () => { calls += 1; return new Promise((resolve) => { resolveCancel = resolve; }); },
  });
  state.setClient('client-a');
  const first = state.runCancellation({ batchId: 'batch-a' });
  const duplicate = state.runCancellation({ batchId: 'batch-a' });
  assert.equal(calls, 1);
  assert.strictEqual(first, duplicate);
  state.setClient('client-b');
  resolveCancel({ cancelledCount: 1 });
  await first;
  assert.equal(state.getState().cancellationPending, null);
  assert.equal(state.getState().feedback, null);
});

it('article management controller stops a removal watch when switching clients or disposing', async function() {
  const { createArticleManagementController } = await controller();
  let stopped = 0;
  const state = createArticleManagementController({ loadSnapshot: async () => ({}), watchRemoval: () => () => { stopped += 1; } });
  state.setClient('client-a');
  state.watchRemoval('removal-a');
  state.setClient('client-b');
  assert.equal(stopped, 1);
  state.watchRemoval('removal-b');
  state.dispose();
  assert.equal(stopped, 2);
});

it('article management controller owns removal subscription and ignores its late poll after a client switch', async function() {
  const { createArticleManagementController } = await controller();
  let listener;
  let unsubscribed = 0;
  let resolvePoll;
  const state = createArticleManagementController({
    loadSnapshot: async () => ({}),
    watchRemoval: (_id, next) => { listener = next; return () => { unsubscribed += 1; }; },
    loadRemoval: () => new Promise((resolve) => { resolvePoll = resolve; }),
  });
  state.setClient('client-a');
  state.startRemovalWatch('removal-a');
  listener({ transactionId: 'removal-a', status: 'pending_recovery' });
  assert.equal(state.getState().removalTransaction.transactionId, 'removal-a');
  state.setClient('client-b');
  resolvePoll({ transactionId: 'removal-a', status: 'committed' });
  await Promise.resolve();
  assert.equal(unsubscribed, 1);
  assert.equal(state.getState().removalTransaction, null);
});
