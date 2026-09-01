const assert = require('node:assert/strict');
const test = require('node:test');
const { createAiContentService } = require('../desktop/services/ai-content-service');

test('content client index uses material metadata without reading material bodies', async () => {
  let fullReads = 0;
  const service = createAiContentService({
    clientKnowledge: {
      listClientIdentities: () => [{ id: 'client-1', name: 'Client' }],
      getClient: () => ({ id: 'client-1', name: 'Client' }),
    },
    materialStore: {
      listMaterialMetadata: async () => [{ id: 'facts', name: 'facts.md', extension: '.md', status: 'ready' }],
      listMaterials: async () => { fullReads += 1; return [{ id: 'facts', name: 'facts.md', content: 'large body' }]; },
    },
    researchStore: { listResearch: () => [], listResearchMetadata: () => [] },
    templateStore: { listCatalog: () => ({ revision: 'r', platforms: [], templates: [], diagnostics: [] }) },
  });
  const clients = await service.listClients();
  assert.equal(clients[0].knowledgeFiles[0].content, undefined);
  assert.equal(fullReads, 0);
});

test('research metadata index omits answer bodies and full reference arrays', () => {
  const service = createAiContentService({
    clientKnowledge: { listClients: () => [], getClient: () => ({ id: 'client-1', name: 'Client' }) },
    researchStore: {
      listResearchMetadata: () => [{ id: 'q1', clientId: 'client-1', question: 'Q', answerLength: 500, referenceCount: 2, isAnswerComplete: true }],
      listResearch: () => [{ id: 'q1', answerText: 'body', references: [{ title: 'R', url: 'https://example.com' }] }],
    },
    materialStore: { listMaterials: async () => [], getSelectedMaterials: async () => [] },
    templateStore: { listCatalog: () => ({ revision: 'r', platforms: [], templates: [], diagnostics: [] }) },
  });
  const item = service.listResearchMetadata('client-1')[0];
  assert.equal(item.answerText, undefined);
  assert.equal(item.references, undefined);
  assert.equal(item.answerLength, 500);
});
