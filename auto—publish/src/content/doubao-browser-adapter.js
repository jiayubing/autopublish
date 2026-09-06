const fs = require("fs");
const path = require("path");
const { reportDiagnostic } = require("../diagnostics/diagnostic-producer");

const { DIRS, PW } = require("../../scripts/config");
const { createPlaywrightRuntime, pwSessionConfig } = require("../core/playwright");
const {
  classifyPage,
  selectAnswerForQuestion,
  getAnswerIdentity,
  isAnswerComplete,
  normalizePageSnapshot
} = require("./doubao-page-parser");

const DOUBAO_CHAT_URL = "https://www.doubao.com/chat/";
const POLL_INTERVAL_MS = 1000;
const COLLECTION_TIMEOUT_MS = 120000;
const MAX_DIAGNOSTICS = 20;
const DIAGNOSTIC_TIMEOUT_MS = 5000;

function codedError(code, message, details) {
  const error = new Error(message);
  error.code = code;
  if (details) error.details = details;
  return error;
}

function defaultSleep(milliseconds) {
  return new Promise(function(resolve) { setTimeout(resolve, milliseconds); });
}

function timeoutError(phase, elapsedMs) {
  const labels = { open: "打开浏览器", conversation: "切换客户对话", ready: "等待上一题结束", send: "确认问题已发送", answer: "等待本题完整回答" };
  return codedError("DOUBAO_TIMEOUT", "豆包采集超时：" + labels[phase] + "；本题已等待 " + Math.floor(elapsedMs / 1000) + " 秒。请检查页面后继续，失败题可单独重试。");
}

function isFreshAnswer(identity, baseline) {
  if (!baseline) return true;
  if (!identity) return false;
  if (!baseline.questionMessageId && !baseline.answerMessageId) return true;
  return identity.questionMessageId !== baseline.questionMessageId || identity.answerMessageId !== baseline.answerMessageId;
}

function withTimeout(promise, milliseconds) {
  let timer;
  const timeout = new Promise(function(_, reject) {
    timer = setTimeout(function() {
      reject(codedError("DOUBAO_DIAGNOSTIC_TIMEOUT", "Doubao diagnostic collection timed out"));
    }, milliseconds);
  });
  return Promise.race([promise, timeout]).finally(function() { clearTimeout(timer); });
}

function inspectPageScript() {
  return [
    "return await page.evaluate(function() {",
    "  var input = document.querySelector('textarea, input[type=\\\"text\\\"], [contenteditable=\\\"true\\\"]');",
    "  var visible = function(node) {",
    "    if (!node) return false;",
    "    var style = window.getComputedStyle ? window.getComputedStyle(node) : null;",
    "    var rect = typeof node.getBoundingClientRect === 'function' ? node.getBoundingClientRect() : null;",
    "    var current = node;",
    "    while (current) {",
    "      var ariaHidden = (current.getAttribute('aria-hidden') || '').toLowerCase();",
    "      if (ariaHidden === 'true') return false;",
    "      var currentStyle = window.getComputedStyle ? window.getComputedStyle(current) : null;",
    "      if (currentStyle && (currentStyle.display === 'none' || currentStyle.visibility === 'hidden' || currentStyle.visibility === 'collapse' || Number(currentStyle.opacity) === 0)) return false;",
    "      var currentRect = typeof current.getBoundingClientRect === 'function' ? current.getBoundingClientRect() : null;",
    "      if (currentRect && (currentRect.width <= 0 || currentRect.height <= 0)) return false;",
    "      current = current.parentElement;",
    "    }",
    "    return true;",
    "  };",
    "  var outsideMessages = function(node) {",
    "    for (var current = node; current; current = current.parentElement) {",
    "      if (current.getAttribute('data-message-id')) return false;",
    "      if ((current.getAttribute('class') || '').split(/\\s+/).indexOf('v_list_row') !== -1) return false;",
    "    }",
    "    return true;",
    "  };",
    "  var statusRegions = Array.from(document.querySelectorAll('[role=\"dialog\"], [role=\"alert\"], [aria-modal=\"true\"], [class*=\"captcha\"], [id*=\"captcha\"]')).filter(function(node) { return outsideMessages(node) && visible(node); });",
    "  var statusText = statusRegions.map(function(node) { return node.innerText || node.textContent || ''; }).join('\\n');",
    "  var loginPattern = /^(?:登录|登錄|立即登录|登录\\s*[/／]\\s*注册|log\\s*in|login|sign\\s*in)$/i;",
    "  var loginControls = Array.from(document.querySelectorAll('button, [role=\"button\"], a'));",
    "  var loginRequired = loginControls.some(function(node) {",
    "    var label = (node.innerText || node.textContent || node.getAttribute('aria-label') || '').trim();",
    "    return outsideMessages(node) && visible(node) && loginPattern.test(label);",
    "  });",
    "  var stopPattern = /(?:stop\\s+generating|停止生成|停止回答)/i;",
    "  var controls = Array.from(document.querySelectorAll('button, [role=\\\"button\\\"]'));",
    "  var generating = controls.some(function(node) {",
    "    var label = (node.getAttribute('aria-label') || node.innerText || node.textContent || '').trim();",
    "    return visible(node) && stopPattern.test(label);",
    "  });",
    "  var allMessageNodes = Array.from(document.querySelectorAll('[data-message-id]'));",
    "  var messageNodes = allMessageNodes.slice(Math.max(0, allMessageNodes.length - 80));",
    "  var messageCandidates = messageNodes.map(function(node) {",
    "    var ancestorClassNames = [];",
    "    var ancestor = node.parentElement;",
    "    var depth = 0;",
    "    while (ancestor && depth < 8) {",
    "      ancestorClassNames.push(typeof ancestor.className === 'string' ? ancestor.className : (ancestor.getAttribute('class') || ''));",
    "      ancestor = ancestor.parentElement;",
    "      depth += 1;",
    "    }",
    "    var messageId = (node.getAttribute('data-message-id') || '').trim();",
    "    var classTokens = function(value) { return (value || '').trim().split(/\\s+/).filter(Boolean); };",
    "    var hasClassToken = function(candidate, token) {",
    "      var value = typeof candidate.className === 'string' ? candidate.className : (candidate.getAttribute('class') || '');",
    "      return classTokens(value).indexOf(token) !== -1;",
    "    };",
    "    var row = node;",
    "    while (row && !hasClassToken(row, 'v_list_row')) row = row.parentElement;",
    "    var isAssociatedPanel = function(candidate) {",
    "      if (!candidate) return false;",
    "      var relation = candidate.getAttribute('data-reference-for') || candidate.getAttribute('data-for-message-id') || candidate.getAttribute('aria-controls') || candidate.getAttribute('aria-labelledby') || '';",
    "      if (relation && relation === messageId) return true;",
    "      return false;",
    "    };",
    "    var scopes = [];",
    "    var addScope = function(scope) { if (scope && scopes.indexOf(scope) === -1) scopes.push(scope); };",
    "    addScope(node);",
    "    addScope(row);",
    "    [node.previousElementSibling, node.nextElementSibling, row && row.previousElementSibling, row && row.nextElementSibling].forEach(function(sibling) {",
    "      if (isAssociatedPanel(sibling)) addScope(sibling);",
    "    });",
    "    var references = [];",
    "    var seenReferenceUrls = {};",
    "    scopes.forEach(function(scope) {",
    "      if (!scope || typeof scope.querySelectorAll !== 'function') return;",
    "      Array.from(scope.querySelectorAll('a[href]')).forEach(function(link) {",
    "        var url = link.href || link.getAttribute('href') || '';",
    "        if (!/^https?:\\/\\//i.test(url) || seenReferenceUrls[url]) return;",
    "        seenReferenceUrls[url] = true;",
    "        references.push({ title: (link.innerText || link.textContent || '').trim(), url: url, snippet: '' });",
    "      });",
    "    });",
    "    var className = typeof node.className === 'string' ? node.className : (node.getAttribute('class') || '');",
    "    return {",
    "      messageId: messageId,",
    "      role: (node.getAttribute('data-role') || node.getAttribute('data-message-role') || '').trim(),",
    "      className: className,",
    "      ancestorClassNames: ancestorClassNames,",
    "      text: (node.innerText || node.textContent || '').trim(),",
    "      references: references",
    "    };",
    "  });",
    "  var challenge = /验证码|安全验证|人机验证|captcha|challenge/i.test(statusText);",
    "  var errorMatch = statusText.match(/(?:加载失败|出错了|服务异常|网络错误)[^\\n]*/i);",
    "  return {",
    "    url: location.href,",
    "    inputAvailable: !!input,",
    "    loginRequired: loginRequired,",
    "    generating: generating,",
    "    challenge: challenge,",
    "    errorText: errorMatch ? errorMatch[0].trim() : '',",
    "    messageCandidates: messageCandidates",
    "  };",
    "});"
  ].join("\n");
}

function sendQuestionScript(questionJson) {
  return [
    "var question = " + questionJson + ";",
    "var knownIds = await page.evaluate(function() { return Array.from(document.querySelectorAll('[data-message-id]')).map(function(node) { return node.getAttribute('data-message-id'); }); });",
    "var input = page.locator('textarea:visible, input[type=\"text\"]:visible, [contenteditable=\"true\"]:visible').first();",
    "await input.waitFor({ state: 'visible', timeout: 15000 });",
    "await input.fill(question);",
    "await input.press('Enter');",
    "var acknowledgement = await page.waitForFunction(function(value) {",
    "  var normalize = function(text) { return String(text || '').trim().replace(/\\s+/g, ' '); };",
    "  var nodes = Array.from(document.querySelectorAll('[data-message-id]'));",
    "  for (var index = nodes.length - 1; index >= 0; index -= 1) {",
    "    var node = nodes[index];",
    "    var id = node.getAttribute('data-message-id');",
    "    if (!id || value.knownIds.indexOf(id) !== -1 || normalize(node.innerText || node.textContent) !== normalize(value.question)) continue;",
    "    var role = (node.getAttribute('data-role') || node.getAttribute('data-message-role') || '').toLowerCase();",
    "    var user = role === 'user' || role === 'human';",
    "    if (!role) {",
    "      for (var parent = node, depth = 0; parent && depth <= 8; parent = parent.parentElement, depth += 1) {",
    "        if ((parent.getAttribute('class') || '').split(/\\s+/).indexOf('justify-end') !== -1) { user = true; break; }",
    "      }",
    "    }",
    "    if (user) return id;",
    "  }",
    "  return false;",
    "}, { question: question, knownIds: knownIds }, { timeout: 15000 });",
    "try { return { ok: true, questionMessageId: await acknowledgement.jsonValue() }; }",
    "finally { await acknowledgement.dispose(); }"
  ].join("\n");
}

function navigateConversationScript(urlJson) {
  return [
    "var targetUrl = " + urlJson + ";",
    "await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });",
    "return { url: page.url() };"
  ].join("\n");
}

function newConversationScript() {
  return [
    "await page.goto(" + JSON.stringify(DOUBAO_CHAT_URL) + ", { waitUntil: 'domcontentloaded' });",
    "return { url: page.url(), created: true };"
  ].join("\n");
}

function safeTimestamp(value) {
  const date = new Date(value);
  const iso = Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
  return iso.replace(/[^0-9TZ-]/g, "-");
}

function trimDiagnostics(directory, limit) {
  // BEST_EFFORT_CLEANUP: pruning optional diagnostic artifacts never changes
  // the collection outcome; failed removals remain available for inspection.
  if (!fs.existsSync(directory)) return;
  const groups = new Map();
  fs.readdirSync(directory).forEach(function(name) {
    if (name.endsWith(".png")) { try { fs.unlinkSync(path.join(directory, name)); } catch (_) {} return; } if (!name.endsWith(".json")) return;
    const stem = name.slice(0, -path.extname(name).length);
    const filePath = path.join(directory, name);
    let mtime = 0;
    try { mtime = fs.statSync(filePath).mtimeMs; } catch (_) {}
    const group = groups.get(stem) || { mtime: 0, files: [] };
    group.mtime = Math.max(group.mtime, mtime);
    group.files.push(filePath);
    groups.set(stem, group);
  });

  const ordered = Array.from(groups.values()).sort(function(a, b) { return a.mtime - b.mtime; });
  while (ordered.length > limit) {
    const group = ordered.shift();
    group.files.forEach(function(filePath) {
      try { fs.unlinkSync(filePath); } catch (_) {}
    });
  }
}

function createDoubaoBrowserAdapter(options) {
  const opts = options || {};
  const mode = opts.mode === undefined ? "visible" : opts.mode;
  if (mode !== "visible" && mode !== "background") {
    throw codedError("DOUBAO_BROWSER_MODE_INVALID", "Doubao browser mode must be visible or background");
  }
  const profileId = opts.profileId || (opts.session && opts.session.profileId) || "default";
  const session = opts.session || pwSessionConfig({ session: "doubao", profileId: profileId, profileDir: opts.profileDir, daemonDir: opts.daemonDir, stateFile: opts.stateFile });
  const runtime = opts.runtime || createPlaywrightRuntime({ session: session });
  const sleep = opts.sleep || defaultSleep;
  const now = opts.now || function() { return new Date().toISOString(); };
  const intervalMs = opts.intervalMs || POLL_INTERVAL_MS;
  const timeoutMs = Math.min(opts.timeoutMs || COLLECTION_TIMEOUT_MS, COLLECTION_TIMEOUT_MS);
  const diagnosticTimeoutMs = opts.diagnosticTimeoutMs || DIAGNOSTIC_TIMEOUT_MS;
  const clock = opts.clock || function() { return Date.now(); };
  const diagnosticsDir = opts.diagnosticsDir || path.join(DIRS.logsDir, "doubao-diagnostics");
  const diagnosticsLimit = opts.diagnosticsLimit || MAX_DIAGNOSTICS;
  let diagnosticSequence = 0;
  let sessionReady = false;
  let openingPromise = null;
  let sessionGeneration = 0;
  let activeClientId = null;
  const conversationStore = opts.conversationStore || {
    get: function() { return null; },
    set: function() { return false; },
    remove: function() { return false; }
  };

  async function openPage(input) {
    return runtime.open(Object.assign({
      url: DOUBAO_CHAT_URL,
      session: session,
      browser: PW.browserChannel,
      headed: mode === "visible",
      persistent: true,
      profileId: profileId,
      profileDir: session.profileDir,
      daemonDir: session.daemonDir,
      stateFile: session.stateFile
    }, input || {}));
  }

  async function ensureSession(input) {
    if (sessionReady) return;
    if (!openingPromise) {
      const generation = sessionGeneration;
      let pending;
      pending = openPage(input).then(function() {
        if (generation === sessionGeneration) sessionReady = true;
      }).finally(function() {
        if (openingPromise === pending) openingPromise = null;
      });
      openingPromise = pending;
    }
    return openingPromise;
  }

  async function inspectExistingSession(input) {
    const evaluateInput = Object.assign({ action: "inspect-page", script: inspectPageScript() }, input || {});
    try {
      const snapshot = await runtime.evaluate(evaluateInput);
      return normalizePageSnapshot(snapshot);
    } catch (error) {
      if (error && error.code === "PLAYWRIGHT_SESSION_NOT_OPEN") {
        sessionReady = false;
        activeClientId = null;
      }
      throw error;
    }
  }

  async function captureDiagnostic(code, snapshot, error, progress) {
    fs.mkdirSync(diagnosticsDir, { recursive: true });
    const stamp = safeTimestamp(now());
    const stem = stamp + "-" + String(code).replace(/[^a-zA-Z0-9_-]/g, "_") + "-" + diagnosticSequence++;
    const jsonPath = path.join(diagnosticsDir, stem + ".json");
    const page = snapshot && typeof snapshot === "object" ? snapshot : {};
    const summary = {
      action: "capture-diagnostic",
      code: code,
      capturedAt: now(),
      status: classifyPage(page).status,
      messageCount: Array.isArray(page.messages) ? page.messages.length : 0,
      errorCode: error && error.code ? String(error.code) : "",
      ...(progress || {})
    };
    fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 2), "utf8");
    trimDiagnostics(diagnosticsDir, diagnosticsLimit);
    return { diagnosticId: stem };
  }

  async function getLoginState() {
    if (mode === "background") throw codedError("DOUBAO_BACKGROUND_UNAVAILABLE", "Background Doubao collection is not available");
    const snapshot = await inspectExistingSession();
    return classifyPage(snapshot);
  }

  async function assertPageCollectable(snapshot) {
    const pageState = classifyPage(snapshot);
    if (pageState.status === "login_required") {
      const error = codedError("DOUBAO_LOGIN_REQUIRED", "Doubao login is required");
      throw error;
    }
    if (pageState.status === "challenge") {
      const error = codedError("DOUBAO_CHALLENGE", "Doubao challenge requires human action");
      throw error;
    }
    if (pageState.status === "page_error") {
      const error = codedError("DOUBAO_PAGE_ERROR", "Doubao page reported an error");
      throw error;
    }
    return pageState;
  }

  async function openLogin() {
    if (mode === "background") throw codedError("DOUBAO_BACKGROUND_UNAVAILABLE", "Background Doubao collection is not available");
    await ensureSession();
    return getLoginState();
  }

  async function ensureClientConversation(clientId, evaluateWithDeadline) {
    if (!clientId || activeClientId === clientId) return;
    const savedUrl = conversationStore.get(clientId);
    if (savedUrl) {
      try {
        await evaluateWithDeadline({
          action: "switch-conversation",
          script: navigateConversationScript(JSON.stringify(savedUrl))
        });
        activeClientId = clientId;
        return;
      } catch (error) {
        if (error && ["DOUBAO_TIMEOUT", "PLAYWRIGHT_TIMEOUT", "ETIMEDOUT"].includes(error.code)) throw error;
        conversationStore.remove(clientId);
      }
    }
    await evaluateWithDeadline({
      action: "new-conversation",
      script: newConversationScript()
    });
    activeClientId = clientId;
  }

  function rememberClientConversation(clientId, snapshot) {
    if (!clientId || !snapshot || typeof snapshot.url !== "string") return;
    conversationStore.set(clientId, snapshot.url);
  }

  async function collect(input) {
    if (mode === "background") throw codedError("DOUBAO_BACKGROUND_UNAVAILABLE", "Background Doubao collection is not available");
    const clientId = input && typeof input === "object" && !Array.isArray(input)
      ? String(input.clientId || "")
      : "";
    const requestedQuestion = String(
      input && typeof input === "object" && !Array.isArray(input)
        ? input.question
        : input == null ? "" : input
    );
    if (!requestedQuestion.trim()) throw codedError("DOUBAO_INVALID_QUESTION", "Doubao question is required");

    const startedAt = clock();
    const deadline = startedAt + timeoutMs;
    let phase = "open";
    let lastSnapshot = null;
    let questionMessageId;
    let sendConfirmed = false;
    const timedOut = function() { return timeoutError(phase, clock() - startedAt); };
    const evaluateWithDeadline = async function(input) {
      const remaining = deadline - clock();
      if (remaining <= 0) throw timedOut();
      const evaluateInput = Object.assign({}, input, { timeoutMs: remaining });
      // Do not silently reopen/navigate away from a question already sent.
      const result = input.action === "inspect-page"
        ? await inspectExistingSession(evaluateInput)
        : await runtime.evaluate(evaluateInput);
      if (clock() >= deadline) throw timedOut();
      return result;
    };
    const readPage = async function() {
      lastSnapshot = await evaluateWithDeadline({ action: "inspect-page", script: inspectPageScript() });
      await assertPageCollectable(lastSnapshot);
      rememberClientConversation(clientId, lastSnapshot);
      return lastSnapshot;
    };
    const waitForPoll = async function() {
      const remaining = deadline - clock();
      if (remaining <= 0) throw timedOut();
      await sleep(Math.min(intervalMs, remaining));
      if (clock() >= deadline) throw timedOut();
    };
    try {
      await ensureSession({ timeoutMs: timeoutMs });
      if (clock() >= deadline) throw timedOut();
      phase = "conversation";
      await ensureClientConversation(clientId, evaluateWithDeadline);
      phase = "ready";
      let initialSnapshot = await readPage();
      while (initialSnapshot.generating) {
        await waitForPoll();
        initialSnapshot = await readPage();
      }
      const baselineAnswer = getAnswerIdentity(initialSnapshot, requestedQuestion);
      phase = "send";
      const questionJson = JSON.stringify(requestedQuestion);
      const sendResult = await evaluateWithDeadline({
        action: "send-question",
        questionJson: questionJson,
        script: sendQuestionScript(questionJson)
      });
      if (!sendResult || sendResult.ok !== true) {
        throw codedError("DOUBAO_SEND_FAILED", "豆包未确认问题已发送，请检查页面后重试。");
      }
      sendConfirmed = true;
      questionMessageId = sendResult.questionMessageId;
      phase = "answer";
      let previousText = null;
      let stableCount = 0;
      while (true) {
        const snapshot = await readPage();
        const answerIdentity = getAnswerIdentity(snapshot, requestedQuestion, questionMessageId);
        if (isFreshAnswer(answerIdentity, baselineAnswer) && isAnswerComplete(snapshot, requestedQuestion, questionMessageId)) {
          const answer = selectAnswerForQuestion(snapshot, requestedQuestion, questionMessageId);
          if (answer.answerText === previousText) stableCount += 1;
          else { previousText = answer.answerText; stableCount = 1; }
          if (stableCount >= 2) {
            return { answerText: answer.answerText, references: answer.references, collectionMethod: "automatic", collectedAt: now() };
          }
        } else {
          previousText = null;
          stableCount = 0;
        }
        await waitForPoll();
      }
    } catch (cause) {
      const error = (cause && ["DOUBAO_TIMEOUT", "PLAYWRIGHT_TIMEOUT", "ETIMEDOUT"].includes(cause.code)) || clock() >= deadline
        ? timedOut() : cause;
      const identity = getAnswerIdentity(lastSnapshot, requestedQuestion, questionMessageId);
      try {
        await captureDiagnostic(error.code || "DOUBAO_COLLECTION_FAILED", lastSnapshot, error, {
          phase: phase, elapsedMs: Math.max(0, clock() - startedAt),
          generating: Boolean(lastSnapshot && lastSnapshot.generating),
          sendConfirmed: sendConfirmed, answerSeen: Boolean(identity)
        });
      } catch (_) {
        reportDiagnostic({
          code: "DOUBAO_DIAGNOSTIC_WRITE_FAILED", module: "doubao-browser-adapter", category: "storage",
          operationId: "doubao-diagnostic", metadata: { phase: phase, outcome: "best-effort-failed" }
        });
      }
      throw error;
    }
  }

  async function close() {
    sessionGeneration += 1;
    sessionReady = false;
    openingPromise = null;
    activeClientId = null;
    if (runtime.close) return runtime.close({ session: session });
    return undefined;
  }

  return { mode: mode, openLogin: openLogin, getLoginState: getLoginState, collect: collect, close: close };
}

module.exports = { createDoubaoBrowserAdapter, inspectPageScript };
