const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, 'media-workbench/src', file), 'utf8');

describe('renderer article management workflow seam', () => {
  it('exposes visible stage tabs and an attention entry without replacing the existing editor flow', () => {
    const content = read('components/ContentWorkbench.tsx');
    const list = read('components/content/GeneratedArticlesView.tsx');
    assert.match(content, /文章流程阶段/);
    assert.match(content, /role="tab"/);
    assert.match(content, /articleStageFilter/);
    assert.match(list, /deriveArticleWorkflow/);
    assert.match(list, /打开需处理/);
    assert.match(content, /GeneratedArticleEditorPanel/);
  });
});
