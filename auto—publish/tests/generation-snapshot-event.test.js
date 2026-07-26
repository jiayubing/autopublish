const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { registerContentGenerationBatchIpc } = require('../desktop/ipc/content-generation-batch-ipc');
const { createContentGenerationBatchService } = require('../desktop/services/content-generation-batch-service');

function createEventFixture(options) {
  const useSnapshotEvents = options && options.useSnapshotEvents === true;
  const handlers = new Map();
  const deliveredEvents = [];
  const consumedSnapshots = [];
  const followUpIpc = [];
  let batchFileReads = 0;
  let runnerListener;
  const batch = {
    id: 'batch-1',
    status: 'running',
    clientSources: [],
    templates: [],
    tasks: [],
    counts: { total: 100, succeeded: 0, failed: 0, pending: 100, interrupted: 0, cancelled: 0 },
  };
  const batchStore = {
    getBatch(batchId) {
      assert.equal(batchId, batch.id);
      batchFileReads += 1;
      return JSON.parse(JSON.stringify(batch));
    },
  };
  const runner = {
    subscribe(listener) {
      runnerListener = listener;
    },
    run() {
      return new Promise(() => {});
    },
  };
  const service = createContentGenerationBatchService({
    batchStore,
    clientKnowledge: { getClient: () => null },
    materialStore: { listMaterials: async () => [] },
    researchStore: { listResearch: () => [] },
    templateStore: { getTemplate: () => null },
    contentStore: { saveArticle: (article) => article, findByGenerationTaskId: () => ({ kind: "none" }) },
    now: () => '2026-07-21T00:00:00.000Z',
    runnerFactory: () => runner,
  });

  registerContentGenerationBatchIpc({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    contentGenerationBatchService: service,
    sendToRenderer(channel, payload) {
      if (channel !== 'content:generation-batch-state') return;
      deliveredEvents.push(payload);
      if (useSnapshotEvents) {
        consumedSnapshots.push(payload);
      } else if (payload.batchId) {
        // This is the current BatchGenerationView event path. It intentionally
        // represents the missing renderer-side counter with an IPC fixture.
        followUpIpc.push(handlers.get('content:get-generation-batch')(null, { batchId: payload.batchId }));
      }
    },
  });

  return {
    batch,
    service,
    start: async () => {
      await service.startBatch({ batchId: batch.id });
      deliveredEvents.length = 0;
      consumedSnapshots.length = 0;
      followUpIpc.length = 0;
      batchFileReads = 0;
      return runnerListener;
    },
    deliveredEvents,
    consumedSnapshots,
    followUpIpc,
    getBatchFileReads: () => batchFileReads,
  };
}

describe('generation snapshot event baseline', () => {
  it('records one current renderer follow-up IPC and batch read for every state event', async () => {
    const fixture = createEventFixture();
    const emit = await fixture.start();
    assert.equal(typeof emit, 'function');

    for (let index = 0; index < 100; index += 1) {
      emit({
        batchId: fixture.batch.id,
        taskId: `task-${index + 1}`,
        status: index === 99 ? 'completed' : 'running',
        counts: {
          total: 100,
          succeeded: index,
          failed: 0,
          pending: 99 - index,
          interrupted: 0,
          cancelled: 0,
        },
        updatedAt: `2026-07-21T00:00:${String(index).padStart(2, '0')}.000Z`,
      });
    }
    await Promise.all(fixture.followUpIpc);

    assert.equal(fixture.deliveredEvents.length, 100);
    assert.equal(fixture.followUpIpc.length, 100);
    assert.equal(fixture.getBatchFileReads(), 100);
    assert.ok(fixture.deliveredEvents.every((event) => event.batchId === fixture.batch.id));
    assert.ok(fixture.deliveredEvents.every((event) => event.status && event.counts && event.updatedAt));
    assert.equal(fixture.deliveredEvents.at(-1).status, 'completed');
    assert.equal(JSON.stringify(fixture.deliveredEvents).includes('prompt'), false);
    assert.equal(JSON.stringify(fixture.deliveredEvents).includes('apiKey'), false);

    console.log(JSON.stringify({ events: 100, followUpIpc: fixture.followUpIpc.length, batchFileReads: fixture.getBatchFileReads() }));
  });

  it('consumes complete snapshot events without renderer follow-up IPC or batch reads', async () => {
    const fixture = createEventFixture({ useSnapshotEvents: true });
    const emit = await fixture.start();
    assert.equal(typeof emit, 'function');

    for (let index = 0; index < 100; index += 1) {
      emit({
        batchId: fixture.batch.id,
        taskId: `task-${index + 1}`,
        status: index === 99 ? 'completed' : 'running',
        counts: {
          total: 100,
          succeeded: index,
          failed: 0,
          pending: 99 - index,
          interrupted: 0,
          cancelled: 0,
        },
        batch: {
          ...fixture.batch,
          status: index === 99 ? 'completed' : 'running',
          counts: {
            total: 100,
            succeeded: index,
            failed: 0,
            pending: 99 - index,
            interrupted: 0,
            cancelled: 0,
          },
        },
        updatedAt: `2026-07-21T00:00:${String(index).padStart(2, '0')}.000Z`,
      });
    }

    assert.equal(fixture.deliveredEvents.length, 100);
    assert.equal(fixture.consumedSnapshots.length, 100);
    assert.equal(fixture.followUpIpc.length, 0);
    assert.equal(fixture.getBatchFileReads(), 0);
    assert.ok(fixture.consumedSnapshots.every((event) => event.batch && event.batch.id === fixture.batch.id));
    assert.ok(fixture.consumedSnapshots.every((event) => typeof event.runtimeId === 'string' && Number.isInteger(event.sequence)));
    assert.ok(fixture.consumedSnapshots.every((event, index) => index === 0 || event.sequence > fixture.consumedSnapshots[index - 1].sequence));
    assert.equal(fixture.consumedSnapshots.at(-1).batch.status, 'completed');
    assert.equal(JSON.stringify(fixture.consumedSnapshots).includes('prompt'), false);
    assert.equal(JSON.stringify(fixture.consumedSnapshots).includes('apiKey'), false);

    console.log(JSON.stringify({ events: 100, followUpIpc: fixture.followUpIpc.length, batchFileReads: fixture.getBatchFileReads() }));
  });
});

module.exports = { createEventFixture };
