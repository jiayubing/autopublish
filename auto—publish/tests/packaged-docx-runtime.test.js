const assert = require("node:assert/strict");
const path = require("node:path");
const { it } = require("node:test");
const { verifyPackagedRuntime, createMinimalDocx } = require("../scripts/verify-packaged-docx-runtime");

it("parses and caches a real DOCX through the packaged client material store", async function() {
  const result = await verifyPackagedRuntime(path.resolve(__dirname, ".."));
  assert.equal(result.status, "ready");
  assert.equal(result.cacheHit, true);
  assert.ok(result.characterCount > 0);
});

it("fails safely when the packaged DOCX is damaged", async function() {
  await assert.rejects(verifyPackagedRuntime(path.resolve(__dirname, ".."), { docxBuffer: Buffer.from("damaged zip") }), function(error) {
    return error.code === "PACKAGED_DOCX_RUNTIME_FAILED";
  });
  assert.ok(createMinimalDocx().length > 100);
});
