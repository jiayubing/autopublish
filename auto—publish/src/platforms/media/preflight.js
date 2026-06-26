// auto—publish/src/platforms/media/preflight.js
// Preflight checks and dry-run for media submission.

const { MediaClient } = require('./media-client');
const { MediaDraftStore } = require('./media-draft-store');
const { MediaResourceStore } = require('./media-resource-store');
const { resolveApiKey } = require('./config');

/**
 * Resolve the list of selected resources from an article, supporting both
 * the new multi-resource `selectedResources` array and the legacy single
 * `resourceId` / `resourceName` fields.
 */
function getSelectedResources(article) {
  if (Array.isArray(article.selectedResources) && article.selectedResources.length > 0) {
    return article.selectedResources;
  }
  if (article.resourceId) {
    return [{ resourceId: article.resourceId, name: article.resourceName || "" }];
  }
  return [];
}

/**
 * Run preflight checks for a set of media articles.
 *
 * @param {object} opts
 * @param {object[]} opts.articles - Array of { filename, title, resourceId, hasImages, imageCount, ignoreImages } 
 *   or { filename, title, selectedResources: [{ resourceId, name }], ... }
 * @param {boolean} [opts.dryRun] - If true, do not call real API (only local checks)
 * @returns {Promise<object>} PreflightResult
 */
async function runPreflight(opts) {
  opts = opts || {};
  var articles = opts.articles || [];
  var dryRun = opts.dryRun !== false;

  var result = {
    ok: true,
    dryRun: dryRun,
    articles: [],
    checks: {
      allHaveResources: true,
      balanceOk: true,
      noImageBlockers: true
    },
    totalEstimatedCost: 0,
    balance: null,
    errors: [],
    warnings: [],
    taskCount: 0
  };

  // Check 1: all articles have at least one selected resource
  for (var i = 0; i < articles.length; i++) {
    var a = articles[i];
    var entry = {
      filename: a.filename,
      title: a.title,
      selectedResources: [],
      resourceCount: 0,
      hasImages: !!a.hasImages,
      imageCount: a.imageCount || 0,
      ignoreImages: !!a.ignoreImages,
      ok: true,
      errors: [],
      warnings: []
    };

    var selectedResources = getSelectedResources(a);
    entry.selectedResources = selectedResources;
    entry.resourceCount = selectedResources.length;
    result.taskCount += selectedResources.length;

    if (selectedResources.length === 0) {
      entry.ok = false;
      entry.errors.push('未选择媒体资源');
      result.checks.allHaveResources = false;
    }

    if (a.hasImages && !a.ignoreImages) {
      entry.ok = false;
      entry.errors.push('文章包含 ' + (a.imageCount || '?') + ' 张图片，未勾选忽略图片');
      result.checks.noImageBlockers = false;
    }

    if (a.hasImages && a.ignoreImages) {
      entry.warnings.push('已忽略 ' + (a.imageCount || '?') + ' 张图片，将以纯文本投稿');
    }

    result.articles.push(entry);
  }

  if (!result.checks.allHaveResources) {
    result.ok = false;
    result.errors.push('部分文章未选择媒体资源');
  }

  if (!result.checks.noImageBlockers) {
    result.ok = false;
    result.errors.push('部分文章包含未处理的图片，请勾选忽略图片或移除图片');
  }

  if (articles.length === 0) {
    result.ok = false;
    result.errors.push('没有待投稿文章');
  }

  // Check 2: balance (only if not dry-run)
  if (!dryRun && articles.length > 0) {
    try {
      var apiKey = resolveApiKey(null);
      var client = new MediaClient({ apiKey: apiKey });
      var balanceResp = await client.getBalance();
      result.balance = balanceResp;
      // Try to extract balance amount
      var bal = extractBalance(balanceResp);
      result.balanceAmount = bal;
      // Estimate cost (simple: assume each article costs based on resource)
      // For now, we use a nominal check — if balance data exists, it passes
    } catch (err) {
      result.checks.balanceOk = false;
      result.errors.push('余额查询失败: ' + err.message);
    }
  }

  if (result.errors.length > 0) {
    result.ok = false;
  }

  return result;
}

function extractBalance(response) {
  if (!response) return null;
  if (response.data && response.data.balance !== undefined) {
    return Number(response.data.balance);
  }
  if (response.balance !== undefined) {
    return Number(response.balance);
  }
  return null;
}

module.exports = { runPreflight };
