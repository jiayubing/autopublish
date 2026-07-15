function snapshotFor(article) {
  const snapshot = article && article.templateSnapshot;
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot) ||
      typeof snapshot.id !== "string" || !snapshot.id.trim()) return null;
  return snapshot;
}

function compareCreatedAt(left, right) {
  const time = String(right.createdAt || "").localeCompare(String(left.createdAt || ""));
  return time || String(right.id || "").localeCompare(String(left.id || ""));
}

export function groupArticlesByTemplate(articles) {
  const groups = new Map();
  (Array.isArray(articles) ? articles : []).forEach(function(article) {
    const snapshot = snapshotFor(article);
    const platform = snapshot ? snapshot.platform : (article && article.platform) || "";
    const templateId = snapshot ? snapshot.id : null;
    const key = snapshot ? platform + ":" + templateId : "legacy";
    let group = groups.get(key);
    if (!group) {
      const legacy = !snapshot;
      group = {
        key: key,
        platform: platform,
        templateId: templateId,
        templateSnapshot: snapshot,
        name: legacy ? "旧版未分类" : snapshot.name,
        scenario: legacy ? "" : snapshot.scenario,
        label: legacy ? "旧版未分类" : snapshot.name + (snapshot.scenario ? " · " + snapshot.scenario : ""),
        articles: []
      };
      groups.set(key, group);
    }
    group.articles.push(article);
  });
  const result = Array.from(groups.values());
  result.forEach(function(group) { group.articles.sort(compareCreatedAt); });
  result.sort(function(left, right) {
    const leftLatest = left.articles[0] && left.articles[0].createdAt || "";
    const rightLatest = right.articles[0] && right.articles[0].createdAt || "";
    return String(rightLatest).localeCompare(String(leftLatest)) || left.key.localeCompare(right.key);
  });
  return result;
}
