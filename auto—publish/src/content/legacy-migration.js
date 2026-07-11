const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const { getContentWorkspace, getClientWorkspace } = require("../core/files");
const { createResearchStore } = require("./research-store");
const { createArticleStore } = require("./article-store");

const KNOWLEDGE_EXTENSIONS = new Set([".txt", ".md", ".markdown", ".json"]);
const REQUIRED_SCHEMA = {
  queries: ["id", "timestamp", "question", "category", "city", "answer_text"],
  citations: ["id", "query_id", "ref_order", "ref_title", "ref_url", "platform"],
  articles: ["id", "query_id", "platform", "scenario", "client_material", "content", "timestamp"]
};

function migrationError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function createStats() {
  return { clientsCopied: 0, researchImported: 0, articlesImported: 0, skipped: 0, warnings: [] };
}

function withoutBom(value) {
  return typeof value === "string" ? value.replace(/^\uFEFF/, "") : "";
}

function hasText(value) {
  return typeof value === "string" && Boolean(value.trim());
}

function timestamp(value) {
  return typeof value === "string" && value.trim() ? value : "1970-01-01T00:00:00.000Z";
}

function articleTitle(content, id) {
  const lines = String(content || "").split(/\r?\n/);
  const heading = lines.find(function(line) { return /^\s{0,3}#{1,6}\s+\S/.test(line); });
  if (heading) return heading.replace(/^\s{0,3}#{1,6}\s+/, "").replace(/\s+#+\s*$/, "").trim();
  const firstLine = lines.find(function(line) { return line.trim(); });
  return firstLine ? firstLine.trim() : "Legacy article " + id;
}

function sameRecord(left, right) {
  if (left === right) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length && leftKeys.every(function(key, index) {
    return key === rightKeys[index] && sameRecord(left[key], right[key]);
  });
}

function createLegacyMigrator(options) {
  if (!options || typeof options.sourceRoot !== "string" || !options.sourceRoot.trim() || typeof options.workspaceRoot !== "string" || !options.workspaceRoot.trim()) {
    throw migrationError("LEGACY_MIGRATION_CONFIG_INVALID", "sourceRoot and workspaceRoot are required");
  }

  const sourceRoot = path.resolve(options.sourceRoot);
  const workspaceRoot = path.resolve(options.workspaceRoot);
  const sourceClients = path.join(sourceRoot, "clients");
  const databasePath = path.join(sourceRoot, "data", "geo_data.db");

  function sourceClientPlans(stats) {
    if (!fs.existsSync(sourceClients)) {
      stats.warnings.push("Legacy clients directory is missing");
      return [];
    }
    return fs.readdirSync(sourceClients, { withFileTypes: true })
      .filter(function(entry) { return entry.isDirectory() && !entry.name.startsWith("."); })
      .sort(function(a, b) { return a.name.localeCompare(b.name); })
      .map(function(entry) {
        const directory = path.join(sourceClients, entry.name);
        let clientDirectory;
        try {
          clientDirectory = getClientWorkspace(getContentWorkspace(workspaceRoot), entry.name);
        } catch (error) {
          stats.warnings.push("Skipped unsafe legacy client directory " + entry.name);
          return null;
        }
        const queryPath = path.join(directory, "search_query.txt");
        const query = fs.existsSync(queryPath) && fs.lstatSync(queryPath).isFile()
          ? withoutBom(fs.readFileSync(queryPath, "utf8")) : "";
        if (!hasText(query)) stats.warnings.push("Legacy client " + entry.name + " has no search query");
        const files = fs.readdirSync(directory, { withFileTypes: true })
          .filter(function(file) {
            return file.isFile() && !file.name.startsWith(".") && KNOWLEDGE_EXTENSIONS.has(path.extname(file.name).toLowerCase());
          })
          .map(function(file) { return file.name; });
        return { id: entry.name, directory: directory, destination: clientDirectory, query: query, files: files };
      })
      .filter(Boolean);
  }

  function openLegacyDatabase(stats) {
    if (!fs.existsSync(databasePath)) {
      stats.warnings.push("Legacy database is missing");
      return null;
    }
    let db;
    try {
      db = new DatabaseSync(databasePath, { readOnly: true });
      const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(function(row) { return row.name; }));
      const schemaValid = Object.keys(REQUIRED_SCHEMA).every(function(table) {
        if (!tables.has(table)) return false;
        const columns = new Set(db.prepare("PRAGMA table_info(" + table + ")").all().map(function(row) { return row.name; }));
        return REQUIRED_SCHEMA[table].every(function(column) { return columns.has(column); });
      });
      if (!schemaValid) throw migrationError("LEGACY_SCHEMA_INVALID", "Legacy database schema is invalid");
      return db;
    } catch (error) {
      if (db) db.close();
      if (error.code === "LEGACY_SCHEMA_INVALID") throw error;
      throw migrationError("LEGACY_DATABASE_INVALID", "Legacy database is invalid");
    }
  }

  function buildPlan() {
    const stats = createStats();
    const clients = sourceClientPlans(stats);
    const db = openLegacyDatabase(stats);
    if (!db) return { stats: stats, clients: clients, research: [], articles: [] };
    try {
      const queries = db.prepare("SELECT id, timestamp, question, answer_text FROM queries").all();
      const citations = db.prepare("SELECT id, query_id, ref_order, ref_title, ref_url FROM citations ORDER BY query_id, ref_order, id").all();
      const articles = db.prepare("SELECT id, query_id, platform, scenario, client_material, content, timestamp FROM articles").all();
      const clientsByQuery = new Map();
      clients.forEach(function(client) {
        if (!hasText(client.query)) return;
        queries.filter(function(query) { return query.question === client.query; }).forEach(function(query) {
          const matched = clientsByQuery.get(query.id) || [];
          matched.push(client);
          clientsByQuery.set(query.id, matched);
        });
      });
      clients.forEach(function(client) {
        if (hasText(client.query) && !queries.some(function(query) { return query.question === client.query; })) {
          stats.warnings.push("No legacy query matches client " + client.id + " search query");
        }
      });
      const citationsByQuery = new Map();
      citations.forEach(function(citation) {
        const rows = citationsByQuery.get(citation.query_id) || [];
        rows.push(citation);
        citationsByQuery.set(citation.query_id, rows);
      });
      const research = [];
      const emptyAnswerQueryIds = new Set();
      queries.forEach(function(query) {
        const matchedClients = clientsByQuery.get(query.id) || [];
        if (!matchedClients.length) return;
        if (!hasText(query.answer_text)) {
          stats.skipped += matchedClients.length;
          emptyAnswerQueryIds.add(query.id);
          return;
        }
        const references = (citationsByQuery.get(query.id) || []).reduce(function(result, citation) {
          if (!hasText(citation.ref_url)) {
            stats.warnings.push("Skipped citation " + citation.id + " for query " + query.id + " because its URL is empty");
            return result;
          }
          try {
            const url = new URL(citation.ref_url);
            if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("unsupported protocol");
          } catch (error) {
            stats.warnings.push("Skipped citation " + citation.id + " for query " + query.id + " because its URL is invalid");
            return result;
          }
          if (!hasText(citation.ref_title)) {
            stats.warnings.push("Skipped citation " + citation.id + " for query " + query.id + " because its title is empty");
            return result;
          }
          result.push({ title: citation.ref_title, url: citation.ref_url, snippet: "" });
          return result;
        }, []);
        matchedClients.forEach(function(client) {
          research.push({ client: client, query: query, record: {
            id: "legacy-query-" + query.id,
            question: query.question,
            answerText: query.answer_text,
            references: references,
            createdAt: timestamp(query.timestamp)
          } });
        });
      });
      const importedQueryIds = new Set(research.map(function(item) { return item.query.id; }));
      const researchByClientAndQuery = new Map(research.map(function(item) {
        return [item.client.id + "\u0000" + item.query.id, item.record];
      }));
      const migratedArticles = [];
      articles.forEach(function(article) {
        const queryClients = clientsByQuery.get(article.query_id) || [];
        if (emptyAnswerQueryIds.has(article.query_id)) {
          stats.skipped += queryClients.length;
          return;
        }
        if (!importedQueryIds.has(article.query_id)) return;
        queryClients.forEach(function(client) {
          migratedArticles.push({ client: client, record: {
            id: "legacy-article-" + article.id,
            clientId: client.id,
            researchQueryId: "legacy-query-" + article.query_id,
            platform: String(article.platform || "legacy"),
            scenario: String(article.scenario || "legacy"),
            templateId: "legacy-" + String(article.platform || "legacy") + "-" + String(article.scenario || "legacy"),
            title: articleTitle(article.content, article.id),
            content: String(article.content || ""),
            status: "generated",
            source: {
              client_material: hasText(article.client_material),
              doubao_answer: true,
              references: researchByClientAndQuery.get(client.id + "\u0000" + article.query_id).references.length > 0,
              template: Boolean(article.platform && article.scenario)
            },
            createdAt: timestamp(article.timestamp),
            updatedAt: timestamp(article.timestamp)
          } });
        });
      });
      return { stats: stats, clients: clients, research: research, articles: migratedArticles };
    } finally {
      db.close();
    }
  }

  function existingResearch(item, researchStore) {
    try {
      const existing = researchStore.getResearch(item.client.id, item.record.id);
      const expected = Object.assign({}, item.record, { clientId: item.client.id, isAnswerComplete: true });
      if (!sameRecord(existing, expected)) planWarning(item, "research");
      item.finalResearch = existing;
      return true;
    } catch (error) {
      if (error.code === "RESEARCH_NOT_FOUND") {
        item.finalResearch = item.record;
        return false;
      }
      throw error;
    }
  }

  function planWarning(item, kind) {
    item.plan.stats.warnings.push("Existing legacy " + kind + " " + item.record.id + " differs and was not replaced");
  }

  function existingArticle(item, articleStore) {
    const directory = path.join(workspaceRoot, "generated", item.client.id);
    const json = path.join(directory, item.record.id + ".json");
    const markdown = path.join(directory, item.record.id + ".md");
    if (!fs.existsSync(json) && !fs.existsSync(markdown)) return false;
    try {
      const existing = articleStore.getArticle(item.client.id, item.record.id);
      if (!sameRecord(existing, item.record)) planWarning(item, "article");
      return true;
    } catch (error) {
      throw error;
    }
  }

  function countOperations(plan) {
    const researchStore = createResearchStore(workspaceRoot);
    const articleStore = createArticleStore(workspaceRoot);
    plan.clients.forEach(function(client) {
      const changed = client.files.some(function(name) { return !fs.existsSync(path.join(client.destination, name)); });
      if (changed) plan.stats.clientsCopied += 1;
      else plan.stats.skipped += 1;
    });
    plan.research.forEach(function(item) {
      item.plan = plan;
      item.exists = existingResearch(item, researchStore);
      if (item.exists) plan.stats.skipped += 1;
      else plan.stats.researchImported += 1;
    });
    const finalResearch = new Map(plan.research.map(function(item) {
      return [item.client.id + "\u0000" + item.record.id, item.finalResearch];
    }));
    plan.articles.forEach(function(item) {
      item.plan = plan;
      const research = finalResearch.get(item.client.id + "\u0000" + item.record.researchQueryId);
      item.record.source.references = Boolean(research && Array.isArray(research.references) && research.references.length);
      item.exists = existingArticle(item, articleStore);
      if (item.exists) plan.stats.skipped += 1;
      else plan.stats.articlesImported += 1;
    });
    return plan.stats;
  }

  function copyClients(plan, count) {
    plan.clients.forEach(function(client) {
      const changed = client.files.some(function(name) { return !fs.existsSync(path.join(client.destination, name)); });
      if (!changed) {
        if (count) plan.stats.skipped += 1;
        return;
      }
      client.files.forEach(function(name) {
        const destination = path.join(client.destination, name);
        if (fs.existsSync(destination)) return;
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.copyFileSync(path.join(client.directory, name), destination, fs.constants.COPYFILE_EXCL);
      });
      if (count) plan.stats.clientsCopied += 1;
    });
  }

  function migrate() {
    const plan = buildPlan();
    if (!plan.research.length && !plan.articles.length && !plan.clients.length) return plan.stats;
    countOperations(plan);
    copyClients(plan, false);
    const researchStore = createResearchStore(workspaceRoot);
    const articleStore = createArticleStore(workspaceRoot);
    plan.research.forEach(function(item) {
      if (!item.exists) {
        researchStore.saveResearch(item.client.id, item.record);
      }
    });
    plan.articles.forEach(function(item) {
      if (!item.exists) {
        articleStore.saveArticle(item.record);
      }
    });
    return plan.stats;
  }

  function dryRun() {
    return countOperations(buildPlan());
  }

  return { dryRun: dryRun, migrate: migrate };
}

module.exports = { createLegacyMigrator };
