const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
function moduleSpecifiers(source) {
  return [
    ...source.matchAll(/\brequire\s*\(\s*["']([^"']+)["']\s*\)/g),
    ...source.matchAll(/\bfrom\s*["']([^"']+)["']/g),
    ...source.matchAll(/\bimport\s*["']([^"']+)["']/g),
  ].map((match) => match[1]);
}

test("attention readers and workspace runtime keep exact dependency boundaries", () => {
  const forbiddenReaderDependency =
    /^(?:node:fs|fs|\.\.\/\.\.\/src\/infrastructure|\.\/.*(?:store|writer)|\.\.\/.*(?:store|writer))/;
  for (const relative of [
    "desktop/services/article-attention-query.js",
    "desktop/services/article-attention-resolver.js",
  ]) {
    for (const specifier of moduleSpecifiers(read(relative)))
      assert.doesNotMatch(specifier, forbiddenReaderDependency, relative);
  }
  assert.ok(
    moduleSpecifiers(read("desktop/main.js")).includes("./workspace-runtime"),
  );
  assert.ok(
    moduleSpecifiers(read("desktop/workspace-runtime.js")).includes(
      "./workspace-data-invalidation",
    ),
  );
  assert.equal(
    fs.existsSync(path.join(root, "desktop/services/workspace-runtime.js")),
    false,
  );
  assert.equal(
    fs.existsSync(path.join(root, "desktop/workspace-invalidation-policy.js")),
    false,
  );
});

test("business views use domain bridges instead of Electron transport or main-process files", () => {
  const businessViews = [
    "media-workbench/src/components/PlatformWorkbench.tsx",
    "media-workbench/src/components/content/GeneratedArticlesView.tsx",
    "media-workbench/src/components/content/BatchGenerationView.tsx",
  ];
  const directTransport =
    /window\.desktopConsole|ipcRenderer|desktop[\\/]main\.js|desktop[\\/]ipc[\\/]|desktop[\\/]services[\\/]/;
  const directChannel =
    /(?:auth|content|media|platforms|publication|workspace|orders):[a-z0-9-]+/;

  for (const relative of businessViews) {
    const source = read(relative);
    assert.doesNotMatch(source, directTransport, relative);
    assert.doesNotMatch(source, directChannel, relative);
  }
});

test("application services do not depend on IPC contracts or transport registry", () => {
  const servicesRoot = path.join(root, "desktop/services");
  const forbidden = /(?:^|[\\/])ipc[\\/]contracts(?:[\\/]|$)/;

  for (const file of fs.readdirSync(servicesRoot)) {
    if (!file.endsWith(".js")) continue;
    const relative = `desktop/services/${file}`;
    for (const specifier of moduleSpecifiers(read(relative)))
      assert.doesNotMatch(specifier, forbidden, relative);
  }
});

test("article management capability has one service-to-IPC-to-feature assembly path", () => {
  const {
    productionIpcRegistry,
  } = require("../desktop/ipc/contracts/production-registry");
  assert.equal(
    productionIpcRegistry.byCapability("content.getArticleManagementSnapshot")
      .channel,
    "content:get-article-management-snapshot",
  );
  assert.ok(
    moduleSpecifiers(read("desktop/ipc/article-management-ipc.js")).includes(
      "../services/article-management-snapshot",
    ),
  );
  assert.ok(
    moduleSpecifiers(
      read("media-workbench/src/components/ContentWorkbench.tsx"),
    ).includes("../features/content/use-content-workbench-feature"),
  );
});

test("electron transport facade is gone and domains own their bridge seams", () => {
  assert.equal(
    fs.existsSync(path.join(root, "media-workbench/src/electron-api.ts")),
    false,
  );
  assert.equal(
    fs.existsSync(
      path.join(root, "media-workbench/src/bridge/transport-legacy.ts"),
    ),
    false,
  );
  for (const file of fs.readdirSync(
    path.join(root, "media-workbench/src/bridge"),
  )) {
    if (!file.endsWith(".ts")) continue;
    assert.doesNotMatch(
      read(`media-workbench/src/bridge/${file}`),
      /electron-api/,
    );
  }
  assert.doesNotMatch(
    read("media-workbench/src/bridge/platform.ts"),
    /submitPlatformSelection|submitSelected/,
  );
  assert.match(
    read("media-workbench/src/bridge/workspace.ts"),
    /getWorkspaceBootstrapState/,
  );
  assert.match(
    read("media-workbench/src/bridge/auth.ts"),
    /onAuthStateChanged/,
  );
  assert.match(
    read("media-workbench/src/bridge/settings.ts"),
    /saveAiProviderConfig/,
  );
  assert.match(
    read("media-workbench/src/bridge/publication.ts"),
    /prepareRegularUncertainResolution/,
  );
  assert.doesNotMatch(
    read("media-workbench/src/bridge/content.ts"),
    /transport-legacy/,
  );
  assert.doesNotMatch(
    read("media-workbench/src/bridge/media.ts"),
    /transport-legacy/,
  );
  assert.doesNotMatch(
    read("media-workbench/src/bridge/content.ts"),
    /\b(?:type ContentCommand|callContent\s*\(|api\?\.\[method\])/,
  );
  assert.doesNotMatch(
    read("media-workbench/src/bridge/media.ts"),
    /api\?\.\[method\]|callMedia\s*\(/,
  );
});
