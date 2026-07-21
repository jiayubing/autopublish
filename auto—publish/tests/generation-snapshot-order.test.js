const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const { pathToFileURL } = require("node:url");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

describe("generation runtime snapshot ordering", function() {
  it("accepts only newer events from the bootstrapped runtime", async function() {
    const { createGenerationRuntimeCursor } = await import(pathToFileURL(path.join(root, "media-workbench/src/generation-runtime-snapshot-logic.js")));
    const cursor = createGenerationRuntimeCursor();

    assert.equal(cursor.bootstrap({ runtimeId: "runtime-a", sequence: 4 }), true);
    assert.equal(cursor.accept({ runtimeId: "runtime-a", sequence: 5 }), true);
    assert.equal(cursor.accept({ runtimeId: "runtime-a", sequence: 4 }), false);
    assert.equal(cursor.accept({ runtimeId: "runtime-a", sequence: 5 }), false);
    assert.equal(cursor.accept({ runtimeId: "runtime-a", sequence: 3 }), false);
    assert.equal(cursor.accept({ runtimeId: "runtime-old", sequence: 99 }), false);
    assert.deepEqual(cursor.getState(), { runtimeId: "runtime-a", sequence: 5 });
  });

  it("switches runtime only through a newer bootstrap snapshot", async function() {
    const { createGenerationRuntimeCursor } = await import(pathToFileURL(path.join(root, "media-workbench/src/generation-runtime-snapshot-logic.js")));
    const cursor = createGenerationRuntimeCursor();

    cursor.bootstrap({ runtimeId: "runtime-a", sequence: 12 });
    assert.equal(cursor.bootstrap({ runtimeId: "runtime-a", sequence: 11 }), false);
    assert.equal(cursor.bootstrap({ runtimeId: "runtime-b", sequence: 0 }), true);
    assert.equal(cursor.accept({ runtimeId: "runtime-a", sequence: 13 }), false);
    assert.equal(cursor.accept({ runtimeId: "runtime-b", sequence: 1 }), true);
    assert.deepEqual(cursor.getState(), { runtimeId: "runtime-b", sequence: 1 });
  });
});
