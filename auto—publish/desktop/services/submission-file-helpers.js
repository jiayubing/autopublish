"use strict";

const fs = require("node:fs");

function articleMarkdown(article) {
  return "# " + String(article.title || "") + "\n\n" + String(article.content || "").trim() + "\n";
}

function writePairAtomic(filePath, markdown, sidecarPath, sidecar) {
  const token = process.pid + "-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  const markdownTemp = filePath + ".tmp-" + token;
  const sidecarTemp = sidecarPath + ".tmp-" + token;
  let markdownMoved = false;
  let sidecarMoved = false;
  try {
    fs.writeFileSync(markdownTemp, markdown, "utf8");
    fs.writeFileSync(sidecarTemp, sidecar, "utf8");
    fs.renameSync(markdownTemp, filePath); markdownMoved = true;
    fs.renameSync(sidecarTemp, sidecarPath); sidecarMoved = true;
  } catch (error) {
    try { if (sidecarMoved) fs.unlinkSync(sidecarPath); } catch (_) {}
    try { if (markdownMoved) fs.unlinkSync(filePath); } catch (_) {}
    throw error;
  } finally {
    try { if (fs.existsSync(markdownTemp)) fs.unlinkSync(markdownTemp); } catch (_) {}
    try { if (fs.existsSync(sidecarTemp)) fs.unlinkSync(sidecarTemp); } catch (_) {}
  }
}

module.exports = { articleMarkdown, writePairAtomic };
