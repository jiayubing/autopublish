var state = {
  isBatchRunning: false,
  isRefreshing: false,
  isStopPending: false,
  snapshot: null,
  selectedPlatformIds: null
};

var elements = {
  manualMode: document.getElementById("manualMode"),
  intervalSeconds: document.getElementById("intervalSeconds"),
  refreshButton: document.getElementById("refreshButton"),
  runButton: document.getElementById("runButton"),
  stopButton: document.getElementById("stopButton"),
  batchStatus: document.getElementById("batchStatus"),
  generatedAt: document.getElementById("generatedAt"),
  platformList: document.getElementById("platformList"),
  queueSummary: document.getElementById("queueSummary"),
  queueList: document.getElementById("queueList"),
  logStream: document.getElementById("logStream"),
  logsHint: document.getElementById("logsHint"),
  totalJobsCount: document.getElementById("totalJobsCount"),
  enabledPlatformsCount: document.getElementById("enabledPlatformsCount"),
  modeLabel: document.getElementById("modeLabel"),
  pendingArticlesMetric: document.getElementById("pendingArticlesMetric"),
  enabledPlatformsMetric: document.getElementById("enabledPlatformsMetric"),
  batchStateMetric: document.getElementById("batchStateMetric"),
  intervalMetric: document.getElementById("intervalMetric"),
  navItems: Array.prototype.slice.call(document.querySelectorAll(".nav-item"))
};

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getIntervalSeconds() {
  var intervalSeconds = Number(elements.intervalSeconds.value);
  if (!Number.isFinite(intervalSeconds) || intervalSeconds < 0) {
    intervalSeconds = 3;
    elements.intervalSeconds.value = "3";
  }
  return intervalSeconds;
}

function updateMetrics(snapshot) {
  var totalJobs = snapshot && typeof snapshot.totalJobs === "number" ? snapshot.totalJobs : 0;
  var enabledPlatforms = snapshot && snapshot.platforms ? snapshot.platforms.length : 0;

  elements.totalJobsCount.textContent = String(totalJobs);
  elements.enabledPlatformsCount.textContent = String(enabledPlatforms);
  elements.pendingArticlesMetric.textContent = String(totalJobs);
  elements.enabledPlatformsMetric.textContent = String(enabledPlatforms);
  elements.modeLabel.textContent = elements.manualMode.checked ? "手动" : "自动";
  elements.intervalMetric.textContent = getIntervalSeconds() + "s";

  if (state.isBatchRunning && state.isStopPending) {
    elements.batchStateMetric.textContent = "停止中";
    return;
  }

  if (state.isBatchRunning) {
    elements.batchStateMetric.textContent = "运行中";
    return;
  }

  if (state.isRefreshing) {
    elements.batchStateMetric.textContent = "刷新中";
    return;
  }

  elements.batchStateMetric.textContent = "空闲";
}

function syncControls() {
  elements.runButton.disabled = state.isBatchRunning || state.isRefreshing;
  elements.refreshButton.disabled = state.isBatchRunning || state.isRefreshing;
  elements.stopButton.disabled = !state.isBatchRunning || state.isStopPending;
  elements.manualMode.disabled = state.isBatchRunning;
  elements.intervalSeconds.disabled = state.isBatchRunning;

  if (state.isBatchRunning && state.isStopPending) {
    elements.batchStatus.textContent = "正在安全停止";
    elements.batchStatus.className = "status-pill pending";
    updateMetrics(state.snapshot);
    return;
  }

  if (state.isBatchRunning) {
    elements.batchStatus.textContent = "批次运行中";
    elements.batchStatus.className = "status-pill running";
    updateMetrics(state.snapshot);
    return;
  }

  if (state.isRefreshing) {
    elements.batchStatus.textContent = "正在刷新队列";
    elements.batchStatus.className = "status-pill pending";
    updateMetrics(state.snapshot);
    return;
  }

  elements.batchStatus.textContent = "空闲";
  elements.batchStatus.className = "status-pill";
  updateMetrics(state.snapshot);
}

function setBatchState(isRunning, isStopPending) {
  state.isBatchRunning = !!isRunning;
  state.isStopPending = !!isStopPending;
  syncControls();
}

function setRefreshing(isRefreshing) {
  state.isRefreshing = !!isRefreshing;
  syncControls();
}

function getSelectedPlatformIds() {
  if (state.selectedPlatformIds === null && state.snapshot && state.snapshot.platforms) {
    state.selectedPlatformIds = state.snapshot.platforms.map(function(p) { return p.id; });
  }
  return state.selectedPlatformIds || [];
}

function isPlatformSelected(platformId) {
  var ids = getSelectedPlatformIds();
  return ids.indexOf(platformId) !== -1;
}

function togglePlatform(platformId) {
  if (state.selectedPlatformIds === null && state.snapshot && state.snapshot.platforms) {
    state.selectedPlatformIds = state.snapshot.platforms.map(function(p) { return p.id; });
  }
  if (!state.selectedPlatformIds) return;
  var idx = state.selectedPlatformIds.indexOf(platformId);
  if (idx !== -1) {
    state.selectedPlatformIds.splice(idx, 1);
  } else {
    state.selectedPlatformIds.push(platformId);
  }
}

function selectAllPlatforms() {
  if (state.snapshot && state.snapshot.platforms) {
    state.selectedPlatformIds = state.snapshot.platforms.map(function(p) { return p.id; });
    renderPlatformList(state.snapshot);
  }
}

function deselectAllPlatforms() {
  state.selectedPlatformIds = [];
  renderPlatformList(state.snapshot);
}

function renderPlatformList(snapshot) {
  if (!snapshot || !snapshot.platforms || snapshot.platforms.length === 0) {
    elements.platformList.innerHTML = '<p class="empty-state">没有启用的平台。</p>';
    return;
  }

  var selectedIds = getSelectedPlatformIds();
  var allSelected = selectedIds.length === snapshot.platforms.length;

  var selectAllHtml = '<div class="platform-select-all">' +
    '<label class="platform-checkbox-label">' +
    '<input type="checkbox" class="platform-checkbox" id="selectAllPlatforms"' + (allSelected ? ' checked' : '') + '>' +
    '<span>全选 / 取消全选</span>' +
    '</label>' +
    '</div>';

  elements.platformList.innerHTML = selectAllHtml + snapshot.platforms.map(function(platform) {
    var hasQueue = Number(platform.queueCount || 0) > 0;
    var checked = selectedIds.indexOf(platform.id) !== -1 ? ' checked' : '';
    return [
      '<article class="platform-item">',
      '<label class="platform-checkbox-label platform-item-label">',
      '<input type="checkbox" class="platform-checkbox" data-platform-id="' + escapeHtml(platform.id) + '"' + checked + '>',
      '<div class="platform-row-meta">',
      '<p class="platform-id">' + escapeHtml(platform.id) + '</p>',
      '<p class="platform-dir">input/' + escapeHtml(platform.scanDir) + '</p>',
      '</div>',
      '<p class="platform-badge' + (hasQueue ? '' : ' empty') + '">' + escapeHtml(platform.queueCount) + ' queued</p>',
      '</label>',
      '</article>'
    ].join("");
  }).join("");

  var selectAllCheckbox = document.getElementById('selectAllPlatforms');
  if (selectAllCheckbox) {
    selectAllCheckbox.addEventListener('change', function() {
      if (selectAllCheckbox.checked) {
        selectAllPlatforms();
      } else {
        deselectAllPlatforms();
      }
    });
  }

  var platformCheckboxes = document.querySelectorAll('.platform-checkbox[data-platform-id]');
  platformCheckboxes.forEach(function(cb) {
    cb.addEventListener('change', function() {
      togglePlatform(cb.getAttribute('data-platform-id'));
      var allNow = state.snapshot && state.snapshot.platforms && getSelectedPlatformIds().length === state.snapshot.platforms.length;
      if (selectAllCheckbox) selectAllCheckbox.checked = allNow;
    });
  });
}

function renderQueue(snapshot) {
  if (!snapshot) {
    elements.queueSummary.textContent = "队列不可用";
    elements.queueList.innerHTML = '<p class="empty-state">无法加载队列快照。</p>';
    return;
  }

  elements.queueSummary.textContent = "共 " + snapshot.totalJobs + " 篇，分布在 " + snapshot.platforms.length + " 个启用平台";

  var nonEmpty = snapshot.queue.filter(function(item) {
    return item.count > 0;
  });

  if (nonEmpty.length === 0) {
    elements.queueList.innerHTML = '<p class="empty-state">当前没有待发文章。</p>';
    return;
  }

  elements.queueList.innerHTML = nonEmpty.map(function(group) {
    var articles = group.articles.map(function(article) {
      return [
        '<li class="article-item">',
        '<p class="article-title">' + escapeHtml(article.title) + "</p>",
        '<p class="article-file">' + escapeHtml(article.filename) + "</p>",
        "</li>"
      ].join("");
    }).join("");

    return [
      '<section class="queue-group">',
      '<div class="queue-group-head">',
      "<h3>" + escapeHtml(group.platformId) + "</h3>",
      "<p>" + escapeHtml(group.count) + " queued</p>",
      "</div>",
      '<ul class="article-list">' + articles + "</ul>",
      "</section>"
    ].join("");
  }).join("");
}

function renderSnapshotResult(result) {
  if (!result || !result.ok) {
    state.snapshot = null;
    elements.generatedAt.textContent = (result && result.error) || "Failed to load.";
    elements.platformList.innerHTML = '<p class="empty-state">队列快照失败。</p>';
    elements.queueList.innerHTML = '<p class="empty-state">队列快照失败。</p>';
    elements.queueSummary.textContent = "队列不可用";
    updateMetrics(null);
    return;
  }

  state.snapshot = result.data;
  elements.generatedAt.textContent = "更新于 " + new Date(result.data.generatedAt).toLocaleString();
  renderPlatformList(result.data);
  renderQueue(result.data);
  updateMetrics(result.data);
}

function appendLog(entry) {
  elements.logsHint.textContent = "来自 publish.log 的实时输出。";
  elements.logStream.textContent += entry.line + "\n";
  elements.logStream.scrollTop = elements.logStream.scrollHeight;
}

function setActiveNav(targetId) {
  elements.navItems.forEach(function(item) {
    item.classList.toggle("active", item.getAttribute("data-target") === targetId);
  });
}

function scrollToPanel(targetId) {
  var panel = document.getElementById(targetId);
  if (panel) {
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveNav(targetId);
  }
}

async function loadInitialState() {
  setRefreshing(true);
  elements.generatedAt.textContent = "正在加载队列...";

  try {
    var result = await window.desktopConsole.getState();
    setBatchState(result.isBatchRunning, result.isStopPending);
    renderSnapshotResult(result.snapshot);
  } finally {
    setRefreshing(false);
  }
}

async function refreshQueue() {
  setRefreshing(true);
  elements.generatedAt.textContent = "正在刷新队列...";

  try {
    var result = await window.desktopConsole.refreshQueue({ platformIds: state.selectedPlatformIds });
    renderSnapshotResult(result);
  } finally {
    setRefreshing(false);
  }
}

async function runBatch() {
  var intervalSeconds = getIntervalSeconds();

  appendLog({
    line: "[desktop] 开始发文批次..."
  });

  var result = await window.desktopConsole.startBatch({
    autoSubmit: !elements.manualMode.checked,
    interactive: false,
    intervalMs: Math.floor(intervalSeconds * 1000),
    platformIds: state.selectedPlatformIds
  });

  if (!result.ok) {
    appendLog({
      line: "[desktop] 批次失败: " + result.error
    });
    return;
  }

  if (result.data.stopped) {
    appendLog({
      line: "[desktop] 批次已停止: " + result.data.ok + " 成功, " + result.data.needsLogin + " 需人工处理, " + result.data.fail + " 失败"
    });
    return;
  }

  appendLog({
    line: "[desktop] 批次完成: " + result.data.ok + " 成功, " + result.data.needsLogin + " 需人工处理, " + result.data.fail + " 失败"
  });
}

async function stopBatch() {
  appendLog({
    line: "[desktop] 已请求停止..."
  });

  var result = await window.desktopConsole.stopBatch();
  if (!result.ok) {
    appendLog({
      line: "[desktop] 停止失败: " + result.error
    });
    return;
  }

  if (result.alreadyRequested) {
    appendLog({
      line: "[desktop] 停止请求已在处理中。"
    });
    return;
  }

  state.isStopPending = true;
  syncControls();
  appendLog({
    line: "[desktop] 停止请求已发送，当前文章会在安全点停下。"
  });
}

elements.refreshButton.addEventListener("click", refreshQueue);
elements.runButton.addEventListener("click", runBatch);
elements.stopButton.addEventListener("click", stopBatch);
elements.manualMode.addEventListener("change", function() {
  updateMetrics(state.snapshot);
});
elements.intervalSeconds.addEventListener("input", function() {
  updateMetrics(state.snapshot);
});

elements.navItems.forEach(function(item) {
  item.addEventListener("click", function() {
    scrollToPanel(item.getAttribute("data-target"));
  });
});

window.desktopConsole.onLog(function(entry) {
  appendLog(entry);
});

window.desktopConsole.onBatchState(function(payload) {
  setBatchState(payload.isBatchRunning, payload.isStopPending);
});

window.desktopConsole.onQueueUpdated(function(result) {
  renderSnapshotResult(result);
});



// -------- Media resource library --------

var mediaElements = {
  refreshMediaBtn: document.getElementById("refreshMediaBtn"),
  mediaSearchInput: document.getElementById("mediaSearchInput"),
  mediaPriceMin: document.getElementById("mediaPriceMin"),
  mediaPriceMax: document.getElementById("mediaPriceMax"),
  mediaFilterBtn: document.getElementById("mediaFilterBtn"),
  mediaCacheInfo: document.getElementById("mediaCacheInfo"),
  mediaResourceList: document.getElementById("mediaResourceList")
};

var mediaState = {
  poolIds: {}
};

function updateMediaCacheInfo() {
  window.desktopConsole.getCachedResources().then(function(result) {
    if (result && result.ok && result.data && result.data.updatedAt) {
      mediaElements.mediaCacheInfo.textContent = result.data.count + " 条, " + new Date(result.data.updatedAt).toLocaleString();
    } else {
      mediaElements.mediaCacheInfo.textContent = "未缓存";
    }
  }).catch(function() {
    mediaElements.mediaCacheInfo.textContent = "读取失败";
  });
}

function loadPoolIds() {
  window.desktopConsole.getPool().then(function(result) {
    if (result && result.ok && result.data) {
      mediaState.poolIds = {};
      result.data.forEach(function(e) {
        mediaState.poolIds[e.resourceId] = true;
      });
    }
  }).catch(function() {});
}

function renderMediaResources(resources) {
  if (!resources || resources.length === 0) {
    mediaElements.mediaResourceList.innerHTML = '<p class="empty-state">没有媒体资源。点击刷新按钮从 API 获取。</p>';
    return;
  }

  mediaElements.mediaResourceList.innerHTML = resources.map(function(r) {
    var rid = String(r.id || r.resource_id || "");
    var name = r.name || r.title || "未知";
    var price = r.price !== undefined && r.price !== null ? String(r.price) : "-";
    var cat = r.category || r.channelType || r.mediaType || "";
    var inPool = mediaState.poolIds[rid];
    var poolBtnLabel = inPool ? "移出媒体池" : "加入媒体池";
    var poolBtnClass = inPool ? "danger" : "secondary";

    return [
      '<article class="media-item">',
      '<div class="media-item-info">',
      '<p class="media-item-name">' + escapeHtml(name) + '</p>',
      '<p class="media-item-meta">ID: ' + escapeHtml(rid) + (cat ? ' | ' + escapeHtml(cat) : '') + '</p>',
      '</div>',
      '<p class="media-item-price">' + (price === "-" ? "价格未知" : "\u00a5" + escapeHtml(price)) + '</p>',
      '<button class="' + poolBtnClass + ' media-pool-btn" data-rid="' + escapeHtml(rid) + '" data-name="' + escapeHtml(name) + '" data-price="' + escapeHtml(price) + '" data-cat="' + escapeHtml(cat) + '">' + poolBtnLabel + '</button>',
      '</article>'
    ].join("");
  }).join("");

  // Attach pool toggle handlers
  var poolBtns = document.querySelectorAll(".media-pool-btn");
  poolBtns.forEach(function(btn) {
    btn.addEventListener("click", function() {
      var rid = btn.getAttribute("data-rid");
      var inPool = mediaState.poolIds[rid];
      if (inPool) {
        window.desktopConsole.removeFromPool(rid).then(function() {
          mediaState.poolIds[rid] = false;
          renderMediaResources(resources);
        });
      } else {
        var resource = {
          id: rid,
          name: btn.getAttribute("data-name"),
          price: btn.getAttribute("data-price") === "-" ? undefined : Number(btn.getAttribute("data-price")),
          category: btn.getAttribute("data-cat")
        };
        window.desktopConsole.addToPool(resource).then(function() {
          mediaState.poolIds[rid] = true;
          renderMediaResources(resources);
        });
      }
    });
  });
}

async function refreshMediaResources() {
  mediaElements.mediaResourceList.innerHTML = '<p class="empty-state">正在拉取媒体资源...</p>';
  try {
    var result = await window.desktopConsole.listResources();
    if (result && result.ok) {
      updateMediaCacheInfo();
      loadPoolIds().then(function() {
        window.desktopConsole.getCachedResources().then(function(cached) {
          if (cached && cached.ok && cached.data) {
            renderMediaResources(cached.data.resources);
          }
        });
      });
    } else {
      mediaElements.mediaResourceList.innerHTML = '<p class="empty-state">拉取失败: ' + (result && result.error || "未知错误") + '</p>';
    }
  } catch (err) {
    mediaElements.mediaResourceList.innerHTML = '<p class="empty-state">拉取异常: ' + err.message + '</p>';
  }
}

function searchMediaResources() {
  var keyword = mediaElements.mediaSearchInput.value;
  window.desktopConsole.searchResources(keyword).then(function(result) {
    if (result && result.ok) {
      renderMediaResources(result.data);
    }
  });
}

function filterMediaResourcesByPrice() {
  var min = mediaElements.mediaPriceMin.value ? Number(mediaElements.mediaPriceMin.value) : null;
  var max = mediaElements.mediaPriceMax.value ? Number(mediaElements.mediaPriceMax.value) : null;
  window.desktopConsole.filterResourcesByPrice(min, max).then(function(result) {
    if (result && result.ok) {
      renderMediaResources(result.data);
    }
  });
}

if (mediaElements.refreshMediaBtn) {
  mediaElements.refreshMediaBtn.addEventListener("click", refreshMediaResources);
}
if (mediaElements.mediaFilterBtn) {
  mediaElements.mediaFilterBtn.addEventListener("click", filterMediaResourcesByPrice);
}
if (mediaElements.mediaSearchInput) {
  mediaElements.mediaSearchInput.addEventListener("input", function() {
    if (!mediaElements.mediaSearchInput.value) {
      window.desktopConsole.getCachedResources().then(function(result) {
        if (result && result.ok && result.data) {
          renderMediaResources(result.data.resources);
        }
      });
    }
  });
  mediaElements.mediaSearchInput.addEventListener("keydown", function(e) {
    if (e.key === "Enter") searchMediaResources();
  });
}



// -------- Media article queue --------

var mediaQueueElements = {
  refreshMediaQueueBtn: document.getElementById("refreshMediaQueueBtn"),
  bulkSelectMediaBtn: document.getElementById("bulkSelectMediaBtn"),
  mediaQueueCount: document.getElementById("mediaQueueCount"),
  mediaQueueList: document.getElementById("mediaQueueList")
};

var mediaQueueState = {
  articles: [],
  poolResources: []
};

function renderMediaQueue(articles) {
  mediaQueueState.articles = articles || [];
  mediaQueueElements.mediaQueueCount.textContent = (articles ? articles.length : 0) + " 篇";

  if (!articles || articles.length === 0) {
    mediaQueueElements.mediaQueueList.innerHTML = '<p class="empty-state">input/media 目录下没有文章。将 .docx 或 .txt 文件放入该目录后刷新。</p>';
    return;
  }

  mediaQueueElements.mediaQueueList.innerHTML = articles.map(function(a, idx) {
    var resourceInfo = a.resourceId ? ('ID: ' + escapeHtml(String(a.resourceId)) + (a.resourceName ? ' (' + escapeHtml(a.resourceName) + ')' : '')) : '未选择';
    var imageWarning = a.hasImages && !a.ignoreImages ? '<span class="image-warning">含图片</span>' : '';
    var imgIgnored = a.hasImages && a.ignoreImages ? '<span class="image-ignored">已忽略图片</span>' : '';

    return [
      '<article class="media-queue-item">',
      '<div class="media-queue-item-info">',
      '<p class="media-queue-title">' + escapeHtml(a.title) + '</p>',
      '<p class="media-queue-file">' + escapeHtml(a.filename) + '</p>',
      '</div>',
      '<div class="media-queue-resource">',
      '<select class="media-resource-select" data-idx="' + idx + '">',
      '<option value="">' + resourceInfo + '</option>',
      '</select>',
      imageWarning,
      imgIgnored,
      '</div>',
      '</article>'
    ].join("");
  }).join("");

  // Populate dropdowns with pool resources
  window.desktopConsole.getPool().then(function(result) {
    if (result && result.ok && result.data) {
      mediaQueueState.poolResources = result.data;
      var selects = document.querySelectorAll(".media-resource-select");
      selects.forEach(function(sel) {
        var idx = parseInt(sel.getAttribute("data-idx"), 10);
        var article = mediaQueueState.articles[idx];
        var currentVal = sel.value;
        sel.innerHTML = '<option value="">未选择</option>' + mediaQueueState.poolResources.map(function(r) {
          var label = r.name + ' (ID: ' + r.resourceId + (r.price !== undefined ? ', ' + r.price : '') + ')';
          var selected = article && String(article.resourceId) === String(r.resourceId) ? ' selected' : '';
          return '<option value="' + r.resourceId + '"' + selected + '>' + escapeHtml(label) + '</option>';
        }).join("");
      });

      // Attach change handlers
      selects.forEach(function(sel) {
        sel.addEventListener("change", function() {
          var idx = parseInt(sel.getAttribute("data-idx"), 10);
          var article = mediaQueueState.articles[idx];
          var newResourceId = sel.value;
          if (newResourceId) {
            var poolEntry = mediaQueueState.poolResources.find(function(r) {
              return String(r.resourceId) === newResourceId;
            });
            window.desktopConsole.setDraft(article.filename, {
              resourceId: newResourceId,
              resourceName: poolEntry ? poolEntry.name : "",
              title: article.title
            }).then(function() {
              article.resourceId = newResourceId;
              article.resourceName = poolEntry ? poolEntry.name : "";
            });
          } else {
            window.desktopConsole.setDraft(article.filename, {
              resourceId: null,
              resourceName: "",
              title: article.title
            }).then(function() {
              article.resourceId = null;
              article.resourceName = null;
            });
          }
        });
      });
    }
  });
}

async function refreshMediaQueue() {
  mediaQueueElements.mediaQueueList.innerHTML = '<p class="empty-state">正在扫描 input/media...</p>';
  try {
    var result = await window.desktopConsole.scanMediaArticles();
    if (result && result.ok) {
      renderMediaQueue(result.data);
    } else {
      mediaQueueElements.mediaQueueList.innerHTML = '<p class="empty-state">扫描失败: ' + (result && result.error || "未知错误") + '</p>';
    }
  } catch (err) {
    mediaQueueElements.mediaQueueList.innerHTML = '<p class="empty-state">扫描异常: ' + err.message + '</p>';
  }
}

async function bulkSelectMedia() {
  // Pop up a pool picker from the pool data
  window.desktopConsole.getPool().then(function(result) {
    if (!result || !result.ok || !result.data || result.data.length === 0) {
      alert("媒体池为空。请先在媒体资源库中将媒体加入媒体池。");
      return;
    }
    var pool = result.data;
    var resourceId = prompt("输入媒体 resource_id 批量应用:
" + pool.map(function(r) {
      return r.resourceId + " - " + r.name;
    }).join("
"));
    if (resourceId) {
      var entry = pool.find(function(r) { return String(r.resourceId) === String(resourceId); });
      var filenames = mediaQueueState.articles.map(function(a) { return a.filename; });
      window.desktopConsole.setBulkResource(filenames, resourceId, entry ? entry.name : "").then(function() {
        refreshMediaQueue();
      });
    }
  });
}

if (mediaQueueElements.refreshMediaQueueBtn) {
  mediaQueueElements.refreshMediaQueueBtn.addEventListener("click", refreshMediaQueue);
}
if (mediaQueueElements.bulkSelectMediaBtn) {
  mediaQueueElements.bulkSelectMediaBtn.addEventListener("click", bulkSelectMedia);
}




// -------- Preflight / Dry-Run --------

var preflightBtn = document.getElementById("preflightBtn");

async function runPreflightCheck() {
  var articles = mediaQueueState.articles;
  if (articles.length === 0) {
    alert("没有待投稿文章。请先将文章放入 input/media 目录并刷新队列。");
    return;
  }

  var payload = articles.map(function(a) {
    return {
      filename: a.filename,
      title: a.title,
      resourceId: a.resourceId,
      resourceName: a.resourceName,
      hasImages: a.hasImages,
      imageCount: a.imageCount,
      ignoreImages: a.ignoreImages
    };
  });

  try {
    var result = await window.desktopConsole.runPreflight(payload, true);
    if (result && result.ok && result.data) {
      var pf = result.data;
      var msg = "=== 预检报告 (Dry-Run) ===

";
      msg += "文章数: " + pf.articles.length + "
";
      msg += "全部通过: " + (pf.ok ? "是" : "否") + "
";
      msg += "所有文章已选媒体: " + (pf.checks.allHaveResources ? "是" : "否") + "
";
      msg += "无图片阻塞: " + (pf.checks.noImageBlockers ? "是" : "否") + "

";
      
      pf.articles.forEach(function(a) {
        msg += "[" + (a.ok ? "OK" : "FAIL") + "] " + a.title + "
";
        msg += "  媒体: " + (a.resourceName || a.resourceId || "未选择") + "
";
        if (a.errors.length) msg += "  错误: " + a.errors.join("; ") + "
";
        if (a.warnings.length) msg += "  警告: " + a.warnings.join("; ") + "
";
      });

      if (pf.errors.length) msg += "
总错误:
" + pf.errors.map(function(e) { return "  - " + e; }).join("
");
      
      alert(msg);
    } else {
      alert("预检失败: " + (result && result.error || "未知错误"));
    }
  } catch (err) {
    alert("预检异常: " + err.message);
  }
}

if (preflightBtn) {
  preflightBtn.addEventListener("click", runPreflightCheck);
}




// -------- Order center --------

var orderElements = {
  refreshOrdersBtn: document.getElementById("refreshOrdersBtn"),
  orderStatusFilter: document.getElementById("orderStatusFilter"),
  syncAllOrdersBtn: document.getElementById("syncAllOrdersBtn"),
  ordersList: document.getElementById("ordersList")
};

var ordersState = {
  orders: []
};

function statusLabel(status) {
  if (status === "submitted" || status === "success") return "已投稿";
  if (status === "published") return "已发布";
  if (status === "failed" || status === "error") return "失败";
  return status || "未知";
}

function statusClass(status) {
  if (status === "submitted" || status === "success") return "status-submitted";
  if (status === "published") return "status-published";
  if (status === "failed" || status === "error") return "status-failed";
  return "status-unknown";
}

function renderOrders(orders) {
  ordersState.orders = orders || [];

  if (!orders || orders.length === 0) {
    orderElements.ordersList.innerHTML = '<p class="empty-state">没有投稿订单记录。</p>';
    return;
  }

  var filterStatus = orderElements.orderStatusFilter ? orderElements.orderStatusFilter.value : "";

  var filtered = orders;
  if (filterStatus) {
    filtered = orders.filter(function(o) {
      var rs = o.result && o.result.success;
      if (filterStatus === "submitted") return rs === true;
      if (filterStatus === "failed") return rs === false;
      return false;
    });
  }

  if (filtered.length === 0) {
    orderElements.ordersList.innerHTML = '<p class="empty-state">没有匹配的订单。</p>';
    return;
  }

  orderElements.ordersList.innerHTML = filtered.map(function(o) {
    var params = o.params || {};
    var result = o.result || {};
    var success = result.success;
    var stLabel = statusLabel(success ? "submitted" : "failed");
    var stClass = statusClass(success ? "submitted" : "failed");

    var orderNid = "";
    if (result.data && result.data.data && result.data.data.order_nid) {
      orderNid = result.data.data.order_nid;
    }

    return [
      '<article class="order-item">',
      '<div class="order-item-info">',
      '<p class="order-item-title">' + escapeHtml(params.title || "未知") + '</p>',
      '<p class="order-item-meta">',
      '资源: ' + escapeHtml(params.resource_id || "-") +
      (orderNid ? ' | 订单号: ' + escapeHtml(orderNid) : '') +
      ' | ' + (o.ts ? new Date(o.ts).toLocaleString() : "未知时间") +
      '</p>',
      '</div>',
      '<span class="order-status ' + stClass + '">' + stLabel + '</span>',
      orderNid ? '<button class="secondary sync-order-btn" data-nid="' + escapeHtml(orderNid) + '">同步</button>' : '',
      '</article>'
    ].join("");
  }).join("");

  // Attach sync handlers
  var syncBtns = document.querySelectorAll(".sync-order-btn");
  syncBtns.forEach(function(btn) {
    btn.addEventListener("click", async function() {
      var nid = btn.getAttribute("data-nid");
      btn.disabled = true;
      btn.textContent = "同步中...";
      try {
        var result = await window.desktopConsole.syncOrder(nid);
        if (result && result.ok) {
          alert("订单 " + nid + " 同步成功");
          refreshOrders();
        } else {
          alert("同步失败: " + (result && result.error || "未知错误"));
        }
      } catch (err) {
        alert("同步异常: " + err.message);
      }
      btn.disabled = false;
      btn.textContent = "同步";
    });
  });
}

async function refreshOrders() {
  orderElements.ordersList.innerHTML = '<p class="empty-state">正在加载订单...</p>';
  try {
    var result = await window.desktopConsole.getOrders();
    if (result && result.ok) {
      renderOrders(result.data);
    } else {
      orderElements.ordersList.innerHTML = '<p class="empty-state">加载失败: ' + (result && result.error || "未知错误") + '</p>';
    }
  } catch (err) {
    orderElements.ordersList.innerHTML = '<p class="empty-state">加载异常: ' + err.message + '</p>';
  }
}

async function syncAllOrders() {
  var orders = ordersState.orders;
  if (orders.length === 0) return;
  orderElements.syncAllOrdersBtn.disabled = true;
  var synced = 0;
  var failed = 0;
  for (var i = 0; i < orders.length; i++) {
    var o = orders[i];
    var data = o.result && o.result.data;
    if (data && data.data && data.data.order_nid) {
      try {
        var result = await window.desktopConsole.syncOrder(data.data.order_nid);
        if (result && result.ok) synced++; else failed++;
      } catch (_) { failed++; }
    }
  }
  orderElements.syncAllOrdersBtn.disabled = false;
  alert("同步完成: " + synced + " 成功, " + failed + " 失败");
  refreshOrders();
}

if (orderElements.refreshOrdersBtn) {
  orderElements.refreshOrdersBtn.addEventListener("click", refreshOrders);
}
if (orderElements.syncAllOrdersBtn) {
  orderElements.syncAllOrdersBtn.addEventListener("click", syncAllOrders);
}
if (orderElements.orderStatusFilter) {
  orderElements.orderStatusFilter.addEventListener("change", function() {
    renderOrders(ordersState.orders);
  });
}

// Initialize orders on load
refreshOrders();


// Initialize media panel on load
updateMediaCacheInfo();
loadPoolIds();
window.desktopConsole.getCachedResources().then(function(result) {
  if (result && result.ok && result.data && result.data.resources) {
    renderMediaResources(result.data.resources);
  }
}).catch(function() {});


loadInitialState().catch(function(error) {
  elements.generatedAt.textContent = error.message;
  setRefreshing(false);
});
