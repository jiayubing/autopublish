const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, 'media-workbench/src', file), 'utf8');

describe('renderer platform queue refresh seam', () => {
  it('uses the shared snapshot and refreshes after terminal submission states', () => {
    const platform = read('components/PlatformWorkbench.tsx');
    const controller = read('hooks/use-platform-workbench-controller.ts');
    const app = read('App.tsx');
    const sidebar = read('components/Sidebar.tsx');
    assert.match(platform, /usePlatformQueue/);
    assert.match(controller, /refreshQueue\('submit-terminal'\)/);
    assert.doesNotMatch(platform, /getPlatformQueue\(/);
    assert.doesNotMatch(platform, /setQueue\(/);
    assert.match(app, /WorkspaceDataProvider/);
    assert.match(sidebar, /deriveNavigationSummary/);
    assert.match(sidebar, /item\.badge > 0/);
    assert.match(platform, /远端已发布，本地归档待处理/);
  });
});
