"use strict";

function inlineMarkdown(value) {
  return value
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*([^*\n]+)\*\*/g, "[b]$1[/b]")
    .replace(/__([^_\n]+)__/g, "[b]$1[/b]")
    .replace(/`([^`\n]+)`/g, "$1");
}

function toHepanBbcode(input) {
  if (typeof input !== "string") return "";
  const safe = input.replace(/\r\n?/g, "\n")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "");
  const lines = safe.split("\n");
  const output = [];
  let list = [];
  function flushList() {
    if (!list.length) return;
    output.push("[list]" + list.map((item) => `[*]${item}`).join("") + "[/list]");
    list = [];
  }
  for (const sourceLine of lines) {
    const line = sourceLine.trimEnd();
    const bullet = line.match(/^\s*[-*+]\s+(.+)$/);
    if (bullet) { list.push(inlineMarkdown(bullet[1].trim())); continue; }
    flushList();
    const heading = line.match(/^\s{0,3}#{1,6}\s+(.+)$/);
    if (heading) { output.push(`[size=5][b]${inlineMarkdown(heading[1].trim())}[/b][/size]`); continue; }
    const quote = line.match(/^\s*>\s?(.*)$/);
    if (quote) { output.push(`[quote]${inlineMarkdown(quote[1])}[/quote]`); continue; }
    output.push(inlineMarkdown(line));
  }
  flushList();
  return output.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
module.exports = { toHepanBbcode };
