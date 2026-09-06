const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

let articleMatchesLibraryDateRange;
let groupArticlesByTemplate;
let groupPublishedArticlesByTarget;
let publishedArticleMatchesDateRange;
let publishedTimeFactFromEvidence;
let publishedTimeFactsByArticle;
let resolveAvailableTemplateId;
let summarizeTemplateSnapshot;
let articleSelectionKey;
let selectableArticles;
let selectionState;

function item(id, platform, templateId, createdAt, overrides) {
  return Object.assign({
    id: id,
    clientId: "c1",
    platform: platform,
    templateId: templateId,
    title: id,
    content: "body",
    status: "generated",
    createdAt: createdAt,
    updatedAt: createdAt,
    templateSnapshot: { platform: platform, id: templateId, name: templateId + " name", scenario: "guide", body: "body", bodyHash: templateId + " hash" }
  }, overrides || {});
}

function publishedArchive(articleId, targetSnapshotV1, firstPublishedAt, firstPublishedAtSource) {
  return {
    publicationId: "publication-" + articleId,
    publicationEvidence: {
      articleIdentityV1: { articleId },
      targetSnapshotV1,
      firstPublishedAt,
      firstPublishedAtSource,
    },
  };
}

describe("article history grouping", async function() {
  const historyLogic = await import("../media-workbench/src/article-history-logic.js");
  articleMatchesLibraryDateRange = historyLogic.articleMatchesLibraryDateRange;
  groupArticlesByTemplate = historyLogic.groupArticlesByTemplate;
  groupPublishedArticlesByTarget = historyLogic.groupPublishedArticlesByTarget;
  publishedArticleMatchesDateRange = historyLogic.publishedArticleMatchesDateRange;
  publishedTimeFactFromEvidence = historyLogic.publishedTimeFactFromEvidence;
  publishedTimeFactsByArticle = historyLogic.publishedTimeFactsByArticle;
  resolveAvailableTemplateId = historyLogic.resolveAvailableTemplateId;
  summarizeTemplateSnapshot = historyLogic.summarizeTemplateSnapshot;
  articleSelectionKey = historyLogic.articleSelectionKey;
  selectableArticles = historyLogic.selectableArticles;
  selectionState = historyLogic.selectionState;
  it("groups by platform and template snapshot, sorting groups and articles by createdAt", function() {
    const groups = groupArticlesByTemplate([
      item("old-a", "ctrip", "a", "2026-07-10T00:00:00.000Z"),
      item("new-b", "toutiao", "b", "2026-07-14T00:00:00.000Z"),
      item("new-a", "ctrip", "a", "2026-07-13T00:00:00.000Z", { updatedAt: "2026-07-15T00:00:00.000Z" }),
      item("old-b", "toutiao", "b", "2026-07-11T00:00:00.000Z")
    ]);

    assert.deepStrictEqual(groups.map((group) => group.key), ["toutiao:b", "ctrip:a"]);
    assert.deepStrictEqual(groups[0].articles.map((article) => article.id), ["new-b", "old-b"]);
    assert.deepStrictEqual(groups[1].articles.map((article) => article.id), ["new-a", "old-a"]);
  });

  it("uses the saved template snapshot after template deletion and keeps old articles visible", function() {
    const historical = item("historical", "ctrip", "deleted-template", "2026-07-12T00:00:00.000Z");
    assert.equal(resolveAvailableTemplateId(historical, [{ id: "current", platform: "ctrip", scenario: "guide" }]), "deleted-template");
    assert.equal(summarizeTemplateSnapshot(historical.templateSnapshot), "body");

    const groups = groupArticlesByTemplate([item("legacy", "", undefined, "2026-07-12T00:00:00.000Z", { templateSnapshot: undefined })]);

    assert.equal(groups.length, 1);
    assert.equal(groups[0].label, "旧版未分类");
    assert.deepStrictEqual(groups[0].articles.map((article) => article.id), ["legacy"]);
  });

  it("separates legacy articles by platform and template id when available", function() {
    const groups = groupArticlesByTemplate([
      item("ctrip-legacy", "ctrip", "old-guide", "2026-07-12T00:00:00.000Z", { templateSnapshot: undefined }),
      item("toutiao-legacy", "toutiao", "old-news", "2026-07-13T00:00:00.000Z", { templateSnapshot: undefined }),
    ]);

    assert.deepStrictEqual(groups.map((group) => group.key), ["toutiao:old-news", "ctrip:old-guide"]);
    assert.deepStrictEqual(groups.map((group) => group.articles.map((article) => article.id)), [["toutiao-legacy"], ["ctrip-legacy"]]);
  });

  it("groups published articles by the real publication platform instead of the generation template", function() {
    const article = item("published-lieju", "generation-platform", "generation-template", "2026-07-15T00:00:00.000Z");
    const groups = groupPublishedArticlesByTarget(
      [article],
      [{
        publicationId: "publication-lieju",
        publicationEvidence: {
          articleIdentityV1: { articleId: article.id },
          targetSnapshotV1: {
            kind: "platform",
            platformId: "lieju",
            platformName: "列举网",
          },
        },
      }],
      [],
    );

    assert.equal(groups.length, 1);
    assert.equal(groups[0].key, "published:platform:lieju");
    assert.equal(groups[0].displayTitle, "列举网");
    assert.deepStrictEqual(groups[0].articles.map((value) => value.id), [article.id]);
  });

  it("keeps all paid media in one published group and labels the media on each article", function() {
    const first = item("paid-a", "generation-platform", "generation-template", "2026-07-14T00:00:00.000Z");
    const second = item("paid-b", "generation-platform", "generation-template", "2026-07-15T00:00:00.000Z");
    const groups = groupPublishedArticlesByTarget(
      [first, second],
      [
        publishedArchive(first.id, {
          kind: "media",
          mediaResourceId: "media-a",
          mediaName: "中华网",
        }, "2026-08-20T02:00:00.000Z", "provider_event_time"),
        publishedArchive(second.id, {
          kind: "media",
          mediaResourceId: "media-b",
          mediaName: "中国网",
        }, "2026-08-20T01:00:00.000Z", "provider_event_time"),
      ],
      [],
    );

    assert.equal(groups.length, 1);
    assert.equal(groups[0].key, "published:media");
    assert.equal(groups[0].displayTitle, "付费媒体");
    assert.deepStrictEqual(groups[0].articles.map((value) => value.id), [first.id, second.id]);
    assert.deepStrictEqual(groups[0].articleAnnotations, {
      [first.id]: "媒体：中华网",
      [second.id]: "媒体：中国网",
    });
  });

  it("sorts published groups and articles by reliable publication time with stable unknowns", function() {
    const lieju = { kind: "platform", platformId: "lieju", platformName: "列举网" };
    const hepan = { kind: "platform", platformId: "hepan", platformName: "蓝色河畔" };
    const generatedEarlyPublishedLate = item("generated-early-published-late", "generation", "template", "2026-06-01T00:00:00.000Z");
    const generatedLatePublishedEarly = item("generated-late-published-early", "generation", "template", "2026-08-20T00:00:00.000Z");
    const unknownFirst = item("unknown-first", "generation", "template", "2026-09-10T00:00:00.000Z");
    const unknownSecond = item("unknown-second", "generation", "template", "2026-09-11T00:00:00.000Z");
    const otherGroupLatest = item("other-group-latest", "generation", "template", "2026-01-01T00:00:00.000Z");
    const groups = groupPublishedArticlesByTarget(
      [generatedEarlyPublishedLate, generatedLatePublishedEarly, unknownFirst, unknownSecond, otherGroupLatest],
      [
        publishedArchive(generatedEarlyPublishedLate.id, lieju, "2026-08-31T16:30:00.000Z", "first_positive_observation_time"),
        publishedArchive(generatedLatePublishedEarly.id, lieju, "2026-08-31T15:30:00.000Z", "provider_event_time"),
        publishedArchive(unknownFirst.id, lieju, null, "legacy_unavailable"),
        publishedArchive(unknownSecond.id, lieju, null, "legacy_unavailable"),
        publishedArchive(otherGroupLatest.id, hepan, "2026-09-01T02:00:00.000Z", "provider_event_time"),
      ],
      [],
    );

    assert.deepStrictEqual(groups.map((group) => group.key), ["published:platform:hepan", "published:platform:lieju"]);
    assert.deepStrictEqual(groups[1].articles.map((article) => article.id), [
      generatedEarlyPublishedLate.id,
      generatedLatePublishedEarly.id,
      unknownFirst.id,
      unknownSecond.id,
    ]);
  });

  it("filters published articles by Beijing publication date without generation-time fallback", function() {
    const target = { kind: "platform", platformId: "lieju", platformName: "列举网" };
    const facts = publishedTimeFactsByArticle([
      publishedArchive("september-in-beijing", target, "2026-08-31T16:00:00.000Z", "provider_event_time"),
      publishedArchive("august-in-beijing", target, "2026-08-31T15:59:59.999Z", "first_positive_observation_time"),
      publishedArchive("unknown", target, null, "legacy_unavailable"),
    ]);

    assert.equal(publishedArticleMatchesDateRange("september-in-beijing", facts, "2026-09-01", "2026-09-01"), true);
    assert.equal(publishedArticleMatchesDateRange("september-in-beijing", facts, "2026-08-31", "2026-08-31"), false);
    assert.equal(publishedArticleMatchesDateRange("august-in-beijing", facts, "2026-08-31", "2026-08-31"), true);
    assert.equal(publishedArticleMatchesDateRange("unknown", facts, "", ""), true);
    assert.equal(publishedArticleMatchesDateRange("unknown", facts, "2026-09-01", "2026-09-01"), false);
    assert.equal(
      articleMatchesLibraryDateRange(
        { id: "unknown", createdAt: "2026-09-01T12:00:00.000Z" },
        "published",
        facts,
        "2026-09-01",
        "2026-09-01",
      ),
      false,
    );
    assert.equal(
      articleMatchesLibraryDateRange(
        { id: "unknown", createdAt: "2026-09-01T12:00:00.000Z" },
        "all",
        facts,
        "2026-09-01",
        "2026-09-01",
      ),
      true,
    );
  });

  it("maps the three reliable publication-time sources and fails closed for legacy time", function() {
    const at = "2026-08-20T00:01:00.000Z";
    assert.equal(publishedTimeFactFromEvidence({ firstPublishedAt: at, firstPublishedAtSource: "provider_event_time" }).label, "发布时间");
    assert.equal(publishedTimeFactFromEvidence({ firstPublishedAt: at, firstPublishedAtSource: "first_positive_observation_time" }).label, "确认发布时间");
    assert.equal(publishedTimeFactFromEvidence({ firstPublishedAt: at, firstPublishedAtSource: "manual_positive_evidence_time" }).label, "人工确认时间");
    assert.equal(publishedTimeFactFromEvidence({ firstPublishedAt: null, firstPublishedAtSource: "legacy_unavailable" }), null);
  });

  it("falls back to a published history record when legacy data has no archive", function() {
    const article = item("legacy-published", "generation-platform", "generation-template", "2026-07-15T00:00:00.000Z");
    const groups = groupPublishedArticlesByTarget(
      [article],
      [],
      [{
        publicationId: "legacy-publication",
        articleId: article.id,
        status: "published",
        platformId: "hepan",
        mediaResourceId: null,
        displayName: "蓝色河畔",
      }],
    );

    assert.equal(groups[0].displayTitle, "蓝色河畔");
    assert.equal(groups[0].key, "published:platform:hepan");
  });

  it("selects a manually saved result without a review status gate", function() {
    const saved = item("saved", "ctrip", "guide", "2026-07-15T00:00:00.000Z", { status: "manual" });
    assert.deepStrictEqual(selectableArticles([saved], "c1"), [saved]);
    assert.deepStrictEqual(selectionState([saved], [articleSelectionKey(saved)], "c1"), {
      total: 1, selected: 1, checked: true, indeterminate: false, disabled: false
    });
  });

  it("keeps generated and saved articles in one mixed selection with indeterminate state", function() {
    const generated = item("generated", "ctrip", "guide", "2026-07-15T00:00:00.000Z");
    const saved = item("saved", "ctrip", "guide", "2026-07-14T00:00:00.000Z", { status: "saved" });
    const foreign = item("foreign", "ctrip", "guide", "2026-07-13T00:00:00.000Z", { clientId: "other-client", status: "saved" });
    const state = selectionState([generated, saved, foreign], [articleSelectionKey(generated)], "c1");
    assert.deepStrictEqual(selectableArticles([generated, saved, foreign], "c1").map((article) => article.id), ["generated", "saved"]);
    assert.equal(state.total, 2);
    assert.equal(state.selected, 1);
    assert.equal(state.checked, false);
    assert.equal(state.indeterminate, true);
    assert.equal(state.disabled, false);
  });

  it("scopes selection state to the currently filtered result", function() {
    const generated = item("generated", "ctrip", "guide", "2026-07-15T00:00:00.000Z");
    const saved = item("saved", "ctrip", "guide", "2026-07-14T00:00:00.000Z", { status: "saved" });
    const selectedSaved = [articleSelectionKey(saved)];
    assert.deepStrictEqual(selectionState([generated], selectedSaved, "c1"), {
      total: 1, selected: 0, checked: false, indeterminate: false, disabled: false
    });
    assert.deepStrictEqual(selectionState([saved], selectedSaved, "c1"), {
      total: 1, selected: 1, checked: true, indeterminate: false, disabled: false
    });
  });
});
