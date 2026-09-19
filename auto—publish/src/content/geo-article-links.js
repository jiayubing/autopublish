"use strict";
const { projectArticleLifecycle } = require("./article-lifecycle-projection");

async function queryGeoArticles(
  { contentStore, operationalStore },
  clientId,
  questionId,
) {
  const summaries = await contentStore.listArticleSummariesAsync(clientId);
  const matched = summaries.filter((article) =>
    article.geoQuestionIds?.includes(questionId),
  );
  const articles = [];
  let publishedCount = 0;
  for (let offset = 0; offset < matched.length; offset += 500) {
    const batch = matched.slice(offset, offset + 500);
    const facts = operationalStore.listArticleLifecycleFacts({
      articleIds: batch.map((a) => a.id),
    });
    const projection = projectArticleLifecycle({ ...facts, articles: batch });
    for (const article of batch) {
      const workflow = projection.byArticle[article.id];
      if (workflow.stage === "published") publishedCount++;
      if (articles.length < 100)
        articles.push({
          id: article.id,
          title: article.title,
          stage: workflow.stage,
          label: workflow.label,
        });
    }
  }
  return { articles, total: matched.length, publishedCount };
}
module.exports = { queryGeoArticles };
