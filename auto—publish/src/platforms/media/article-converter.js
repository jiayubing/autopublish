// auto—publish/src/platforms/media/article-converter.js
// Convert document files to HTML and plain-text representations.
// CommonJS port from root src/core/article-converter.js.

const { readFile } = require('node:fs/promises');
const { extname, basename } = require('node:path');

/**
 * Convert a document file to HTML and plain-text representations.
 *
 * Supported formats:
 *   - .txt  → wraps text in <p> tags, produces plain-text as-is
 *   - .docx → uses mammoth to produce simple HTML, with a plain-text fallback
 *
 * Not supported in v1: images, tables, complex Word styles.
 *
 * @param {string} filePath - Absolute path to the article file
 * @returns {Promise<{html: string, plainText: string, sourceFile: string}>}
 */
async function convertArticle(filePath) {
  const ext = extname(filePath).toLowerCase();

  if (ext === '.txt') {
    return convertTextFile(filePath);
  }

  if (ext === '.docx') {
    return convertDocxFile(filePath);
  }

  throw new Error(
    '不支持的文件格式: \"' + ext + '\"。当前支持 .txt 和 .docx。'
  );
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function convertTextFile(filePath) {
  const raw = await readFile(filePath, 'utf-8');
  const trimmed = raw.trim();

  if (!trimmed) {
    throw new Error('文件内容为空。');
  }

  // Wrap each paragraph in <p> for the HTML version
  const paragraphs = trimmed
    .split(/\n\s*\n/)
    .map(function (p) { return p.trim(); })
    .filter(Boolean);

  const html = paragraphs.map(function (p) { return '<p>' + escapeHtml(p) + '</p>'; }).join('\n');

  return {
    html: html,
    plainText: trimmed,
    sourceFile: basename(filePath)
  };
}

async function convertDocxFile(filePath) {
  // Dynamic import: mammoth is an ESM-compatible module, use require
  const mammoth = require('mammoth');

  const buffer = await readFile(filePath);

  const result = await mammoth.convertToHtml(
    { buffer: buffer },
    {
      // Strip inline styles to keep HTML clean
      styleMap: [
        "p[style-name='Normal'] => p:fresh",
        "p[style-name='Heading 1'] => h1:fresh",
        "p[style-name='Heading 2'] => h2:fresh",
        "p[style-name='Heading 3'] => h3:fresh"
      ]
    }
  );

  const html = result.value.trim();

  if (!html) {
    throw new Error('无法从 docx 文件中提取内容。文件可能为空或不包含可识别文本。');
  }

  // Collect warnings but don't fail (non-fatal)
  if (result.messages && result.messages.length > 0) {
    const warnings = result.messages
      .filter(function (m) { return m.type === 'warning'; })
      .map(function (m) { return m.message; });
    if (warnings.length > 0) {
      console.warn('[article-converter] mammoth warnings:', warnings.join('; '));
    }
  }

  // Create a plain-text fallback by stripping HTML tags
  const plainText = stripHtml(html);

  return {
    html: html,
    plainText: plainText,
    sourceFile: basename(filePath)
  };
}

/**
 * Escape special HTML characters in plain text.
 */
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;');
}

/**
 * Naive HTML tag stripper for plain-text fallback.
 */
function stripHtml(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '\"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}



// ---------------------------------------------------------------------------
// Image detection for .docx files
// ---------------------------------------------------------------------------

/**
 * Check if a .docx file contains images by scanning the ZIP archive.
 * A .docx file is a ZIP archive; images live in word/media/.
 * We scan the raw bytes for "word/media/" directory entries.
 *
 * Returns { hasImages: boolean, imageCount: number }.
 * Does not extract or process images -- v1 only detects their presence.
 */
function detectDocxImages(filePath) {
  try {
    const fs = require('fs');
    const buf = fs.readFileSync(filePath);
    // Search for "word/media/" ZIP central directory entries
    // A ZIP entry stored with path "word/media/image1.png" will appear
    // in the raw bytes. We count occurrences of the ZIP file header
    // followed by "word/media/" entries.
    var count = 0;
    var pos = -1;
    var searchStr = 'word/media/';
    var bufStr = buf.toString('binary');
    while ((pos = bufStr.indexOf(searchStr, pos + 1)) !== -1) {
      // Verify this is likely a real file entry (not a false match in content)
      // Simple check: look for PK (0x50 0x4B) signature nearby
      count++;
    }
    if (count > 20) {
      // If we see more than 20 matches, it's probably content that happens
      // to contain "word/media/" as text -- cap it
      count = 0;
    }
    return { hasImages: count > 0, imageCount: count };
  } catch (_) {
    return { hasImages: false, imageCount: 0, detectionFailed: true };
  }
}

module.exports = { convertArticle, detectDocxImages };