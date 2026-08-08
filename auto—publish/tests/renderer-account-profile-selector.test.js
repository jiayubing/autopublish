const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const loader = pathToFileURL(path.join(root, 'media-workbench', 'node_modules', 'tsx', 'dist', 'loader.mjs')).href;

test('account profile selector handles rejected commands without an unhandled rejection', () => {
  execFileSync(process.execPath, ['--import', loader, '--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { confirmAccountProfileSelection } from './media-workbench/src/components/content/AccountProfileSelector.tsx';
    const unhandled = [];
    process.on('unhandledRejection', (reason) => unhandled.push(reason));
    let changed = 0;
    const accepted = await confirmAccountProfileSelection({
      feature: { confirmAccountProfile: async () => { throw new Error('fixture rejected'); } },
      platformId: 'toutiao',
      displayName: '失败账号',
      onChange: () => { changed += 1; },
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(accepted, false);
    assert.equal(changed, 0);
    assert.equal(unhandled.length, 0);
  `], { cwd: root, stdio: 'pipe' });
});
