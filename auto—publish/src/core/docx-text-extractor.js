const mammoth = require("mammoth");

const ERROR_MESSAGES = Object.freeze({
  MATERIAL_DOCX_INVALID: "DOCX input is invalid",
  MATERIAL_DOCX_EMPTY: "DOCX does not contain readable text",
  MATERIAL_DOCX_ENCRYPTED: "DOCX is encrypted or damaged",
  MATERIAL_DOCX_CONVERSION_FAILED: "DOCX conversion failed"
});

function createDocxError(code) {
  const error = new Error(ERROR_MESSAGES[code] || ERROR_MESSAGES.MATERIAL_DOCX_CONVERSION_FAILED);
  error.code = code;
  return error;
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map(function(line) { return line.trim(); })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function mapMammothError(error) {
  if (error && ERROR_MESSAGES[error.code]) return createDocxError(error.code);
  const message = String(error && error.message || "").toLowerCase();
  if (/encrypt|password|protected/.test(message)) return createDocxError("MATERIAL_DOCX_ENCRYPTED");
  return createDocxError("MATERIAL_DOCX_CONVERSION_FAILED");
}

async function extractDocxText(input) {
  const value = input || {};
  if (!Buffer.isBuffer(value.buffer)) throw createDocxError("MATERIAL_DOCX_INVALID");

  let result;
  try {
    result = await mammoth.extractRawText({ buffer: value.buffer });
  } catch (error) {
    throw mapMammothError(error);
  }

  const text = normalizeText(result && result.value);
  if (!text) throw createDocxError("MATERIAL_DOCX_EMPTY");
  return text;
}

async function extractDocxArticle(input) {
  const value = input || {};
  const text = await extractDocxText({ buffer: value.buffer });
  const paragraphs = text.split("\n").map(function(paragraph) { return paragraph.trim(); }).filter(Boolean);
  const fallbackTitle = typeof value.fallbackTitle === "string" ? value.fallbackTitle.trim() : "";
  const title = paragraphs[0] || fallbackTitle;
  return {
    title: title,
    body: paragraphs.slice(1).join("\n\n"),
    text: text
  };
}

module.exports = { extractDocxText, extractDocxArticle };
