// Convert document files to HTML and plain-text representations.

const { readFile } = require('node:fs/promises');
const { extname, basename } = require('node:path');
const { reportDiagnostic } = require('../../diagnostics/diagnostic-producer');

/**
 * Convert a document file to HTML and plain-text representations.
 *
 * Supported formats:
 *   - .txt  wraps text in <p> tags, produces plain-text as-is
 *   - .docx uses mammoth to produce simple HTML, with a plain-text fallback
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

  if (ext === '.md') {
    return convertMarkdownFile(filePath);
  }

  if (ext === '.docx') {
    return convertDocxFile(filePath);
  }

  throw new Error('不支持的文件格式: "' + ext + '"。当前支持 .txt、.md 和 .docx。');
}


async function convertMarkdownFile(filePath) {
  const raw = await readFile(filePath, 'utf-8');
  const trimmed = raw.trim();

  if (!trimmed) {
    throw new Error('文件内容为空。');
  }

  const blocks = trimmed.split(/\n\s*\n/).map(function(block) {
    return block.trim();
  }).filter(Boolean);

  const html = blocks.map(function(block) {
    if (/^#\s+/.test(block)) {
      return '<h1>' + escapeHtml(block.replace(/^#\s+/, '').trim()) + '</h1>';
    }
    if (/^##\s+/.test(block)) {
      return '<h2>' + escapeHtml(block.replace(/^##\s+/, '').trim()) + '</h2>';
    }
    return '<p>' + escapeHtml(block) + '</p>';
  }).join('\n');

  return {
    html: html,
    plainText: trimmed.replace(/^#{1,6}\s+/gm, ''),
    sourceFile: basename(filePath)
  };
}

async function convertTextFile(filePath) {
  const raw = await readFile(filePath, 'utf-8');
  const trimmed = raw.trim();

  if (!trimmed) {
    throw new Error('文件内容为空。');
  }

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
  const mammoth = require('mammoth');
  const buffer = await readFile(filePath);

  const result = await mammoth.convertToHtml(
    { buffer: buffer },
    {
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

  if (result.messages && result.messages.length > 0) {
    const warnings = result.messages
      .filter(function (m) { return m.type === 'warning'; })
      .map(function (m) { return m.message; });
    if (warnings.length > 0) {
      reportDiagnostic({
        code: 'ARTICLE_CONVERTER_WARNINGS',
        module: 'media-article-converter',
        category: 'validation',
        operationId: 'article-convert',
        metadata: { itemCount: warnings.length },
      });
    }
  }

  return {
    html: html,
    plainText: stripHtml(html),
    sourceFile: basename(filePath)
  };
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function stripHtml(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Check if a .docx file contains images by scanning the ZIP archive.
 * A .docx file is a ZIP archive; images live in word/media/.
 *
 * Returns { hasImages: boolean, imageCount: number }.
 */
function detectDocxImages(filePath) {
  try {
    const fs = require('fs');
    const bufStr = fs.readFileSync(filePath).toString('binary');
    var count = 0;
    var pos = -1;
    var searchStr = 'word/media/';
    while ((pos = bufStr.indexOf(searchStr, pos + 1)) !== -1) {
      count++;
    }
    if (count > 20) {
      count = 0;
    }
    return { hasImages: count > 0, imageCount: count };
  } catch (_) {
    return { hasImages: false, imageCount: 0, detectionFailed: true };
  }
}

module.exports = { convertArticle, detectDocxImages };
