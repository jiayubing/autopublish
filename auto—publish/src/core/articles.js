const fs = require("fs");
const path = require("path");

const { DIRS } = require("../../scripts/config");
const { reportDiagnostic } = require("../diagnostics/diagnostic-producer");
const { copyToFailed } = require("./files");
const { extractDocxArticle } = require("./docx-text-extractor");
const { parseArticle } = require("./article-text");

function stripDuplicateMarker(text) {
  return String(text || "")
    .replace(/\s*-\s*副本$/g, "")
    .replace(/\s*\+\s*副本$/g, "")
    .replace(/\+\(\d+\)$/g, "")
    .replace(/\(\d+\)$/g, "")
    .replace(/_\d+$/g, "")
    .trim();
}

function normalizeWhitespace(text) {
  return String(text || "")
    .replace(/[\s\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]+/g, "")
    .trim();
}

function parseFilenameMeta(name) {
  var ext = path.extname(name);
  var base = stripDuplicateMarker(normalizeWhitespace(path.basename(name, ext)));
  var parts = base.split("_").map(function(part) {
    return normalizeWhitespace(part);
  }).filter(Boolean);

  if (parts.length >= 3) {
    var serial = "";
    var tail = parts.slice(3).join("_");
    if (tail && /^\d+$/.test(tail)) {
      serial = tail;
    } else {
      var oldMatch = base.match(/(?:\+\((\d+)\)|\((\d+)\)|_(\d+))$/);
      if (oldMatch) {
        serial = oldMatch[1] || oldMatch[2] || oldMatch[3] || "";
      }
    }

    return {
      city: parts[0],
      phone: parts[1],
      contact: stripDuplicateMarker(parts[2]),
      serial: serial
    };
  }

  var compactMatch = base.match(/^([\u4e00-\u9fa5]+)(\d{7,15})([\u4e00-\u9fa5A-Za-z]+?)(\d+)?$/);
  if (!compactMatch) {
    return null;
  }

  return {
    city: compactMatch[1],
    phone: compactMatch[2],
    contact: stripDuplicateMarker(compactMatch[3]),
    serial: compactMatch[4] || ""
  };
}

function buildNormalizedFilename(article) {
  var ext = path.extname(article.filename);
  return article.city + article.phone + article.contact + (article.serial || "") + ext;
}

function scanArticles(scanDir) {
  var inputDir = path.join(DIRS.inputDir, scanDir);
  if (!fs.existsSync(inputDir)) {
    return [];
  }

  return fs.readdirSync(inputDir).filter(function(name) {
    if (name.indexOf("~$") === 0) return false;
    return name.endsWith(".docx") || name.endsWith(".md");
  }).map(function(name) {
    var meta = parseFilenameMeta(name);
    if (meta) {
      return {
        file: path.join(inputDir, name),
        filename: name,
        city: meta.city,
        phone: meta.phone,
        contact: meta.contact,
        serial: meta.serial
      };
    }
    // 不匹配列举网格式时不过滤，用空字段兜底
    return {
      file: path.join(inputDir, name),
      filename: name,
      city: "",
      phone: "",
      contact: "",
      serial: ""
    };
  });
}

async function parseArticleFiles(articles) {
  var parsed = [];

  for (var i = 0; i < articles.length; i++) {
    var article = articles[i];
    try {
      var data;
      if (path.extname(article.file).toLowerCase() === ".docx") {
        data = await extractDocxArticle({
          buffer: fs.readFileSync(article.file),
          fallbackTitle: path.basename(article.file, path.extname(article.file))
        });
      } else {
        data = parseArticle(article.file);
      }
      data.city = article.city;
      data.phone = article.phone;
      data.contact = article.contact;
      data.serial = article.serial;
      data.sourceFile = article.file;
      data.filename = article.filename;
      data.normalizedFilename = buildNormalizedFilename(data);
      parsed.push(data);
      reportDiagnostic({
        code: "ARTICLE_PARSED",
        module: "core-articles",
        category: "validation",
        operationId: "article-parse",
        metadata: { outcome: "accepted" },
      });
    } catch (e) {
      copyToFailed(article.file, article.filename);
      reportDiagnostic({
        code: "ARTICLE_PARSE_FAILED",
        module: "core-articles",
        category: "validation",
        operationId: "article-parse",
        metadata: { outcome: "rejected" },
      });
    }
  }

  return parsed;
}

module.exports = {
  stripDuplicateMarker,
  normalizeWhitespace,
  parseFilenameMeta,
  buildNormalizedFilename,
  scanArticles,
  parseArticleFiles
};
