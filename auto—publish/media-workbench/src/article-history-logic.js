function snapshotFor(article) {
  const snapshot = article && article.templateSnapshot;
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot) ||
      typeof snapshot.id !== "string" || !snapshot.id.trim()) return null;
  return snapshot;
}

export function resolveAvailableTemplateId(article, nextTemplates) {
  if (!article) return nextTemplates[0]?.id || "";
  const snapshot = snapshotFor(article);
  if (snapshot) return snapshot.id;
  const templates = Array.isArray(nextTemplates) ? nextTemplates : [];
  const currentTemplate = templates.find((item) => item.id === article.templateId);
  if (currentTemplate) return currentTemplate.id;
  const scenarioTemplate = templates.find((item) => item.platform === article.platform && item.scenario === article.scenario);
  return scenarioTemplate?.id || templates[0]?.id || "";
}

export function summarizeTemplateSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || typeof snapshot.body !== "string" || !snapshot.body.trim()) return "";
  const compact = snapshot.body.trim().replace(/\s+/g, " ");
  return compact.length > 240 ? compact.slice(0, 240) + "…" : compact;
}

function compareCreatedAt(left, right) {
  const time = String(right.createdAt || "").localeCompare(String(left.createdAt || ""));
  return time || String(right.id || "").localeCompare(String(left.id || ""));
}

export function articleSelectionKey(article) {
  return String(article?.clientId || "") + "\u0000" + String(article?.id || "");
}

export function selectableArticles(articles, clientId) {
  return (Array.isArray(articles) ? articles : []).filter(function(article) {
    return (!clientId || article?.clientId === clientId) && (article?.status === "generated" || article?.status === "saved");
  });
}

export function selectionState(articles, selectedKeys, clientId) {
  const candidates = selectableArticles(articles, clientId);
  const selected = new Set(Array.isArray(selectedKeys) ? selectedKeys : []);
  const selectedCount = candidates.filter((article) => selected.has(articleSelectionKey(article))).length;
  return {
    total: candidates.length,
    selected: selectedCount,
    checked: candidates.length > 0 && selectedCount === candidates.length,
    indeterminate: selectedCount > 0 && selectedCount < candidates.length,
    disabled: candidates.length === 0
  };
}

export function groupArticlesByTemplate(articles) {
  const groups = new Map();
  (Array.isArray(articles) ? articles : []).forEach(function(article) {
    const snapshot = snapshotFor(article);
    const platform = snapshot ? snapshot.platform : (article && article.platform) || "";
    const templateId = snapshot ? snapshot.id : (article && article.templateId) || null;
    const hasTemplateIdentity = Boolean(platform && templateId);
    const key = snapshot || hasTemplateIdentity ? platform + ":" + templateId : "legacy";
    let group = groups.get(key);
    if (!group) {
      const legacy = !snapshot && !hasTemplateIdentity;
      group = {
        key: key,
        platform: platform,
        templateId: templateId,
        templateSnapshot: snapshot,
        name: legacy ? "旧版未分类" : snapshot ? snapshot.name : templateId,
        scenario: snapshot ? snapshot.scenario : "",
        label: legacy ? "旧版未分类" : snapshot ? snapshot.name + (snapshot.scenario ? " · " + snapshot.scenario : "") : platform + " · " + templateId,
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
