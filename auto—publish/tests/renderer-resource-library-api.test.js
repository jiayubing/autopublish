const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(file) {
  return fs.readFileSync(path.resolve(__dirname, "..", file), "utf8");
}

describe("React renderer resource library api", function() {
  it("uses the paged media service methods directly", function() {
    const app = read("media-workbench/src/App.tsx");
    const api = read("media-workbench/src/bridge/media.ts");
    const feature = read("media-workbench/src/features/media/media-feature.js");
    const hook = read("media-workbench/src/features/media/use-media-feature.ts");
    const library = read("media-workbench/src/components/ResourceLibrary.tsx");
    assert.match(app, /useMediaFeature/);
    assert.match(hook, /useSyncExternalStore/);
    assert.match(feature, /DEFAULT_RESOURCE_PAGE_SIZE = 50/);
    assert.match(feature, /loadResourcePage/);
    assert.match(feature, /searchResources/);
    assert.match(library, /onResourceSearch/);
    assert.match(library, /onResourcePageChange/);
    assert.match(api, /getResourcePage/);
    assert.match(api, /searchResourcePage/);
    assert.doesNotMatch(app, /getResourcePage|searchResourcePage|pageSize:\s*99999/);
    assert.doesNotMatch(app, /listResources|getCachedResources/);
    assert.doesNotMatch(api, /listResources|getCachedResources|searchResources/);
  });

  it("keeps orders as a durable projection without a local clear command", function() {
    const app = read("media-workbench/src/App.tsx");
    const orders = read("media-workbench/src/components/OrdersView.tsx");
    assert.doesNotMatch(app, /handleClearOrders|setOrders\(\[\]\)|onClearOrders/);
    assert.doesNotMatch(orders, /清空记录|onClearOrders|Trash2/);
    assert.match(orders, /onSyncOrder/);
  });

  it("does not expose a fake local media creation action without a typed capability", function() {
    const app = read("media-workbench/src/App.tsx");
    const library = read("media-workbench/src/components/ResourceLibrary.tsx");
    const feature = read("media-workbench/src/features/media/media-feature.js");
    assert.doesNotMatch(app, /onAddResource/);
    assert.doesNotMatch(library, /onAddResource|showAddForm|RES-\$\{|添加媒体|录入新媒体资源/);
    assert.doesNotMatch(feature, /addSelectedResource/);
  });
});
