const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

describe('renderer workbench controller seams', () => {
  it('keeps platform selection, request identity, and terminal refresh in a renderer controller', () => {
    const controller = read('media-workbench/src/hooks/use-platform-workbench-controller.ts');
    const view = read('media-workbench/src/components/PlatformWorkbench.tsx');
    assert.match(controller, /activeRequestRef/);
    assert.match(controller, /refreshQueue\('submit-terminal'\)/);
    assert.match(controller, /setSelectedArticles/);
    assert.match(view, /usePlatformWorkbenchController/);
  });

  it('loads article-management snapshots through a client-scoped request identity hook', () => {
    const hook = read('media-workbench/src/hooks/use-article-management-snapshot.ts');
    const view = read('media-workbench/src/components/content/GeneratedArticlesView.tsx');
    assert.match(hook, /useRequestIdentity\(clientId\)/);
    assert.match(hook, /if \(isCurrent\(\)\)/);
    assert.match(view, /useArticleManagementSnapshot\(clientId, refreshToken,/);
  });
});
