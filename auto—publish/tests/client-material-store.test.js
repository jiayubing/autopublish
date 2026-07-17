const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createClientMaterialStore } = require("../src/content/client-material-store");

const DOCX_FIXTURE = path.resolve(__dirname, "fixtures", "docx", "customer-material.docx");

const LINK_UNAVAILABLE_CODES = new Set(["EPERM", "EACCES", "ENOTSUP", "EOPNOTSUPP", "EINVAL", "ENOSYS"]);

function createLinkOrSkip(t, target, link, type) {
  try {
    fs.symlinkSync(target, link, type);
    return true;
  } catch (error) {
    if (LINK_UNAVAILABLE_CODES.has(error.code)) {
      t.skip("links are unavailable: " + error.code);
      return false;
    }
    throw error;
  }
}

describe("client material store", function() {
  let workspaceRoot;
  let clientDirectory;

  beforeEach(function() {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "client-material-store-"));
    clientDirectory = path.join(workspaceRoot, "clients", "client-1");
    fs.mkdirSync(path.join(clientDirectory, "nested"), { recursive: true });
    fs.writeFileSync(path.join(clientDirectory, "brand.md"), "品牌资料", "utf8");
    fs.writeFileSync(path.join(clientDirectory, "menu.docx"), "fixture-docx", "utf8");
    fs.writeFileSync(path.join(clientDirectory, "nested", "hidden.docx"), "nested", "utf8");
    fs.writeFileSync(path.join(clientDirectory, "questions.json"), "{}", "utf8");
  });

  afterEach(function() {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it("lists only first-level supported material files", async function() {
    const store = createClientMaterialStore({
      workspaceRoot: workspaceRoot,
      converter: async function() { return "转换后的客户资料"; }
    });

    const items = await store.listMaterials("client-1");

    assert.deepEqual(items.map(function(item) { return item.name; }), ["brand.md", "menu.docx"]);
  });

  it("parses a real DOCX with the default converter when MarkItDown is unavailable", async function() {
    const previous = process.env.MARKITDOWN_CMD;
    const previousPath = process.env.PATH;
    delete process.env.MARKITDOWN_CMD;
    process.env.PATH = "";
    try {
      fs.copyFileSync(DOCX_FIXTURE, path.join(clientDirectory, "menu.docx"));
      const store = createClientMaterialStore({ workspaceRoot: workspaceRoot });
      const material = (await store.listMaterials("client-1")).find(function(item) { return item.name === "menu.docx"; });

      assert.equal(material.status, "ready");
      assert.match(material.content, /客户资料标题/);
      assert.match(material.content, /English context paragraph\./);
      assert.match(material.content, /第二段中文正文。/);
      assert.ok(material.characterCount > 0);
    } finally {
      if (previous === undefined) delete process.env.MARKITDOWN_CMD;
      else process.env.MARKITDOWN_CMD = previous;
      process.env.PATH = previousPath;
    }
  });

  it("reads, retries, and selects materials by logical client id when its directory has another name", async function() {
    const physicalDirectory = path.join(workspaceRoot, "clients", "physical-client-directory");
    fs.rmSync(clientDirectory, { recursive: true, force: true });
    fs.mkdirSync(physicalDirectory, { recursive: true });
    fs.writeFileSync(path.join(physicalDirectory, "client.json"), JSON.stringify({ id: "logical-client-id", name: "Logical Client" }), "utf8");
    fs.writeFileSync(path.join(physicalDirectory, "brand.md"), "逻辑客户资料", "utf8");
    fs.writeFileSync(path.join(physicalDirectory, "menu.docx"), "fixture-docx", "utf8");
    let attempts = 0;
    const store = createClientMaterialStore({
      workspaceRoot: workspaceRoot,
      converter: async function() {
        attempts += 1;
        if (attempts === 1) throw Object.assign(new Error("conversion failed"), { code: "MATERIAL_DOCX_CONVERSION_FAILED" });
        return "重试后的资料";
      }
    });

    const listed = await store.listMaterials("logical-client-id");
    assert.deepEqual(listed.map(function(item) { return [item.name, item.status]; }), [["brand.md", "ready"], ["menu.docx", "error"]]);
    const selected = await store.getSelectedMaterials("logical-client-id", [listed[0].id]);
    assert.equal(selected[0].content, "逻辑客户资料");
    const retried = await store.retryMaterial("logical-client-id", listed[1].id);
    assert.equal(retried.status, "ready");
    assert.equal(retried.content, "重试后的资料");
  });

  it("supports text extensions and ignores reserved, hidden, nested, and generated files", async function() {
    fs.writeFileSync(path.join(clientDirectory, "plain.txt"), "plain", "utf8");
    fs.writeFileSync(path.join(clientDirectory, "notes.markdown"), "notes", "utf8");
    fs.writeFileSync(path.join(clientDirectory, "facts.json"), "{\"ok\":true}", "utf8");
    fs.writeFileSync(path.join(clientDirectory, ".hidden.md"), "hidden", "utf8");
    fs.mkdirSync(path.join(clientDirectory, "generated"));
    fs.writeFileSync(path.join(clientDirectory, "generated", "article.md"), "generated", "utf8");

    const store = createClientMaterialStore({ workspaceRoot: workspaceRoot, converter: async function() { return "docx"; } });
    const items = await store.listMaterials("client-1");

    assert.deepEqual(items.map(function(item) { return item.name; }), ["brand.md", "facts.json", "menu.docx", "notes.markdown", "plain.txt"]);
    assert.deepEqual(items.filter(function(item) { return item.extension !== ".docx"; }).map(function(item) { return item.content; }), ["品牌资料", "{\"ok\":true}", "notes", "plain"]);
  });

  it("reuses a DOCX conversion cache and invalidates it when the source changes", async function() {
    const calls = [];
    const store = createClientMaterialStore({
      workspaceRoot: workspaceRoot,
        converter: async function(inputBuffer, options) {
        calls.push({ inputBuffer: inputBuffer, options: options });
        return "转换后的客户资料";
      },
      cacheVersion: 2
    });

    const first = await store.listMaterials("client-1");
    const second = await store.listMaterials("client-1");
    assert.equal(calls.length, 1);
    assert.equal(first[1].content, "转换后的客户资料");
    assert.equal(first[1].cacheHit, false);
    assert.equal(second[1].cacheHit, true);
    assert.equal(Buffer.isBuffer(calls[0].inputBuffer), true);
    assert.deepEqual(calls[0].options, { clientId: "client-1", name: "menu.docx", version: 2 });
    const cacheFiles = fs.readdirSync(path.join(workspaceRoot, "work", "client-material-cache", "Y2xpZW50LTE"));
    const cacheDocument = JSON.parse(fs.readFileSync(path.join(workspaceRoot, "work", "client-material-cache", "Y2xpZW50LTE", cacheFiles[0]), "utf8"));
    assert.deepEqual(Object.keys(cacheDocument).sort(), ["characterCount", "clientId", "content", "convertedAt", "name", "sourceHash", "version"]);
    assert.equal(cacheDocument.version, 2);
    assert.equal(cacheDocument.sourceHash, crypto.createHash("sha256").update("fixture-docx").digest("hex"));
    assert.equal(fs.readFileSync(path.join(clientDirectory, "menu.docx"), "utf8"), "fixture-docx");

    fs.writeFileSync(path.join(clientDirectory, "menu.docx"), "changed-docx", "utf8");
    const changed = await store.listMaterials("client-1");
    assert.equal(calls.length, 2);
    assert.equal(changed[1].cacheHit, false);
    assert.equal(fs.existsSync(path.join(clientDirectory, "menu.md")), false);
    assert.equal(fs.readdirSync(path.join(workspaceRoot, "work", "client-material-cache"), { withFileTypes: true }).some(function(entry) { return entry.name.includes(".tmp-"); }), false);
  });

  it("stores DOCX cache under injected local state instead of the content workspace", async function() {
    const localStateRoot = fs.mkdtempSync(path.join(os.tmpdir(), "client-material-local-state-"));
    try {
      const cacheRoot = path.join(localStateRoot, "cache", "client-material");
      let conversions = 0;
      const store = createClientMaterialStore({
        workspaceRoot: workspaceRoot,
        paths: {
          clients: path.join(workspaceRoot, "clients"),
          localState: localStateRoot,
          clientMaterialCache: cacheRoot
        },
        converter: async function() {
          conversions += 1;
          return "cached outside workspace";
        }
      });

      const first = await store.listMaterials("client-1");
      const second = await store.listMaterials("client-1");

      assert.equal(first.find(function(item) { return item.name === "menu.docx"; }).status, "ready");
      assert.equal(second.find(function(item) { return item.name === "menu.docx"; }).cacheHit, true);
      assert.equal(conversions, 1);
      assert.equal(fs.existsSync(cacheRoot), true);
      assert.equal(fs.existsSync(path.join(workspaceRoot, "work")), false);
    } finally {
      fs.rmSync(localStateRoot, { recursive: true, force: true });
    }
  });

  it("returns a safe failure DTO and retries only the failed DOCX", async function() {
    let attempts = 0;
    const store = createClientMaterialStore({
      workspaceRoot: workspaceRoot,
      converter: async function() {
        attempts += 1;
        if (attempts === 1) {
          const error = new Error("provider output contains a customer path");
          error.code = "MATERIAL_DOCX_CONVERSION_FAILED";
          throw error;
        }
        return "重试成功";
      }
    });

    const failed = await store.listMaterials("client-1");
    assert.deepEqual(failed[1], {
      id: failed[1].id,
      name: "menu.docx",
      extension: ".docx",
      status: "error",
      error: { code: "MATERIAL_DOCX_CONVERSION_FAILED", message: "DOCX conversion failed" },
      content: "",
      characterCount: 0
    });
    assert.equal(failed[0].content, "品牌资料");

    const retried = await store.retryMaterial("client-1", failed[1].id);
    assert.equal(attempts, 2);
    assert.equal(retried.status, "ready");
    assert.equal(retried.content, "重试成功");
  });

  it("selects materials by opaque id without accepting renderer paths", async function() {
    const store = createClientMaterialStore({ workspaceRoot: workspaceRoot, converter: async function() { return "docx"; } });
    const items = await store.listMaterials("client-1");
    const selected = await store.getSelectedMaterials("client-1", [items[0].id, "menu.docx"]);

    assert.deepEqual(selected.map(function(item) { return item.name; }), ["brand.md", "menu.docx"]);
    await assert.rejects(store.getSelectedMaterials("client-1", ["..\\outside.docx"]), function(error) {
      return error.code === "CLIENT_MATERIAL_INVALID";
    });
  });

  it("skips linked materials and rejects client paths outside the workspace", async function(t) {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "client-material-outside-"));
    try {
      fs.writeFileSync(path.join(outside, "outside.md"), "outside", "utf8");
      if (!createLinkOrSkip(t, path.join(outside, "outside.md"), path.join(clientDirectory, "linked.md"), "file")) return;
      const store = createClientMaterialStore({ workspaceRoot: workspaceRoot, converter: async function() { return "docx"; } });
      assert.deepEqual((await store.listMaterials("client-1")).map(function(item) { return item.name; }), ["brand.md", "menu.docx"]);
      await assert.rejects(store.listMaterials(".."), function(error) { return error.code === "CLIENT_PATH_OUT_OF_BOUNDS"; });
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

});
