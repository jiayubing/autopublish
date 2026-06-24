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

loadInitialState().catch(function(error) {
  elements.generatedAt.textContent = error.message;
  setRefreshing(false);
});
