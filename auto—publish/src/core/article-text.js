const fs = require("node:fs");
const path = require("node:path");

function markdownToPlainText(markdown) {
  return String(markdown || "")
    .replace(/\r/g, "")
    .replace(/\\([\\`*_{}\[\]()#+\-.!])/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/_(.*?)_/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\(([^)]+)\)/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/^---+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseArticle(mdPath) {
  const raw = fs.readFileSync(mdPath, "utf8").trim();
  const lines = raw.split("\n");
  let title = "";
  let bodyStart = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const text = lines[i].trim();
    if (text) {
      title = text.replace(/^#\s+/, "");
      bodyStart = i + 1;
      break;
    }
  }

  return {
    title: title || path.basename(mdPath, ".md"),
    body: markdownToPlainText(lines.slice(bodyStart).join("\n").trim())
  };
}

module.exports = { markdownToPlainText, parseArticle };
