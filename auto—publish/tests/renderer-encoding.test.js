const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const rendererDir = path.resolve(__dirname, "..", "desktop", "renderer");
const rendererFiles = [
  "index.html",
  "app.js",
  "media-workbench.js",
  "media-resource-library.js",
  "media-orders-drawer.js",
  "platform-workbench.js",
  "shared/confirm.js",
  "shared/dom.js",
  "shared/drawer.js"
];

const mojibakeFragments = [
  "婵帊缍",
  "鐠у嫭绨",
  "濯掍綋",
  "璧勬簮",
  "鎶曠",
  "鍏朵粬骞冲彴",
  "鍒锋柊",
  "宸插湪姹犱腑",
  "鍔犲叆姹",
  "涓婁竴椤",
  "涓嬩竴椤",
  "鎼滅储",
  "鍚屾",
  "寰呭鏍",
  "瀹℃牳涓",
  "宸插彂甯",
  "椹冲洖",
  "閫€娆",
  "鐘舵€"
];

function readRendererFile(file) {
  return fs.readFileSync(path.join(rendererDir, file), "utf8");
}

function assertReadableLabels(text, labels, file) {
  labels.forEach(function(label) {
    assert.match(text, new RegExp(label), file + " is missing readable label: " + label);
  });
}

describe("renderer encoding", function() {
  it("has no replacement characters or known mojibake fragments", function() {
    rendererFiles.forEach(function(file) {
      const text = readRendererFile(file);
      assert.equal(text.includes("\uFFFD"), false, file + " contains replacement characters");
      mojibakeFragments.forEach(function(fragment) {
        assert.equal(text.includes(fragment), false, file + " contains mojibake fragment: " + fragment);
      });
    });
  });

  it("keeps expected Chinese labels readable in key renderer files", function() {
    assertReadableLabels(readRendererFile("index.html"), [
      "媒体投稿",
      "其他平台"
    ], "index.html");

    assertReadableLabels(readRendererFile("media-workbench.js"), [
      "拉取资源库（较慢，约需数分钟）",
      "查询余额"
    ], "media-workbench.js");

    assertReadableLabels(readRendererFile("media-resource-library.js"), [
      "媒体池",
      "资源库",
      "上一页",
      "下一页",
      "搜索媒体名称"
    ], "media-resource-library.js");

    assertReadableLabels(readRendererFile("media-orders-drawer.js"), [
      "投稿订单",
      "暂无订单",
      "同步中...",
      "已同步",
      "待审核",
      "审核中",
      "已发布",
      "驳回",
      "退款"
    ], "media-orders-drawer.js");
  });
});
