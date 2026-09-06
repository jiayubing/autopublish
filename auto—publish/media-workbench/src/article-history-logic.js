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

const PUBLISHED_TIME_LABELS = Object.freeze({
  provider_event_time: "发布时间",
  first_positive_observation_time: "确认发布时间",
  manual_positive_evidence_time: "人工确认时间",
});

export function publishedTimeFactFromEvidence(evidence) {
  if (!evidence || typeof evidence !== "object") return null;
  const firstPublishedAt =
    typeof evidence.firstPublishedAt === "string"
      ? evidence.firstPublishedAt.trim()
      : "";
  const firstPublishedAtSource =
    typeof evidence.firstPublishedAtSource === "string"
      ? evidence.firstPublishedAtSource
      : "";
  const label = PUBLISHED_TIME_LABELS[firstPublishedAtSource];
  const timestamp = firstPublishedAt ? Date.parse(firstPublishedAt) : NaN;
  if (!label || !Number.isFinite(timestamp)) return null;
  return {
    firstPublishedAt,
    firstPublishedAtSource,
    label,
    timestamp,
  };
}

export function publishedTimeFactsByArticle(publishedArchives) {
  const facts = new Map();
  (Array.isArray(publishedArchives) ? publishedArchives : []).forEach(function(entry) {
    const articleId = entry?.publicationEvidence?.articleIdentityV1?.articleId;
    if (!articleId || facts.has(articleId)) return;
    facts.set(articleId, publishedTimeFactFromEvidence(entry.publicationEvidence));
  });
  return facts;
}

export function publishedArticleMatchesDateRange(
  articleId,
  publishedTimeFacts,
  fromDate,
  toDate,
) {
  if (!fromDate && !toDate) return true;
  const fact = publishedTimeFacts instanceof Map
    ? publishedTimeFacts.get(articleId)
    : null;
  if (!fact) return false;
  if (fromDate) {
    const start = Date.parse(String(fromDate) + "T00:00:00+08:00");
    if (!Number.isFinite(start) || fact.timestamp < start) return false;
  }
  if (toDate) {
    const end = Date.parse(String(toDate) + "T23:59:59.999+08:00");
    if (!Number.isFinite(end) || fact.timestamp > end) return false;
  }
  return true;
}

export function articleMatchesLibraryDateRange(
  article,
  selectedStage,
  publishedTimeFacts,
  fromDate,
  toDate,
) {
  if (!fromDate && !toDate) return true;
  if (selectedStage === "published")
    return publishedArticleMatchesDateRange(
      article?.id,
      publishedTimeFacts,
      fromDate,
      toDate,
    );
  const createdDate = String(article?.createdAt || "").slice(0, 10);
  return (
    (!fromDate || createdDate >= fromDate) &&
    (!toDate || createdDate <= toDate)
  );
}

function comparePublishedAt(left, right, publishedTimeFacts) {
  const leftFact = publishedTimeFacts.get(left?.id) || null;
  const rightFact = publishedTimeFacts.get(right?.id) || null;
  if (leftFact && rightFact) return rightFact.timestamp - leftFact.timestamp;
  if (leftFact) return -1;
  if (rightFact) return 1;
  return 0;
}

export function articleSelectionKey(article) {
  return String(article?.clientId || "") + "\u0000" + String(article?.id || "");
}

export function selectableArticles(articles, clientId) {
  return (Array.isArray(articles) ? articles : []).filter(function(article) {
    return (!clientId || article?.clientId === clientId) && typeof article?.id === "string" && Boolean(article.id.trim());
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

function publishedTargetFromArchive(entry) {
  const snapshot = entry?.publicationEvidence?.targetSnapshotV1;
  if (!snapshot || typeof snapshot !== "object") return null;
  if (snapshot.kind === "media") {
    const mediaName = snapshot.mediaName || snapshot.mediaResourceId || "媒体未记录";
    return {
      key: "published:media",
      displayTitle: "付费媒体",
      articleLabel: "媒体：" + mediaName,
    };
  }
  if (snapshot.kind === "platform" || snapshot.kind === "legacy-unknown-account") {
    const platformId = snapshot.platformId || "";
    const platformName = snapshot.platformName || platformId || "历史发布";
    return {
      key: "published:platform:" + (platformId || platformName),
      displayTitle: platformName,
      articleLabel: null,
    };
  }
  return null;
}

function publishedTargetFromRecord(record) {
  if (!record || record.status !== "published") return null;
  if (record.mediaResourceId) {
    return {
      key: "published:media",
      displayTitle: "付费媒体",
      articleLabel: "媒体：" + (record.displayName || record.mediaResourceId),
    };
  }
  if (record.platformId || record.displayName) {
    const platformName = record.displayName || record.platformId;
    return {
      key: "published:platform:" + (record.platformId || platformName),
      displayTitle: platformName,
      articleLabel: null,
    };
  }
  return null;
}

export function groupPublishedArticlesByTarget(articles, publishedArchives, publicationRecords) {
  const targetsByArticle = new Map();

  (Array.isArray(publishedArchives) ? publishedArchives : []).forEach(function(entry) {
    const articleId = entry?.publicationEvidence?.articleIdentityV1?.articleId;
    if (!articleId || targetsByArticle.has(articleId)) return;
    const target = publishedTargetFromArchive(entry);
    if (target) targetsByArticle.set(articleId, target);
  });

  (Array.isArray(publicationRecords) ? publicationRecords : []).forEach(function(record) {
    const articleId = record?.articleId;
    if (!articleId || targetsByArticle.has(articleId)) return;
    const target = publishedTargetFromRecord(record);
    if (target) targetsByArticle.set(articleId, target);
  });

  const groups = new Map();
  (Array.isArray(articles) ? articles : []).forEach(function(article) {
    const target = targetsByArticle.get(article?.id) || {
      key: "published:legacy",
      displayTitle: "历史发布",
      articleLabel: null,
    };
    let group = groups.get(target.key);
    if (!group) {
      group = {
        key: target.key,
        platform: target.displayTitle,
        label: target.displayTitle,
        templateSnapshot: null,
        displayTitle: target.displayTitle,
        articleAnnotations: {},
        articles: [],
      };
      groups.set(target.key, group);
    }
    group.articles.push(article);
    if (target.articleLabel) group.articleAnnotations[article.id] = target.articleLabel;
  });

  const publishedTimeFacts = publishedTimeFactsByArticle(publishedArchives);
  const result = Array.from(groups.values());
  result.forEach(function(group) {
    group.articles.sort(function(left, right) {
      return comparePublishedAt(left, right, publishedTimeFacts);
    });
  });
  result.sort(function(left, right) {
    const leftLatest = publishedTimeFacts.get(left.articles[0]?.id) || null;
    const rightLatest = publishedTimeFacts.get(right.articles[0]?.id) || null;
    if (leftLatest && rightLatest)
      return rightLatest.timestamp - leftLatest.timestamp;
    if (leftLatest) return -1;
    if (rightLatest) return 1;
    return 0;
  });
  return result;
}
