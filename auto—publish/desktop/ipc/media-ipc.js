const fs = require("fs");
const path = require("path");
const { MediaResourceStore } = require("../../src/platforms/media/media-resource-store");
const { MediaPoolStore } = require("../../src/platforms/media/media-pool-store");
const { MediaClient } = require("../../src/platforms/media/media-client");
const { resolveApiKey } = require("../../src/platforms/media/config");
const { runPreflight } = require("../../src/platforms/media/preflight");
const { MediaDraftStore } = require("../../src/platforms/media/media-draft-store");
const { detectDocxImages } = require("../../src/platforms/media/article-converter");
const { createMediaOrderService } = require("../services/media-order-service");

function registerMediaIpc(deps) {
  var ipcMain = deps.ipcMain;

  var mediaResourceStore = new MediaResourceStore();
  var mediaPoolStore = new MediaPoolStore();
  var mediaDraftStore = new MediaDraftStore();
  var mediaOrderService = createMediaOrderService({});

  function getMediaClient() {
    var apiKey = resolveApiKey(null);
    return new MediaClient({ apiKey: apiKey });
  }

  ipcMain.handle("media:list-resources", async function(event, opts) {
    try {
      var fetchAll = opts && opts.fetchAll !== false;
      var maxPages = (opts && opts.maxPages) || 0; var MAX_SAFE_PAGES = 1000;
      var client = getMediaClient();
      var allResources = [];
      var page = 1;

      while ((maxPages === 0 || page <= maxPages) && page <= MAX_SAFE_PAGES) {
        var response = await client.mediaList({ page: page });
        var pageItems = [];
        if (response && response.data) {
          if (Array.isArray(response.data)) {
            pageItems = response.data;
          } else if (response.data && Array.isArray(response.data.list)) {
            pageItems = response.data.list;
          } else if (Array.isArray(response.data.data)) {
            pageItems = response.data.data;
          }
        }
        if (pageItems.length === 0) break;
        allResources = allResources.concat(pageItems);
        if (pageItems.length < 20) break; if (page > MAX_SAFE_PAGES) { console.warn("media:list-resources hit MAX_SAFE_PAGES=" + MAX_SAFE_PAGES); }
        if (!fetchAll) break;
        page++;
      }

      if (allResources.length === 0) {
        return { ok: false, error: "API 返回空媒体列表，请检查 API Key 是否有效" };
      }
      mediaResourceStore.setAll(allResources, { total: allResources.length });
      return {
        ok: true,
        data: {
          count: allResources.length,
          updatedAt: mediaResourceStore.getAll().updatedAt
        }
      };
    } catch (err) {
      if (allResources && allResources.length > 0) {
        try { mediaResourceStore.setAll(allResources, { total: allResources.length, partial: true }); } catch (_) {}
      }
      return { ok: false, error: err.message, partialCount: allResources ? allResources.length : 0 };
    }
  });

  ipcMain.handle("media:get-cached-resources", function() {
    var data = mediaResourceStore.getAll();
    return {
      ok: true,
      data: data || { updatedAt: null, count: 0, resources: [] }
    };
  });

  ipcMain.handle("media:search-resources", function(event, keyword) {
    var results = mediaResourceStore.search(keyword);
    return { ok: true, data: results };
  });

  ipcMain.handle("media:filter-resources-by-price", function(event, minPrice, maxPrice) {
    var results = mediaResourceStore.filterByPrice(minPrice, maxPrice);
    return { ok: true, data: results };
  });

  ipcMain.handle("media:get-pool", function() {
    return { ok: true, data: mediaPoolStore.getAll() };
  });

  ipcMain.handle("media:add-to-pool", function(event, resource) {
    mediaPoolStore.add(resource);
    return { ok: true };
  });

  ipcMain.handle("media:remove-from-pool", function(event, resourceId) {
    mediaPoolStore.remove(resourceId);
    return { ok: true };
  });

  ipcMain.handle("media:pool-contains", function(event, resourceId) {
    return { ok: true, data: mediaPoolStore.contains(resourceId) };
  });

  ipcMain.handle("media:get-balance", async function() {
    try {
      var client = getMediaClient();
      var response = await client.getBalance();
      var balanceData = response && response.data ? response.data : {};
      return {
        ok: true,
        data: {
          balance: balanceData.money || "0",
          powerCount: balanceData.power_count || 0,
          raw: response
        }
      };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle("media:get-drafts", function() {
    return { ok: true, data: mediaDraftStore.getAll() };
  });

  ipcMain.handle("media:get-draft", function(event, filename) {
    var draft = mediaDraftStore.get(filename);
    return { ok: true, data: draft };
  });

  ipcMain.handle("media:set-draft", function(event, filename, draft) {
    mediaDraftStore.set(filename, draft);
    return { ok: true };
  });

  ipcMain.handle("media:remove-draft", function(event, filename) {
    mediaDraftStore.remove(filename);
    return { ok: true };
  });

  ipcMain.handle("media:set-bulk-resource", function(event, filenames, resourceId, resourceName) {
    mediaDraftStore.setBulkResource(filenames, resourceId, resourceName);
    return { ok: true };
  });

  ipcMain.handle("media:scan-articles", async function() {
    var scanDir = path.resolve(__dirname, "..", "..", "input", "media");
    if (!fs.existsSync(scanDir)) {
      return { ok: true, data: [] };
    }
    var files = fs.readdirSync(scanDir).filter(function(name) {
      if (name.indexOf("~$") === 0) return false;
      if (name === ".gitkeep") return false;
      return name.endsWith(".docx") || name.endsWith(".txt") || name.endsWith(".md");
    });
    var articles = [];
    for (var i = 0; i < files.length; i++) {
      var fn = files[i];
      var ext = path.extname(fn).toLowerCase();
      var filePath = path.join(scanDir, fn);
      var draft = mediaDraftStore.get(fn);

      var autoTitle = "";
      var imgInfo = { hasImages: false, imageCount: 0 };
      try {
        if (ext === ".txt") {
          var raw = fs.readFileSync(filePath, "utf-8").trim();
          var txtLines = raw.split(/\n/);
          for (var ti = 0; ti < txtLines.length; ti++) {
            var tl = txtLines[ti].replace(/^#+\s*/, "").trim();
            if (tl) { autoTitle = tl; break; }
          }
        } else if (ext === ".docx") {
          imgInfo = detectDocxImages(filePath);
          try {
            var mammoth = require("mammoth");
            var buf = fs.readFileSync(filePath);
            var result = await mammoth.extractRawText({ buffer: buf });
            var text = (result && result.value || "").trim();
            var docLines = text.split(/\n/);
            for (var di = 0; di < docLines.length; di++) {
              var dl = docLines[di].trim();
              if (dl) { autoTitle = dl; break; }
            }
          } catch(_) {}
        } else if (ext === ".md") {
          var mdRaw = fs.readFileSync(filePath, "utf-8").trim();
          var mdLines = mdRaw.split(/\n/);
          for (var j = 0; j < mdLines.length; j++) {
            var line = mdLines[j].trim();
            if (!line || line === "---") continue;
            autoTitle = line.replace(/^#+\s*/, "").trim();
            if (autoTitle) break;
          }
        }
      } catch(_) {}
      if (!autoTitle) {
        autoTitle = path.basename(fn, path.extname(fn));
      }
      articles.push({
        filename: fn,
        filePath: filePath,
        title: (draft && draft.title) || autoTitle,
        hasImages: imgInfo.hasImages,
        imageCount: imgInfo.imageCount,
        resourceId: draft ? draft.resourceId : null,
        resourceName: draft ? draft.resourceName : null,
        ignoreImages: draft ? !!draft.ignoreImages : false
      });
    }
    return { ok: true, data: articles };
  });

  ipcMain.handle("media:preview-article", async function(event, filename) {
    var articleDir = path.resolve(__dirname, "..", "..", "input", "media");
    var filePath = path.join(articleDir, filename);
    if (!fs.existsSync(filePath)) {
      return { ok: false, error: "File not found: " + filename };
    }
    var ext = path.extname(filename).toLowerCase();
    var title = "";
    var content = "";
    try {
      if (ext === ".txt") {
        var raw = fs.readFileSync(filePath, "utf-8").trim();
        var lines = raw.split(/\n/);
        for (var i = 0; i < lines.length; i++) {
          var tl = lines[i].replace(/^#+\s*/, "").trim();
          if (tl) { title = tl; break; }
        }
        content = raw;
      } else if (ext === ".docx") {
        try {
          var mammoth = require("mammoth");
          var buf = fs.readFileSync(filePath);
          var result = await mammoth.extractRawText({ buffer: buf });
          var text = (result && result.value || "").trim();
          var docLines = text.split(/\n/);
          for (var di = 0; di < docLines.length; di++) {
            var dl = docLines[di].trim();
            if (dl) { title = dl; break; }
          }
          content = text;
        } catch (docxErr) {
          content = "[Cannot read .docx: " + docxErr.message + "]";
        }
      } else if (ext === ".md") {
        var mdRaw = fs.readFileSync(filePath, "utf-8").trim();
        var mdLines = mdRaw.split(/\n/);
        for (var j = 0; j < mdLines.length; j++) {
          var line = mdLines[j].trim();
          if (!line || line === "---") continue;
          title = line.replace(/^#+\s*/, "").trim();
          if (title) break;
        }
        content = mdRaw;
      }
    } catch (e) {
      return { ok: false, error: "Read error: " + e.message };
    }
    var draft = mediaDraftStore.get(filename);
    return {
      ok: true,
      data: {
        filename: filename,
        title: (draft && draft.title) || title || path.basename(filename, ext),
        content: content,
        resourceId: draft ? draft.resourceId : null,
        resourceName: draft ? draft.resourceName : null
      }
    };
  });

  ipcMain.handle("media:preflight", async function(event, articles, dryRun) {
    try {
      var result = await runPreflight({ articles: articles, dryRun: dryRun !== false });
      return { ok: true, data: result };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle("media:get-orders", async function() {
    var orders = mediaOrderService.listOrders();
    return { ok: true, data: orders };
  });

  ipcMain.handle("media:sync-order", async function(event, orderNid) {
    try {
      var response = await mediaOrderService.syncOrder(orderNid);
      return { ok: true, data: response };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
}

module.exports = { registerMediaIpc };
