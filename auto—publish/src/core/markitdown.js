const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const { DIRS, MARKITDOWN_CMD } = require("../../scripts/config");
const { log } = require("./logger");
const { quoteArg } = require("./files");

function convertDocxToMd(filePath) {
  var mdPath = path.join(DIRS.tmpDir, path.basename(filePath, ".docx") + ".md");
  log("转换: " + path.basename(filePath), "INFO");
  execSync(
    MARKITDOWN_CMD + " " + quoteArg(filePath) + " -o " + quoteArg(mdPath),
    { encoding: "utf-8", timeout: 60000 }
  );
  if (!fs.existsSync(mdPath)) {
    throw new Error("转换后文件未生成");
  }
  return mdPath;
}

function markdownToPlainText(markdown) {
  return markdown
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
  var raw = fs.readFileSync(mdPath, "utf-8").trim();
  var lines = raw.split("\n");
  var title = "";
  var bodyStart = 0;

  for (var i = 0; i < lines.length; i++) {
    var text = lines[i].trim();
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

module.exports = { convertDocxToMd, markdownToPlainText, parseArticle };
