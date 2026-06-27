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
  "濠殿垱甯婄紞",
  "閻犙冨缁",
  "婵帊缍",
  "鐠у嫭绨",
  "閹舵洜顭",
  "閸忔湹绮獮鍐插酱",
  "閸掗攱鏌",
  "瀹告彃婀Ч鐘辫厬",
  "閸旂姴鍙嗗Ч",
  "娑撳﹣绔存い",
  "娑撳绔存い",
  "閹兼粎鍌",
  "閸氬本顒",
  "瀵板懎顓搁弽",
  "鐎光剝鐗虫稉",
  "瀹告彃褰傜敮",
  "妞瑰啿娲",
  "闁偓濞",
  "閻樿埖鈧"
];

function readRendererFile(file) {
  return fs.readFileSync(path.join(rendererDir, file), "utf8");
}

function assertReadableLabels(text, labels, file) {
  labels.forEach(function(label) {
    assert.equal(text.includes(label), true, file + " is missing readable label: " + label);
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
