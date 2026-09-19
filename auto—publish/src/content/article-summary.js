// Display metadata is derived from a validated article, never accepted as a
// replacement for the article used by a mutation or publication command.
function projectArticleSummary(article) {
  const summary = { summaryVersion: 1, hasContent: typeof article.content === "string"
    ? Boolean(article.content.trim()) : article.summaryVersion === 1 && article.hasContent === true };
  for (const field of ["id", "clientId", "title", "status", "createdAt", "updatedAt",
    "platform", "scenario", "templateId", "generationBatchId", "generationTaskId",
    "generationOperationId", "researchQueryId", "materialIds", "researchQueryIds", "source"]) {
    if (article[field] !== undefined) summary[field] = JSON.parse(JSON.stringify(article[field]));
  }
  if (article.templateSnapshot) {
    summary.templateSnapshot = {};
    for (const field of ["platform", "id", "name", "scenario", "source"])
      if (article.templateSnapshot[field] !== undefined)
        summary.templateSnapshot[field] = article.templateSnapshot[field];
  }
  if (article.knowledgeSnapshot) summary.geoQuestionIds = article.knowledgeSnapshot.questions.map(q => q.id);
  else if (article.summaryVersion === 1 && Array.isArray(article.geoQuestionIds)) summary.geoQuestionIds = article.geoQuestionIds.slice();
  return summary;
}

function articleHasContent(article) {
  if (!article) return false;
  return typeof article.content === "string" ? Boolean(article.content.trim())
    : article.summaryVersion === 1 && article.hasContent === true;
}

module.exports = { projectArticleSummary, articleHasContent };
