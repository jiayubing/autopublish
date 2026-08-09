const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  mapRuntimeCapabilityState,
} = require("../media-workbench/src/runtime-capability-state.cjs");

describe("renderer settings contract", function () {
  it("maps all runtime capability states without treating not_checked as unavailable", function () {
    assert.deepEqual(mapRuntimeCapabilityState({ state: "ready" }), {
      label: "\u53ef\u7528",
      tone: "ready",
    });
    assert.deepEqual(mapRuntimeCapabilityState({ state: "not_checked" }), {
      label: "\u672a\u68c0\u6d4b",
      tone: "not_checked",
    });
    assert.deepEqual(
      mapRuntimeCapabilityState({ state: "optional_unconfigured" }),
      {
        label:
          "\u672a\u914d\u7f6e\uff08\u4ec5\u5f71\u54cd\u6cb3\u7554\u6295\u7a3f\uff09",
        tone: "optional",
      },
    );
    assert.deepEqual(mapRuntimeCapabilityState({ state: "unavailable" }), {
      label: "\u4e0d\u53ef\u7528",
      tone: "unavailable",
    });
  });
});
