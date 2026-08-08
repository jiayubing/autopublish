const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

describe('renderer content confirmation flow', () => {
  it('uses the shared FIFO confirmation seam for destructive content actions, never a native dialog', () => {
    const view = read('media-workbench/src/components/content/GeneratedArticlesView.tsx');
    const workbench = read('media-workbench/src/components/ContentWorkbench.tsx');
    const editor = read('media-workbench/src/components/content/GeneratedArticleEditorPanel.tsx');
    const queue = view.slice(view.indexOf('async function queueSelected'), view.indexOf('\n  async function removePendingSelected'));
    const cancel = view.slice(view.indexOf('async function cancelCancelableBatches'), view.indexOf('\n  async function previewTrashSelections'));
    [view, workbench, editor].forEach((source) => {
      assert.match(source, /useConfirmation/);
      assert.match(source, /const \{ confirm \} = useConfirmation\(\)/);
      assert.doesNotMatch(source, /ActionConfirmationModal|pendingConfirmation|confirmationActionRef|window\.confirm/);
    });
    assert.match(queue, /title: ["']确认加入普通平台队列["']/);
    assert.match(cancel, /title: ["']确认撤销未开始投稿["']/);
    const host = read('media-workbench/src/components/ConfirmationHost.tsx');
    assert.match(host, /ConfirmationHost/);
    assert.match(host, /queueRef\.current\.push/);
  });

  it('does not auto-accept native dialogs in content queue regression tests', () => {
    const clientSwitch = read('tests/renderer-content-client-switch.test.js');
    assert.doesNotMatch(clientSwitch, /page\.on\("dialog"/);
    assert.match(clientSwitch, /getByRole\("dialog", \{ name: "确认加入普通平台队列" \}\)/);
    assert.match(clientSwitch, /getByRole\("dialog", \{ name: "确认撤销未开始投稿" \}\)/);
  });
});
