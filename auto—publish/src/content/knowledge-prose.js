"use strict";
const { geoError } = require("./geo-knowledge-schema");

// Selection preserves complete sections; the saved Markdown remains authoritative.
function selectKnowledgeProse(document, topic, maxCharacters = 50000) {
  const prose = document.deliverable;
  if (!prose) return null;
  const chunks = prose.markdown
    .split(/(?=^##\s+)/mu)
    .filter((value) => value.trim());
  const sections = chunks.map((markdown, index) => ({
    title: markdown.match(/^##\s+([^\n]+)/u)?.[1].trim() || "正文说明",
    markdown,
    index,
  }));
  let selected = sections;
  if (prose.markdown.length > maxCharacters) {
    const terms =
      String(topic || "")
        .normalize("NFKC")
        .toLowerCase()
        .match(/[\p{L}\p{N}]{2,}/gu) || [];
    const tokens = terms.flatMap((term) => [
      term,
      ...Array.from({ length: Math.max(0, term.length - 1) }, (_, i) =>
        term.slice(i, i + 2),
      ),
    ]);
    const ranked = sections
      .map((section) => ({
        ...section,
        score: tokens.reduce(
          (sum, token) =>
            sum + (section.markdown.toLowerCase().includes(token) ? 1 : 0),
          0,
        ),
      }))
      .sort((a, b) => b.score - a.score || a.index - b.index);
    selected = [];
    let length = 0;
    for (const section of ranked)
      if (length + section.markdown.length + 2 <= maxCharacters) {
        selected.push(section);
        length += section.markdown.length + 2;
      }
    selected.sort((a, b) => a.index - b.index);
    if (!selected.some((section) => section.title !== "正文说明"))
      throw geoError("GEO_CONTEXT_TOO_LARGE");
  }
  const titles = selected.map((section) => section.title);
  const sectionEvidence = (prose.sectionEvidence || []).filter((item) =>
    titles.includes(item.title),
  );
  const sourceIds = new Set(
    prose.sourceIds || document.sources.map((source) => source.id),
  );
  return {
    contentRevision: prose.contentRevision || 1,
    savedAt: prose.savedAt || document.updatedAt,
    origin: prose.origin || "legacy",
    markdown:
      selected.length === sections.length
        ? prose.markdown
        : selected.map((section) => section.markdown.trim()).join("\n\n"),
    selectedSections: titles,
    omittedSections: sections
      .filter(
        (section) => !selected.some((item) => item.index === section.index),
      )
      .map((section) => section.title),
    sectionEvidence,
    sources: document.sources.filter((source) => sourceIds.has(source.id)),
    usageRules:
      "九板块正文是主要客户内容。客户自述不是独立认证；public_research 只作为公开信息，industry_context 是行业背景，不得改写为客户事实；derived 是分析。人工编辑或旧稿的来源只供参考，不能声称逐句核实。保密、禁用、易变和冲突限制优先。",
  };
}
module.exports = { selectKnowledgeProse };
