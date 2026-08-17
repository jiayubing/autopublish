"use strict";

const crypto = require("node:crypto");
const domain = require("../../src/domain");
const { canonicalArticleRefs } = require("../../src/content/article-ref");
const { fingerprintArticle } = require("../../src/content/content-store");
const {
  deriveArticleLifecycle,
} = require("../../src/content/article-lifecycle-projection");

const MAX_ARTICLES = 1000;
const MAX_TITLE_LENGTH = 30;
const MAX_PRICE = 100000000;
const CONFIRMATION_TTL_MS = 5 * 60 * 1000;

function preflightError(code, message, metadata) {
  const error = new Error(message || code);
  error.code = code;
  if (metadata && typeof metadata === "object") {
    Object.defineProperty(error, "safeMetadata", {
      value: Object.freeze(Object.assign({}, metadata)),
      enumerable: false,
    });
  }
  return error;
}

function nowIso(clock) {
  const value =
    typeof clock === "function" ? clock() : new Date().toISOString();
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime()))
    throw preflightError("PAID_MEDIA_CLOCK_INVALID");
  return date.toISOString();
}

function nowMs(clock) {
  return Date.parse(nowIso(clock));
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value)
    .sort()
    .reduce((result, key) => {
      result[key] = stableValue(value[key]);
      return result;
    }, {});
}

function fingerprint(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(stableValue(value)), "utf8")
    .digest("hex");
}

function resourceFingerprint(resource) {
  const value = resource || {};
  return fingerprint({
    resourceId: String(value.resourceId || ""),
    name: String(value.name || ""),
    price: value.price === undefined ? null : value.price,
    available: value.available !== false,
    remarks: String(value.remarks || ""),
    publishRate: value.publishRate === undefined ? null : value.publishRate,
    publishTime: value.publishTime === undefined ? null : value.publishTime,
    caseLink: value.caseLink === undefined ? null : value.caseLink,
  });
}

function plainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function text(value) {
  return typeof value === "string" ? value : "";
}

function normalizeSystemSubmissionCode(value) {
  const candidate =
    value && typeof value === "object"
      ? value.systemSubmissionCode || value.thirdPartyId
      : value;
  return typeof candidate === "string" ? candidate.trim() : "";
}

function scanRiskWarnings(title, body) {
  const source = `${title}\n${body}`;
  const rules = [
    {
      code: "PHONE_NUMBER",
      message: "正文包含手机号风险，请结合媒体备注人工确认。",
      pattern: /(?<!\d)(?:(?:\+?86)[\s-]?)?1[3-9]\d{9}(?!\d)/gu,
    },
    {
      code: "URL",
      message: "正文包含网址风险，请结合媒体备注人工确认。",
      pattern: /(?:https?:\/\/|www\.)[^\s<>'"`]+/giu,
    },
  ];
  return Object.freeze(
    rules
      .map((rule) => {
        const matches = source.match(rule.pattern) || [];
        return matches.length
          ? Object.freeze({
              code: rule.code,
              message: rule.message,
              count: matches.length,
            })
          : null;
      })
      .filter(Boolean),
  );
}

function articleReasonCodes(article, workflow) {
  const title = text(article && article.title).trim();
  const body = text(article && article.content).trim();
  const reasons = [];
  if (!title || !body) reasons.push("PAID_MEDIA_ARTICLE_CONTENT_REQUIRED");
  if (Array.from(title).length > MAX_TITLE_LENGTH)
    reasons.push("PAID_MEDIA_TITLE_TOO_LONG");
  if (
    workflow &&
    workflow.operations &&
    workflow.operations.queue &&
    workflow.operations.queue.allowed !== true
  ) {
    const code =
      workflow.operations.queue.reasonCodes &&
      workflow.operations.queue.reasonCodes[0];
    if (code) reasons.push(code);
  }
  return [...new Set(reasons)];
}

function resourceForConfirmation(resource) {
  const value = resource || {};
  const price =
    typeof value.price === "number" &&
    Number.isFinite(value.price) &&
    value.price >= 0 &&
    value.price <= MAX_PRICE
      ? value.price
      : null;
  return Object.freeze({
    resourceId: String(value.resourceId || ""),
    name: text(value.name || value.resourceName),
    remarks: text(value.remarks || value.remark || value.note),
    available: value.available !== false,
    price,
    fingerprint:
      typeof value.fingerprint === "string" && value.fingerprint
        ? value.fingerprint
        : resourceFingerprint(value),
  });
}

function safeArticleSummary(
  ref,
  article,
  workflow,
  riskWarnings,
  readErrorCode,
) {
  const title = text(article && article.title);
  const content = text(article && article.content);
  const reasonCodes = article
    ? articleReasonCodes(article, workflow)
    : [readErrorCode || "PAID_MEDIA_ARTICLE_NOT_FOUND"];
  return Object.freeze({
    articleRef: Object.freeze({
      clientId: ref.clientId,
      articleId: ref.articleId,
    }),
    articleId: ref.articleId,
    title,
    contentFingerprint: article ? fingerprintArticle(article) : null,
    status: reasonCodes.length ? "blocked" : "ready",
    reasonCodes: Object.freeze(reasonCodes),
    riskCodes: Object.freeze(
      (riskWarnings || []).map((warning) => warning.code),
    ),
  });
}

function createPaidMediaPreflightService(options) {
  const value = options || {};
  if (
    !value.contentStore ||
    typeof value.contentStore.getArticle !== "function"
  )
    throw preflightError("PAID_MEDIA_CONTENT_STORE_REQUIRED");
  const paidAdmission = value.paidAdmission || value.paidAdmissionFacade;
  if (!paidAdmission || typeof paidAdmission.admitPaidBatch !== "function")
    throw preflightError("PAID_MEDIA_ADMISSION_REQUIRED");
  const mediaPoolStore = value.mediaPoolStore || value.favoriteMediaPool;
  if (!mediaPoolStore || typeof mediaPoolStore.contains !== "function")
    throw preflightError(
      "PAID_MEDIA_PREFLIGHT_UNAVAILABLE",
      "收藏媒体状态读取能力不可用，未创建付费批次",
    );
  const resourceService = value.resourceService || null;
  const queryResource =
    typeof value.queryResource === "function"
      ? value.queryResource
      : resourceService &&
          typeof resourceService.getFavoriteResource === "function"
        ? resourceService.getFavoriteResource.bind(resourceService)
        : null;
  if (!queryResource)
    throw preflightError("PAID_MEDIA_RESOURCE_QUERY_REQUIRED");
  const lifecycleFacts =
    value.lifecycleFacts || value.articleLifecycleFacts || null;
  const contentStore = value.contentStore;
  if (typeof value.clientSnapshotResolver !== "function")
    throw preflightError("PAID_MEDIA_CUSTOMER_SNAPSHOT_RESOLVER_REQUIRED");
  const clientSnapshotResolver = value.clientSnapshotResolver;
  const systemSubmissionCodeProvider =
    typeof value.systemSubmissionCodeProvider === "function"
      ? value.systemSubmissionCodeProvider
      : () => value.systemSubmissionCode || "";
  const clock = value.clock || (() => new Date().toISOString());
  const confirmations = new Map();

  function refsFrom(input) {
    const request = input || {};
    const raw = Array.isArray(request.articleRefs)
      ? request.articleRefs
      : Array.isArray(request.selections)
        ? request.selections.map((item) =>
            item && item.articleRef ? item.articleRef : item,
          )
        : [];
    if (!raw.length || raw.length > MAX_ARTICLES)
      throw preflightError("PAID_MEDIA_ARTICLES_REQUIRED");
    try {
      return canonicalArticleRefs(raw);
    } catch (_) {
      throw preflightError("PAID_MEDIA_ARTICLE_IDENTITY_INVALID");
    }
  }

  function mediaResourceIdFrom(input) {
    const request = input || {};
    const id =
      typeof request.mediaResourceId === "string"
        ? request.mediaResourceId.trim()
        : "";
    if (!id || id.length > 128)
      throw preflightError("PAID_MEDIA_RESOURCE_REQUIRED");
    return id;
  }

  function factsFor(refs) {
    if (
      !lifecycleFacts ||
      typeof lifecycleFacts.listArticleLifecycleFacts !== "function"
    )
      return {
        publications: [],
        submissionItems: [],
        orders: [],
        attentionItems: [],
        removalTransactions: [],
      };
    try {
      return (
        lifecycleFacts.listArticleLifecycleFacts({
          articleIds: [...new Set(refs.map((ref) => ref.articleId))],
        }) || {
          publications: [],
          submissionItems: [],
          orders: [],
          attentionItems: [],
          removalTransactions: [],
        }
      );
    } catch (_) {
      throw preflightError(
        "PAID_MEDIA_ARTICLE_STATE_UNAVAILABLE",
        "文章状态读取失败，未创建付费批次",
      );
    }
  }

  async function assertFavoriteMembership(mediaResourceId, phase) {
    let isFavorite;
    try {
      isFavorite = await mediaPoolStore.contains(mediaResourceId);
    } catch (_) {
      throw preflightError(
        "PAID_MEDIA_RESOURCE_QUERY_FAILED",
        "收藏媒体状态读取失败，请重新预检",
      );
    }
    if (isFavorite !== true)
      throw preflightError(
        phase === "confirm"
          ? "PAID_MEDIA_CONFIRMATION_STALE"
          : "INVALID_MEDIA_RESOURCE_ID",
        phase === "confirm"
          ? "媒体已不在当前收藏媒体池中，请重新预检"
          : "媒体资源不在当前收藏媒体池中",
      );
  }

  function readArticles(refs, options) {
    const readOptions = options || {};
    const facts = factsFor(refs);
    return refs.map((ref) => {
      let article = null;
      let readErrorCode = null;
      try {
        article = contentStore.getArticle(ref.clientId, ref.articleId);
      } catch (_) {
        if (readOptions.throwOnUnavailable === true)
          throw preflightError(
            "PAID_MEDIA_ARTICLE_STATE_UNAVAILABLE",
            "文章状态读取失败，未创建付费批次",
          );
        readErrorCode = "PAID_MEDIA_ARTICLE_STATE_UNAVAILABLE";
      }
      const workflow = article
        ? deriveArticleLifecycle({
            article,
            publications: facts.publications,
            submissionItems: facts.submissionItems,
            orders: facts.orders,
            attentionItems: facts.attentionItems,
            removalTransactions: facts.removalTransactions || [],
          })
        : null;
      const risks = article
        ? scanRiskWarnings(text(article.title).trim(), text(article.content))
        : Object.freeze([]);
      return { ref, article, workflow, risks, readErrorCode };
    });
  }

  function currentSystemSubmissionCode() {
    try {
      return normalizeSystemSubmissionCode(systemSubmissionCodeProvider());
    } catch (_) {
      throw preflightError(
        "PAID_MEDIA_PREFLIGHT_UNAVAILABLE",
        "系统投稿标识码读取失败，未创建付费批次",
      );
    }
  }

  function mapPaidAdmissionError(error) {
    const code = error && typeof error.code === "string" ? error.code : "";
    if (code === "PLATFORM_CONFIG_STORAGE_INVALID")
      return preflightError(
        "PAID_MEDIA_PREFLIGHT_UNAVAILABLE",
        "系统投稿标识码读取失败，未创建付费批次",
      );
    return error;
  }

  function shouldInvalidateAfterStateChange(code) {
    return new Set([
      "PAID_MEDIA_CONFIRMATION_STALE",
    ]).has(code);
  }

  function modelFor(refs, resource, articles, createdAt, expiresAt) {
    const safeResource = resourceForConfirmation(resource);
    const systemSubmissionCode = currentSystemSubmissionCode();
    const articleSummaries = articles.map((entry) =>
      safeArticleSummary(
        entry.ref,
        entry.article,
        entry.workflow,
        entry.risks,
        entry.readErrorCode,
      ),
    );
    const risks = Object.freeze(
      articles
        .flatMap((entry) => entry.risks)
        .reduce((result, warning) => {
          const existing = result.find((item) => item.code === warning.code);
          if (existing) existing.count += warning.count;
          else
            result.push({
              code: warning.code,
              message: warning.message,
              count: warning.count,
            });
          return result;
        }, [])
        .map((warning) => Object.freeze(warning)),
    );
    const articleFingerprints = articleSummaries.map((item) => ({
      articleRef: item.articleRef,
      fingerprint: item.contentFingerprint,
    }));
    const estimatedTotal =
      typeof safeResource.price === "number"
        ? safeResource.price * refs.length
        : null;
    const blockers = [];
    if (safeResource.available !== true)
      blockers.push("PAID_MEDIA_RESOURCE_UNAVAILABLE");
    if (safeResource.price === null)
      blockers.push("PAID_MEDIA_RESOURCE_PRICE_INVALID");
    if (
      safeResource.price !== null &&
      (typeof estimatedTotal !== "number" ||
        !Number.isFinite(estimatedTotal) ||
        estimatedTotal < 0 ||
        estimatedTotal > MAX_PRICE)
    )
      blockers.push("PAID_ADMISSION_PRICE_INVALID");
    if (!systemSubmissionCode)
      blockers.push("PAID_MEDIA_SYSTEM_SUBMISSION_CODE_REQUIRED");
    articleSummaries.forEach((item) => blockers.push(...item.reasonCodes));
    const normalizedBlockers = [...new Set(blockers)];
    const confirmationFingerprint = fingerprint({
      version: 1,
      articleRefs: refs,
      articleFingerprints,
      mediaResourceId: safeResource.resourceId,
      resourceFingerprint: safeResource.fingerprint,
      available: safeResource.available,
      quotedPrice: safeResource.price,
      estimatedTotal,
      systemSubmissionCode,
      riskCodes: risks.map((warning) => warning.code),
    });
    return {
      version: 1,
      status: normalizedBlockers.length ? "blocked" : "ready",
      canConfirm: normalizedBlockers.length === 0,
      confirmationToken: crypto.randomUUID(),
      confirmationFingerprint,
      articleRefs: Object.freeze(refs),
      articleCount: refs.length,
      articles: Object.freeze(articleSummaries),
      mediaResourceId: safeResource.resourceId,
      mediaName: safeResource.name,
      mediaRemarks: safeResource.remarks,
      resourceFingerprint: safeResource.fingerprint,
      resourceAvailable: safeResource.available,
      quotedPrice: safeResource.price,
      estimatedTotal,
      systemSubmissionCode,
      blockers: Object.freeze(normalizedBlockers),
      risks,
      createdAt,
      expiresAt,
      _resource: safeResource,
    };
  }

  function publicModel(model) {
    const output = Object.assign({}, model);
    delete output._resource;
    return Object.freeze(output);
  }

  async function preflight(input) {
    const refs = refsFrom(input);
    const mediaResourceId = mediaResourceIdFrom(input);
    await assertFavoriteMembership(mediaResourceId, "preflight");
    let resource;
    try {
      resource = await queryResource(mediaResourceId);
    } catch (_) {
      throw preflightError(
        "PAID_MEDIA_RESOURCE_QUERY_FAILED",
        "收藏媒体信息读取失败，请重新选择",
      );
    }
    const safeResource = resourceForConfirmation(resource);
    if (safeResource.resourceId !== mediaResourceId)
      throw preflightError(
        "PAID_MEDIA_RESOURCE_UNAVAILABLE",
        "媒体资源当前不可用",
      );
    const createdAt = nowIso(clock);
    const expiresAt = new Date(
      Date.parse(createdAt) + CONFIRMATION_TTL_MS,
    ).toISOString();
    const model = modelFor(
      refs,
      safeResource,
      readArticles(refs),
      createdAt,
      expiresAt,
    );
    confirmations.set(model.confirmationToken, {
      model,
      refs,
      resource: safeResource,
      expiresAtMs: Date.parse(expiresAt),
      consumed: false,
      result: null,
    });
    while (confirmations.size > 1000)
      confirmations.delete(confirmations.keys().next().value);
    return publicModel(model);
  }

  function confirmationFor(token) {
    const entry = confirmations.get(token);
    if (
      !entry ||
      entry.consumed ||
      entry.inFlight ||
      entry.expiresAtMs <= nowMs(clock)
    ) {
      confirmations.delete(token);
      throw preflightError(
        "PAID_MEDIA_CONFIRMATION_STALE",
        "费用确认已失效，请重新预检",
      );
    }
    return entry;
  }

  async function confirm(input) {
    const request = input || {};
    const token =
      typeof request.confirmationToken === "string"
        ? request.confirmationToken
        : "";
    if (!token)
      throw preflightError(
        "PAID_MEDIA_CONFIRMATION_REQUIRED",
        "请先完成费用预检",
      );
    const entry = confirmationFor(token);
    const model = entry.model;
    if (model.canConfirm !== true) {
      confirmations.delete(token);
      throw preflightError(
        "PAID_MEDIA_CONFIRMATION_BLOCKED",
        "当前文章或媒体资源不满足付费投稿条件",
      );
    }
    entry.inFlight = true;

    try {
      await assertFavoriteMembership(model.mediaResourceId, "confirm");
    } catch (error) {
      entry.inFlight = false;
      if (shouldInvalidateAfterStateChange(error && error.code))
        confirmations.delete(token);
      throw error;
    }

    let currentResource;
    try {
      currentResource = resourceForConfirmation(
        await queryResource(model.mediaResourceId),
      );
    } catch (_) {
      confirmations.delete(token);
      throw preflightError(
        "PAID_MEDIA_RESOURCE_RECHECK_FAILED",
        "收藏媒体信息复核失败，请重新确认",
      );
    }
    if (
      currentResource.resourceId !== entry.resource.resourceId ||
      currentResource.available !== true ||
      currentResource.price !== entry.resource.price ||
      currentResource.fingerprint !== entry.resource.fingerprint
    ) {
      confirmations.delete(token);
      throw preflightError(
        "PAID_MEDIA_CONFIRMATION_STALE",
        "收藏媒体参考信息已变化，请重新确认",
      );
    }

    let systemSubmissionCode;
    try {
      systemSubmissionCode = currentSystemSubmissionCode();
    } catch (error) {
      entry.inFlight = false;
      throw error;
    }
    if (
      !systemSubmissionCode ||
      systemSubmissionCode !== model.systemSubmissionCode
    ) {
      confirmations.delete(token);
      throw preflightError(
        "PAID_MEDIA_SYSTEM_SUBMISSION_CODE_CHANGED",
        "系统投稿标识码已变化，请重新预检",
      );
    }
    let currentArticles;
    try {
      currentArticles = readArticles(entry.refs, { throwOnUnavailable: true });
    } catch (error) {
      entry.inFlight = false;
      throw error;
    }
    const currentFingerprints = currentArticles.map((item) => ({
      articleRef: item.ref,
      fingerprint: item.article ? fingerprintArticle(item.article) : null,
    }));
    if (
      currentFingerprints.length !== model.articles.length ||
      currentFingerprints.some(
        (item, index) =>
          item.fingerprint !== model.articles[index].contentFingerprint,
      )
    ) {
      confirmations.delete(token);
      throw preflightError(
        "PAID_MEDIA_CONFIRMATION_STALE",
        "文章内容已变化，请重新预检",
      );
    }

    const confirmation = Object.freeze({
      version: model.version,
      articleRefs: model.articleRefs,
      articleFingerprints: currentFingerprints,
      mediaResourceId: model.mediaResourceId,
      resourceName: model.mediaName,
      mediaRemarks: model.mediaRemarks,
      resourceFingerprint: model.resourceFingerprint,
      quotedPrice: model.quotedPrice,
      estimatedTotal: model.estimatedTotal,
      systemSubmissionCode: model.systemSubmissionCode,
      riskCodes: model.risks.map((warning) => warning.code),
      confirmedAt: nowIso(clock),
    });
    let customerSnapshotsV1;
    try {
      customerSnapshotsV1 = Object.freeze(
        Object.fromEntries(
          entry.refs.map((ref) => {
            const snapshot = domain.parseCustomerSnapshotV1(
              clientSnapshotResolver(ref.clientId),
            );
            if (snapshot.clientId !== ref.clientId)
              throw preflightError("PAID_MEDIA_CUSTOMER_SNAPSHOT_INVALID");
            return [ref.clientId, snapshot];
          }),
        ),
      );
    } catch (error) {
      if (error && error.code === "PAID_MEDIA_CUSTOMER_SNAPSHOT_INVALID")
        throw error;
      throw preflightError("PAID_MEDIA_CUSTOMER_SNAPSHOT_INVALID");
    }
    let result;
    try {
      result = paidAdmission.admitPaidBatch({
        batchId: `paid-batch-${crypto.randomUUID()}`,
        articleRefs: entry.refs,
        target: { kind: "media", mediaResourceId: model.mediaResourceId },
        resourceSnapshot: {
          resourceId: model.mediaResourceId,
          name: model.mediaName,
          remarks: model.mediaRemarks,
          available: true,
          price: model.quotedPrice,
          fingerprint: model.resourceFingerprint,
        },
        confirmationFingerprint: model.confirmationFingerprint,
        confirmation,
        systemSubmissionCode,
        quotedPrice: model.quotedPrice,
        estimatedTotal: model.estimatedTotal,
        articleFingerprints: currentFingerprints,
        customerSnapshotsV1,
      });
    } catch (error) {
      const mappedError = mapPaidAdmissionError(error);
      if (
        [
          "PAID_MEDIA_CONFIRMATION_STALE",
          "PAID_MEDIA_SYSTEM_SUBMISSION_CODE_CHANGED",
        ].includes(mappedError && mappedError.code)
      )
        confirmations.delete(token);
      else if (shouldInvalidateAfterStateChange(mappedError && mappedError.code))
        confirmations.delete(token);
      else entry.inFlight = false;
      throw mappedError;
    }
    entry.consumed = true;
    entry.result = result;
    return Object.freeze(
      Object.assign({}, result, {
        confirmationFingerprint: model.confirmationFingerprint,
        mediaResourceId: model.mediaResourceId,
        articleRefs: model.articleRefs,
        articleCount: model.articleCount,
        quotedPrice: model.quotedPrice,
        estimatedTotal: model.estimatedTotal,
      }),
    );
  }

  return Object.freeze({ preflight, confirm });
}

module.exports = { createPaidMediaPreflightService, scanRiskWarnings };
