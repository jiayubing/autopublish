const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { DatabaseSync } = require("node:sqlite");

const { createLegacyMigrator } = require("../src/content/legacy-migration");
const { createResearchStore } = require("../src/content/research-store");
const { createArticleStore } = require("../src/content/article-store");

describe("legacy GEO migration", function() {
  let root;
  let sourceRoot;
  let workspaceRoot;

  beforeEach(function() {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "legacy-migration-"));
    sourceRoot = path.join(root, "legacy");
    workspaceRoot = path.join(root, "workspace");
    fs.mkdirSync(path.join(sourceRoot, "clients", "travel-client", "articles"), { recursive: true });
    fs.writeFileSync(path.join(sourceRoot, "clients", "travel-client", "search_query.txt"), "\uFEFFShanghai hotels");
    fs.writeFileSync(path.join(sourceRoot, "clients", "travel-client", "brand.md"), "# Hotel Brand\n");
    fs.writeFileSync(path.join(sourceRoot, "clients", "travel-client", "notes.txt"), "Family friendly\n");
    fs.writeFileSync(path.join(sourceRoot, "clients", "travel-client", "ignored.png"), "image");
    fs.writeFileSync(path.join(sourceRoot, "clients", "travel-client", ".secret.txt"), "hidden");
    fs.writeFileSync(path.join(sourceRoot, "clients", "travel-client", "articles", "old.md"), "old article");
    createDatabase(path.join(sourceRoot, "data", "geo_data.db"));
  });

  afterEach(function() { fs.rmSync(root, { recursive: true, force: true }); });

  function createDatabase(filename) {
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    const db = new DatabaseSync(filename);
    db.exec("CREATE TABLE queries (id INTEGER PRIMARY KEY, timestamp TEXT, question TEXT, category TEXT, city TEXT, answer_text TEXT)");
    db.exec("CREATE TABLE citations (id INTEGER PRIMARY KEY, query_id INTEGER, ref_order INTEGER, ref_title TEXT, ref_url TEXT, platform TEXT)");
    db.exec("CREATE TABLE articles (id INTEGER PRIMARY KEY, query_id INTEGER, platform TEXT, scenario TEXT, client_material TEXT, content TEXT, timestamp TEXT)");
    db.prepare("INSERT INTO queries VALUES (?, ?, ?, ?, ?, ?)").run(7, "2025-01-02T03:04:05.000Z", "Shanghai hotels", "hotel", "Shanghai", "Research answer");
    db.prepare("INSERT INTO citations VALUES (?, ?, ?, ?, ?, ?)").run(1, 7, 1, "Useful source", "https://example.com/source", "web");
    db.prepare("INSERT INTO citations VALUES (?, ?, ?, ?, ?, ?)").run(2, 7, 2, "No URL", "", "web");
    db.prepare("INSERT INTO articles VALUES (?, ?, ?, ?, ?, ?, ?)").run(8, 7, "ctrip", "guide", "Client facts", "# Migrated title\n\nBody text", "2025-01-03T03:04:05.000Z");
    db.close();
  }

  function migrator() {
    return createLegacyMigrator({ sourceRoot: sourceRoot, workspaceRoot: workspaceRoot });
  }

  it("dry-runs against a temporary legacy database without writing output", function() {
    const sourceBefore = snapshot(sourceRoot);
    const result = migrator().dryRun();
    assert.deepStrictEqual(result, { clientsCopied: 1, researchImported: 1, articlesImported: 1, skipped: 0, warnings: ["Skipped citation 2 for query 7 because its URL is empty"] });
    assert.equal(fs.existsSync(workspaceRoot), false);
    assert.deepStrictEqual(snapshot(sourceRoot), sourceBefore);
  });

  it("copies allowed client knowledge and imports matching research and articles", function() {
    const sourceBefore = snapshot(sourceRoot);
    const result = migrator().migrate();
    assert.equal(result.clientsCopied, 1);
    assert.equal(result.researchImported, 1);
    assert.equal(result.articlesImported, 1);
    assert.equal(fs.existsSync(path.join(workspaceRoot, "clients", "travel-client", "brand.md")), true);
    assert.equal(fs.existsSync(path.join(workspaceRoot, "clients", "travel-client", "search_query.txt")), true);
    assert.equal(fs.existsSync(path.join(workspaceRoot, "clients", "travel-client", "ignored.png")), false);
    assert.equal(fs.existsSync(path.join(workspaceRoot, "clients", "travel-client", ".secret.txt")), false);
    assert.equal(fs.existsSync(path.join(workspaceRoot, "clients", "travel-client", "articles")), false);
    assert.deepStrictEqual(createResearchStore(workspaceRoot).getResearch("travel-client", "legacy-query-7"), {
      id: "legacy-query-7", clientId: "travel-client", question: "Shanghai hotels", answerText: "Research answer",
      references: [{ title: "Useful source", url: "https://example.com/source", snippet: "" }],
      collectionMethod: "legacy", collectedAt: "2025-01-02T03:04:05.000Z",
      updatedAt: "2025-01-02T03:04:05.000Z", isAnswerComplete: true
    });
    const article = createArticleStore(workspaceRoot).getArticle("travel-client", "legacy-article-8");
    assert.equal(article.title, "Migrated title");
    assert.equal(article.researchQueryId, "legacy-query-7");
    assert.equal(article.templateId, "legacy-ctrip-guide");
    assert.deepStrictEqual(article.source, { client_material: true, doubao_answer: true, references: true, template: true });
    assert.deepStrictEqual(snapshot(sourceRoot), sourceBefore);
  });

  it("matches only the exact search query after removing a UTF-8 BOM", function() {
    assert.equal(migrator().dryRun().researchImported, 1);
    fs.writeFileSync(path.join(sourceRoot, "clients", "travel-client", "search_query.txt"), " Shanghai hotels ");
    const result = migrator().dryRun();
    assert.equal(result.researchImported, 0);
    assert.equal(result.articlesImported, 0);
    assert.deepStrictEqual(result.warnings, ["No legacy query matches client travel-client search query"]);
  });

  it("skips unmatched customers and empty answers while preserving existing knowledge", function() {
    fs.mkdirSync(path.join(sourceRoot, "clients", "unmatched"), { recursive: true });
    fs.writeFileSync(path.join(sourceRoot, "clients", "unmatched", "search_query.txt"), "Not in database");
    fs.writeFileSync(path.join(sourceRoot, "clients", "unmatched", "only.md"), "unmatched");
    const db = new DatabaseSync(path.join(sourceRoot, "data", "geo_data.db"));
    db.prepare("UPDATE queries SET answer_text = ? WHERE id = ?").run("   ", 7);
    db.close();
    fs.mkdirSync(path.join(workspaceRoot, "clients", "travel-client"), { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, "clients", "travel-client", "brand.md"), "user version");
    const result = migrator().migrate();
    assert.equal(result.clientsCopied, 2);
    assert.equal(result.researchImported, 0);
    assert.equal(result.articlesImported, 0);
    assert.equal(result.skipped, 2);
    assert.equal(fs.readFileSync(path.join(workspaceRoot, "clients", "travel-client", "brand.md"), "utf8"), "user version");
    assert.equal(fs.existsSync(path.join(workspaceRoot, "research", "travel-client", "legacy-query-7.json")), false);
  });

  it("is idempotent and does not overwrite non-legacy outputs", function() {
    migrator().migrate();
    const research = createResearchStore(workspaceRoot);
    research.saveResearch("travel-client", { id: "user-query", question: "user", answerText: "user", references: [], createdAt: "2025-01-01T00:00:00.000Z" });
    const second = migrator().migrate();
    assert.deepStrictEqual(second, { clientsCopied: 0, researchImported: 0, articlesImported: 0, skipped: 3, warnings: [
      "Skipped citation 2 for query 7 because its URL is empty",
      "Existing legacy research legacy-query-7 differs and was not replaced"
    ] });
    assert.equal(research.getResearch("travel-client", "user-query").answerText, "user");
  });

  it("reports stable warnings for unavailable or invalid legacy databases", function() {
    fs.unlinkSync(path.join(sourceRoot, "data", "geo_data.db"));
    assert.deepStrictEqual(migrator().dryRun(), { clientsCopied: 1, researchImported: 0, articlesImported: 0, skipped: 0, warnings: ["Legacy database is missing"] });
    fs.mkdirSync(path.join(sourceRoot, "data"), { recursive: true });
    fs.writeFileSync(path.join(sourceRoot, "data", "geo_data.db"), "not sqlite");
    assert.throws(function() { migrator().dryRun(); }, function(error) { return error.code === "LEGACY_DATABASE_INVALID"; });
  });

  it("loads without node:sqlite and reports a stable unsupported error only when migration reads a database", function() {
    const modulePath = path.resolve(__dirname, "..", "src", "content", "legacy-migration.js");
    const script = [
      "const Module = require('module');",
      "const originalLoad = Module._load;",
      "Module._load = function(request) { if (request === 'node:sqlite') { const error = new Error('Cannot find module node:sqlite'); error.code = 'MODULE_NOT_FOUND'; throw error; } return originalLoad.apply(this, arguments); };",
      "const { createLegacyMigrator } = require(" + JSON.stringify(modulePath) + ");",
      "const migrator = createLegacyMigrator({ sourceRoot: " + JSON.stringify(sourceRoot) + ", workspaceRoot: " + JSON.stringify(workspaceRoot) + " });",
      "try { migrator.dryRun(); } catch (error) { process.stderr.write(error.code + ':' + error.message); process.exitCode = 1; }"
    ].join("\n");
    const result = spawnSync(process.execPath, ["-e", script], { encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.equal(result.stderr, "LEGACY_SQLITE_UNSUPPORTED:Legacy SQLite migration is unsupported in this runtime");
    const hook = path.join(root, "block-node-sqlite.js");
    fs.writeFileSync(hook, "const Module = require('module'); const originalLoad = Module._load; Module._load = function(request) { if (request === 'node:sqlite') { const error = new Error('Cannot find module node:sqlite'); error.code = 'MODULE_NOT_FOUND'; throw error; } return originalLoad.apply(this, arguments); };\n");
    const cli = spawnSync(process.execPath, ["--require", hook, path.resolve(__dirname, "..", "scripts", "migrate-geo-data.js"), "--source", sourceRoot, "--workspace", workspaceRoot, "--dry-run"], { encoding: "utf8" });
    assert.notEqual(cli.status, 0);
    assert.equal(cli.stderr.trim(), "Legacy SQLite migration is unsupported in this runtime");
  });

  it("rejects a linked workspace client target before copying legacy files", function(t) {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "legacy-migration-outside-"));
    const clients = path.join(workspaceRoot, "clients");
    fs.mkdirSync(clients, { recursive: true });
    try {
      fs.symlinkSync(outside, path.join(clients, "travel-client"), "junction");
    } catch (error) {
      fs.rmSync(outside, { recursive: true, force: true });
      if (["EPERM", "EACCES", "ENOTSUP", "EINVAL"].includes(error.code)) {
        t.skip("symlinks or junctions are unavailable in this environment");
        return;
      }
      throw error;
    }
    try {
      assert.throws(function() { migrator().migrate(); }, function(error) {
        return error.code === "LEGACY_TARGET_PATH_UNSAFE";
      });
      assert.equal(fs.existsSync(path.join(outside, "brand.md")), false);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it("rejects a linked workspace clients root before copying legacy files", function(t) {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "legacy-migration-outside-"));
    fs.mkdirSync(workspaceRoot, { recursive: true });
    try {
      fs.symlinkSync(outside, path.join(workspaceRoot, "clients"), "junction");
    } catch (error) {
      fs.rmSync(outside, { recursive: true, force: true });
      if (["EPERM", "EACCES", "ENOTSUP", "EINVAL"].includes(error.code)) {
        t.skip("symlinks or junctions are unavailable in this environment");
        return;
      }
      throw error;
    }
    try {
      assert.throws(function() { migrator().migrate(); }, function(error) {
        return error.code === "CLIENT_PATH_OUT_OF_BOUNDS";
      });
      assert.equal(fs.existsSync(path.join(outside, "brand.md")), false);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it("rejects a linked workspace root before copying legacy files", function(t) {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "legacy-migration-root-outside-"));
    try {
      try {
        fs.symlinkSync(outside, workspaceRoot, "junction");
      } catch (error) {
        if (["EPERM", "EACCES", "ENOTSUP", "EINVAL"].includes(error.code)) {
          t.skip("symlinks or junctions are unavailable in this environment");
          return;
        }
        throw error;
      }
      assert.throws(function() { migrator().migrate(); }, function(error) {
        return error.code === "CLIENT_PATH_OUT_OF_BOUNDS";
      });
      assert.equal(fs.existsSync(path.join(outside, "clients", "travel-client", "brand.md")), false);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it("rejects schemas that omit required columns without exposing SQLite details", function() {
    fs.unlinkSync(path.join(sourceRoot, "data", "geo_data.db"));
    const db = new DatabaseSync(path.join(sourceRoot, "data", "geo_data.db"));
    db.exec("CREATE TABLE queries (id INTEGER PRIMARY KEY, question TEXT)");
    db.exec("CREATE TABLE citations (id INTEGER PRIMARY KEY, query_id INTEGER, ref_order INTEGER, ref_title TEXT, ref_url TEXT)");
    db.exec("CREATE TABLE articles (id INTEGER PRIMARY KEY, query_id INTEGER, platform TEXT, scenario TEXT, client_material TEXT, content TEXT, timestamp TEXT)");
    db.close();
    assert.throws(function() { migrator().dryRun(); }, function(error) {
      return error.code === "LEGACY_SCHEMA_INVALID" && error.message === "Legacy database schema is invalid";
    });
  });

  it("skips malformed citation URLs instead of failing the matching research import", function() {
    const db = new DatabaseSync(path.join(sourceRoot, "data", "geo_data.db"));
    db.prepare("UPDATE citations SET ref_url = ? WHERE id = ?").run("not-a-url", 1);
    db.close();
    const result = migrator().migrate();
    assert.equal(result.researchImported, 1);
    assert.deepStrictEqual(createResearchStore(workspaceRoot).getResearch("travel-client", "legacy-query-7").references, []);
    assert.deepStrictEqual(result.warnings, [
      "Skipped citation 1 for query 7 because its URL is invalid",
      "Skipped citation 2 for query 7 because its URL is empty"
    ]);
    assert.equal(createArticleStore(workspaceRoot).getArticle("travel-client", "legacy-article-8").source.references, false);
  });

  it("reports existing legacy records as skipped during dry-run", function() {
    migrator().migrate();
    assert.deepStrictEqual(migrator().dryRun(), {
      clientsCopied: 0,
      researchImported: 0,
      articlesImported: 0,
      skipped: 3,
      warnings: [
        "Skipped citation 2 for query 7 because its URL is empty",
        "Existing legacy research legacy-query-7 differs and was not replaced"
      ]
    });
  });

  it("ignores the in-memory legacy researchQueryIds compatibility field when comparing articles", function() {
    migrator().migrate();
    const existing = createArticleStore(workspaceRoot).getArticle("travel-client", "legacy-article-8");
    assert.deepStrictEqual(existing.researchQueryIds, ["legacy-query-7"]);
    assert.equal(migrator().dryRun().warnings.includes("Existing legacy article legacy-article-8 differs and was not replaced"), false);
  });

  it("uses the preserved research references when an existing legacy query is skipped", function() {
    createResearchStore(workspaceRoot).saveResearch("travel-client", {
      id: "legacy-query-7",
      question: "Shanghai hotels",
      answerText: "Existing answer",
      references: [],
      createdAt: "2025-01-01T00:00:00.000Z"
    });
    const result = migrator().migrate();
    assert.equal(result.researchImported, 0);
    assert.equal(result.articlesImported, 1);
    assert.equal(createArticleStore(workspaceRoot).getArticle("travel-client", "legacy-article-8").source.references, false);
  });

  it("validates command parameters and emits JSON statistics", function() {
    const script = path.resolve(__dirname, "..", "scripts", "migrate-geo-data.js");
    const missing = spawnSync(process.execPath, [script, "--source", sourceRoot], { encoding: "utf8" });
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /--workspace is required/);
    const dryRun = spawnSync(process.execPath, [script, "--source", sourceRoot, "--workspace", workspaceRoot, "--dry-run"], { encoding: "utf8" });
    assert.equal(dryRun.status, 0, dryRun.stderr);
    assert.equal(JSON.parse(dryRun.stdout).researchImported, 1);
    assert.equal(fs.existsSync(workspaceRoot), false);
  });

  it("exits nonzero from the command when the schema is invalid", function() {
    fs.unlinkSync(path.join(sourceRoot, "data", "geo_data.db"));
    const db = new DatabaseSync(path.join(sourceRoot, "data", "geo_data.db"));
    db.exec("CREATE TABLE queries (id INTEGER PRIMARY KEY)");
    db.exec("CREATE TABLE citations (id INTEGER PRIMARY KEY)");
    db.exec("CREATE TABLE articles (id INTEGER PRIMARY KEY)");
    db.close();
    const script = path.resolve(__dirname, "..", "scripts", "migrate-geo-data.js");
    const result = spawnSync(process.execPath, [script, "--source", sourceRoot, "--workspace", workspaceRoot, "--dry-run"], { encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.equal(result.stderr.trim(), "Legacy database schema is invalid");
  });

  function snapshot(directory) {
    const entries = [];
    function visit(current) {
      fs.readdirSync(current, { withFileTypes: true }).sort(function(a, b) { return a.name.localeCompare(b.name); }).forEach(function(entry) {
        const filename = path.join(current, entry.name);
        const relative = path.relative(directory, filename).replace(/\\\\/g, "/");
        if (entry.isDirectory()) visit(filename);
        else entries.push([relative, fs.readFileSync(filename).toString("base64")]);
      });
    }
    visit(directory);
    return entries;
  }
});
