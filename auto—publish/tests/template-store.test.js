const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { listTemplates, getTemplate } = require("../src/content/template-store");

describe("template store", function() {
  let root;
  let ctripDirectory;
  let toutiaoDirectory;

  beforeEach(function() {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "template-store-"));
    ctripDirectory = path.join(root, "templates", "ctrip");
    toutiaoDirectory = path.join(root, "templates", "toutiao");
    fs.mkdirSync(ctripDirectory, { recursive: true });
    fs.mkdirSync(toutiaoDirectory, { recursive: true });
    fs.writeFileSync(path.join(ctripDirectory, "榜单.md"), "---\nplatform: ctrip\nscenario: 榜单\nname: ctrip_rank\n---\n根据客户资料写榜单内容。\n");
    fs.writeFileSync(path.join(ctripDirectory, "探店攻略.md"), "---\nplatform: ctrip\nscenario: 探店攻略\nname: ctrip_explore\n---\n根据客户资料写探店攻略。\n");
    fs.writeFileSync(path.join(toutiaoDirectory, "资讯.md"), "---\nplatform: toutiao\nscenario: 资讯\nname: toutiao_news\n---\n写资讯内容。\n");
  });

  afterEach(function() { fs.rmSync(root, { recursive: true, force: true }); });

  it("lists multiple Chinese templates for one platform and selects by exact id", function() {
    const templates = listTemplates(root, "ctrip");
    assert.deepStrictEqual(templates.map(function(template) { return template.id; }).sort(), ["ctrip_explore", "ctrip_rank"]);
    assert.equal(getTemplate(root, "ctrip", "ctrip_rank").scenario, "榜单");
    assert.equal(getTemplate(root, "ctrip", "ctrip_explore").body, "根据客户资料写探店攻略。");
  });

  it("lists templates independently for a second platform", function() {
    assert.deepStrictEqual(listTemplates(root, "toutiao").map(function(template) { return template.platform; }), ["toutiao"]);
    assert.throws(function() { getTemplate(root, "ctrip", "toutiao_news"); }, function(error) { return error.code === "TEMPLATE_NOT_FOUND"; });
  });

  it("rejects duplicate template names within one platform", function() {
    fs.writeFileSync(path.join(ctripDirectory, "duplicate.md"), "---\nplatform: ctrip\nscenario: 重复场景\nname: ctrip_rank\n---\n重复模板。\n");
    assert.throws(function() { listTemplates(root, "ctrip"); }, function(error) { return error.code === "TEMPLATE_DUPLICATE_ID"; });
    assert.throws(function() { getTemplate(root, "ctrip", "ctrip_rank"); }, function(error) { return error.code === "TEMPLATE_DUPLICATE_ID"; });
  });

  it("rejects missing front matter, required fields, platform mismatches, and empty bodies", function() {
    const cases = [
      ["no-front-matter.md", "正文", "TEMPLATE_FRONT_MATTER_REQUIRED"],
      ["invalid-front-matter.md", "---\nplatform ctrip\n---\n正文", "TEMPLATE_FRONT_MATTER_INVALID"],
      ["missing-platform.md", "---\nscenario: 场景\nname: id\n---\n正文", "TEMPLATE_FIELD_MISSING"],
      ["missing-scenario.md", "---\nplatform: ctrip\nname: id\n---\n正文", "TEMPLATE_FIELD_MISSING"],
      ["missing-name.md", "---\nplatform: ctrip\nscenario: 场景\n---\n正文", "TEMPLATE_FIELD_MISSING"],
      ["wrong-platform.md", "---\nplatform: toutiao\nscenario: 场景\nname: wrong\n---\n正文", "TEMPLATE_PLATFORM_MISMATCH"],
      ["empty-body.md", "---\nplatform: ctrip\nscenario: 空\nname: empty\n---\n  \n", "TEMPLATE_BODY_EMPTY"]
    ];
    cases.forEach(function(item) {
      fs.writeFileSync(path.join(ctripDirectory, item[0]), item[1]);
      assert.throws(function() { listTemplates(root, "ctrip"); }, function(error) { return error.code === item[2]; });
      fs.unlinkSync(path.join(ctripDirectory, item[0]));
    });
  });

  it("rejects platform and template path traversal", function() {
    assert.throws(function() { listTemplates(root, "../ctrip"); }, function(error) { return error.code === "TEMPLATE_INVALID_PLATFORM"; });
    assert.throws(function() { getTemplate(root, "ctrip", "../secret"); }, function(error) { return error.code === "TEMPLATE_INVALID_ID"; });
    assert.throws(function() { getTemplate(root, "ctrip", "missing"); }, function(error) { return error.code === "TEMPLATE_NOT_FOUND"; });
  });

  it("rejects a platform symlink resolving outside the real templates directory", function(t) {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "template-store-outside-"));
    const linkedDirectory = path.join(root, "templates", "linked");
    try {
      fs.writeFileSync(path.join(outside, "outside.md"), "---\nplatform: linked\nscenario: 外部\nname: outside\n---\n外部模板。\n");
      fs.symlinkSync(outside, linkedDirectory, "junction");
    } catch (error) {
      fs.rmSync(outside, { recursive: true, force: true });
      if (["EPERM", "EACCES", "ENOTSUP", "EINVAL"].includes(error.code)) {
        t.skip("symlinks or junctions are unavailable in this environment");
        return;
      }
      throw error;
    }
    try {
      assert.throws(function() { listTemplates(root, "linked"); }, function(error) { return error.code === "TEMPLATE_INVALID_PLATFORM"; });
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });
});
