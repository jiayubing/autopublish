const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const rendererRoot = path.resolve(__dirname, "..", "media-workbench", "src");
const rendererFiles = [
  "App.tsx",
  "components/ArticleEditor.tsx",
  "components/ResourceLibrary.tsx",
  "components/OrdersView.tsx",
  "components/PlatformWorkbench.tsx",
  "components/content/GeneratedArticlesView.tsx"
];

const mojibakeFragments = [
  "婵犳鍨辩敮濠勭礊",
  "闁荤姍鍐仾缂?",
  "濠殿垱甯婄紞",
  "閻犙冨缁?",
  "闁硅埖娲滈…",
  "闁稿繑婀圭划顒勭嵁閸愭彃閰?",
  "闁告帡鏀遍弻",
  "鐎瑰憡褰冨﹢顏勑ч悩杈幀",
  "闁告梻濮撮崣鍡椥?",
  "濞戞挸锕ｇ粩瀛樸亜",
  "濞戞挸顑勭粩瀛樸亜"
];

function readRendererFile(file) {
  return fs.readFileSync(path.join(rendererRoot, file), "utf8");
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

  it("keeps expected Chinese labels readable in React renderer files", function() {
    assert.match(readRendererFile("components/Sidebar.tsx"), /付费媒体投稿|其他平台投稿|投稿订单记录/);
    assert.match(readRendererFile("components/ResourceLibrary.tsx"), /媒体资源池|搜索资源名称/);
    assert.match(readRendererFile("components/OrdersView.tsx"), /暂无订单记录|已发布/);
    assert.match(readRendererFile("components/PlatformWorkbench.tsx"), /其他平台投稿/);
  });
});
