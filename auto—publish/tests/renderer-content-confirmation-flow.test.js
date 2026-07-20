const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

describe('renderer content confirmation flow', () => {
  it('uses an observable in-app dialog for queue and cancel, never a native dialog', () => {
    const view = read('media-workbench/src/components/content/GeneratedArticlesView.tsx');
    const queue = view.slice(view.indexOf('async function queueSelected'), view.indexOf('\n  function openArticle'));
    const cancel = view.slice(view.indexOf('async function cancelCancelableBatches'), view.indexOf('\n  async function cleanupFailedBatches'));
    assert.match(read('media-workbench/src/components/content/ActionConfirmationModal.tsx'), /role="dialog"/);
    assert.match(queue, /title: '确认加入投稿队列'/);
    assert.match(cancel, /title: '确认撤销未开始投稿'/);
    assert.doesNotMatch(queue, /window\.confirm/);
    assert.doesNotMatch(cancel, /window\.confirm/);
  });

  it('does not auto-accept native dialogs in content queue regression tests', () => {
    const clientSwitch = read('tests/renderer-content-client-switch.test.js');
    assert.doesNotMatch(clientSwitch, /page\.on\("dialog"/);
    assert.match(clientSwitch, /getByRole\("dialog", \{ name: "确认加入投稿队列" \}\)/);
    assert.match(clientSwitch, /getByRole\("dialog", \{ name: "确认撤销未开始投稿" \}\)/);
  });
});
