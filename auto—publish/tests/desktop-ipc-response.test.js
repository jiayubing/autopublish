const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { ok, fail, wrap } = require("../desktop/services/ipc-response");

describe("ipc-response", function() {
  it("wraps successful data", function() {
    assert.deepStrictEqual(ok({ count: 2 }), { ok: true, data: { count: 2 } });
  });

  it("wraps errors without stack traces", function() {
    assert.deepStrictEqual(fail(new Error("bad input")), { ok: false, error: { code: "IPC_ERROR", message: "bad input" } });
  });

  it("wraps async handlers", async function() {
    const result = await wrap(async function() {
      return { total: 1 };
    });
    assert.deepStrictEqual(result, { ok: true, data: { total: 1 } });
  });

  it("wraps async handler failures", async function() {
    const result = await wrap(async function() {
      throw new Error("boom");
    });
    assert.deepStrictEqual(result, { ok: false, error: { code: "IPC_ERROR", message: "boom" } });
  });

  it("preserves stable error codes", function() {
    const error = new Error("bad input");
    error.code = "CONTENT_INPUT_INVALID";
    assert.deepStrictEqual(fail(error), { ok: false, error: { code: "CONTENT_INPUT_INVALID", message: "bad input" } });
  });
});
