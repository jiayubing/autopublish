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
  const workspaceRuntime = read('desktop/services/workspace-runtime.js');
  const invalidationPolicy = read('desktop/workspace-invalidation-policy.js');
  const invalidation = read('desktop/workspace-data-invalidation.js');
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
  assert.match(main, /createWorkspaceRuntime/);
  assert.match(workspaceRuntime, /createWorkspaceInvalidator/);
  assert.match(workspaceRuntime, /registerIpc/);
  assert.match(workspaceRuntime, /disposeServices/);
  assert.match(invalidationPolicy, /workspace:data-invalidated/);
  assert.match(invalidationPolicy, /revision/);
  assert.match(invalidationPolicy, /scopes/);
  assert.match(invalidationPolicy, /reasonCode/);
  assert.match(invalidation, /workspace:data-invalidated/);
  assert.match(invalidation, /\{ revision, scopes, reasonCode:/);
  assert.match(invalidation, /reasonCode:/);
});

test('business views use domain bridges instead of Electron transport or main-process files', () => {
  const businessViews = [
    'media-workbench/src/components/PlatformWorkbench.tsx',
    'media-workbench/src/components/content/GeneratedArticlesView.tsx',
    'media-workbench/src/components/content/BatchGenerationView.tsx',
  ];
  const directTransport = /window\.desktopConsole|ipcRenderer|desktop[\\/]main\.js|desktop[\\/]ipc[\\/]|desktop[\\/]services[\\/]/;
  const directChannel = /(?:auth|content|media|platforms|publication|workspace|orders):[a-z0-9-]+/;

  for (const relative of businessViews) {
    const source = read(relative);
    assert.doesNotMatch(source, directTransport, relative);
    assert.doesNotMatch(source, directChannel, relative);
  }
});

test('article management owns one revisioned snapshot seam', () => {
  const snapshot = read('desktop/services/article-management-snapshot.js');
  const ipc = read('desktop/ipc/article-management-ipc.js');
  const view = read('media-workbench/src/components/content/GeneratedArticlesView.tsx');

  assert.match(snapshot, /clientId.*revision/);
  assert.match(snapshot, /cancellationPlans/);
  assert.match(snapshot, /workflowByArticle/);
  assert.match(ipc, /content:get-article-management-snapshot/);
  assert.match(view, /getArticleManagementSnapshot/);
  assert.doesNotMatch(view, /listContentArticles\(|listContentSubmissionBatches\(|listContentTrash\(|listPublicationHistory\(|previewCancelContentSubmissionBatch\(/);
});

test('electron transport facade is gone and domains own their bridge seams', () => {
  assert.equal(fs.existsSync(path.join(root, 'media-workbench/src/electron-api.ts')), false);
  assert.equal(fs.existsSync(path.join(root, 'media-workbench/src/bridge/transport-legacy.ts')), false);
  for (const file of fs.readdirSync(path.join(root, 'media-workbench/src/bridge'))) {
    if (!file.endsWith('.ts')) continue;
    assert.doesNotMatch(read(`media-workbench/src/bridge/${file}`), /electron-api/);
  }
  assert.match(read('media-workbench/src/bridge/platform.ts'), /submitPlatformSelection/);
  assert.match(read('media-workbench/src/bridge/workspace.ts'), /getWorkspaceBootstrapState/);
  assert.match(read('media-workbench/src/bridge/auth.ts'), /onAuthStateChanged/);
  assert.match(read('media-workbench/src/bridge/settings.ts'), /saveAiProviderConfig/);
  assert.match(read('media-workbench/src/bridge/publication.ts'), /reconcilePublicationHistory/);
  assert.doesNotMatch(read('media-workbench/src/bridge/content.ts'), /transport-legacy/);
  assert.doesNotMatch(read('media-workbench/src/bridge/media.ts'), /transport-legacy/);
  assert.match(read('media-workbench/src/bridge/content.ts'), /async function callContent/);
  assert.match(read('media-workbench/src/bridge/media.ts'), /async function callMedia/);
});
