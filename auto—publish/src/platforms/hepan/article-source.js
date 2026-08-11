const fs = require("node:fs");
const path = require("node:path");
const { reportDiagnostic } = require("../../diagnostics/diagnostic-producer");

const MAX_ARTICLE_BYTES = 5 * 1024 * 1024;
const SUPPORTED_FORMATS = Object.freeze({
  ".md": "markdown",
  ".markdown": "markdown",
  ".txt": "txt",
  ".docx": "docx"
});

const ERROR_MESSAGES = Object.freeze({
  HEPAN_ARTICLE_INVALID_FILE: "Hepan article file is invalid",
  HEPAN_ARTICLE_INVALID_EXTENSION: "Hepan article extension is not supported",
  HEPAN_ARTICLE_TOO_LARGE: "Hepan article is too large",
  HEPAN_ARTICLE_INVALID_ENCODING: "Hepan article must be valid UTF-8",
  HEPAN_ARTICLE_EMPTY_TITLE: "Hepan article title is empty",
  HEPAN_ARTICLE_EMPTY_BODY: "Hepan article body is empty"
});

function diagnoseScan(action) {
  reportDiagnostic({
    code: "HEPAN_ARTICLE_SCAN_FAILED",
    module: "hepan-article-source",
    category: "storage",
    operationId: "hepan-article-source",
    metadata: { action },
  });
}

function articleError(code) {
  const error = new Error(ERROR_MESSAGES[code] || "Hepan article is invalid");
  error.code = code;
  return error;
}

function htmlEscape(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeText(buffer) {
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch (_) {
    throw articleError("HEPAN_ARTICLE_INVALID_ENCODING");
  }
  return text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
}

function safeUrl(value) {
  const candidate = String(value || "").trim();
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    return parsed.href;
  } catch (_) {
    return "";
  }
}

function renderInline(value) {
  const source = String(value || "");
  const codeParts = [];
  const withCodeTokens = source.replace(/`([^`\n]+)`/g, function(_, code) {
    const token = "HEPAN_CODE_TOKEN_" + codeParts.length + "_";
    codeParts.push("<code>" + htmlEscape(code) + "</code>");
    return token;
  });
  let html = htmlEscape(withCodeTokens);

  html = html.replace(/!\[([^\]]*)\]\(((?:[^()]|\([^()]*\))+?)\)/g, "");
  html = html.replace(/\[([^\]]+)\]\(((?:[^()]|\([^()]*\))+?)\)/g, function(_, label, href) {
    const url = safeUrl(href);
    return url ? '<a href="' + htmlEscape(url) + '">' + label + "</a>" : label;
  });
  html = html.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/__([^_\n]+)__/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
  html = html.replace(/_([^_\n]+)_/g, "<em>$1</em>");
  html = html.replace(/HEPAN_CODE_TOKEN_(\d+)_/g, function(_, index) { return codeParts[Number(index)] || ""; });
  return html;
}

function titleText(value) {
  return String(value || "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[`*_~]/g, "")
    .replace(/<[^>]*>/g, "")
    .trim();
}

function renderMarkdown(markdown) {
  const lines = String(markdown || "").split("\n");
  const blocks = [];
  let paragraph = [];
  let list = null;
  let code = null;

  function flushParagraph() {
    if (!paragraph.length) return;
    blocks.push("<p>" + paragraph.map(renderInline).join("<br />") + "</p>");
    paragraph = [];
  }

  function flushList() {
    if (!list) return;
    blocks.push("<" + list.type + ">" + list.items.map(function(item) { return "<li>" + renderInline(item) + "</li>"; }).join("") + "</" + list.type + ">");
    list = null;
  }

  function flushCode() {
    if (!code) return;
    blocks.push("<pre><code>" + htmlEscape(code.lines.join("\n")) + "</code></pre>");
    code = null;
  }

  for (const line of lines) {
    if (code) {
      if (/^\s*```/.test(line)) flushCode();
      else code.lines.push(line);
      continue;
    }
    if (/^\s*```/.test(line)) {
      flushParagraph();
      flushList();
      code = { lines: [] };
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }
    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push("<h" + heading[1].length + ">" + renderInline(heading[2]) + "</h" + heading[1].length + ">");
      continue;
    }
    const unordered = line.match(/^\s*[-+*]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+[.]\s+(.+)$/);
    if (unordered || ordered) {
      flushParagraph();
      const type = unordered ? "ul" : "ol";
      if (!list || list.type !== type) {
        flushList();
        list = { type: type, items: [] };
      }
      list.items.push((unordered || ordered)[1]);
      continue;
    }
    if (/^\s*>\s?/.test(line)) {
      flushParagraph();
      flushList();
      blocks.push("<blockquote>" + renderInline(line.replace(/^\s*>\s?/, "")) + "</blockquote>");
      continue;
    }
    if (/^\s*(?:---+|___+|\*\s*\*\s*\*+)\s*$/.test(line)) {
      flushParagraph();
      flushList();
      blocks.push("<hr />");
      continue;
    }
    flushList();
    paragraph.push(line);
  }
  flushCode();
  flushParagraph();
  flushList();
  return blocks.join("\n");
}

function renderText(text) {
  const paragraphs = String(text || "").split(/\n\s*\n/).map(function(paragraph) { return paragraph.trim(); }).filter(Boolean);
  return paragraphs.map(function(paragraph) {
    return "<p>" + paragraph.split("\n").map(htmlEscape).join("<br />") + "</p>";
  }).join("\n");
}

function validateFile(filePath, io, pathApi) {
  const fileSystem = io || fs;
  const pathModule = pathApi || path;
  const extension = pathModule.extname(String(filePath || "")).toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(SUPPORTED_FORMATS, extension)) throw articleError("HEPAN_ARTICLE_INVALID_EXTENSION");
  let stat;
  try { stat = fileSystem.lstatSync(filePath); } catch (_) { throw articleError("HEPAN_ARTICLE_INVALID_FILE"); }
  if (!stat.isFile() || stat.isSymbolicLink()) throw articleError("HEPAN_ARTICLE_INVALID_FILE");
  if (stat.size > MAX_ARTICLE_BYTES) throw articleError("HEPAN_ARTICLE_TOO_LARGE");
  return { extension: extension, format: SUPPORTED_FORMATS[extension], stem: pathModule.basename(filePath, extension).trim() };
}

function parseArticle(filePath, options) {
  const values = options || {};
  const io = values.fs || fs;
  const pathApi = values.path || path;
  const metadata = validateFile(filePath, io, pathApi);
  if (!metadata.stem) throw articleError("HEPAN_ARTICLE_EMPTY_TITLE");
  if (metadata.format === "docx") {
    return { title: metadata.stem, contentHtml: "", sourceStem: metadata.stem, sourceFormat: "docx" };
  }

  const text = normalizeText(io.readFileSync(filePath));
  const lines = text.split("\n");
  let titleIndex = -1;
  let title = "";
  if (metadata.format === "markdown") {
    for (let index = 0; index < lines.length; index += 1) {
      const heading = lines[index].match(/^\s{0,3}#\s+(.+?)\s*#*\s*$/);
      if (heading) { titleIndex = index; title = titleText(heading[1]); break; }
    }
  }
  if (titleIndex === -1) {
    for (let index = 0; index < lines.length; index += 1) {
      if (lines[index].trim()) { titleIndex = index; title = titleText(lines[index].replace(/^\s*#\s+/, "")); break; }
    }
  }
  if (!title) throw articleError("HEPAN_ARTICLE_EMPTY_TITLE");
  const bodyText = lines.slice(titleIndex + 1).join("\n").trim();
  if (!bodyText) throw articleError("HEPAN_ARTICLE_EMPTY_BODY");
  const contentHtml = metadata.format === "markdown" ? renderMarkdown(bodyText) : renderText(bodyText);
  if (!contentHtml.trim()) throw articleError("HEPAN_ARTICLE_EMPTY_BODY");
  return { title: title, contentHtml: contentHtml, sourceStem: metadata.stem, sourceFormat: metadata.format };
}

function isTemporaryName(name) {
  return name === ".gitkeep" || name.indexOf("~$") === 0 ||
    /(?:\.submission\.json|\.meta\.json|\.tmp-|\.stage(?:$|\.)|\.deleting-)/i.test(name);
}

function scanArticles(directory, options) {
  const values = options || {};
  const io = values.fs || fs;
  const pathApi = values.path || path;
  let names;
  try { names = io.readdirSync(directory); } catch (error) {
    if (!error || error.code !== "ENOENT") diagnoseScan("directory-read");
    return [];
  }
  return names.filter(function(name) {
    if (isTemporaryName(name)) return false;
    const extension = pathApi.extname(name).toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(SUPPORTED_FORMATS, extension)) return false;
    try {
      const stat = io.lstatSync(pathApi.join(directory, name));
      return stat.isFile() && !stat.isSymbolicLink();
    } catch (error) {
      if (!error || error.code !== "ENOENT") diagnoseScan("article-stat");
      return false;
    }
  }).sort().map(function(name) {
    const extension = pathApi.extname(name).toLowerCase();
    return {
      file: pathApi.join(directory, name),
      filename: name,
      fileBaseName: pathApi.basename(name, pathApi.extname(name)).trim(),
      sourceStem: pathApi.basename(name, pathApi.extname(name)).trim(),
      sourceFormat: SUPPORTED_FORMATS[extension]
    };
  });
}

module.exports = {
  MAX_ARTICLE_BYTES,
  SUPPORTED_FORMATS,
  parseArticle,
  scanArticles
};
