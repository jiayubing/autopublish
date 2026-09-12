const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { MediaResourceStore } = require("../src/platforms/media/media-resource-store");
const { createMediaResourceService } = require("../desktop/services/media-resource-service");

test("resource pages reuse a file version and observe replace, corruption and deletion", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "media-read-cache-"));
  const filePath = path.join(root, "resources.json");
  const store = new MediaResourceStore({ filePath });
  const writer = new MediaResourceStore({ filePath });
  const service = createMediaResourceService({ resourceStore: store, poolStore: {} });
  const originalRead = fs.readFileSync;
  let reads = 0;
  t.after(() => {
    fs.readFileSync = originalRead;
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith("media-read-cache-"));
    fs.rmSync(root, { recursive: true, force: true });
  });
  writer.setAll(Array.from({ length: 25 }, (_, i) => ({ resourceId: `r-${i}`, name: `Resource ${i}`, price: i })));
  fs.readFileSync = function(filename, ...args) {
    if (filename === filePath) reads++;
    return originalRead.call(fs, filename, ...args);
  };
  assert.equal(service.getCachedResourcePage({ page: 1, pageSize: 10 }).items.length, 10);
  const second = service.getCachedResourcePage({ page: 2, pageSize: 10 });
  assert.equal(second.items[0].name, "Resource 10");
  second.items[0].name = "caller changed";
  store.getAll().resources[0].name = "caller changed";
  assert.equal(store.getAll().resources[0].name, "Resource 0");
  assert.equal(reads, 1);
  writer.setAll([{ resourceId: "new", name: "Replacement", price: 1 }]);
  assert.equal(service.getCachedResourcePage({}).items[0].name, "Replacement");
  assert.equal(reads, 2);
  fs.writeFileSync(filePath, "broken-json");
  assert.throws(() => store.getAll(), { code: "MEDIA_RESOURCE_STORE_CORRUPT" });
  writer.clear();
  assert.equal(store.getAll(), null);
});
