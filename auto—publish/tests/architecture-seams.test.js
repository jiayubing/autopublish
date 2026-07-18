const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('attention and workspace seams keep ownership and dependency direction explicit', () => {
  const query = read('desktop/services/article-attention-query.js');
  const resolver = read('desktop/services/article-attention-resolver.js');
  const workspace = read('media-workbench/src/workspace-data-store.tsx');
  const main = read('desktop/main.js');
  const sidebar = read('media-workbench/src/components/Sidebar.tsx');
  const platform = read('media-workbench/src/components/PlatformWorkbench.tsx');

  assert.doesNotMatch(query, /writeFile|writeFileSync|unlink|unlinkSync|\.save\(/);
  assert.doesNotMatch(resolver, /writeFile|writeFileSync|unlink|unlinkSync|\.save\(/);
  assert.match(query, /list\(input\)/);
  assert.match(query, /get\(input\)/);
  assert.match(resolver, /preview\(input\)/);
  assert.match(resolver, /resolve\(input\)/);
  assert.match(workspace, /getSnapshot\(scope/);
  assert.match(workspace, /refresh\(scope/);
  assert.match(workspace, /subscribe\(scope/);
  assert.doesNotMatch(sidebar, /getPlatformQueue\(/);
  assert.doesNotMatch(platform, /getPlatformQueue\(/);
  assert.doesNotMatch(query, /React|Renderer|window\./);
  assert.doesNotMatch(resolver, /React|Renderer|window\./);
  assert.match(main, /workspace:data-invalidated/);
  assert.match(main, /revision:/);
  assert.match(main, /scopes:/);
  assert.match(main, /reasonCode:/);
});
