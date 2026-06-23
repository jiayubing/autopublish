import { readFile } from "node:fs/promises";
import { extname, basename } from "node:path";

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
export async function convertArticle(filePath) {
  const ext = extname(filePath).toLowerCase();

  if (ext === ".txt") {
    return convertTextFile(filePath);
  }

  if (ext === ".docx") {
    return convertDocxFile(filePath);
  }

  throw new Error(
    `不支持的文件格式: "${ext}"。当前支持 .txt 和 .docx。`
  );
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function convertTextFile(filePath) {
  const raw = await readFile(filePath, "utf-8");
  const trimmed = raw.trim();

  if (!trimmed) {
    throw new Error("文件内容为空。");
  }

  // Wrap each paragraph in <p> for the HTML version
  const paragraphs = trimmed
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const html = paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("\n");

  return {
    html,
    plainText: trimmed,
    sourceFile: basename(filePath),
  };
}

async function convertDocxFile(filePath) {
  // Dynamic import: mammoth is an ESM-compatible module
  const mammoth = await import("mammoth");

  const buffer = await readFile(filePath);

  const result = await mammoth.convertToHtml(
    { buffer },
    {
      // Strip inline styles to keep HTML clean
      styleMap: [
        "p[style-name='Normal'] => p:fresh",
        "p[style-name='Heading 1'] => h1:fresh",
        "p[style-name='Heading 2'] => h2:fresh",
        "p[style-name='Heading 3'] => h3:fresh",
      ],
    }
  );

  const html = result.value.trim();

  if (!html) {
    throw new Error("无法从 docx 文件中提取内容。文件可能为空或不包含可识别文本。");
  }

  // Collect warnings but don't fail (non-fatal)
  if (result.messages && result.messages.length > 0) {
    const warnings = result.messages
      .filter((m) => m.type === "warning")
      .map((m) => m.message);
    if (warnings.length > 0) {
      console.warn("[article-converter] mammoth warnings:", warnings.join("; "));
    }
  }

  // Create a plain-text fallback by stripping HTML tags
  const plainText = stripHtml(html);

  return {
    html,
    plainText,
    sourceFile: basename(filePath),
  };
}

/**
 * Escape special HTML characters in plain text.
 */
function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Naive HTML tag stripper for plain-text fallback.
 * Not suitable for complex HTML, but adequate for mammoth's clean output.
 */
function stripHtml(html) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
