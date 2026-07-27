const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, 'media-workbench/src', file), 'utf8');

describe('renderer article management workflow seam', () => {
  it('exposes visible stage tabs and a failure entry without replacing the existing editor flow', () => {
    const content = read('components/ContentWorkbench.tsx');
    const list = read('components/content/GeneratedArticlesView.tsx');
    const tabs = read('components/content/ArticleStageTabs.tsx');
    assert.match(tabs, /文章流程阶段/);
    assert.match(tabs, /role="tab"/);
    assert.match(content, /articleStageFilter/);
    assert.match(list, /snapshotWorkflowByArticle/);
    assert.match(list, /management:\s*ArticleManagementReadModel/);
    assert.match(content, /management[^\n]+content\.snapshot/);
    assert.match(content, /GeneratedArticlesView[^>]+management=\{management\}/);
    assert.doesNotMatch(list, /getArticleManagementSnapshot/);
    assert.match(list, /打开需处理/);
    assert.match(content, /GeneratedArticleEditorPanel/);
  });
});
