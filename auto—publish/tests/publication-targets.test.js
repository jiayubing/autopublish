const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { resolvePublicationTarget } = require("../src/publication/publication-targets");

describe("publication target resolution", function() {
  it("resolves ordinary platforms at platform granularity", function() {
    assert.deepEqual(resolvePublicationTarget({ platformId: "lieju" }), {
      kind: "platform",
      platformId: "lieju",
      mediaResourceId: null,
      resourceId: null,
      targetKey: "platform:lieju"
    });
  });

  it("resolves each paid media resource as an independent target", function() {
    const target = resolvePublicationTarget({ mediaResourceId: "1001" });
    assert.equal(target.kind, "resource");
    assert.equal(target.platformId, "media");
    assert.equal(target.mediaResourceId, "1001");
    assert.equal(target.targetKey, "media-resource:1001");
  });

  it("rejects undeclared platforms and unsafe identifiers", function() {
    assert.throws(() => resolvePublicationTarget({ platformId: "unknown" }), { code: "PUBLICATION_PLATFORM_UNDECLARED" });
    assert.throws(() => resolvePublicationTarget({ platformId: "lieju/other" }), { code: "PUBLICATION_PLATFORM_UNDECLARED" });
    assert.throws(() => resolvePublicationTarget({ mediaResourceId: "1001/2" }), { code: "PUBLICATION_MEDIA_RESOURCE_ID_INVALID" });
    assert.throws(() => resolvePublicationTarget({ platformId: "" }), { code: "PUBLICATION_TARGET_REQUIRED" });
  });
});
