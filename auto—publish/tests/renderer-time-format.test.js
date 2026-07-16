const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

async function loadFormatter() {
  const filename = path.resolve(__dirname, "../media-workbench/src/time-format.ts");
  const source = fs.readFileSync(filename, "utf8");
  return import("data:text/javascript," + encodeURIComponent(source));
}

describe("renderer Beijing time formatter", function() {
  it("formats the same UTC instant consistently as Beijing time", async function() {
    const { formatBeijingTime } = await loadFormatter();
    assert.equal(formatBeijingTime("2026-07-15T00:00:00.000Z"), "2026-07-15 08:00:00");
    assert.equal(formatBeijingTime("2026-01-02T16:05:06.000Z"), "2026-01-03 00:05:06");
  });

  it("handles invalid, missing, and legacy UTC-like values safely", async function() {
    const { formatBeijingTime } = await loadFormatter();
    assert.equal(formatBeijingTime(undefined), "未知时间");
    assert.equal(formatBeijingTime("not-a-date"), "未知时间");
    assert.equal(formatBeijingTime("2026-07-15 00:00:00"), "2026-07-15 08:00:00");
  });

  it("is used by the order history view for persisted timestamps", function() {
    const source = fs.readFileSync(path.resolve(__dirname, "../media-workbench/src/components/OrdersView.tsx"), "utf8");
    assert.match(source, /formatBeijingTime\(order\.submittedAt\)/);
    assert.match(source, /formatBeijingTime\(order\.publishedAt\)/);
  });
});
