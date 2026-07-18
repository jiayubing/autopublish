const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createTemplateCatalog } = require("../src/content/template-catalog");

function tempDirectory() { return fs.mkdtempSync(path.join(os.tmpdir(), "auto-publish-template-catalog-")); }
function write(root, relative, content) { const filename = path.join(root, relative); fs.mkdirSync(path.dirname(filename), { recursive: true }); fs.writeFileSync(filename, content, "utf8"); }

describe("template catalog", () => {
  it("discovers a v2 template from its path with body-only content", () => {
    const root = tempDirectory();
    try {
      write(root, "templates/new-platform/first-template.md", "根据客户资料生成一篇可直接发布的实用攻略。\n");
      const catalog = createTemplateCatalog(root, { builtinRoot: false }).listCatalog();
      assert.deepStrictEqual(catalog.platforms.map((item) => item.id), ["new-platform"]);
      assert.equal(catalog.templates[0].platform, "new-platform");
      assert.equal(catalog.templates[0].templateId, "first-template");
      assert.equal(catalog.templates[0].displayName, "first-template");
      assert.equal(catalog.templates[0].scenario, "first-template");
      assert.equal(catalog.templates[0].body, "根据客户资料生成一篇可直接发布的实用攻略。");
      assert.equal(Object.prototype.hasOwnProperty.call(catalog.templates[0], "sourcePath"), false);
      assert.equal(catalog.diagnostics.length, 0);
      assert.equal(createTemplateCatalog(root, { builtinRoot: false }).getTemplate({ platformId: "new-platform", templateId: "first-template" }).bodyHash, catalog.templates[0].bodyHash);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  it("accepts strict optional metadata and derives a platform description from platform.json", () => {
    const root = tempDirectory();
    try {
      write(root, "templates/city/platform.json", JSON.stringify({ displayName: "城市攻略", description: "本地服务", order: 20 }));
      write(root, "templates/city/guide.md", "---\ndisplayName: 周末攻略\ndescription: 适合门店\norder: 3\nenabled: true\n---\n写一篇周末攻略。\n");
      const result = createTemplateCatalog(root, { builtinRoot: false }).listCatalog();
      assert.deepStrictEqual(result.platforms[0], { id: "city", displayName: "城市攻略", description: "本地服务", order: 20, source: "custom" });
      assert.equal(result.templates[0].displayName, "周末攻略");
      assert.equal(result.templates[0].description, "适合门店");
      assert.equal(result.templates[0].order, 3);
      assert.equal(result.templates[0].enabled, true);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  it("isolates one invalid template and keeps other platforms usable", () => {
    const root = tempDirectory();
    try {
      write(root, "templates/good/guide.md", "有效正文\n");
      write(root, "templates/bad/broken.md", "---\nunknown: value\n---\n坏模板\n");
      const result = createTemplateCatalog(root, { builtinRoot: false }).listCatalog();
      assert.deepStrictEqual(result.templates.map((item) => item.platform), ["good"]);
      assert.equal(result.diagnostics.length, 1);
      assert.equal(result.diagnostics[0].platformId, "bad");
      assert.equal(result.diagnostics[0].code, "TEMPLATE_FRONT_MATTER_INVALID");
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  it("keeps legacy front matter compatible and rejects builtin/custom collisions without overwriting", () => {
    const root = tempDirectory();
    const builtin = tempDirectory();
    try {
      write(root, "templates/ctrip/legacy.md", "---\nplatform: ctrip\nscenario: 旧版\nname: legacy-id\n---\n旧版正文\n");
      write(root, "templates/ctrip/conflict.md", "---\nplatform: ctrip\nscenario: 冲突\nname: same-id\n---\n自定义正文\n");
      write(builtin, "ctrip/builtin.md", "---\nplatform: ctrip\nscenario: 内置\nname: same-id\n---\n内置正文\n");
      const result = createTemplateCatalog(root, { builtinRoot: builtin }).listCatalog();
      assert.equal(result.templates.some((item) => item.templateId === "legacy-id"), true);
      assert.equal(result.templates.some((item) => item.templateId === "same-id"), false);
      assert.equal(result.diagnostics.some((item) => item.code === "TEMPLATE_ID_CONFLICT"), true);
    } finally { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(builtin, { recursive: true, force: true }); }
  });

  it("changes revision when a valid body changes", () => {
    const root = tempDirectory();
    try {
      write(root, "templates/one/guide.md", "正文一\n");
      const first = createTemplateCatalog(root, { builtinRoot: false }).listCatalog();
      write(root, "templates/one/guide.md", "正文二\n");
      const second = createTemplateCatalog(root, { builtinRoot: false }).listCatalog();
      assert.notEqual(first.revision, second.revision);
      assert.notEqual(first.templates[0].bodyHash, second.templates[0].bodyHash);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  it("diagnoses duplicate platform display names without merging ids", () => {
    const root = tempDirectory();
    try {
      write(root, "templates/xhs/platform.json", JSON.stringify({ displayName: "小红书" }));
      write(root, "templates/xhs/guide.md", "小红书正文\n");
      write(root, "templates/xiaohongshu/platform.json", JSON.stringify({ displayName: "小红书" }));
      write(root, "templates/xiaohongshu/guide.md", "另一平台正文\n");
      const result = createTemplateCatalog(root, { builtinRoot: false }).listCatalog();
      assert.deepStrictEqual(result.platforms.map((item) => item.id).sort(), ["xhs", "xiaohongshu"]);
      assert.equal(result.diagnostics.some((item) => item.code === "TEMPLATE_PLATFORM_DISPLAY_NAME_DUPLICATE"), true);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
});
