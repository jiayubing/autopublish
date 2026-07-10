const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  listClients,
  getClient,
  loadClientKnowledge,
  readSearchQuery
} = require("../src/content/client-knowledge");

describe("client knowledge", function() {
  let root;
  let clientDirectory;

  beforeEach(function() {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "content-knowledge-"));
    clientDirectory = path.join(root, "clients", "travel-客户");
    fs.mkdirSync(path.join(clientDirectory, "articles"), { recursive: true });
    fs.mkdirSync(path.join(clientDirectory, "generated"), { recursive: true });
    fs.writeFileSync(path.join(clientDirectory, "client.json"), JSON.stringify({
      id: "client-1",
      name: "Travel 客户"
    }), "utf8");
    fs.writeFileSync(path.join(clientDirectory, "search_query.txt"), "\uFEFF上海 酒店\n 亲子旅行 \n", "utf8");
    fs.writeFileSync(path.join(clientDirectory, "brand.md"), "# Brand\n真实资料", "utf8");
    fs.writeFileSync(path.join(clientDirectory, "service.txt"), "服务内容", "utf8");
    fs.writeFileSync(path.join(clientDirectory, "facts.json"), "{\"city\":\"上海\"}", "utf8");
    fs.writeFileSync(path.join(clientDirectory, "ignored.png"), "not knowledge", "utf8");
    fs.writeFileSync(path.join(clientDirectory, ".tmp.md"), "temporary", "utf8");
    fs.writeFileSync(path.join(clientDirectory, "articles", "old.md"), "old", "utf8");
  });

  afterEach(function() {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("lists clients with metadata, search query, and first-level knowledge files", function() {
    const clients = listClients(root);

    assert.equal(clients.length, 1);
    assert.deepStrictEqual(clients[0], {
      id: "client-1",
      name: "Travel 客户",
      directory: clientDirectory,
      searchQuery: "上海 酒店\n 亲子旅行 ",
      knowledgeFiles: [
        { name: "brand.md", path: path.join(clientDirectory, "brand.md"), content: "# Brand\n真实资料" },
        { name: "facts.json", path: path.join(clientDirectory, "facts.json"), content: "{\"city\":\"上海\"}" },
        { name: "service.txt", path: path.join(clientDirectory, "service.txt"), content: "服务内容" }
      ]
    });
    assert.deepStrictEqual(getClient(root, "client-1"), clients[0]);
  });

  it("reads query and knowledge independently, while ignoring reserved files and subdirectories", function() {
    assert.equal(readSearchQuery(clientDirectory), "上海 酒店\n 亲子旅行 ");
    assert.deepStrictEqual(loadClientKnowledge(clientDirectory).map(function(file) {
      return file.name;
    }), ["brand.md", "facts.json", "service.txt"]);
  });

  it("reports stable errors for missing clients and queries", function() {
    assert.throws(function() { getClient(root, "missing"); }, function(error) {
      return error.code === "CLIENT_NOT_FOUND";
    });
    fs.unlinkSync(path.join(clientDirectory, "search_query.txt"));
    assert.throws(function() { readSearchQuery(clientDirectory); }, function(error) {
      return error.code === "SEARCH_QUERY_MISSING";
    });
  });

  it("rejects a search query that contains no content", function() {
    fs.writeFileSync(path.join(clientDirectory, "search_query.txt"), "\uFEFF \n\t", "utf8");

    assert.throws(function() { readSearchQuery(clientDirectory); }, function(error) {
      return error.code === "SEARCH_QUERY_MISSING";
    });
  });

  it("rejects reading a client directory outside workspace.clients", function() {
    const outsideDirectory = path.join(root, "outside-client");
    fs.mkdirSync(outsideDirectory, { recursive: true });
    fs.writeFileSync(path.join(outsideDirectory, "search_query.txt"), "outside", "utf8");
    fs.writeFileSync(path.join(outsideDirectory, "facts.md"), "outside", "utf8");

    assert.throws(function() { readSearchQuery(outsideDirectory, root); }, function(error) {
      return error.code === "CLIENT_PATH_OUT_OF_BOUNDS";
    });
    assert.throws(function() { loadClientKnowledge(outsideDirectory, root); }, function(error) {
      return error.code === "CLIENT_PATH_OUT_OF_BOUNDS";
    });
  });
});
