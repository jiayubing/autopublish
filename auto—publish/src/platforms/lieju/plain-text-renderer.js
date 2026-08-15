"use strict";

const { load } = require("cheerio");

const TOKEN_PREFIX = "\uE000lieju-plain-text-";
const TOKEN_SUFFIX = "\uE001";

function createTokenStore() {
  const values = [];
  return {
    put(value) {
      const index = values.push(String(value)) - 1;
      return TOKEN_PREFIX + index + TOKEN_SUFFIX;
    },
    restore(value) {
      return String(value).replace(
        new RegExp(TOKEN_PREFIX + "(\\d+)" + TOKEN_SUFFIX, "g"),
        function (_, index) {
          return values[Number(index)];
        },
      );
    },
  };
}

function protectFencedCode(value, tokens) {
  return value
    .replace(
      /^ {0,3}(`{3,}|~{3,})[^\n]*\n([\s\S]*?)^\s*\1[ \t]*(?:\n|$)/gm,
      function (_, __, code) {
        return tokens.put(code.replace(/\n$/, "")) + "\n";
      },
    )
    .replace(/^ {0,3}(?:`{3,}|~{3,}).*$/gm, "");
}

function protectInlineCode(value, tokens) {
  return value.replace(/(`+)([\s\S]*?)\1/g, function (_, __, code) {
    return tokens.put(code);
  });
}

function protectEscapedMarkdown(value, tokens) {
  return value.replace(
    /\\([\\`*_{}\[\]()#+\-.!<>|])/g,
    function (_, character) {
      return tokens.put(character);
    },
  );
}

function renderHtml(value) {
  const $ = load(value, { decodeEntities: true }, false);
  $("script, style, template, noscript").remove();
  $("img").each(function (_, element) {
    const alt = $(element).attr("alt") || "";
    $(element).replaceWith($("<span></span>").text(alt));
  });
  $("br").replaceWith("\n");
  $("ol").each(function (_, list) {
    $(list)
      .children("li")
      .each(function (index, item) {
        $(item).prepend(String(index + 1) + ". ");
      });
  });
  $("ul").each(function (_, list) {
    $(list)
      .children("li")
      .each(function (_, item) {
        $(item).prepend("• ");
      });
  });
  $("td, th").each(function (_, cell) {
    $(cell).append("\t");
  });
  $(
    "p, div, section, article, header, footer, aside, h1, h2, h3, h4, h5, h6, li, blockquote, tr, table",
  ).each(function (_, element) {
    $(element).append("\n");
  });
  return $.root().text();
}

function matchingBracket(value, start, open, close) {
  let depth = 0;
  for (let index = start; index < value.length; index += 1) {
    if (value[index] === "\\") {
      index += 1;
      continue;
    }
    if (value[index] === open) depth += 1;
    if (value[index] === close) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function referenceLabel(value) {
  return String(value).replace(/\s+/g, " ").trim().toLowerCase();
}

function collectReferenceLabels(value) {
  const labels = new Set();
  String(value).replace(/^\s*\[([^\]]+)\]:\s+\S+/gm, function (_, label) {
    labels.add(referenceLabel(label));
    return _;
  });
  return labels;
}

function replaceMarkdownLinks(value, referenceLabels) {
  let output = "";
  let index = 0;
  while (index < value.length) {
    const image = value.startsWith("![", index);
    const link = value[index] === "[";
    if (!image && !link) {
      output += value[index];
      index += 1;
      continue;
    }
    const labelStart = index + (image ? 2 : 1);
    const labelEnd = matchingBracket(value, labelStart - 1, "[", "]");
    if (labelEnd < 0) {
      output += value[index];
      index += 1;
      continue;
    }
    const label = value.slice(labelStart, labelEnd);
    const next = value[labelEnd + 1];
    if (next === "(") {
      const destinationEnd = matchingBracket(value, labelEnd + 1, "(", ")");
      if (destinationEnd >= 0) {
        output += label;
        index = destinationEnd + 1;
        continue;
      }
    }
    if (next === "[") {
      const referenceEnd = matchingBracket(value, labelEnd + 1, "[", "]");
      if (referenceEnd >= 0) {
        output += label;
        index = referenceEnd + 1;
        continue;
      }
    }
    if (referenceLabels.has(referenceLabel(label))) {
      output += label;
      index = labelEnd + 1;
      continue;
    }
    output += value[index];
    index += 1;
  }
  return output;
}

function renderInline(value, referenceLabels) {
  let rendered = replaceMarkdownLinks(value, referenceLabels);
  for (let pass = 0; pass < 3; pass += 1) {
    rendered = rendered
      .replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, "$2")
      .replace(/(\*|_)(?=\S)([\s\S]*?\S)\1/g, "$2")
      .replace(/~~(?=\S)([\s\S]*?\S)~~/g, "$1");
  }
  return rendered.replace(/[ \t]+$/g, "");
}

function isTableDivider(value) {
  return /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(value);
}

function tableRow(value, referenceLabels) {
  let row = value.trim();
  if (row.startsWith("|")) row = row.slice(1);
  if (row.endsWith("|")) row = row.slice(0, -1);
  return row
    .split("|")
    .map(function (cell) {
      return renderInline(cell.trim(), referenceLabels);
    })
    .join("\t");
}

function renderBlockLine(value, referenceLabels) {
  let line = value;
  if (/^\s*(?:[-*_]\s*){3,}$/.test(line)) return "";
  if (/^\s*\[[^\]]+\]:\s+\S+/.test(line)) return "";

  const heading = /^\s{0,3}#{1,6}\s+(.+?)(?:\s+#+)?\s*$/.exec(line);
  if (heading) return renderInline(heading[1], referenceLabels);

  const quote = /^(\s*)((?:>\s*)+)(.*)$/.exec(line);
  if (quote) {
    const depth = (quote[2].match(/>/g) || []).length;
    return (
      quote[1] +
      "引用" +
      (depth > 1 ? "（" + depth + "）" : "") +
      "：" +
      renderBlockLine(quote[3], referenceLabels)
    );
  }

  const unordered = /^(\s*)[-+*]\s+(.*)$/.exec(line);
  if (unordered)
    return unordered[1] + "• " + renderInline(unordered[2], referenceLabels);

  const ordered = /^(\s*)(\d+)[.)]\s+(.*)$/.exec(line);
  if (ordered)
    return (
      ordered[1] + ordered[2] + ". " + renderInline(ordered[3], referenceLabels)
    );

  return renderInline(line, referenceLabels);
}

function renderMarkdownBlocks(value) {
  const lines = value.split("\n");
  const output = [];
  const referenceLabels = collectReferenceLabels(value);
  let table = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (isTableDivider(line)) {
      table = true;
      continue;
    }
    const hasTableRow = line.includes("|");
    const beginsTable = hasTableRow && isTableDivider(lines[index + 1] || "");
    if ((table && hasTableRow) || beginsTable) {
      output.push(tableRow(line, referenceLabels));
      table = true;
      continue;
    }
    table = false;
    if (
      /^\s*(?:=+|-+)\s*$/.test(line) &&
      output.length > 0 &&
      output[output.length - 1].trim()
    )
      continue;
    output.push(renderBlockLine(line, referenceLabels));
  }
  return output.join("\n");
}

function renderLiejuPlainText(markdown) {
  const tokens = createTokenStore();
  let value = String(markdown).replace(/\r\n?/g, "\n");
  value = protectFencedCode(value, tokens);
  value = protectInlineCode(value, tokens);
  value = protectEscapedMarkdown(value, tokens);
  value = value.replace(/<((?:https?:\/\/|mailto:)[^<>\s]+)>/gi, "$1");
  value = renderHtml(value);
  value = renderMarkdownBlocks(value);
  value = value
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return tokens.restore(value);
}

module.exports = Object.freeze({ renderLiejuPlainText });
