"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { collectTestFiles } = require("./run-tests");
const { classifyTestFile } = require("./test-runner-policy");

const ROOT = path.resolve(__dirname, "..");
const REPOSITORY_ROOT = path.resolve(ROOT, "..");
const DEFAULT_OUTPUT = path.join(
  REPOSITORY_ROOT,
  ".scratch",
  "article-lifecycle-and-submission",
  "handoffs",
  "M05-0-authoritative-test-disposition-ledger.md",
);
const TEST_CALL_NAMES = new Set(["test", "it", "specify"]);
const TEST_CALL_MODIFIERS = new Set([
  "skip",
  "todo",
  "only",
  "failing",
  "if",
  "unless",
  "concurrent",
]);

const PACKAGE_FREEZE = Object.freeze([
  {
    id: "M05-A",
    owner: "Renderer content/generation/attention feature owners",
    scope:
      "features/content、features/generation、features/attention，以及 content workbench 内 paid-media execution command state；只证明公开 feature/query/command snapshot 和可观察 Renderer 行为。",
    forbidden:
      "platform/media account/queue/run、provider settings、workspace/bootstrap、IPC/bridge contract、adapter outcome、OperationalStore。",
    gate: "content/generation/attention feature tests、Renderer harness observable behavior、inventory delta。",
  },
  {
    id: "M05-B",
    owner: "Renderer platform/publication/media read-model owners",
    scope:
      "features/platform、platform-event-router、features/media、order-list-projection，以及 publication history/status/read-model presentation。",
    forbidden:
      "content workbench paid-media execution state、provider configuration、IPC/bridge contract、远端 adapter mapping、OperationalStore lifecycle。",
    gate: "platform/publication/media feature/controller tests、typed fixture smoke、Renderer typecheck/build、inventory delta。",
  },
  {
    id: "M05-C",
    owner: "Renderer workspace/settings/shell owners",
    scope:
      "features/workspace、workspace-coordinator、diagnostic sink/store、features/settings、application shell、confirmation host 和纯 presentation utility；包含 provider settings 的 Renderer 展示。",
    forbidden:
      "content/platform/media lifecycle、publication-derived read projection、Electron security/packaging static gate、IPC/bridge contract、provider runtime/adapter。",
    gate: "workspace/settings/shell/harness tests、Renderer typecheck/build、inventory delta。",
  },
  {
    id: "M05-D",
    owner: "Typed IPC/domain contract, registrar, preload and bridge owners",
    scope:
      "DTO/version/unknown-field/safe-error/event contract、registry/registrar/preload/bridge mapping、named capability/consumer/absence/symbol identity evidence。",
    forbidden:
      "Renderer business state、OperationalStore、adapter outcome、恢复旧 barrel/compatibility export、production contract implementation。",
    gate: "typed IPC owner suites、production IPC matrix、main/bridge/renderer typecheck、contract capability subset。",
  },
  {
    id: "M05-E1",
    owner:
      "Lifecycle projection, article permissions/attention/query and ArticleMutationCoordinator owners",
    scope:
      "lifecycle projection、article mutation admission、article permissions/attention policy/query、ArticleMutationCoordinator 的行为矩阵；不含 Renderer attention feature。",
    forbidden:
      "OperationalStore persistence/transaction/recovery、submission/publication application、Renderer、IPC、adapter、migration reader。",
    gate: "lifecycle/coordinator/permission/attention public-call-chain、stale/duplicate/failure matrix。",
  },
  {
    id: "M05-E2",
    owner:
      "OperationalStore public facade, persistence, transaction and recovery owners",
    scope:
      "OperationalStore public facade、持久事实、transaction、fault/restart/recovery、removal transaction storage；保留能定位内部事务边界的测试。",
    forbidden:
      "submission/publication application orchestration、Renderer、IPC、adapter、migration reader、合法 static gate。",
    gate: "OperationalStore lifecycle/internals/fault/restart/recovery matrix、inventory delta。",
  },
  {
    id: "M05-E3",
    owner:
      "Submission/publication application, admission/queue claim and remote outcome owners",
    scope:
      "submission/publication application、single-target admission、queue claim、publication outcome/reconciliation、order observation 的行为矩阵。",
    forbidden:
      "adapter protocol mapping（归 F）、Renderer/IPC、OperationalStore persistence owner、migration reader、static gate。",
    gate: "submission/publication/queue/outcome admission、uncertain、duplicate/idempotent、reordered/recovery matrix。",
  },
  {
    id: "M05-F",
    owner: "External adapter and browser/session runtime boundary owners",
    scope:
      "regular platform、Hepan、Doubao browser/media adapter 与 worker/runtime；输入→typed outcome/remote evidence mapping、failure/uncertain/credential cleanup。",
    forbidden:
      "lifecycle freeze/retry/manual-resolution facts、Renderer/IPC/store/static packaging tests、真实账号/发布/付费/取消/上传。",
    gate: "adapter/runtime contract behavior、synthetic fake transport、security cleanup、inventory delta。",
  },
  {
    id: "M05-G",
    owner:
      "Architecture, security, retired-capability/legacy-absence and packaging/CI verification owners",
    scope:
      "仅保留合法 architecture/dependency、security、retired capability/legacy absence、packaging/release/CI static guard；migration reader 保持独立边界。",
    forbidden:
      "production behavior、migration allowlist 语义放宽、用 regex 证明业务行为、真实打包/发布、Renderer/IPC/adapter behavior rewrite。",
    gate: "architecture/reverse-dependency、security、Ticket 24/legacy absence、packaging/CI contracts。",
  },
  {
    id: "M05-H",
    owner:
      "Test discovery, runner policy, pool/resource cleanup and evidence tooling owners",
    scope:
      "最终 .js/.mjs discovery、serial/parallel partition、resource cleanup、profile/evidence、after inventory；只修 runner/process lifecycle，不隐藏业务失败。",
    forbidden:
      "runner concurrency/timeout policy in M05-0、业务断言、worker failure、production behavior、未完成测试计 PASS。",
    gate: "inventory/discovery/runner policy/evidence tests、test:discover、serial/hybrid parity、diff check。",
  },
]);

const E_DECISION = Object.freeze({
  mode: "M05-E1 → M05-E2 → M05-E3",
  rationale:
    "三条闭环分别拥有不同的公开 owner、fixture/依赖替身、故障矩阵和可单独 Closure 的证据边界；合并为单包会把生命周期 admission、OperationalStore transaction/recovery 与 submission/publication outcome 混成一个不可局部审计的状态集合。",
  order: ["M05-D", "M05-E1", "M05-E2", "M05-E3", "M05-F"],
  boundaries: [
    {
      package: "M05-E1",
      ownerEvidence: [
        "tests/article-mutation-coordinator.test.js",
        "tests/article-attention-policy.test.js",
        "tests/article-attention-query.test.js",
        "tests/article-management-snapshot.test.js",
        "tests/article-removal-service.test.js",
      ],
      fixtureBoundary:
        "ArticleMutationCoordinator、article projection、permission/attention policy/query 与 content mutation fixture；不创建 OperationalStore 事务的第二 owner。",
    },
    {
      package: "M05-E2",
      ownerEvidence: [
        "tests/phase-02-operational-store.test.js",
        "tests/phase-03-operational-store-v3.test.js",
        "tests/phase-04-operational-store-lifecycle.test.js",
        "tests/phase-08-operational-store-internals.test.js",
        "tests/article-removal-transaction-store.test.js",
      ],
      fixtureBoundary:
        "createOperationalStore、SQLite/public facade、transaction/fault/restart/recovery fixture；只消费 E1 的 domain admission，不拥有 submission adapter。",
    },
    {
      package: "M05-E3",
      ownerEvidence: [
        "tests/publication-recovery.test.js",
        "tests/submission-cleanup-recovery.test.js",
        "tests/phase-07-regular-queue.test.js",
        "tests/ticket-25-d-paid-media-acceptance.test.js",
        "tests/regular-platform-outcome-service.test.js",
      ],
      fixtureBoundary:
        "submission/publication application、queue/admission、remote outcome/reconciliation fixture；消费 E2 public facts，adapter protocol mapping 留给 F。",
    },
  ],
  exceptions:
    "migration reader、migration-only payload/journal 与 legacy absence 不进入 E1–E3；它们保留在独立 migration/absence owner，由 M05-G 只处理合法 static/absence guard，行为测试不因拆包删除。",
});

const DUPLICATE_INVARIANT_CLUSTERS = Object.freeze([
  {
    id: "DUP-01",
    invariant: "OperationalStore 唯一 writer/facade/internal 依赖",
    evidence:
      "phase-02 architecture、phase-03 composition/runtime-no-ledger、phase-05 production seams、phase-08 OperationalStore internals/reverse-dependencies、architecture-seams",
    owner: "M05-E2 public facade + M05-G architecture gate",
    package: "M05-E2 / M05-G",
    disposition: "RETAIN_BEHAVIOR_AND_CONSOLIDATE_STATIC_GATE",
    replacement:
      "E2 保留 public facade/transaction/fault behavior；G 只保留一个 reverse-dependency/forbidden-internal-import gate。",
  },
  {
    id: "DUP-02",
    invariant:
      "typed IPC exact capability、安全 error、dead caller/legacy absence",
    evidence:
      "phase-06 typed IPC family、typed-ipc-production、production-caller-inventory、production IPC fixture matrix、renderer bridge surface、Ticket 24-E",
    owner: "M05-D typed IPC contract owner",
    package: "M05-D",
    disposition: "RETAIN_BEHAVIOR_AND_CONSOLIDATE_CAPABILITY_GATE",
    replacement:
      "D 保留 registry/registrar/preload/bridge behavior matrix；同一 capability/consumer/absence root 只留一个 named static gate。",
  },
  {
    id: "DUP-03",
    invariant: "Renderer content refresh/query identity/stale fencing",
    evidence:
      "renderer-content-read-model-seam、renderer-content-refresh-lifecycle、workbench controller seams、phase-06 content feature/read model/workbench feature、phase-08 renderer races",
    owner: "M05-A content/generation feature owner",
    package: "M05-A",
    disposition: "REWRITE_TO_PUBLIC_FEATURE_SNAPSHOT",
    replacement:
      "以 feature query/command snapshot 和 stale/race observable matrix 替换组件源码 callback/hook/layout presence assertion。",
  },
  {
    id: "DUP-04",
    invariant: "regular submission single target/outcome/queue claim",
    evidence:
      "phase-03 publication/operational-content、phase-04 store lifecycle、phase-07 queue、phase-08 orchestration、Ticket 24 B/C/G、regular outcome suites",
    owner: "M05-E3 submission/publication application owner",
    package: "M05-E3",
    disposition: "CONSOLIDATE_BY_ADMISSION_QUEUE_OUTCOME_MATRIX",
    replacement:
      "按 admission、durable queue claim、remote outcome/reconciliation 三个 public owner 保留状态矩阵；历史 phase 同义 happy path 只有在等价证据映射后才去重。",
  },
  {
    id: "DUP-05",
    invariant: "retired publication/order/ledger capability absence",
    evidence:
      "legacy submission audit、phase-03 remote-order/runtime-ledger/workbench readonly、phase-06 dead/legacy path、phase-08 artifact absence、Ticket 24-E/G",
    owner: "M05-G retired capability/legacy-absence owner",
    package: "M05-G",
    disposition: "RETAIN_SINGLE_FAIL_CLOSED_ABSENCE_GATE",
    replacement:
      "保留 Ticket 24 allowlist/production capability/package absence；不删除 migration-only evidence，不改名伪装成 behavior test。",
  },
  {
    id: "DUP-06",
    invariant: "packaging/private-data/artifact absence",
    evidence:
      "desktop/production packaging、packaging-runtime、phase-03 ASAR absence、phase-06 capability ASAR、phase-08 cleanup/package gate、release evidence",
    owner: "M05-G packaging/release/CI contract owner",
    package: "M05-G",
    disposition: "CONSOLIDATE_PACKAGE_CONTRACT_GATES",
    replacement:
      "按 alpha/production package contract、private-data exclusion、legacy artifact absence 分 owner，禁止每个历史 phase 重扫整包。",
  },
  {
    id: "DUP-07",
    invariant: "migration reader isolation and non-runnable payload boundary",
    evidence:
      "content-library/content-metadata/legacy migration、Ticket 23 migration reader/journal、phase-03 runtime-no-legacy-ledger、Ticket 24 legacy boundary",
    owner:
      "独立 migration reader/absence owner（M05-G 只承接 static/absence gate）",
    package: "M05-G（仅 static/absence）",
    disposition: "RETAIN_SEPARATE_MIGRATION_OWNER",
    replacement:
      "行为/故障/幂等 migration reader tests 原样保留；只合并重复 legacy absence/static scan，绝不把 migration reader 塞进 E1–E3。",
  },
  {
    id: "DUP-08",
    invariant:
      "Renderer platform/media/settings/workspace cross-slice ownership",
    evidence:
      "phase-06 platform/media/settings/workspace feature suites、phase-08 platform-media-settings-workspace-renderer-slice、renderer queue/publication/settings/workspace suites",
    owner: "M05-B / M05-C，按实际 feature state/action 拆分",
    package: "M05-B / M05-C",
    disposition: "SPLIT_BY_AUTHORITATIVE_FEATURE_OWNER",
    replacement:
      "跨 cluster 测试按 assertion 拆 disposition；account/queue/publication/media read model 归 B，workspace/settings/shell/confirmation 归 C，不因共享 App/Sidebar/harness 合并。",
  },
]);

function decodeEscapes(value) {
  return value.replace(/\\(.)/gs, function (_, character) {
    switch (character) {
      case "n":
        return "\n";
      case "r":
        return "\r";
      case "t":
        return "\t";
      case "b":
        return "\b";
      case "f":
        return "\f";
      case "v":
        return "\v";
      case "0":
        return "\0";
      default:
        return character;
    }
  });
}

function decodeString(raw, quote) {
  if (!raw || raw[0] !== quote || raw[raw.length - 1] !== quote) return null;
  return decodeEscapes(raw.slice(1, -1));
}

function isIdentifierStart(character) {
  return /[A-Za-z_$]/.test(character);
}

function isIdentifierPart(character) {
  return /[A-Za-z0-9_$]/.test(character);
}

function isRegexStart(tokens) {
  const previous = tokens[tokens.length - 1];
  if (!previous) return true;
  return new Set([
    "(",
    "[",
    "{",
    "=",
    ":",
    ",",
    ";",
    "!",
    "?",
    "=>",
    "return",
    "case",
    "throw",
    "yield",
    "await",
  ]).has(previous.value);
}

function tokenize(source) {
  const tokens = [];
  let index = 0;
  let line = 1;

  function push(type, start, end, value, tokenLine) {
    tokens.push({ type, start, end, value, line: tokenLine });
  }

  function advanceTo(end) {
    for (; index < end; index += 1) {
      if (source[index] === "\n") line += 1;
    }
  }

  while (index < source.length) {
    const character = source[index];
    if (/\s/.test(character)) {
      advanceTo(index + 1);
      continue;
    }

    if (character === "/" && source[index + 1] === "/") {
      const end = source.indexOf("\n", index + 2);
      advanceTo(end === -1 ? source.length : end);
      continue;
    }

    if (character === "/" && source[index + 1] === "*") {
      const end = source.indexOf("*/", index + 2);
      advanceTo(end === -1 ? source.length : end + 2);
      continue;
    }

    const tokenLine = line;
    if (character === "'" || character === '"') {
      const quote = character;
      const start = index;
      index += 1;
      while (index < source.length) {
        if (source[index] === "\\") {
          index += 2;
          continue;
        }
        if (source[index] === quote) {
          index += 1;
          break;
        }
        if (source[index] === "\n") line += 1;
        index += 1;
      }
      const raw = source.slice(start, index);
      push("string", start, index, decodeString(raw, quote), tokenLine);
      continue;
    }

    if (character === "`") {
      const start = index;
      index += 1;
      let hasInterpolation = false;
      while (index < source.length) {
        if (source[index] === "\\") {
          index += 2;
          continue;
        }
        if (source[index] === "$" && source[index + 1] === "{")
          hasInterpolation = true;
        if (source[index] === "`") {
          index += 1;
          break;
        }
        if (source[index] === "\n") line += 1;
        index += 1;
      }
      const raw = source.slice(start, index);
      push(
        "template",
        start,
        index,
        hasInterpolation ? null : decodeEscapes(raw.slice(1, -1)),
        tokenLine,
      );
      continue;
    }

    if (character === "/" && isRegexStart(tokens)) {
      const start = index;
      index += 1;
      let inCharacterClass = false;
      while (index < source.length) {
        if (source[index] === "\\") {
          index += 2;
          continue;
        }
        if (source[index] === "[") inCharacterClass = true;
        if (source[index] === "]") inCharacterClass = false;
        if (source[index] === "/" && !inCharacterClass) {
          index += 1;
          while (/[A-Za-z]/.test(source[index] || "")) index += 1;
          break;
        }
        if (source[index] === "\n") break;
        index += 1;
      }
      push("regex", start, index, source.slice(start, index), tokenLine);
      continue;
    }

    if (isIdentifierStart(character)) {
      const start = index;
      index += 1;
      while (isIdentifierPart(source[index] || "")) index += 1;
      push("identifier", start, index, source.slice(start, index), tokenLine);
      continue;
    }

    const twoCharacter = source.slice(index, index + 2);
    if (
      [
        "=>",
        "==",
        "!=",
        "<=",
        ">=",
        "&&",
        "||",
        "??",
        "?.",
        "++",
        "--",
      ].includes(twoCharacter)
    ) {
      push("punctuation", index, index + 2, twoCharacter, tokenLine);
      index += 2;
      continue;
    }

    push("punctuation", index, index + 1, character, tokenLine);
    index += 1;
  }

  return tokens;
}

function findMatchingParenthesis(tokens, openIndex) {
  let depth = 0;
  for (let index = openIndex; index < tokens.length; index += 1) {
    if (tokens[index].value === "(") depth += 1;
    if (tokens[index].value === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function findCallSources(source, names) {
  const tokens = tokenize(source);
  const calls = [];
  for (let index = 0; index < tokens.length - 1; index += 1) {
    if (tokens[index].type !== "identifier" || !names.has(tokens[index].value))
      continue;
    if (tokens[index + 1].value !== "(") continue;
    const closeIndex = findMatchingParenthesis(tokens, index + 1);
    if (closeIndex === -1) continue;
    calls.push(source.slice(tokens[index].start, tokens[closeIndex].end));
  }
  return calls;
}

function findMatchingToken(tokens, openIndex, openValue, closeValue) {
  let depth = 0;
  for (let index = openIndex; index < tokens.length; index += 1) {
    if (tokens[index].value === openValue) depth += 1;
    if (tokens[index].value === closeValue) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function findVariableDeclarations(source) {
  const tokens = tokenize(source);
  const declarations = [];
  for (let index = 0; index < tokens.length - 3; index += 1) {
    if (
      !["const", "let", "var"].includes(tokens[index]?.value) ||
      tokens[index + 1]?.type !== "identifier" ||
      tokens[index + 2]?.value !== "="
    )
      continue;

    let depth = 0;
    let end = index + 3;
    for (; end < tokens.length; end += 1) {
      const value = tokens[end].value;
      if (["(", "[", "{"].includes(value)) depth += 1;
      if ([")", "]", "}"].includes(value)) depth = Math.max(0, depth - 1);
      if (depth === 0 && value === ";") break;
    }
    declarations.push({
      name: tokens[index + 1].value,
      start: tokens[index].start,
      end: tokens[Math.min(end, tokens.length - 1)].end,
      expression: source.slice(
        tokens[index + 2].end,
        tokens[Math.min(end, tokens.length - 1)].end,
      ),
    });
  }
  return declarations;
}

function objectPropertyExpressions(expression) {
  const tokens = tokenize(expression);
  const objectEnd =
    tokens[tokens.length - 1]?.value === ";"
      ? tokens.length - 2
      : tokens.length - 1;
  if (tokens[0]?.value !== "{" || tokens[objectEnd]?.value !== "}")
    return new Map();
  const properties = new Map();
  let index = 1;
  while (index < objectEnd) {
    const key = tokens[index];
    if (
      !key ||
      !["identifier", "string"].includes(key.type) ||
      tokens[index + 1]?.value !== ":"
    ) {
      index += 1;
      continue;
    }
    const valueStart = index + 2;
    let valueEnd = valueStart;
    let depth = 0;
    while (valueEnd < objectEnd) {
      const value = tokens[valueEnd].value;
      if (["(", "[", "{"].includes(value)) depth += 1;
      if ([")", "]", "}"].includes(value)) depth = Math.max(0, depth - 1);
      if (depth === 0 && value === ",") break;
      valueEnd += 1;
    }
    if (valueEnd > valueStart) {
      properties.set(
        key.value,
        expression.slice(tokens[valueStart].start, tokens[valueEnd - 1].end),
      );
    }
    index = valueEnd + 1;
  }
  return properties;
}

const SOURCE_TAINT = Object.freeze({
  ORDINARY_RUNTIME_VALUE: "ordinary-runtime-value",
  REPOSITORY_CONFIG_PATH: "repo/config-path",
  SOURCE_TEXT: "source-text",
  SOURCE_TEXT_DERIVED_VALUE: "source-text-derived-value",
});

const SOURCE_PATH_SEGMENTS = new Set([
  ".github",
  "auth-server",
  "build",
  "config",
  "desktop",
  "media-workbench",
  "release",
  "resources",
  "scripts",
  "src",
]);

const SOURCE_FILE_NAMES = Object.freeze([
  /^\.env\.example$/i,
  /^dockerfile(?:\..*)?$/i,
  /^docker-compose(?:\..*)?$/i,
  /^electron-builder(?:\..*)?\.ya?ml$/i,
  /^eslint\.config\..+$/i,
  /^package(?:-lock)?\.json$/i,
  /^prettier(?:\.config)?\..+$/i,
  /^tsconfig(?:\..*)?\.json$/i,
]);

const SOURCE_TAINT_METHODS = new Set([
  "concat",
  "endsWith",
  "includes",
  "indexOf",
  "length",
  "match",
  "replace",
  "slice",
  "split",
  "startsWith",
  "test",
  "trim",
]);

const SOURCE_TEXT_DERIVATION_METHODS = new Set([
  "concat",
  "join",
  "matchAll",
  "replace",
  "replaceAll",
  "slice",
  "split",
  "substr",
  "substring",
  "trim",
  "toString",
]);

const SOURCE_COLLECTION_METHODS = new Set(["concat", "filter", "join", "map"]);

const PATH_METHODS = new Set([
  "basename",
  "dirname",
  "extname",
  "join",
  "normalize",
  "relative",
  "resolve",
]);

const SOURCE_TAINT_CACHE = new Map();

function isSourceTaint(value) {
  return (
    value === SOURCE_TAINT.SOURCE_TEXT ||
    value === SOURCE_TAINT.SOURCE_TEXT_DERIVED_VALUE
  );
}

function isRepositoryPathTaint(value) {
  return value === SOURCE_TAINT.REPOSITORY_CONFIG_PATH;
}

function isStaticSourceFileName(value) {
  const normalized = String(value || "")
    .replaceAll("\\", "/")
    .split("/")
    .filter(Boolean)
    .pop();
  return Boolean(
    normalized && SOURCE_FILE_NAMES.some((pattern) => pattern.test(normalized)),
  );
}

function isStaticSourcePathToken(token) {
  if (!token || (token.type !== "string" && token.type !== "template"))
    return false;
  const value = token.value;
  if (typeof value !== "string") return false;
  const normalized = value.replaceAll("\\", "/");
  if (isStaticSourceFileName(normalized)) return true;
  return normalized.split("/").some((segment) => {
    const lower = segment.toLowerCase();
    return SOURCE_PATH_SEGMENTS.has(lower);
  });
}

function isRepositoryConfigPathExpression(value) {
  const source = String(value || "");
  return tokenize(source).some(isStaticSourcePathToken);
}

function taintRank(value) {
  switch (value) {
    case SOURCE_TAINT.SOURCE_TEXT_DERIVED_VALUE:
      return 4;
    case SOURCE_TAINT.SOURCE_TEXT:
      return 3;
    case SOURCE_TAINT.REPOSITORY_CONFIG_PATH:
      return 2;
    default:
      return 1;
  }
}

function mergeTaint(left, right) {
  return taintRank(right) > taintRank(left) ? right : left;
}

function splitCallArguments(call) {
  const tokens = tokenize(call);
  const openIndex = tokens.findIndex((token) => token.value === "(");
  if (openIndex === -1) return [];
  const closeIndex = findMatchingParenthesis(tokens, openIndex);
  if (closeIndex === -1 || closeIndex === openIndex + 1) return [];
  const argumentsList = [];
  let start = openIndex + 1;
  let depth = 0;
  for (let index = start; index < closeIndex; index += 1) {
    const value = tokens[index].value;
    if (["(", "[", "{"].includes(value)) depth += 1;
    if ([")", "]", "}"].includes(value)) depth = Math.max(0, depth - 1);
    if (depth === 0 && value === ",") {
      argumentsList.push(call.slice(tokens[start].start, tokens[index].start));
      start = index + 1;
    }
  }
  if (start < closeIndex)
    argumentsList.push(
      call.slice(tokens[start].start, tokens[closeIndex].start),
    );
  return argumentsList.map((argument) => argument.trim()).filter(Boolean);
}

function findLoopBindings(source) {
  const tokens = tokenize(source);
  const bindings = [];
  for (let index = 0; index < tokens.length; index += 1) {
    if (tokens[index].value !== "for" || tokens[index + 1]?.value !== "(")
      continue;
    const closeIndex = findMatchingParenthesis(tokens, index + 1);
    if (closeIndex === -1) continue;
    let depth = 0;
    let operatorIndex = -1;
    for (let cursor = index + 2; cursor < closeIndex; cursor += 1) {
      const value = tokens[cursor].value;
      if (["(", "[", "{"].includes(value)) depth += 1;
      if ([")", "]", "}"].includes(value)) depth = Math.max(0, depth - 1);
      if (depth === 0 && (value === "of" || value === "in")) {
        operatorIndex = cursor;
        break;
      }
    }
    if (operatorIndex === -1) continue;
    const bindingToken = tokens[index + 2]?.value;
    const nameToken =
      ["const", "let", "var"].includes(bindingToken) &&
      tokens[index + 3]?.type === "identifier"
        ? tokens[index + 3]
        : tokens[index + 2];
    if (!nameToken || nameToken.type !== "identifier") continue;
    bindings.push({
      name: nameToken.value,
      expression: source.slice(
        tokens[operatorIndex].end,
        tokens[closeIndex].start,
      ),
      start: tokens[index].start,
      end: tokens[closeIndex].end,
    });
  }
  return bindings;
}

function parameterNames(tokens) {
  return tokens
    .filter((token) => token.type === "identifier")
    .map((token) => token.value)
    .filter(
      (name) =>
        !new Set(["const", "let", "var", "async", "function"]).has(name),
    );
}

function findFunctionRecords(source) {
  const tokens = tokenize(source);
  const records = [];
  for (let index = 0; index < tokens.length; index += 1) {
    if (tokens[index].value === "function") {
      const nameIndex =
        tokens[index + 1]?.value === "*" ? index + 2 : index + 1;
      const name = tokens[nameIndex]?.value;
      const openIndex = nameIndex + 1;
      if (
        tokens[nameIndex]?.type !== "identifier" ||
        tokens[openIndex]?.value !== "("
      )
        continue;
      const closeIndex = findMatchingParenthesis(tokens, openIndex);
      const bodyOpenIndex = closeIndex + 1;
      if (closeIndex === -1 || tokens[bodyOpenIndex]?.value !== "{") continue;
      const bodyCloseIndex = findMatchingToken(tokens, bodyOpenIndex, "{", "}");
      if (bodyCloseIndex === -1) continue;
      records.push({
        name,
        params: parameterNames(tokens.slice(openIndex + 1, closeIndex)),
        body: source.slice(
          tokens[bodyOpenIndex].start,
          tokens[bodyCloseIndex].end,
        ),
        expressionBody: false,
      });
      continue;
    }

    if (
      !["const", "let", "var"].includes(tokens[index].value) ||
      tokens[index + 1]?.type !== "identifier" ||
      tokens[index + 2]?.value !== "="
    )
      continue;
    const name = tokens[index + 1].value;
    let arrowIndex = -1;
    for (let cursor = index + 3; cursor < tokens.length; cursor += 1) {
      if (tokens[cursor].value === "=>") {
        arrowIndex = cursor;
        break;
      }
      if (tokens[cursor].value === ";") break;
    }
    if (arrowIndex === -1) continue;
    let params = [];
    if (tokens[index + 3]?.value === "(") {
      const closeIndex = findMatchingParenthesis(tokens, index + 3);
      if (closeIndex !== -1 && closeIndex < arrowIndex)
        params = parameterNames(tokens.slice(index + 4, closeIndex));
    } else if (tokens[index + 3]?.type === "identifier") {
      params = [tokens[index + 3].value];
    }
    const bodyStart = arrowIndex + 1;
    if (tokens[bodyStart]?.value === "{") {
      const bodyCloseIndex = findMatchingToken(tokens, bodyStart, "{", "}");
      if (bodyCloseIndex !== -1)
        records.push({
          name,
          params,
          body: source.slice(
            tokens[bodyStart].start,
            tokens[bodyCloseIndex].end,
          ),
          expressionBody: false,
        });
    } else {
      let bodyEnd = bodyStart;
      while (bodyEnd < tokens.length && tokens[bodyEnd].value !== ";")
        bodyEnd += 1;
      records.push({
        name,
        params,
        body: source.slice(
          tokens[bodyStart]?.start || tokens[index + 2].end,
          tokens[Math.max(bodyStart, bodyEnd - 1)]?.end ||
            tokens[index + 2].end,
        ),
        expressionBody: true,
      });
    }
  }
  return records;
}

function findFunctionParameterNames(source) {
  const tokens = tokenize(source);
  const names = new Set();
  for (let index = 0; index < tokens.length; index += 1) {
    if (tokens[index].value === "function") {
      const openIndex =
        tokens[index + 1]?.type === "identifier" ||
        tokens[index + 1]?.value === "*"
          ? index + 2
          : index + 1;
      if (tokens[openIndex]?.value !== "(") continue;
      const closeIndex = findMatchingParenthesis(tokens, openIndex);
      if (closeIndex !== -1)
        for (const name of parameterNames(
          tokens.slice(openIndex + 1, closeIndex),
        ))
          names.add(name);
    }
    if (tokens[index].value !== "=>") continue;
    if (tokens[index - 1]?.value === ")") {
      let depth = 0;
      let openIndex = -1;
      for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
        if (tokens[cursor].value === ")") depth += 1;
        if (tokens[cursor].value === "(") {
          depth -= 1;
          if (depth === 0) {
            openIndex = cursor;
            break;
          }
        }
      }
      if (openIndex !== -1)
        for (const name of parameterNames(
          tokens.slice(openIndex + 1, index - 1),
        ))
          names.add(name);
    } else if (tokens[index - 1]?.type === "identifier") {
      names.add(tokens[index - 1].value);
    }
  }
  return names;
}

function findReturnExpressions(source) {
  const tokens = tokenize(source);
  const returns = [];
  for (let index = 0; index < tokens.length; index += 1) {
    if (tokens[index].value !== "return") continue;
    let end = index + 1;
    let depth = 0;
    for (; end < tokens.length; end += 1) {
      const value = tokens[end].value;
      if (["(", "[", "{"].includes(value)) depth += 1;
      if ([")", "]", "}"].includes(value)) {
        if (depth === 0) break;
        depth -= 1;
      }
      if (depth === 0 && value === ";") break;
    }
    if (end > index + 1)
      returns.push(source.slice(tokens[index + 1].start, tokens[end - 1].end));
  }
  return returns;
}

function isProductionPathExpression(value) {
  return isRepositoryConfigPathExpression(value);
}

function findProductionPathVariables(source) {
  const variables = new Set();
  let changed = true;
  while (changed) {
    changed = false;
    for (const declaration of findVariableDeclarations(source)) {
      if (variables.has(declaration.name)) continue;
      const expressionTokens = tokenize(declaration.expression);
      const derivesFromProductionPath = expressionTokens.some(
        (token, index) =>
          token.type === "identifier" &&
          variables.has(token.value) &&
          expressionTokens[index - 1]?.value !== "." &&
          expressionTokens[index - 1]?.value !== "?.",
      );
      if (
        isProductionPathExpression(declaration.expression) ||
        derivesFromProductionPath
      ) {
        variables.add(declaration.name);
        changed = true;
      }
    }
  }
  return variables;
}

function findProductionSourceReaderHelpers(source) {
  const tokens = tokenize(source);
  const helpers = new Map();
  const productionPathVariables = findProductionPathVariables(source);

  function addHelper(name, start, end) {
    const body = source.slice(start, end);
    if (!/\b(?:readFileSync|readFile|createReadStream)\s*\(/i.test(body))
      return;
    const readCalls = findCallSources(
      body,
      new Set(["readFileSync", "readFile", "createReadStream"]),
    );
    helpers.set(name, {
      readsProductionSource:
        hasProductionSourceRead(body) ||
        readCalls.some((call) => isProductionSourceReadCall(call)) ||
        readCalls.some((call) =>
          [...productionPathVariables].some((variable) =>
            new RegExp("\\b" + variable + "\\b").test(call),
          ),
        ),
    });
  }

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (
      token.value === "function" &&
      tokens[index + 1]?.type === "identifier"
    ) {
      const name = tokens[index + 1].value;
      const openParen = index + 2;
      const closeParen = findMatchingToken(tokens, openParen, "(", ")");
      const openBrace = closeParen + 1;
      if (closeParen !== -1 && tokens[openBrace]?.value === "{") {
        const closeBrace = findMatchingToken(tokens, openBrace, "{", "}");
        if (closeBrace !== -1)
          addHelper(name, tokens[openBrace].start, tokens[closeBrace].end);
      }
    }

    if (
      !["const", "let", "var"].includes(token.value) ||
      tokens[index + 1]?.type !== "identifier" ||
      tokens[index + 2]?.value !== "="
    )
      continue;

    const name = tokens[index + 1].value;
    let arrow = -1;
    for (let cursor = index + 3; cursor < tokens.length; cursor += 1) {
      if (tokens[cursor].value === "=>") {
        arrow = cursor;
        break;
      }
      if (tokens[cursor].value === ";") break;
    }
    if (arrow === -1) continue;

    const bodyStart = arrow + 1;
    if (tokens[bodyStart]?.value === "{") {
      const closeBrace = findMatchingToken(tokens, bodyStart, "{", "}");
      if (closeBrace !== -1)
        addHelper(name, tokens[bodyStart].start, tokens[closeBrace].end);
      continue;
    }

    let bodyEnd = bodyStart;
    while (bodyEnd < tokens.length && tokens[bodyEnd].value !== ";")
      bodyEnd += 1;
    addHelper(
      name,
      tokens[bodyStart]?.start || token.end,
      tokens[Math.max(bodyStart, bodyEnd - 1)]?.end || token.end,
    );
  }

  return helpers;
}

const DIRECT_SOURCE_READER_NAMES = Object.freeze([
  "readFileSync",
  "readFile",
  "createReadStream",
]);

function expressionIdentifierTaints(expression, taints) {
  const tokens = tokenize(expression);
  return tokens
    .filter(
      (token, index) =>
        token.type === "identifier" &&
        tokens[index - 1]?.value !== "." &&
        tokens[index - 1]?.value !== "?." &&
        tokens[index + 1]?.value !== ":",
    )
    .map(
      (token) => taints.get(token.value) || SOURCE_TAINT.ORDINARY_RUNTIME_VALUE,
    );
}

function isPathCallExpression(tokens) {
  return tokens.some(
    (token, index) =>
      PATH_METHODS.has(token.value) &&
      tokens[index - 1]?.value === "." &&
      tokens[index + 1]?.value === "(",
  );
}

function pathCallUsesRepositoryPath(expression, taints, functions) {
  const calls = findCallSources(expression, PATH_METHODS);
  return calls.some((call) => {
    const argumentsList = splitCallArguments(call);
    return argumentsList.some((argument) => {
      const argumentTaint = evaluateExpressionTaint(
        argument,
        taints,
        functions,
      );
      return (
        isRepositoryPathTaint(argumentTaint) ||
        isRepositoryConfigPathExpression(argument)
      );
    });
  });
}

function callReturnsSourceText(call, taints, functions) {
  const argumentsList = splitCallArguments(call);
  const firstArgument = argumentsList[0] || "";
  if (DIRECT_SOURCE_READER_NAMES.some((name) => callContainsName(call, name)))
    return isRepositoryPathTaint(
      evaluateExpressionTaint(firstArgument, taints, functions),
    );

  for (const [name, summary] of functions) {
    if (!callContainsName(call, name)) continue;
    if (summary.returnsSource) return true;
    if (
      summary.sourceReturnPathParameters.some((index) =>
        isRepositoryPathTaint(
          evaluateExpressionTaint(
            argumentsList[index] || "",
            taints,
            functions,
          ),
        ),
      )
    )
      return true;
  }
  return false;
}

function callReadsSourceText(call, taints, functions) {
  const argumentsList = splitCallArguments(call);
  const firstArgument = argumentsList[0] || "";
  if (DIRECT_SOURCE_READER_NAMES.some((name) => callContainsName(call, name)))
    return isRepositoryPathTaint(
      evaluateExpressionTaint(firstArgument, taints, functions),
    );
  for (const [name, summary] of functions) {
    if (!callContainsName(call, name)) continue;
    if (summary.unconditional) return true;
    if (
      summary.sourcePathParameters.some((index) =>
        isRepositoryPathTaint(
          evaluateExpressionTaint(
            argumentsList[index] || "",
            taints,
            functions,
          ),
        ),
      )
    )
      return true;
  }
  return false;
}

function sourceReaderCallHasShapeTransform(text, taints, functions) {
  const tokens = tokenize(text);
  for (let index = 0; index < tokens.length - 1; index += 1) {
    if (tokens[index].type !== "identifier" || tokens[index + 1].value !== "(")
      continue;
    const closeIndex = findMatchingParenthesis(tokens, index + 1);
    if (closeIndex === -1) continue;
    const call = text.slice(tokens[index].start, tokens[closeIndex].end);
    if (
      !callReturnsSourceText(call, taints, functions) ||
      tokens[closeIndex + 1]?.value !== "."
    )
      continue;
    if (SOURCE_TEXT_DERIVATION_METHODS.has(tokens[closeIndex + 2]?.value))
      return true;
  }
  return false;
}

function evaluateExpressionTaint(expression, taints, functions) {
  const text = String(expression || "").trim();
  if (!text) return SOURCE_TAINT.ORDINARY_RUNTIME_VALUE;
  const tokens = tokenize(text);
  if (
    tokens.some(
      (token, index) =>
        token.value === "require" && tokens[index + 1]?.value === "(",
    ) ||
    tokens.some(
      (token, index) =>
        token.value === "import" && tokens[index + 1]?.value === "(",
    )
  )
    return SOURCE_TAINT.ORDINARY_RUNTIME_VALUE;
  if (
    tokens.length === 1 &&
    tokens[0].type === "identifier" &&
    taints.has(tokens[0].value)
  )
    return taints.get(tokens[0].value);

  const directReaderCalls = findCallSources(
    text,
    new Set(DIRECT_SOURCE_READER_NAMES),
  );
  const readsSource = directReaderCalls.some((call) =>
    callReturnsSourceText(call, taints, functions),
  );
  const helperCalls = [...functions.keys()].flatMap((name) =>
    findCallSources(text, new Set([name])),
  );
  const helperReturnsSource = helperCalls.some((call) =>
    callReturnsSourceText(call, taints, functions),
  );
  const collectionCallbackReturnsSource = tokens.some(
    (token, index) =>
      token.value === "map" &&
      tokens[index - 1]?.value === "." &&
      tokens[index + 1]?.value === "(" &&
      tokens[index + 2]?.type === "identifier" &&
      functions.get(tokens[index + 2].value)?.returnsSource,
  );
  if (readsSource || helperReturnsSource || collectionCallbackReturnsSource) {
    const callCount = tokens.filter((token) => token.value === "(").length;
    const pathCallCount = findCallSources(text, PATH_METHODS).length;
    const knownSourceTransform = sourceReaderCallHasShapeTransform(
      text,
      taints,
      functions,
    );
    const collectionTransform =
      tokens.some(
        (token, index) =>
          token.value === "." &&
          SOURCE_COLLECTION_METHODS.has(tokens[index + 1]?.value),
      ) || tokens.some((token) => token.value === "[");
    const exactReaderCall =
      callCount === 1 + pathCallCount &&
      directReaderCalls.length === 1 &&
      !helperCalls.length &&
      /^(?:[A-Za-z_$][A-Za-z0-9_$]*\.)?(?:readFileSync|readFile|createReadStream)\s*\(/.test(
        text,
      );
    const exactHelperCall =
      callCount === 1 &&
      helperCalls.length === 1 &&
      !directReaderCalls.length &&
      /^[A-Za-z_$][A-Za-z0-9_$]*\s*\(/.test(text);
    if (exactReaderCall || exactHelperCall) return SOURCE_TAINT.SOURCE_TEXT;
    if (knownSourceTransform || collectionTransform)
      return SOURCE_TAINT.SOURCE_TEXT_DERIVED_VALUE;
    return SOURCE_TAINT.ORDINARY_RUNTIME_VALUE;
  }

  const identifierTaints = expressionIdentifierTaints(text, taints);
  const hasSourceText = identifierTaints.some(isSourceTaint);
  if (hasSourceText) {
    if (
      tokens.length === 1 &&
      tokens[0].type === "identifier" &&
      isSourceTaint(taints.get(tokens[0].value))
    )
      return taints.get(tokens[0].value);
    const hasKnownSourceTransform = tokens.some(
      (token, index) =>
        SOURCE_TEXT_DERIVATION_METHODS.has(token.value) &&
        tokens[index - 1]?.value === ".",
    );
    const hasCall = tokens.some((token) => token.value === "(");
    return hasKnownSourceTransform || !hasCall
      ? SOURCE_TAINT.SOURCE_TEXT_DERIVED_VALUE
      : SOURCE_TAINT.ORDINARY_RUNTIME_VALUE;
  }

  if (
    isRepositoryConfigPathExpression(text) ||
    (isPathCallExpression(tokens) &&
      pathCallUsesRepositoryPath(text, taints, functions)) ||
    identifierTaints.some(isRepositoryPathTaint)
  )
    return SOURCE_TAINT.REPOSITORY_CONFIG_PATH;
  return SOURCE_TAINT.ORDINARY_RUNTIME_VALUE;
}

function functionSummariesEqual(left, right) {
  return (
    left.unconditional === right.unconditional &&
    left.returnsSource === right.returnsSource &&
    left.sourcePathParameters.join(",") ===
      right.sourcePathParameters.join(",") &&
    left.sourceReturnPathParameters.join(",") ===
      right.sourceReturnPathParameters.join(",")
  );
}

function runTaintFlow(
  source,
  functions,
  initialTaints = new Map(),
  shadowNames = new Set(),
) {
  const declarations = findVariableDeclarations(source);
  const loops = findLoopBindings(source);
  const taints = new Map(initialTaints);
  for (const name of shadowNames)
    taints.set(name, SOURCE_TAINT.ORDINARY_RUNTIME_VALUE);
  for (const declaration of declarations)
    if (!taints.has(declaration.name))
      taints.set(declaration.name, SOURCE_TAINT.ORDINARY_RUNTIME_VALUE);
  for (const binding of loops)
    if (!taints.has(binding.name))
      taints.set(binding.name, SOURCE_TAINT.ORDINARY_RUNTIME_VALUE);

  let directSourceRead = false;
  let helperSourceRead = false;
  for (let pass = 0; pass < 8; pass += 1) {
    let changed = false;
    for (const declaration of declarations) {
      const next = evaluateExpressionTaint(
        declaration.expression,
        taints,
        functions,
      );
      if (taints.get(declaration.name) !== next) {
        taints.set(declaration.name, next);
        changed = true;
      }
    }
    for (const binding of loops) {
      const iterable = evaluateExpressionTaint(
        binding.expression,
        taints,
        functions,
      );
      const next = isRepositoryPathTaint(iterable)
        ? SOURCE_TAINT.REPOSITORY_CONFIG_PATH
        : isSourceTaint(iterable)
          ? SOURCE_TAINT.SOURCE_TEXT_DERIVED_VALUE
          : SOURCE_TAINT.ORDINARY_RUNTIME_VALUE;
      if (taints.get(binding.name) !== next) {
        taints.set(binding.name, next);
        changed = true;
      }
    }

    const mutationTokens = tokenize(source);
    for (let index = 0; index < mutationTokens.length - 2; index += 1) {
      if (
        mutationTokens[index]?.type !== "identifier" ||
        mutationTokens[index + 1]?.value !== "." ||
        mutationTokens[index + 2]?.value !== "push" ||
        mutationTokens[index + 3]?.value !== "("
      )
        continue;
      const closeIndex = findMatchingParenthesis(mutationTokens, index + 3);
      if (closeIndex === -1) continue;
      const push = source.slice(
        mutationTokens[index + 2].start,
        mutationTokens[closeIndex].end,
      );
      const argumentsList = splitCallArguments(push);
      if (
        argumentsList.some((argument) =>
          isSourceTaint(evaluateExpressionTaint(argument, taints, functions)),
        )
      ) {
        const receiverName = mutationTokens[index].value;
        if (
          receiverName &&
          taints.get(receiverName) !== SOURCE_TAINT.SOURCE_TEXT_DERIVED_VALUE
        ) {
          taints.set(receiverName, SOURCE_TAINT.SOURCE_TEXT_DERIVED_VALUE);
          changed = true;
        }
      }
    }

    const tokens = tokenize(source);
    for (let index = 0; index < tokens.length; index += 1) {
      if (
        tokens[index].type !== "identifier" ||
        !functions.has(tokens[index].value) ||
        tokens[index - 1]?.value !== "(" ||
        tokens[index - 2]?.value !== "forEach" ||
        tokens[index - 3]?.value !== "."
      )
        continue;
      const summary = functions.get(tokens[index].value);
      const receiverToken = tokens[index - 4];
      if (!receiverToken) continue;
      const receiver = source.slice(
        receiverToken.start,
        tokens[index - 3].start,
      );
      if (
        summary?.sourcePathParameters.includes(0) &&
        isRepositoryPathTaint(
          evaluateExpressionTaint(receiver, taints, functions),
        ) &&
        summary.params[0]
      ) {
        if (
          taints.get(summary.params[0]) !== SOURCE_TAINT.REPOSITORY_CONFIG_PATH
        ) {
          taints.set(summary.params[0], SOURCE_TAINT.REPOSITORY_CONFIG_PATH);
          changed = true;
        }
      }
    }

    for (const [name, summary] of functions) {
      for (const call of findCallSources(source, new Set([name]))) {
        const args = splitCallArguments(call);
        for (const parameterIndex of summary.sourcePathParameters) {
          const parameter = summary.params[parameterIndex];
          if (!parameter) continue;
          if (
            isRepositoryPathTaint(
              evaluateExpressionTaint(
                args[parameterIndex] || "",
                taints,
                functions,
              ),
            ) &&
            taints.get(parameter) !== SOURCE_TAINT.REPOSITORY_CONFIG_PATH
          ) {
            taints.set(parameter, SOURCE_TAINT.REPOSITORY_CONFIG_PATH);
            changed = true;
          }
        }
      }
    }

    for (const call of findCallSources(
      source,
      new Set(DIRECT_SOURCE_READER_NAMES),
    )) {
      if (callReturnsSourceText(call, taints, functions))
        directSourceRead = true;
    }
    for (const [name, summary] of functions) {
      if (!summary.unconditional && !summary.sourcePathParameters.length)
        continue;
      for (const call of findCallSources(source, new Set([name]))) {
        if (callReadsSourceText(call, taints, functions))
          helperSourceRead = true;
      }
    }
    if (!changed) break;
  }

  return {
    taints,
    directSourceRead,
    helperSourceRead,
    observedSourceRead: directSourceRead || helperSourceRead,
  };
}

function buildFunctionSummaries(
  source,
  inheritedFunctions = new Map(),
  inheritedTaints = new Map(),
) {
  const functions = new Map(inheritedFunctions);
  const records = findFunctionRecords(source);
  for (let pass = 0; pass < 4; pass += 1) {
    let changed = false;
    for (const record of records) {
      const unconditionalFlow = runTaintFlow(
        record.body,
        functions,
        inheritedTaints,
      );
      const sourcePathParameters = [];
      const sourceReturnPathParameters = [];
      const returnsSource = (initialTaints) => {
        const flow = runTaintFlow(
          record.body,
          functions,
          new Map([...inheritedTaints, ...initialTaints]),
        );
        const returnExpressions = record.expressionBody
          ? [record.body]
          : findReturnExpressions(record.body);
        return returnExpressions.some((expression) =>
          isSourceTaint(
            evaluateExpressionTaint(expression, flow.taints, functions),
          ),
        );
      };
      const unconditionalReturnsSource = returnsSource(new Map());
      for (let index = 0; index < record.params.length; index += 1) {
        const seeded = new Map([
          [record.params[index], SOURCE_TAINT.REPOSITORY_CONFIG_PATH],
        ]);
        const parameterFlow = runTaintFlow(
          record.body,
          functions,
          new Map([...inheritedTaints, ...seeded]),
        );
        if (parameterFlow.observedSourceRead) sourcePathParameters.push(index);
        if (returnsSource(seeded)) sourceReturnPathParameters.push(index);
      }
      const next = {
        params: record.params,
        unconditional: unconditionalFlow.observedSourceRead,
        returnsSource: unconditionalReturnsSource,
        sourcePathParameters,
        sourceReturnPathParameters,
      };
      const previous = functions.get(record.name);
      if (!previous || !functionSummariesEqual(previous, next)) {
        functions.set(record.name, next);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return functions;
}

function sourceTaintAnalysis(fileSource, baseAnalysis = null) {
  const source = fileSource || "";
  if (!baseAnalysis && SOURCE_TAINT_CACHE.has(source))
    return SOURCE_TAINT_CACHE.get(source);
  const inheritedTaints = baseAnalysis?.taints || new Map();
  const pathSeeds = new Map(inheritedTaints);
  for (let pass = 0; pass < 4; pass += 1) {
    let changed = false;
    for (const declaration of findVariableDeclarations(source)) {
      const taint = evaluateExpressionTaint(
        declaration.expression,
        pathSeeds,
        new Map(),
      );
      if (
        isRepositoryPathTaint(taint) &&
        pathSeeds.get(declaration.name) !== SOURCE_TAINT.REPOSITORY_CONFIG_PATH
      ) {
        pathSeeds.set(declaration.name, SOURCE_TAINT.REPOSITORY_CONFIG_PATH);
        changed = true;
      }
    }
    if (!changed) break;
  }
  const functions = buildFunctionSummaries(
    source,
    baseAnalysis?.functions || new Map(),
    pathSeeds,
  );
  const localNames = new Set([
    ...findVariableDeclarations(source).map((declaration) => declaration.name),
    ...findLoopBindings(source).map((binding) => binding.name),
    ...findFunctionParameterNames(source),
  ]);
  const flow = runTaintFlow(source, functions, inheritedTaints, localNames);
  const sourceProperties = new Map(baseAnalysis?.sourceProperties || []);
  for (const declaration of findVariableDeclarations(source)) {
    const properties = objectPropertyExpressions(declaration.expression);
    for (const [property, expression] of properties) {
      sourceProperties.set(
        declaration.name + "." + property,
        isSourceTaint(
          evaluateExpressionTaint(expression, flow.taints, functions),
        ),
      );
    }
  }
  const potentialSourceReader = [...functions.values()].some(
    (summary) =>
      summary.unconditional || summary.sourcePathParameters.length > 0,
  );
  const analysis = {
    ...flow,
    functions,
    taints: flow.taints,
    pathVariables: new Set(
      [...flow.taints]
        .filter(([, taint]) => isRepositoryPathTaint(taint))
        .map(([name]) => name),
    ),
    sourceVariables: new Set(
      [...flow.taints]
        .filter(([, taint]) => isSourceTaint(taint))
        .map(([name]) => name),
    ),
    sourceProperties,
    potentialSourceReader,
    readsProductionSource: flow.observedSourceRead || potentialSourceReader,
  };
  if (!baseAnalysis) SOURCE_TAINT_CACHE.set(source, analysis);
  return analysis;
}

function callContainsName(call, name) {
  return new RegExp("\\b" + name + "\\s*\\(").test(call);
}

function isProductionSourceReadCall(call) {
  return isProductionPathExpression(call);
}

function sourceReaderMetadata(fileSource) {
  const source = fileSource || "";
  const taint = sourceTaintAnalysis(source);
  const helperNames = new Set(taint.functions.keys());
  const productionHelperNames = new Set(
    [...taint.functions]
      .filter(
        ([, helper]) =>
          helper.unconditional || helper.sourcePathParameters.length > 0,
      )
      .map(([name]) => name),
  );
  const readerNames = new Set([...DIRECT_SOURCE_READER_NAMES, ...helperNames]);
  return {
    helperNames,
    productionHelperNames,
    productionPathVariables: taint.pathVariables,
    readerNames,
    aliases: taint.sourceVariables,
    taint,
  };
}

function sourceReaderCallIsProduction(
  call,
  productionHelperNames,
  helperNames = productionHelperNames,
  productionPathVariables = new Set(),
) {
  if ([...productionHelperNames].some((name) => callContainsName(call, name)))
    return true;
  const referencesProductionPath = [...productionPathVariables].some((name) =>
    new RegExp("\\b" + name + "\\b").test(call),
  );
  if (
    [...helperNames].some(
      (name) =>
        callContainsName(call, name) &&
        (isProductionSourceReadCall(call) || referencesProductionPath),
    )
  )
    return true;
  return DIRECT_SOURCE_READER_NAMES.some(
    (name) =>
      callContainsName(call, name) &&
      (isProductionSourceReadCall(call) || referencesProductionPath),
  );
}

function expressionUsesSourceReader(
  expression,
  readerNames,
  productionHelperNames,
  aliases,
  helperNames,
  productionPathVariables = new Set(),
) {
  const calls = findCallSources(expression, readerNames);
  if (
    calls.some((call) =>
      sourceReaderCallIsProduction(
        call,
        productionHelperNames,
        helperNames,
        productionPathVariables,
      ),
    )
  )
    return true;
  if (!aliases.size) return false;
  const tokens = tokenize(expression);
  return tokens.some(
    (token, index) =>
      token.type === "identifier" &&
      aliases.has(token.value) &&
      tokens[index - 1]?.value !== "." &&
      tokens[index - 1]?.value !== "?." &&
      !(
        tokens[index + 1]?.value === "." &&
        SOURCE_SHAPE_METHODS.has(tokens[index + 2]?.value)
      ),
  );
}

function findSourceDerivedAliases(
  source,
  readerNames,
  excludedRanges = [],
  productionHelperNames = new Set(
    [...readerNames].filter(
      (name) => !DIRECT_SOURCE_READER_NAMES.includes(name),
    ),
  ),
  productionPathVariables = findProductionPathVariables(source),
) {
  const aliases = new Set();
  const helperNames = new Set(
    [...readerNames].filter(
      (name) => !DIRECT_SOURCE_READER_NAMES.includes(name),
    ),
  );
  let changed = true;
  while (changed) {
    changed = false;
    for (const declaration of findVariableDeclarations(source)) {
      if (
        excludedRanges.some(
          (range) =>
            declaration.start >= range.start && declaration.start < range.end,
        )
      )
        continue;
      if (/=>/.test(declaration.expression)) continue;
      if (
        !aliases.has(declaration.name) &&
        expressionUsesSourceReader(
          declaration.expression,
          readerNames,
          productionHelperNames,
          aliases,
          helperNames,
          productionPathVariables,
        )
      ) {
        aliases.add(declaration.name);
        changed = true;
      }
    }
  }
  return aliases;
}

function hasProductionSourceReaderCall(testSource, fileSource) {
  const base = sourceTaintAnalysis(fileSource || "");
  return sourceTaintAnalysis(testSource, base).observedSourceRead;
}

const SOURCE_SHAPE_METHODS = new Set([
  "includes",
  "indexOf",
  "match",
  "test",
  "startsWith",
  "endsWith",
]);

const ASSERTION_METHODS = new Set([
  "match",
  "doesNotMatch",
  "equal",
  "strictEqual",
  "notEqual",
  "notStrictEqual",
  "deepEqual",
  "deepStrictEqual",
  "notDeepEqual",
  "ok",
  "ifError",
  "ifStrictEqual",
  "throws",
  "rejects",
]);

const EXPECT_MATCHER_METHODS = new Set([
  "toMatch",
  "toContain",
  "toEqual",
  "toStrictEqual",
  "toBe",
  "toHaveProperty",
  "toThrow",
]);

const NEGATIVE_ASSERTION_METHODS = new Set([
  "doesNotMatch",
  "notEqual",
  "notStrictEqual",
  "notDeepEqual",
]);

const STATIC_ABSENCE_PATTERN =
  /(?:old(?:capability|surface|route)?|legacy|retired|deprecated|removed|forbidden|prohibited|dead|preflightmodal|preparesubmission|submitprepared)/i;

function staticCategoryMatches(category, text) {
  const target = STATIC_CATEGORY_TARGETS[category];
  if (!target) return false;
  const raw = String(text);
  const normalized = raw
    .replaceAll("\\b", " ")
    .replace(/\\[bBdDsSwW]/g, " ")
    .replaceAll("\\", "");
  const explicitInvariantPatterns = {
    "architecture/dependency": [
      /Record[\s\S]{0,40}string[\s\S]{0,40}any/i,
      /key\|channel\|method\|name/i,
      /(?:ipcRenderer|infrastructure|desktop[\\/]main|desktop[\\/]ipc|desktop[\\/]services)/i,
      /(?:\/types|bridge\/workspace|registerWorkspaceBootstrapIpc|requireAuthenticated|createAuthenticatedIpcMain)/i,
      /(?:window\.)?confirm\s*\(/i,
      /(?:ArticleStore|content-lifecycle-composition|moduleSpecifiers|directTransport|directChannel|confirm)/i,
    ],
    security: [
      /action:[\s\S]{0,30}deny/i,
      /(?:autopublish-auth-data|healthz\/ready|workspacePath|selection\.path|filePath|path-free|token-only)/i,
      /(?:secrets|\.\/data:\/data)/i,
    ],
    "packaging/release/CI": [
      /src[\\/][\s\S]{0,12}\*\*/i,
      /\.env/i,
      /!(?:input|data|logs)[\\/][\s\S]{0,8}\*\*/i,
      /!src[\\/]content[\\/]doubao/i,
      /!scripts[\\/]/i,
      /(?:name:\s*CI|jobs:|required\/|npm\s+run|node-version|docker\s+(?:build|run)|MARKITDOWN_CMD|mammoth|verify-packaged-docx-runtime|desktop\.cmd|electron[\\/].*cli|--test-concurrency=1|\.test\.mjs|\.test\.js|build-info\.json)/i,
    ],
  };
  return (
    target.test(raw) ||
    target.test(normalized) ||
    (explicitInvariantPatterns[category] || []).some(
      (pattern) => pattern.test(raw) || pattern.test(normalized),
    )
  );
}

function staticCategoryContextMatches(category, assertionText, testSource) {
  if (
    category === "packaging/release/CI" &&
    /\.env\.example/i.test(testSource) &&
    /\bAI_/i.test(assertionText)
  )
    return true;
  if (
    category === "packaging/release/CI" &&
    /(?:workflow|runner|check|command)/i.test(assertionText) &&
    /(?:required\/|REQUIRED_CHECKS|node-version|npm run)/i.test(testSource)
  )
    return true;
  if (
    category === "security" &&
    /(?:workflow|compose|dockerfile)/i.test(assertionText) &&
    /(?:secrets|autopublish-auth-data|healthz|\.\/data:\/data)/i.test(
      testSource,
    )
  )
    return true;
  if (category === "architecture/dependency") {
    if (
      /\bchannel\b/.test(assertionText) &&
      /\b(?:AUTH_INVOKE_EXEMPTIONS|AUTH_EVENT_EXEMPTIONS|DEAD_CHANNELS|auth:get-state|auth-state-changed)\b/.test(
        testSource,
      )
    )
      return true;
    if (
      /\bsymbol\b/.test(assertionText) &&
      /\bgenerationBridgeExports\b/.test(testSource)
    )
      return true;
    return (
      /\baccessor\b/.test(assertionText) &&
      /\brequireContentApi\b/.test(testSource) &&
      /\brequireWorkspaceApi\b/.test(testSource)
    );
  }
  return (
    category === "packaging/release/CI" &&
    /\bscript\b/.test(assertionText) &&
    /migrate-content-metadata|migrate-content-library/.test(testSource)
  );
}

function staticCategoryEvidenceForAssertion(
  assertionText,
  testSource,
  fileSource,
) {
  const referencedNames = new Set(
    tokenize(assertionText)
      .filter((token) => token.type === "identifier")
      .map((token) => token.value),
  );
  const sourceHolders = sourceReaderAnalysis(fileSource).sourceHolders;
  const declarations = findVariableDeclarations(testSource)
    .filter(
      (declaration) =>
        referencedNames.has(declaration.name) &&
        !sourceHolders.has(declaration.name),
    )
    .map((declaration) => declaration.expression);
  return [assertionText, ...declarations].join("\n");
}

function sourceReaderValueAt(source, tokens, metadata, aliases, index) {
  const token = tokens[index];
  if (!token || token.type !== "identifier") return false;
  const taint = metadata.taint;
  if (
    tokens[index + 1]?.value === "." &&
    tokens[index + 2]?.type === "identifier" &&
    taint?.sourceProperties?.has(token.value + "." + tokens[index + 2].value)
  )
    return taint.sourceProperties.get(
      token.value + "." + tokens[index + 2].value,
    );
  if (
    taint?.sourceVariables?.has(token.value) &&
    tokens[index - 1]?.value !== "." &&
    tokens[index - 1]?.value !== "?."
  )
    return true;
  if (
    aliases.has(token.value) &&
    tokens[index - 1]?.value !== "." &&
    tokens[index - 1]?.value !== "?."
  )
    return true;
  if (!metadata.readerNames.has(token.value)) return false;
  if (tokens[index + 1]?.value !== "(") return false;
  const closeIndex = findMatchingParenthesis(tokens, index + 1);
  if (closeIndex === -1) return false;
  const call = source.slice(token.start, tokens[closeIndex].end);
  return taint
    ? callReturnsSourceText(call, taint.taints, taint.functions)
    : sourceReaderCallIsProduction(
        call,
        metadata.productionHelperNames,
        metadata.helperNames,
        metadata.productionPathVariables,
      );
}

function sourceAssertionDetails(testSource, fileSource, staticCategories = []) {
  const fileMetadata = sourceReaderMetadata(fileSource || "");
  const localTaint = sourceTaintAnalysis(testSource, fileMetadata.taint);
  const metadata = { ...fileMetadata, taint: localTaint };
  const aliases = new Set(localTaint.sourceVariables);
  const tokens = tokenize(testSource);
  const details = [];

  function containsSourceValue(start, end) {
    for (let index = start; index < end; index += 1) {
      if (sourceReaderValueAt(testSource, tokens, metadata, aliases, index))
        return true;
    }
    return false;
  }

  function addDetail(start, end, method, kind) {
    const text = testSource.slice(tokens[start].start, tokens[end - 1].end);
    const categoryEvidence = staticCategoryEvidenceForAssertion(
      text,
      testSource,
      fileSource || testSource,
    );
    const matchedStaticCategories = staticCategories.filter(
      (category) =>
        staticCategoryMatches(category, categoryEvidence) ||
        staticCategoryContextMatches(category, text, testSource),
    );
    const negative =
      NEGATIVE_ASSERTION_METHODS.has(method) ||
      /,\s*(?:false|null|undefined)\s*\)?\s*$/i.test(text);
    const staticAssertion =
      matchedStaticCategories.length > 0 ||
      (staticCategories.length > 0 &&
        negative &&
        STATIC_ABSENCE_PATTERN.test(text));
    details.push({
      start,
      end,
      kind,
      method,
      text,
      staticCategories: matchedStaticCategories,
      staticAssertion,
    });
  }

  for (let index = 0; index < tokens.length; index += 1) {
    if (
      tokens[index]?.value === "assert" &&
      tokens[index + 1]?.value === "." &&
      ASSERTION_METHODS.has(tokens[index + 2]?.value) &&
      tokens[index + 3]?.value === "("
    ) {
      const closeIndex = findMatchingToken(tokens, index + 3, "(", ")");
      if (closeIndex !== -1 && containsSourceValue(index + 4, closeIndex))
        addDetail(index, closeIndex + 1, tokens[index + 2].value, "assert");
    }

    if (tokens[index]?.value !== "expect" || tokens[index + 1]?.value !== "(")
      continue;
    const closeIndex = findMatchingToken(tokens, index + 1, "(", ")");
    if (closeIndex === -1 || !containsSourceValue(index + 2, closeIndex))
      continue;
    let matcher = null;
    let matcherEnd = closeIndex + 1;
    for (
      let matcherIndex = closeIndex + 1;
      matcherIndex < Math.min(tokens.length, closeIndex + 8);
      matcherIndex += 1
    ) {
      if (EXPECT_MATCHER_METHODS.has(tokens[matcherIndex]?.value)) {
        matcher = tokens[matcherIndex].value;
        if (tokens[matcherIndex + 1]?.value === "(") {
          const matcherClose = findMatchingParenthesis(
            tokens,
            matcherIndex + 1,
          );
          matcherEnd =
            matcherClose === -1 ? matcherIndex + 2 : matcherClose + 1;
        } else {
          matcherEnd = matcherIndex + 1;
        }
        break;
      }
    }
    if (matcher) addDetail(index, matcherEnd, matcher, "expect");
  }

  for (let index = 0; index < tokens.length - 3; index += 1) {
    if (!sourceReaderValueAt(testSource, tokens, metadata, aliases, index))
      continue;
    let methodIndex = index + 1;
    if (tokens[methodIndex]?.value === "(") {
      const closeIndex = findMatchingParenthesis(tokens, methodIndex);
      if (closeIndex === -1) continue;
      methodIndex = closeIndex + 1;
    }
    if (![".", "?\."].includes(tokens[methodIndex]?.value)) continue;
    const method = tokens[methodIndex + 1]?.value;
    if (
      !SOURCE_SHAPE_METHODS.has(method) ||
      tokens[methodIndex + 2]?.value !== "("
    )
      continue;
    const closeIndex = findMatchingParenthesis(tokens, methodIndex + 2);
    const alreadyCovered = details.some(
      (detail) =>
        tokens[index].start >= tokens[detail.start]?.start &&
        tokens[index].end <= tokens[detail.end - 1]?.end,
    );
    if (!alreadyCovered)
      addDetail(
        index,
        closeIndex === -1 ? methodIndex + 3 : closeIndex + 1,
        method,
        "source-shape",
      );
  }

  return details;
}

function sourceReaderAnalysis(fileSource) {
  const source = fileSource || "";
  const metadata = sourceReaderMetadata(source);
  const aliases = new Set(metadata.taint.sourceVariables);
  return {
    metadata,
    aliases,
    sourceHolders: new Set(metadata.taint.sourceVariables),
    taint: metadata.taint,
  };
}

function neutralizeSourceValues(text, fileSource) {
  const { metadata, sourceHolders, taint } = sourceReaderAnalysis(fileSource);
  const tokens = tokenize(text);
  const ranges = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const isSourceHolder =
      token?.type === "identifier" &&
      sourceHolders.has(token.value) &&
      tokens[index - 1]?.value !== "." &&
      tokens[index - 1]?.value !== "?.";
    const isProductionReaderCall =
      token?.type === "identifier" &&
      metadata.readerNames.has(token.value) &&
      tokens[index + 1]?.value === "(";
    if (!isSourceHolder && !isProductionReaderCall) continue;
    let end = index + 1;
    if (isProductionReaderCall) {
      const closeIndex = findMatchingParenthesis(tokens, index + 1);
      if (
        closeIndex !== -1 &&
        callReturnsSourceText(
          text.slice(token.start, tokens[closeIndex].end),
          taint.taints,
          taint.functions,
        )
      )
        end = closeIndex + 1;
    }
    if (isProductionReaderCall && end === index + 1) continue;
    ranges.push([tokens[index].start, tokens[end - 1].end]);
    index = end - 1;
  }

  if (!ranges.length) return text;
  let result = "";
  let cursor = 0;
  for (const [start, end] of ranges) {
    result += text.slice(cursor, start) + " ".repeat(end - start);
    cursor = end;
  }
  return result + text.slice(cursor);
}

function assertionEvidenceTexts(testSource) {
  const tokens = tokenize(testSource);
  const details = [];

  for (let index = 0; index < tokens.length; index += 1) {
    if (
      tokens[index]?.value === "assert" &&
      tokens[index + 1]?.value === "." &&
      ASSERTION_METHODS.has(tokens[index + 2]?.value) &&
      tokens[index + 3]?.value === "("
    ) {
      const closeIndex = findMatchingToken(tokens, index + 3, "(", ")");
      if (closeIndex !== -1)
        details.push(
          testSource.slice(tokens[index].start, tokens[closeIndex].end),
        );
    }

    if (tokens[index]?.value !== "expect" || tokens[index + 1]?.value !== "(")
      continue;
    const closeIndex = findMatchingToken(tokens, index + 1, "(", ")");
    if (closeIndex === -1) continue;
    for (
      let matcherIndex = closeIndex + 1;
      matcherIndex < Math.min(tokens.length, closeIndex + 8);
      matcherIndex += 1
    ) {
      if (!EXPECT_MATCHER_METHODS.has(tokens[matcherIndex]?.value)) continue;
      let matcherEnd = matcherIndex + 1;
      if (tokens[matcherIndex + 1]?.value === "(") {
        const matcherClose = findMatchingParenthesis(tokens, matcherIndex + 1);
        if (matcherClose !== -1) matcherEnd = matcherClose + 1;
      }
      details.push(
        testSource.slice(tokens[index].start, tokens[matcherEnd - 1].end),
      );
      break;
    }
  }

  return details.concat(extractTests(testSource).map((test) => test.name));
}

function staticCategoryEvidenceSource(testSource, fileSource = testSource) {
  const evidence = assertionEvidenceTexts(testSource);
  if (!evidence.length) return testSource;
  const referencedNames = new Set(
    evidence.flatMap((text) =>
      tokenize(text)
        .filter((token) => token.type === "identifier")
        .map((token) => token.value),
    ),
  );
  const sourceHolders = sourceReaderAnalysis(fileSource).sourceHolders;
  const referencedDeclarations = findVariableDeclarations(testSource)
    .filter(
      (declaration) =>
        referencedNames.has(declaration.name) &&
        !sourceHolders.has(declaration.name),
    )
    .map((declaration) => declaration.expression);
  return evidence
    .concat(referencedDeclarations)
    .map((text) => neutralizeSourceValues(text, fileSource))
    .join("\n");
}

function sourceAssertionProfile(details) {
  const staticCount = details.filter((detail) => detail.staticAssertion).length;
  const businessCount = details.length - staticCount;
  return {
    assertionCount: details.length,
    staticCount,
    businessCount,
    mixed: staticCount > 0 && businessCount > 0,
    allStatic: details.length > 0 && businessCount === 0,
  };
}

function hasSourceTextAssertion(testSource, fileSource) {
  return sourceAssertionDetails(testSource, fileSource).length > 0;
}

function lineAt(source, offset) {
  return source.slice(0, offset).split("\n").length;
}

function normalizeOneLine(value) {
  return String(value).replace(/\s+/g, " ").trim();
}

function dynamicContext(source, start) {
  const prefix = source.slice(Math.max(0, start - 1200), start);
  const patterns = [
    /(?:\.forEach\s*\([^\n]*=>\s*\{[^{}]*)$/s,
    /(?:for\s*\([^\n)]*(?:\bof\b|\bin\b)[^\n)]*\)\s*\{[^{}]*)$/s,
    /(?:for\s*\([^\n;]+;[^\n;]+;[^\n)]*\)\s*\{[^{}]*)$/s,
  ];
  for (const pattern of patterns) {
    if (pattern.test(prefix)) {
      const match = prefix.match(pattern);
      return {
        dynamicMatrix: true,
        evidence: normalizeOneLine(match ? match[0] : prefix.slice(-180)),
      };
    }
  }
  return { dynamicMatrix: false, evidence: null };
}

function extractTests(source) {
  const tokens = tokenize(source);
  const tests = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type !== "identifier" || !TEST_CALL_NAMES.has(token.value))
      continue;
    if (tokens[index - 1] && [".", "?."].includes(tokens[index - 1].value))
      continue;

    let callIndex = index + 1;
    const modifiers = [];
    while (
      tokens[callIndex] &&
      tokens[callIndex].value === "." &&
      tokens[callIndex + 1] &&
      TEST_CALL_MODIFIERS.has(tokens[callIndex + 1].value)
    ) {
      modifiers.push(tokens[callIndex + 1].value);
      callIndex += 2;
    }
    if (!tokens[callIndex] || tokens[callIndex].value !== "(") continue;

    const closeIndex = findMatchingParenthesis(tokens, callIndex);
    if (closeIndex === -1) continue;
    const firstArgument = tokens[callIndex + 1];
    const staticName =
      firstArgument &&
      (firstArgument.type === "string" ||
        (firstArgument.type === "template" && firstArgument.value !== null));
    const name = staticName ? firstArgument.value : "(动态测试名，需人工确认)";
    const dynamicName = !staticName;
    const context = dynamicContext(source, token.start);
    tests.push({
      name: name || "(空测试名，需人工确认)",
      modifier: modifiers.length ? modifiers.join(".") : null,
      dynamicName,
      dynamicMatrix: context.dynamicMatrix,
      matrixEvidence: context.evidence,
      line: token.line,
      endLine: tokens[closeIndex].line,
      start: token.start,
      end: tokens[closeIndex].end,
      source: source.slice(token.start, tokens[closeIndex].end),
    });
  }

  return tests;
}

function extractDynamicMatrices(source) {
  const matrices = [];
  const patterns = [
    {
      kind: "for-each",
      pattern: /\b[A-Za-z_$][A-Za-z0-9_$.[\]]*\.forEach\s*\([^\n]*=>\s*\{/g,
    },
    {
      kind: "for-of",
      pattern:
        /\bfor\s*\(\s*(?:const|let|var)\s+[A-Za-z_$][A-Za-z0-9_$]*\s+of\s+[^\n)]*\)\s*\{/g,
    },
    {
      kind: "for-in",
      pattern:
        /\bfor\s*\(\s*(?:const|let|var)\s+[A-Za-z_$][A-Za-z0-9_$]*\s+in\s+[^\n)]*\)\s*\{/g,
    },
  ];
  for (const { kind, pattern } of patterns) {
    let match;
    while ((match = pattern.exec(source)) !== null) {
      matrices.push({
        kind,
        line: lineAt(source, match.index),
        evidence: normalizeOneLine(match[0]),
      });
    }
  }
  const dynamicNamePattern = /\b(?:test|it|specify)\s*\(\s*`[^`]*\$\{/g;
  let dynamicNameMatch;
  while ((dynamicNameMatch = dynamicNamePattern.exec(source)) !== null) {
    matrices.push({
      kind: "dynamic-name",
      line: lineAt(source, dynamicNameMatch.index),
      evidence: normalizeOneLine(dynamicNameMatch[0]),
    });
  }
  return matrices.sort(
    (left, right) =>
      left.line - right.line || left.kind.localeCompare(right.kind),
  );
}

function hasAny(value, patterns) {
  return patterns.some((pattern) => pattern.test(value));
}

function hasProductionSourceRead(source) {
  return sourceTaintAnalysis(source).readsProductionSource;
}

function staticSignals(source) {
  const rendererBuildPatterns = [
    /(?:execFileSync|execFile|spawnSync|spawn)\s*\([\s\S]{0,500}?npm[\s\S]{0,160}?media-workbench[\s\S]{0,160}?run[\s\S]{0,80}?build/i,
    /(?:execFileSync|execFile|spawnSync|spawn)\s*\([\s\S]{0,500}?"build"[\s\S]{0,160}?media-workbench/i,
    /\b(?:buildRenderer|buildRendererApp|runRendererBuild|startRenderer|ensureBuild)\s*\(/i,
  ];
  const browserLaunchPatterns = [
    /\b(?:chromium|firefox|webkit|electron)\s*\.\s*launch\s*\(/i,
    /\blaunchPersistentContext\s*\(/i,
    /\bbrowserType\s*\.\s*launch\s*\(/i,
    /\bstartRenderer\s*\(/i,
  ];
  const readsProductionSource = hasProductionSourceRead(source);
  return {
    rendererBuild: hasAny(source, rendererBuildPatterns),
    browserLaunch: hasAny(source, browserLaunchPatterns),
    readsProductionSource,
    evidence: {
      rendererBuild: hasAny(source, rendererBuildPatterns)
        ? /\bstartRenderer\s*\(|\bensureBuild\s*\(/i.test(source)
          ? "检测到共享 Renderer harness 的构建入口调用"
          : "检测到子进程/构建器调用与 Renderer build 命令的静态组合"
        : null,
      browserLaunch: hasAny(source, browserLaunchPatterns)
        ? /\bstartRenderer\s*\(/i.test(source)
          ? "检测到共享 Renderer harness 的浏览器生命周期入口调用"
          : "检测到 chromium/firefox/webkit/electron launch 调用"
        : null,
      readsProductionSource: readsProductionSource
        ? "检测到生产路径读取或读取生产路径的测试辅助函数"
        : null,
    },
  };
}

function sourceReadSignals(
  testSource,
  fileSignals,
  fileSource,
  staticCategories = [],
) {
  const base = sourceTaintAnalysis(fileSource || "");
  const local = sourceTaintAnalysis(testSource, base);
  const helperRead = local.observedSourceRead;
  const directRead = local.directSourceRead;
  const sourceAssertions = sourceAssertionDetails(
    testSource,
    fileSource,
    staticCategories,
  );
  const sourceRead = helperRead || sourceAssertions.length > 0;
  const sourceAssertion = sourceRead && sourceAssertions.length > 0;
  if (sourceAssertion) {
    return {
      level: "assertion",
      direct: directRead,
      sourceAssertion: true,
      sourceAssertions,
      assertionProfile: sourceAssertionProfile(sourceAssertions),
      reason: helperRead
        ? "测试声明调用了文件级生产源码读取 helper"
        : "测试声明内部直接读取生产路径或生产源码辅助函数",
    };
  }
  if (fileSignals.readsProductionSource || sourceRead) {
    return {
      level: "file-heuristic",
      direct: false,
      sourceAssertion: false,
      sourceAssertions: [],
      assertionProfile: null,
      reason:
        "文件级 source-reading heuristic 命中，但本测试声明未提取到 assertion-level 读取；保留并由后续包人工确认",
    };
  }
  return {
    level: "none",
    direct: false,
    sourceAssertion: false,
    sourceAssertions: [],
    assertionProfile: null,
    reason: null,
  };
}

const STATIC_GATE_FILE_RULES = Object.freeze([
  {
    pattern:
      /^tests\/(?:architecture-seams|ci-workflow-contract|phase-01-architecture|phase-03-composition|phase-05-production-seams|phase-05-production-removal|phase-06-content-core-typed-ipc|phase-06-dead-content-ipc|phase-06-production-caller-inventory|phase-06-production-ipc-fixture-matrix|phase-06-renderer-bridge-api-surface|phase-06-typed-ipc-production|phase-06-workspace-bootstrap-typed-ipc|phase-06-workspace-coordinator|phase-08-operational-store-internals|phase-08-platform-media-settings-workspace-renderer-slice|phase-08-renderer-contract-layout|react-workbench-regression|renderer-confirmation-host|renderer-platform-cross-page-progress|renderer-resource-library-api|workspace-bootstrap-ipc)(?:\.electron)?\.test\.(?:js|mjs)$/,
    categories: ["architecture/dependency"],
  },
  {
    pattern:
      /^tests\/(?:ci-workflow-contract|desktop-packaging|electron-security|j4125-auth-contract|phase-06-production-ipc-fixture-matrix|phase-06-typed-ipc-production|phase-06-workspace-bootstrap-typed-ipc|phase-08-operational-store-internals|production-preload-sandbox|renderer-confirmation-host|ticket-24-g-legacy-boundary|workspace-paths)(?:\.electron)?\.test\.(?:js|mjs)$/,
    categories: ["security"],
  },
  {
    pattern:
      /^tests\/(?:content-library-migration|desktop-packaging|phase-03-composition|phase-03-media-adapter-readonly|phase-03-worker-main-contract|phase-03-workbench-readonly|phase-05-production-seams|phase-05-production-removal|phase-06-capability-specific-inventory|phase-06-content-core-typed-ipc|phase-06-dead-content-ipc|phase-06-production-caller-inventory|phase-06-typed-ipc-production|phase-08-cleanup-gates|phase-08-publication-submission-orchestration|phase-08-renderer-contract-artifact-absence|phase-08-renderer-contract-layout|react-workbench-regression|renderer-confirmation-host|renderer-platform-task-store|ticket-24-g-legacy-boundary)(?:\.electron)?\.test\.(?:js|mjs)$/,
    categories: ["retired-capability/legacy-absence"],
  },
  {
    pattern:
      /^tests\/(?:application-identity|ci-workflow-contract|content-library-migration|desktop-packaging|desktop-workbench-flow|packaged-playwright-runtime|phase-05-production-seams|phase-06-capability-specific-inventory|phase-08-cleanup-gates|phase-08-renderer-contract-artifact-absence|production-packaging|production-preload-sandbox|relaunch-environment|renderer-encoding|test-discovery-contract)(?:\.electron)?\.test\.(?:js|mjs)$/,
    categories: ["packaging/release/CI"],
  },
]);

const STATIC_CATEGORY_TARGETS = Object.freeze({
  "architecture/dependency":
    /\b(?:moduleSpecifiers|dependency|forbidden|assembly|bridge|import|require|capability|surface|seam|owner|registry|typedIpcMain|ipcMain|PlatformFeatureProvider|usePlatformFeature|DesktopConsoleApi|content-store|content stores|physical store|IpcResponse|IpcError|PlatformStatus|platform status|ConfirmationHost|scopeKey|WorkspaceBootstrap|WorkspaceCoordinatorProvider|WorkspaceScopedConfirmationHost|WorkspaceFeatureProvider|useWorkspaceRuntimeIdentity|useConfirmationScope|registrar|LocalStorage|VITE_ENABLE_FIXTURES|AES-256|clearAll|mockData|INITIAL_ARTICLES|handleAddNewMockArticle|persistArticles|submitPlatformSelection|getPlatformQueue|listRegularQueueGroups|startRegularQueueGroup|isBatchRunning|isStopPending|isPlatformRunning|isPlatformPaused|phase-01-composition|src\/infrastructure|node|publication-submission-orchestrator|publicationSubmissionService|retryFailedPublication|retryFailedPublicationExecutor|regularQueueGroupComposition|regularPlatformOutcomeService|SubmissionOrderStore|platform-workbench-service|createPlatformWorkbenchService|desktopConsole|articleAttention|productionIpcRegistry|exposeInMainWorld|electronIpcRenderer|AUTH_INVOKE_EXEMPTIONS|AUTH_EVENT_EXEMPTIONS|requireBridgeApi|requireContentApi|new\s+Proxy|Reflect\.get|DatabaseSync|CREATE TABLE|BEGIN IMMEDIATE|publication_records|submission_items|remote_orders|recovery_intents|order_display_snapshots|types\/workspace|bridge\/workspace|PlatformTaskProvider|WorkspaceDataProvider|usePlatformTask|usePlatformQueue|getPlatformState|onPlatformState|onDoubaoQueueState|platforms:|getQueue|registerWorkspaceBootstrapIpc|deriveNavigationSummary|onAddResource|showAddForm|RES-\$|addSelectedResource|添加媒体|录入新媒体资源|preloadMethod|Record\s*<\s*string\s*,\s*any\s*>|as\s+any)\b/i,
  security:
    /\b(?:sandbox|csp|credential|cookie|token|secret|auth|protected|private|permission|isolation|boundary|safe|Documents|process\.cwd|homedir|setWindowOpenHandler|will-navigate|setPermissionRequestHandler|action:\s*["']deny|accessToken|refreshToken|authenticated|randomUUID|deviceName|mac|serial|motherboard|cpu|Content-Security-Policy|default-src|connect-src|passwordHash|node:sqlite|healthz|dotenv\.config)\b/i,
  "retired-capability/legacy-absence":
    /\b(?:legacy|retired|absence|dead|migration|removed|forbidden|prohibited|old(?:Capability|Surface|Route)?|deprecated|not\s+(?:exist|package|ship)|OldCapability|mockData|INITIAL_ARTICLES|handleAddNewMockArticle|persistArticles|submitPlatformSelection|PreflightModal|prepareSubmission|submitPrepared|window\.confirm|publicationLedger|publication-ledger|migrate-publication|legacyStatus|publish-log|phase-01-composition|publication-submission-orchestrator|publicationSubmissionService|retryFailedPublication|retryFailedPublicationExecutor|SubmissionOrderStore|record|platform-workbench-service|createPlatformWorkbenchService|PlatformTaskProvider|WorkspaceDataProvider|usePlatformTask|usePlatformQueue|onAddResource|showAddForm|RES-\$|addSelectedResource|添加媒体|录入新媒体资源)\b/i,
  "packaging/release/CI":
    /\b(?:package|packag|asar|artifact|release|build|electron|discovery|runner|relaunch|environment|mojibake|replacement|readable|编码|中文|from:\s*build\/runtime-tools\/node|to:\s*tools\/node|prepare:runtime-tools|verify-alpha-package|asarUnpack|extraResources|media-workbench|dist|index\.html|offline-packaging-smoke|did-finish-load|dotenv\.config|Content-Security-Policy|requiredRuntimeFile|forceCodeSigning|certificateFile|resources\/content-templates|migrate-(?:content-library|content-metadata|publication-ledger)|publication-ledger|src\/\*\*|!\*\*\/\.env|!input\/\*\*|!data\/\*\*|!logs\/\*\*|preload\.js|escapeRegExp|onDoubaoQueueState|desktop.*renderer)\b/i,
});

const STATIC_CATEGORY_RATIONALES = Object.freeze({
  "architecture/dependency":
    "保护模块依赖、唯一装配或 capability/bridge 边界；行为测试无法证明未被调用路径覆盖的 import graph invariant。",
  security:
    "保护 sandbox、鉴权、凭据、路径或敏感数据边界；行为测试无法穷举入口并证明不安全 surface 不存在。",
  "retired-capability/legacy-absence":
    "保护已退役能力或 legacy surface 的 source/package absence；行为测试无法证明未调用的旧能力不存在。",
  "packaging/release/CI":
    "保护生成 artifact、package inclusion/exclusion、discovery 或 CI contract；运行时行为无法替代构建前/打包边界验证。",
});

function inferStaticCategories(
  fileName,
  _testName,
  testSource,
  fileSource = testSource,
) {
  const file = fileName.replaceAll("\\", "/");
  const allowedCategories = [
    ...new Set(
      STATIC_GATE_FILE_RULES.filter((item) => item.pattern.test(file)).flatMap(
        (item) => item.categories,
      ),
    ),
  ];
  if (!allowedCategories.length) return [];
  const evidenceSource = staticCategoryEvidenceSource(testSource, fileSource);
  return allowedCategories.filter((category) =>
    staticCategoryMatches(category, evidenceSource),
  );
}

function staticRationaleFor(categories) {
  return categories
    .map((category) => STATIC_CATEGORY_RATIONALES[category])
    .filter(Boolean)
    .join("；");
}

function classifyPackage(fileName, testName) {
  const file = fileName.replaceAll("\\", "/").toLowerCase();
  const name = testName.toLowerCase();
  const ownerValue = file + "\n" + name;

  if (
    /test-discovery|test-inventory|test-runner-policy|run-tests|harness-lock/.test(
      file,
    )
  )
    return "M05-H";

  if (
    /^tests\/(?:article-lifecycle-ticket-23-|phase-02-migration|legacy-|content-library-migration|content-metadata-migration|phase-03-remote-order-legacy|phase-03-runtime-no-legacy|phase-06-legacy|phase-08-renderer-contract-artifact-absence|ticket-24-[eg])/.test(
      file,
    )
  )
    return "M05-G";

  if (
    /^tests\/(?:architecture-seams|phase-01-architecture|phase-02-architecture|phase-03-composition|phase-05-production-seams|phase-05-production-removal|phase-08-cleanup-gates|phase-08-diagnostics-artifact-toolchain|phase-08-reverse-dependencies|desktop-packaging|desktop-workbench-flow|electron-security|production-packaging|production-preload-sandbox|packaging-runtime|release-evidence|ci-workflow-contract|application-identity|workspace-manifest|storage-paths|workspace-paths|workspace-validator|auth-service|authenticated-runtime|auth-local-data-boundary|auth-gate|j4125-auth-contract|relaunch-environment|alpha-smoke-verifier|packaged-docx-runtime|packaged-playwright-runtime|runtime-tools|ticket-24-c-runtime-outcome-vocabulary)\.test\./.test(
      file,
    )
  )
    return "M05-G";

  if (
    /^tests\/phase-08-platform-media-settings-workspace-renderer-slice\.test\./.test(
      file,
    )
  ) {
    if (
      /domain import|forbidden|dependency|static|source|boundary/.test(
        testName.toLowerCase(),
      )
    )
      return "M05-G";
    if (
      /settings|workspace|sync indicator|workspace switch|confirmation|diagnostic/.test(
        testName.toLowerCase(),
      )
    )
      return "M05-C";
    return "M05-B";
  }
  if (/^tests\/phase-08-feature-development-admission\.test\./.test(file)) {
    if (/fake platform|publisher adapter|remote/.test(name)) return "M05-F";
    if (/publication query|publication/.test(name)) return "M05-B";
    return "M05-A";
  }

  if (
    /^tests\/phase-06-(?:attention-feature|media-feature)\.test\./.test(file) &&
    /workspace coordinator/.test(name)
  )
    return "M05-C";
  if (/^tests\/renderer-content-confirmation-flow\.test\./.test(file))
    return "M05-C";
  if (
    /^tests\/renderer-batch-generation\.test\./.test(file) &&
    /preload|bridge|ipc/.test(name)
  )
    return "M05-D";
  if (
    /^tests\/renderer-batch-generation\.test\./.test(file) &&
    /confirmation/.test(name)
  )
    return "M05-C";
  if (
    /^tests\/renderer-content-read-model-seam\.test\./.test(file) &&
    /query bridge/.test(name)
  )
    return "M05-D";

  if (
    /^tests\/(?:article-lifecycle-ticket-14-renderer|article-attention-invalidation|article-attention-policy|article-attention-query|article-editor-session|content-workbench-regression|doubao-content-workbench|generation-snapshot-(?:event|order)|generation-batch-runner|generation-batch-store|content-generation-batch-service|renderer-(?:content|article|batch|generation|history|question|template)[a-z0-9-]*|react-workbench-regression|client-image-library|client-image-selector|content-workspace|phase-06-(?:attention-feature|content-feature|content-read-model|content-workbench-feature|generation-feature|query-identity)|phase-08-content-renderer-feature-races)\.test\./.test(
      file,
    )
  )
    return "M05-A";

  if (
    /^tests\/(?:phase-06-media-feature|phase-06-media-renderer-capacity|order-list-projection|platform-submission-controller|media-article-drawer-boundary|media-resource-ux|media-workbench-flow|renderer-(?:account-profile|platform|publication|resource|residue)[a-z0-9-]*|phase-03-media-order-(?:evidence|projection)|phase-04-platform-(?:account-projection|run)|phase-03-workbench-readonly)\.test\./.test(
      file,
    )
  )
    return "M05-B";

  if (
    /^tests\/(?:phase-06-settings-feature|phase-06-workspace-(?:coordinator|feature)|renderer-(?:ai-provider-settings|confirmation|encoding|hepan-settings|responsive|settings|time-format|workspace)[a-z0-9-]*|workspace-(?:bootstrap-service|data-invalidation|runtime-lifecycle)|runtime-diagnostics|structured-diagnostics|media-provider-settings|hepan-provider-settings|ai-provider-config-store|platform-provider-config-store)\.test\./.test(
      file,
    )
  )
    return "M05-C";

  if (
    /^tests\/(?:ai-content-ipc|ai-provider-ipc|auth-ipc-boundary|auth-protected-ipc|content-generation-batch-ipc|content-submission-ipc|desktop-ipc-response|doubao-collection-ipc|phase-03-account-profile-ipc|phase-06-.*(?:ipc|typed-ipc|bridge|caller-inventory|symbol-identity|capability)|phase-06-(?:media|platform|publication|settings|submission|workspace)-typed-ipc|phase-06-typed-ipc-production|publication-ipc|runtime-diagnostics-ipc|workspace-bootstrap-ipc|workspace-runtime-ipc)\.test\./.test(
      file,
    )
  )
    return "M05-D";

  if (
    /^tests\/(?:adapter-workspace-injection|desktop-publisher-router|desktop-task-service|doubao-browser-adapter|doubao-collection-queue|doubao-collection-service|doubao-page-parser|hepan-[a-z0-9-]*|media-resource-service|phase-03-media-adapter-readonly|phase-03-supplier-canonical-behavior|phase-04-browser-evidence|phase-04-hepan-runtime-paths|phase-04-media-transport|phase-11-media-supplier[a-z0-9-]*|platform-account-inspector|platform-account-runtime|platform-browser-session[a-z0-9-]*|platform-settings-service|platform-task-progress|platform-workbench-service|prompt-builder|regular-platform-adapter-outcomes|regular-platform-outcomes|article-generator|media-client)\.test\./.test(
      file,
    )
  )
    return "M05-F";

  if (
    /^tests\/(?:article-removal-transaction-store|phase-02-operational-store|phase-02-runtime-capacity|phase-03-operational-store-v3|phase-04-operational-store-lifecycle|phase-08-operational-store-internals|article-removal-recovery-scheduler)\.test\./.test(
      file,
    )
  )
    return "M05-E2";

  if (
    /^tests\/(?:article-management-filter-model|article-management-snapshot[a-z0-9-]*|article-mutation-coordinator|article-removal-service|article-store|article-submission-eligibility|article-workflow|client-knowledge|client-material-store|content-store|phase-08-content-lifecycle|phase-03-six-stage-article-lifecycle|phase-05-trash-confirmation|published-archive|question-store|research-store|template-store)\.test\./.test(
      file,
    )
  )
    return "M05-E1";

  if (
    /^tests\/(?:article-lifecycle-ticket-(?:08|13|15|16|22)|c3-shadow-submission-absence|order-observation-contract|phase-01-domain-contracts|phase-03-content-batch-store|phase-03-media-publication-workflow|phase-03-post-processing|phase-05-p1-blockers|phase-07-regular-queue|publication-article-identity|publication-recovery|publication-targets|regular-platform-outcome-service|regular-publication-evidence-contract|submission-cleanup-recovery|ticket-24-c-runtime-outcome-vocabulary|ticket-25-d-paid-media-acceptance)\.test\./.test(
      file,
    )
  )
    return "M05-E3";

  if (/migration|legacy/.test(file)) return "M05-G";

  // Mixed or non-owner-named files use the assertion's own words, never an
  // arbitrary production-source path, to resolve the remaining disposition.
  if (
    /ipc|typed ipc|preload|bridge|capability|caller|symbol identity/.test(
      ownerValue,
    )
  )
    return "M05-D";
  if (
    /workspace|settings|confirmation|responsive|layout|encoding|time|diagnostic|bootstrap/.test(
      ownerValue,
    )
  )
    return "M05-C";
  if (
    /platform|publication|media|order|account|queue|resource/.test(ownerValue)
  )
    return "M05-B";
  if (
    /content|generation|attention|article|question|research|batch|template/.test(
      ownerValue,
    )
  )
    return "M05-A";
  if (/adapter|browser|hepan|doubao|provider|supplier|remote/.test(ownerValue))
    return "M05-F";
  if (/store|transaction|recovery|capacity/.test(ownerValue)) return "M05-E2";
  if (/submission|publication|queue|outcome|reconcile/.test(ownerValue))
    return "M05-E3";
  return "NONE";
}

function inferInvariants(fileName, test) {
  const value = fileName + "\n" + test.name;
  const rules = [
    {
      pattern:
        /auth|password|credential|token|secret|cookie|permission|sandbox|isolation|path|symlink|safe|protected|boundary|injection|leak|expos/i,
      label: "安全边界与敏感信息不泄露",
    },
    {
      pattern:
        /publication|submission|duplicate|attempt|uncertain|retry|reconcile|ledger|queue|publish|archive|attention/i,
      label: "发布状态、重复保护与尝试历史保持一致",
    },
    {
      pattern: /migration|legacy|import|dry.?run|idempotent|restore|recover/i,
      label: "迁移兼容、幂等与恢复语义保持稳定",
    },
    {
      pattern:
        /renderer|react|workbench|view|layout|page|ui|drawer|refresh|session|browser/i,
      label: "Renderer 用户流程、状态刷新与布局行为保持稳定",
    },
    {
      pattern: /doubao|hepan|platform|provider|adapter|remote|publish/i,
      label: "平台适配、配置隔离与远端结果分类保持稳定",
    },
    {
      pattern: /ai|generation|prompt|research|material|template/i,
      label: "内容生成来源、模板与输入选择保持可追溯",
    },
    {
      pattern: /client|question|search_query/i,
      label: "客户端知识、问题查询与来源数据保持稳定",
    },
    {
      pattern: /docx|document|text.?extract/i,
      label: "文档文本提取与空/损坏输入错误语义保持稳定",
    },
    {
      pattern: /resource|balance|pagination|dto/i,
      label: "资源 DTO、分页与外部数据归一化保持稳定",
    },
    {
      pattern:
        /store|workspace|article|content|file|atomic|rollback|trash|delete|remove|version/i,
      label: "工作区数据、文件事务与内容生命周期保持完整",
    },
    {
      pattern: /ipc|preload|channel|desktop|electron/i,
      label: "IPC 契约、DTO 过滤与主进程边界保持稳定",
    },
    {
      pattern: /packag|runtime|build|install|identity|tool/i,
      label: "打包边界、运行时依赖与应用身份保持一致",
    },
    {
      pattern: /config|setting|default|environment/i,
      label: "配置持久化、默认值与环境来源保持明确",
    },
  ];
  const labels = [];
  for (const rule of rules) {
    if (rule.pattern.test(value) && !labels.includes(rule.label))
      labels.push(rule.label);
    if (labels.length === 3) break;
  }
  if (!labels.length)
    labels.push("待人工确认：未从静态文本提取明确不变量（保留候选）");
  return labels;
}

const FIXTURE_RULES = [
  {
    name: "临时目录",
    pattern:
      /\b(?:mkdtempSync|mkdtemp|makeTemporaryDirectory|createTemp(?:orary)?Directory|temporaryDirectory)\b/i,
  },
  {
    name: "工作区 fixture",
    pattern:
      /\b(?:workspaceRoot|contentLibraryRoot|localStateRoot|createWorkspace|workspacePath|fixtureRoot)\b/i,
  },
  {
    name: "IPC stub",
    pattern:
      /\b(?:createIpc|ipcMain|ipcRenderer|handlers|register[A-Z_$][A-Za-z0-9_$]*Ipc)\b/i,
  },
  {
    name: "store/service stub",
    pattern:
      /\b(?:create[A-Z_$][A-Za-z0-9_$]*(?:Store|Service|Fixture)|fake[A-Z_$][A-Za-z0-9_$]*|mock[A-Z_$][A-Za-z0-9_$]*|stub[A-Z_$][A-Za-z0-9_$]*)\b/i,
  },
  {
    name: "浏览器/Renderer fixture",
    pattern:
      /\b(?:chromium\s*\.\s*launch|browser\.newPage|page\.goto|rendererUrl|viteProcess)\b/i,
  },
  {
    name: "文件 fixture",
    pattern:
      /\b(?:fs\.(?:readFile|writeFile|mkdir|rm|readdir|symlink|lstat|realpath)|readFileSync|writeFileSync)\b/i,
  },
];

const ASSERTION_RULES = [
  {
    name: "equal",
    pattern:
      /\bassert\s*\.\s*(?:equal|strictEqual|notEqual|notStrictEqual)\s*\(/i,
  },
  {
    name: "deep-equal",
    pattern:
      /\bassert\s*\.\s*(?:deepEqual|deepStrictEqual|notDeepEqual|notStrictEqual)\s*\(/i,
  },
  {
    name: "throws/rejects",
    pattern:
      /\bassert\s*\.\s*(?:throws|rejects|doesNotThrow|doesNotReject)\s*\(/i,
  },
  { name: "match", pattern: /\bassert\s*\.\s*(?:match|doesNotMatch)\s*\(/i },
  {
    name: "truthiness",
    pattern: /\bassert\s*\.(?:ok|ifError|ifStrictEqual)\s*\(/i,
  },
];

function getSignature(test) {
  const fixtures = FIXTURE_RULES.map((rule) => {
    const match = rule.pattern.exec(test.source);
    return match ? rule.name + ": " + normalizeOneLine(match[0]) : null;
  }).filter(Boolean);
  const assertions = ASSERTION_RULES.filter((rule) =>
    rule.pattern.test(test.source),
  ).map((rule) => rule.name);
  if (!fixtures.length || !assertions.length) return null;
  return {
    fixtures,
    assertions,
    key: fixtures.join(" + ") + " :: " + assertions.join(" + "),
  };
}

function sourceHash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function stableId(prefix, value) {
  return prefix + "-" + sourceHash(value).slice(0, 10);
}

function normalizeName(name) {
  return String(name).replace(/\s+/g, " ").trim();
}

function escapeMarkdown(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ");
}

function dispositionFor(test, packageId, staticCategories) {
  const sourceLevel = test.sourceRead.level;
  const assertionProfile = test.sourceRead.assertionProfile;
  if (test.modifier && /(?:skip|todo|only|failing)/.test(test.modifier)) {
    return {
      disposition: "REVIEW_MODIFIER_WITHOUT_WEAKENING",
      replacement:
        "后续 owner 必须解释 modifier 的产品/测试语义；M05-0 不删除、放宽或把它计为 PASS。",
    };
  }
  if (
    sourceLevel === "assertion" &&
    staticCategories.length > 0 &&
    assertionProfile?.allStatic
  ) {
    return {
      disposition: "RETAIN_STATIC_GUARD",
      replacement:
        "按静态类别保留窄 root/graph/capability/path/packaging guard；不得以该断言证明业务状态转换。",
    };
  }
  if (sourceLevel === "assertion") {
    if (test.dynamicMatrix || test.dynamicName) {
      return {
        disposition: "REWRITE_PUBLIC_BEHAVIOR_KEEP_MATRIX",
        replacement: assertionProfile?.mixed
          ? "同一 declaration 混合了合法 static invariant 与业务/source-shape assertion；先拆分并以公开行为/contract/harness observable result 替换业务部分，同时保留当前动态故障/输入矩阵。"
          : "后续 owner 以公开行为/contract/harness observable result 替换源码断言，并保留当前动态故障/输入矩阵。",
      };
    }
    return {
      disposition: "REWRITE_PUBLIC_BEHAVIOR",
      replacement: assertionProfile?.mixed
        ? "同一 declaration 混合了合法 static invariant 与业务/source-shape assertion；必须先拆分，无法确定的部分 fail closed，不得整条作为 static guard 放行。"
        : "后续 owner 先确认等价 public behavior evidence，再移除实现形状断言；不得按文件整体删除。",
    };
  }
  if (test.dynamicMatrix || test.dynamicName) {
    return {
      disposition: "RETAIN_DYNAMIC_MATRIX",
      replacement:
        "保留动态生成的故障/输入矩阵；后续 owner 只校准声明计数和可诊断命名，不把动态项漏计或静默跳过。",
    };
  }
  if (sourceLevel === "file-heuristic") {
    return {
      disposition: "RETAIN_BEHAVIOR_FILE_HEURISTIC_NOT_ASSERTION",
      replacement:
        "文件级 heuristic 与 assertion-level 结论分离；当前声明未发现直接源码读取，保留现有 behavior/contract evidence。",
    };
  }
  return {
    disposition: "RETAIN_BEHAVIOR",
    replacement:
      "现有 public behavior/contract evidence 保留；只有后续 owner 证明等价覆盖后才可合并或删除。",
  };
}

function countBy(values) {
  const counts = {};
  for (const value of values) counts[value] = (counts[value] || 0) + 1;
  return Object.fromEntries(
    Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)),
  );
}

function collectInventory() {
  const files = collectTestFiles().map((file) => file.replaceAll("\\", "/"));
  if (!files.length) throw new Error("test discovery returned no test files");

  const classifications = new Map(
    files.map((file) => [file, classifyTestFile(file, { root: ROOT })]),
  );
  const records = files.map((relativePath) => {
    const absolutePath = path.join(ROOT, relativePath);
    const source = fs.readFileSync(absolutePath, "utf8");
    const stat = fs.statSync(absolutePath);
    const signals = staticSignals(source);
    const matrices = extractDynamicMatrices(source);
    const tests = extractTests(source).map((test, index) => {
      const staticCategories = inferStaticCategories(
        relativePath,
        test.name,
        test.source,
        source,
      );
      const sourceRead = sourceReadSignals(
        test.source,
        signals,
        source,
        staticCategories,
      );
      const packageId = classifyPackage(relativePath, test.name);
      const classifiedTest = { ...test, sourceRead };
      const disposition = dispositionFor(
        classifiedTest,
        packageId,
        staticCategories,
      );
      return {
        ...classifiedTest,
        id:
          "T-" +
          sourceHash(relativePath + ":" + test.line + ":" + index).slice(0, 10),
        sourceRead,
        staticCategories,
        staticRationale: staticRationaleFor(staticCategories),
        package: packageId,
        owner:
          packageId === "NONE"
            ? "现有行为/contract owner（M05-0 不改动）"
            : PACKAGE_FREEZE.find((item) => item.id === packageId)?.owner ||
              packageId,
        invariants: inferInvariants(relativePath, test),
        signature: getSignature(test),
        disposition: disposition.disposition,
        replacement: disposition.replacement,
      };
    });
    const pool = classifications.get(relativePath);
    return {
      fileName: path.basename(relativePath),
      relativePath,
      extension: path.extname(relativePath),
      bytes: stat.size,
      sha256: sourceHash(source),
      tests,
      testCount: tests.length,
      dynamicMatrices: matrices,
      dynamicMatrixCount: matrices.length,
      pool: pool.pool,
      poolReason: pool.reason,
      primaryPackage:
        tests.find((test) => test.package !== "NONE")?.package || "NONE",
      primaryDisposition: countBy(tests.map((test) => test.disposition)),
      signals,
    };
  });

  const allTests = records.flatMap((record) =>
    record.tests.map((test) => ({
      fileName: record.fileName,
      relativePath: record.relativePath,
      ...test,
    })),
  );
  const duplicateNames = new Map();
  const signatures = new Map();
  for (const test of allTests) {
    const name = normalizeName(test.name);
    if (!duplicateNames.has(name)) duplicateNames.set(name, []);
    duplicateNames.get(name).push(test);
    if (test.signature) {
      if (!signatures.has(test.signature.key))
        signatures.set(test.signature.key, []);
      signatures.get(test.signature.key).push(test);
    }
  }

  const duplicateNameEntries = Array.from(duplicateNames.entries())
    .filter((entry) => entry[1].length > 1)
    .sort(([left], [right]) => left.localeCompare(right));
  const signatureEntries = Array.from(signatures.entries())
    .filter((entry) => entry[1].length > 1)
    .sort(([left], [right]) => left.localeCompare(right));
  const signatureClusters = signatureEntries.map(([key, tests]) => {
    const packageCounts = countBy(tests.map((test) => test.package));
    const packageId = Object.entries(packageCounts).sort(
      ([left, leftCount], [right, rightCount]) =>
        rightCount - leftCount || left.localeCompare(right),
    )[0][0];
    const id = stableId("SIG", key);
    for (const test of tests) test.signatureId = id;
    return {
      id,
      key,
      count: tests.length,
      package: packageId,
      owner:
        packageId === "NONE"
          ? "各测试既有 behavior/contract owner（未证明为重复）"
          : PACKAGE_FREEZE.find((item) => item.id === packageId)?.owner ||
            packageId,
      disposition: "RETAIN_UNPROVEN_DUPLICATE_UNTIL_OWNER_REVIEW",
      replacement:
        "仅作 fixture/assertion 组合候选；后续 owner 必须核对输入、分支、fake/依赖和 observable outcome 后，才能合并或删除。",
      tests: tests.map((test) => ({
        id: test.id,
        location: test.relativePath + ":" + test.line,
        name: test.name,
      })),
    };
  });
  const duplicateNameClusters = duplicateNameEntries.map(([name, tests]) => ({
    id: stableId("NAME", name),
    name,
    count: tests.length,
    disposition: "RETAIN_DYNAMIC_OR_UNNAMED_DECLARATION_UNTIL_MANUAL_REVIEW",
    replacement:
      "动态/占位测试名不得按精确名称判定重复；后续 owner 需补可诊断 matrix name 或保留当前声明。",
    tests: tests.map((test) => ({
      id: test.id,
      location: test.relativePath + ":" + test.line,
      name: test.name,
    })),
  }));

  const fileManifest = records.map((record) => ({
    path: record.relativePath,
    extension: record.extension,
    bytes: record.bytes,
    sha256: record.sha256,
    testCount: record.testCount,
    dynamicMatrixCount: record.dynamicMatrixCount,
    pool: record.pool,
  }));
  const discoverySha256 = sourceHash(files.join("\n"));
  const manifestDigest = sourceHash(
    JSON.stringify({
      inventoryVersion: "m05-0-v1",
      files: fileManifest,
      declarations: allTests.map((test) => ({
        id: test.id,
        path: test.relativePath,
        line: test.line,
        endLine: test.endLine,
        name: test.name,
        modifier: test.modifier,
        dynamicName: test.dynamicName,
        dynamicMatrix: test.dynamicMatrix,
        sourceReadLevel: test.sourceRead.level,
        staticCategories: test.staticCategories,
        staticRationale: test.staticRationale,
        package: test.package,
        disposition: test.disposition,
      })),
    }),
  );

  return {
    inventoryVersion: "m05-0-v1",
    discovery: {
      command: "npm run test:discover",
      implementation: "scripts/run-tests.js::collectTestFiles",
      pattern: "tests/**/*.test.{js,mjs}",
      files: files.length,
      jsFiles: files.filter((file) => file.endsWith(".test.js")).length,
      mjsFiles: files.filter((file) => file.endsWith(".test.mjs")).length,
      paths: files,
      sha256: discoverySha256,
    },
    records,
    allTests,
    duplicateNames: duplicateNameEntries,
    signatures: signatureEntries,
    duplicateNameClusters,
    signatureClusters,
    duplicateInvariantClusters: DUPLICATE_INVARIANT_CLUSTERS,
    packageFreeze: PACKAGE_FREEZE,
    eDecision: E_DECISION,
    summary: {
      files: records.length,
      jsFiles: records.filter((record) => record.extension === ".js").length,
      mjsFiles: records.filter((record) => record.extension === ".mjs").length,
      declarations: allTests.length,
      dynamicMatrices: records.reduce(
        (sum, record) => sum + record.dynamicMatrixCount,
        0,
      ),
      dynamicDeclarations: allTests.filter(
        (test) => test.dynamicMatrix || test.dynamicName,
      ).length,
      fileLevelSourceCandidates: records.filter(
        (record) => record.signals.readsProductionSource,
      ).length,
      fileLevelSourceCandidateDeclarations: allTests.filter(
        (test) => test.sourceRead.level !== "none",
      ).length,
      assertionLevelSourceCandidates: allTests.filter(
        (test) => test.sourceRead.level === "assertion",
      ).length,
      staticCategoryDeclarations: allTests.filter(
        (test) =>
          test.sourceRead.level === "assertion" &&
          test.staticCategories.length > 0,
      ).length,
      duplicateNameClusters: duplicateNameClusters.length,
      signatureClusters: signatureClusters.length,
      signatureDeclarations: signatureClusters.reduce(
        (sum, cluster) => sum + cluster.count,
        0,
      ),
      pools: countBy(records.map((record) => record.pool)),
      dispositions: countBy(allTests.map((test) => test.disposition)),
      packages: countBy(allTests.map((test) => test.package)),
    },
    manifestDigest,
  };
}

function createInventorySnapshot(inventory) {
  const value = inventory || collectInventory();
  if (Array.isArray(value.files) && !Array.isArray(value.records)) return value;
  return {
    inventoryVersion: value.inventoryVersion,
    discovery: {
      pattern: value.discovery.pattern,
      implementation: value.discovery.implementation,
      files: value.discovery.files,
      jsFiles: value.discovery.jsFiles,
      mjsFiles: value.discovery.mjsFiles,
      sha256: value.discovery.sha256,
    },
    manifestDigest: value.manifestDigest,
    summary: {
      ...value.summary,
      dispositions: { ...value.summary.dispositions },
      packages: { ...value.summary.packages },
      pools: { ...value.summary.pools },
    },
    files: value.records.map((record) => ({
      path: record.relativePath,
      extension: record.extension,
      bytes: record.bytes,
      sha256: record.sha256,
      testCount: record.testCount,
      dynamicMatrixCount: record.dynamicMatrixCount,
      pool: record.pool,
      poolReason: record.poolReason,
      primaryPackage: record.primaryPackage,
      declarations: record.tests.map((declaration, index) => ({
        index,
        id: declaration.id,
        line: declaration.line,
        endLine: declaration.endLine,
        name: declaration.name,
        modifier: declaration.modifier,
        dynamicName: declaration.dynamicName,
        dynamicMatrix: declaration.dynamicMatrix,
        package: declaration.package,
        disposition: declaration.disposition,
        staticCategories: declaration.staticCategories,
        staticRationale: declaration.staticRationale,
        replacement: declaration.replacement,
      })),
    })),
  };
}

function reconcileInventory(before, after) {
  const beforeSnapshot = createInventorySnapshot(before);
  const afterSnapshot = createInventorySnapshot(after);
  const beforeFiles = new Map(
    beforeSnapshot.files.map((record) => [record.path, record]),
  );
  const afterFiles = new Map(
    afterSnapshot.files.map((record) => [record.path, record]),
  );
  const addedFiles = afterSnapshot.files
    .filter((record) => !beforeFiles.has(record.path))
    .map((record) => record.path);
  const removedFiles = beforeSnapshot.files
    .filter((record) => !afterFiles.has(record.path))
    .map((record) => record.path);
  const changedFiles = [];
  const poolMismatches = [];
  const dispositionMismatches = [];
  const newDeclarations = [];
  const removedDeclarations = [];
  const missingAfterDisposition = [];

  for (const afterRecord of afterSnapshot.files) {
    const beforeRecord = beforeFiles.get(afterRecord.path);
    if (!beforeRecord) continue;
    if (
      beforeRecord.sha256 !== afterRecord.sha256 ||
      beforeRecord.bytes !== afterRecord.bytes ||
      beforeRecord.testCount !== afterRecord.testCount
    )
      changedFiles.push(afterRecord.path);
    if (beforeRecord.pool !== afterRecord.pool)
      poolMismatches.push({
        path: afterRecord.path,
        before: beforeRecord.pool,
        after: afterRecord.pool,
      });

    const beforeDeclarations = new Map();
    const beforeNameCounts = new Map();
    for (const declaration of beforeRecord.declarations) {
      const occurrence = beforeNameCounts.get(declaration.name) || 0;
      beforeNameCounts.set(declaration.name, occurrence + 1);
      beforeDeclarations.set(declaration.name + "#" + occurrence, declaration);
    }
    const afterNameCounts = new Map();
    const afterDeclarationKeys = new Set();
    for (const declaration of afterRecord.declarations) {
      const occurrence = afterNameCounts.get(declaration.name) || 0;
      afterNameCounts.set(declaration.name, occurrence + 1);
      const declarationKey = declaration.name + "#" + occurrence;
      afterDeclarationKeys.add(declarationKey);
      if (!declaration.package || !declaration.disposition) {
        missingAfterDisposition.push(
          afterRecord.path + "#" + declaration.index,
        );
        continue;
      }
      const previous = beforeDeclarations.get(declarationKey);
      if (!previous) {
        newDeclarations.push({
          path: afterRecord.path,
          index: declaration.index,
          name: declaration.name,
          package: declaration.package,
          disposition: declaration.disposition,
        });
        continue;
      }
      if (
        previous.package !== declaration.package ||
        previous.disposition !== declaration.disposition
      )
        dispositionMismatches.push({
          path: afterRecord.path,
          index: declaration.index,
          before: {
            name: previous.name,
            package: previous.package,
            disposition: previous.disposition,
          },
          after: {
            name: declaration.name,
            package: declaration.package,
            disposition: declaration.disposition,
          },
        });
    }
    for (const [declarationKey, declaration] of beforeDeclarations) {
      if (!afterDeclarationKeys.has(declarationKey))
        removedDeclarations.push({
          path: afterRecord.path,
          index: declaration.index,
          name: declaration.name,
          package: declaration.package,
          disposition: declaration.disposition,
        });
    }
  }

  const uniquePools = afterSnapshot.files.every((record) =>
    ["parallel", "serial"].includes(record.pool),
  );
  const unexpectedNewDeclarations = newDeclarations.filter(
    (declaration) => declaration.package !== "M05-H",
  );
  const status =
    addedFiles.length === 0 &&
    removedFiles.length === 0 &&
    poolMismatches.length === 0 &&
    dispositionMismatches.length === 0 &&
    removedDeclarations.length === 0 &&
    missingAfterDisposition.length === 0 &&
    unexpectedNewDeclarations.length === 0 &&
    uniquePools
      ? "PASSED"
      : "FAILED";
  return {
    status,
    before: {
      files: beforeSnapshot.discovery.files,
      jsFiles: beforeSnapshot.discovery.jsFiles,
      mjsFiles: beforeSnapshot.discovery.mjsFiles,
      discoverySha256: beforeSnapshot.discovery.sha256,
      manifestDigest: beforeSnapshot.manifestDigest,
    },
    after: {
      files: afterSnapshot.discovery.files,
      jsFiles: afterSnapshot.discovery.jsFiles,
      mjsFiles: afterSnapshot.discovery.mjsFiles,
      discoverySha256: afterSnapshot.discovery.sha256,
      manifestDigest: afterSnapshot.manifestDigest,
    },
    addedFiles,
    removedFiles,
    changedFiles: [...new Set(changedFiles)].sort(),
    poolMismatches,
    dispositionMismatches,
    newDeclarations,
    unexpectedNewDeclarations,
    removedDeclarations,
    missingAfterDisposition,
    uniquePools,
  };
}

function formatBoolean(value) {
  return value ? "是" : "否";
}

function renderInventory(inventory) {
  const lines = [
    "# M05-0 authoritative test disposition ledger",
    "",
    "> 本文件由 `node scripts/test-inventory.js` 基于 `scripts/run-tests.js::collectTestFiles` 生成；它是 M05-A–H 的唯一 before inventory、ownership、disposition、replacement mapping 真源。分析 handoff 只作为历史输入。",
    "",
    "## Inventory contract",
    "",
    "- Discovery pattern：`" +
      inventory.discovery.pattern +
      "`；实现：`" +
      inventory.discovery.implementation +
      "`。",
    "- Reproduction command：`npm run test:discover`（文件集合）及 `node scripts/test-inventory.js`（ledger）。",
    "- 本清单只静态读取测试文件，不 require/执行测试，不启动 Electron、Renderer、浏览器、Vite、Python、外部服务，不发起网络请求。",
    "- `file-heuristic` 与 `assertion` 是两个不同证据级别；文件级命中不自动授权删除该文件内所有声明。",
    "- before manifest digest：`" +
      inventory.manifestDigest +
      "`；discovery path digest：`" +
      inventory.discovery.sha256 +
      "`。",
    "",
    "## Frozen package ownership",
    "",
    "| Package | Authoritative owner | Scope | Forbidden scope | Direct gate |",
    "| --- | --- | --- | --- | --- |",
  ];
  for (const item of inventory.packageFreeze) {
    lines.push(
      "| `" +
        item.id +
        "` | " +
        escapeMarkdown(item.owner) +
        " | " +
        escapeMarkdown(item.scope) +
        " | " +
        escapeMarkdown(item.forbidden) +
        " | " +
        escapeMarkdown(item.gate) +
        " |",
    );
  }

  lines.push(
    "",
    "## M05-E complexity decision",
    "",
    "- Decision：`" + inventory.eDecision.mode + "`。",
    "- Rationale：" + inventory.eDecision.rationale,
    "- Strict order：`" + inventory.eDecision.order.join(" → ") + "`。",
    "- Exception：" + inventory.eDecision.exceptions,
    "",
    "| Package | Owner evidence | Fixture / closure boundary |",
    "| --- | --- | --- |",
  );
  for (const boundary of inventory.eDecision.boundaries) {
    lines.push(
      "| `" +
        boundary.package +
        "` | " +
        escapeMarkdown(boundary.ownerEvidence.join("；")) +
        " | " +
        escapeMarkdown(boundary.fixtureBoundary) +
        " |",
    );
  }

  lines.push(
    "",
    "## Before inventory summary",
    "",
    "| Metric | Value |",
    "| --- | ---: |",
    "| Discovered files | " + inventory.summary.files + " |",
    "| `.test.js` files | " + inventory.summary.jsFiles + " |",
    "| `.test.mjs` files | " + inventory.summary.mjsFiles + " |",
    "| Static test declarations | " + inventory.summary.declarations + " |",
    "| Dynamic matrix candidates | " + inventory.summary.dynamicMatrices + " |",
    "| Dynamic/unnamed declarations | " +
      inventory.summary.dynamicDeclarations +
      " |",
    "| File-level source-reading candidates | " +
      inventory.summary.fileLevelSourceCandidates +
      " files / " +
      inventory.summary.fileLevelSourceCandidateDeclarations +
      " declarations |",
    "| Assertion-level source-reading candidates | " +
      inventory.summary.assertionLevelSourceCandidates +
      " declarations |",
    "| Declarations with legal static-category signals | " +
      inventory.summary.staticCategoryDeclarations +
      " |",
    "| Duplicate-name clusters | " +
      inventory.summary.duplicateNameClusters +
      " |",
    "| Fixture/assertion signature clusters | " +
      inventory.summary.signatureClusters +
      " / " +
      inventory.summary.signatureDeclarations +
      " declarations |",
    "| Runner pools | `" +
      escapeMarkdown(JSON.stringify(inventory.summary.pools)) +
      "` |",
    "| Manifest digest | `" + inventory.manifestDigest + "` |",
    "",
    "### Disposition counts",
    "",
    "| Disposition | Declarations |",
    "| --- | ---: |",
  );
  for (const [key, value] of Object.entries(inventory.summary.dispositions))
    lines.push("| `" + escapeMarkdown(key) + "` | " + value + " |");
  lines.push(
    "",
    "### Package counts",
    "",
    "| Package | Declarations |",
    "| --- | ---: |",
  );
  for (const [key, value] of Object.entries(inventory.summary.packages))
    lines.push("| `" + escapeMarkdown(key) + "` | " + value + " |");

  lines.push(
    "",
    "## Discovered file manifest and runner pool",
    "",
    "| File | Ext | Bytes | SHA-256 | Declarations | Dynamic matrices | Pool | Pool reason | Primary package |",
    "| --- | --- | ---: | --- | ---: | ---: | --- | --- | --- |",
  );
  for (const record of inventory.records) {
    lines.push(
      "| `" +
        escapeMarkdown(record.relativePath) +
        "` | `" +
        record.extension +
        "` | " +
        record.bytes +
        " | `" +
        record.sha256 +
        "` | " +
        record.testCount +
        " | " +
        record.dynamicMatrixCount +
        " | `" +
        record.pool +
        "` | " +
        escapeMarkdown(record.poolReason) +
        " | `" +
        record.primaryPackage +
        "` |",
    );
  }

  lines.push(
    "",
    "## Dynamic matrix candidates",
    "",
    "动态矩阵是 discovery/inventory 的独立证据维度；它们不因静态声明只有一个 `test(...)` 就被视为单一 case。当前仅记录循环/动态命名入口，不执行或猜测运行时迭代数量。",
    "",
    "| File | Line | Kind | Evidence | Linked dynamic declarations |",
    "| --- | ---: | --- | --- | ---: |",
  );
  for (const record of inventory.records) {
    for (const matrix of record.dynamicMatrices) {
      const linked = record.tests.filter(
        (test) =>
          test.dynamicMatrix &&
          test.line >= matrix.line &&
          test.line <= matrix.line + 80,
      ).length;
      lines.push(
        "| `" +
          escapeMarkdown(record.relativePath) +
          "` | " +
          matrix.line +
          " | `" +
          matrix.kind +
          "` | " +
          escapeMarkdown(matrix.evidence) +
          " | " +
          linked +
          " |",
      );
    }
  }

  lines.push(
    "",
    "## Assertion-level disposition ledger",
    "",
    "每条静态声明都有稳定 ID 与 disposition。`RETAIN_BEHAVIOR_FILE_HEURISTIC_NOT_ASSERTION` 明确表示文件级 source-reading 命中没有扩展成 assertion-level 删除候选；`REWRITE_*` 只授权后续包在等价公开行为证据落地后改写，不授权 M05-0 直接删除。",
    "",
    "| ID | Location | Test name | Package / owner | Disposition | Source evidence | Static category | Static rationale | Dynamic | Invariant | Replacement mapping |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  );
  for (const test of inventory.allTests) {
    const owner =
      test.package === "NONE" ? "—" : test.package + "；" + test.owner;
    const sourceEvidence =
      test.sourceRead.level +
      (test.sourceRead.reason ? "：" + test.sourceRead.reason : "");
    const dynamic =
      test.dynamicMatrix || test.dynamicName
        ? "是：" + (test.matrixEvidence || "动态名/矩阵")
        : "否";
    lines.push(
      "| `" +
        test.id +
        "` | `" +
        escapeMarkdown(test.relativePath + ":" + test.line) +
        "` | " +
        escapeMarkdown(test.name) +
        " | " +
        escapeMarkdown(owner) +
        " | `" +
        test.disposition +
        "` | " +
        escapeMarkdown(sourceEvidence) +
        " | " +
        escapeMarkdown(test.staticCategories.join("；") || "—") +
        " | " +
        escapeMarkdown(test.staticRationale || "—") +
        " | " +
        escapeMarkdown(dynamic) +
        " | " +
        escapeMarkdown(test.invariants.join("；")) +
        " | " +
        escapeMarkdown(test.replacement) +
        " |",
    );
  }

  lines.push(
    "",
    "## Semantic duplicate invariant clusters",
    "",
    "| ID | Invariant | Evidence cluster | Owner | Package | Disposition | Replacement mapping |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  );
  for (const cluster of inventory.duplicateInvariantClusters) {
    lines.push(
      "| `" +
        cluster.id +
        "` | " +
        escapeMarkdown(cluster.invariant) +
        " | " +
        escapeMarkdown(cluster.evidence) +
        " | " +
        escapeMarkdown(cluster.owner) +
        " | `" +
        escapeMarkdown(cluster.package) +
        "` | `" +
        cluster.disposition +
        "` | " +
        escapeMarkdown(cluster.replacement) +
        " |",
    );
  }

  lines.push(
    "",
    "## Duplicate-name and fixture/assertion candidates",
    "",
    "这些候选不等同于可删除重复测试；每个 cluster 都有明确 retain/review disposition、owner 和 follow-up。",
    "",
    "### Duplicate test-name clusters",
    "",
    "| ID | Name | Count | Disposition | Locations |",
    "| --- | --- | ---: | --- | --- |",
  );
  for (const cluster of inventory.duplicateNameClusters) {
    lines.push(
      "| `" +
        cluster.id +
        "` | " +
        escapeMarkdown(cluster.name) +
        " | " +
        cluster.count +
        " | `" +
        cluster.disposition +
        "` | " +
        escapeMarkdown(cluster.tests.map((test) => test.location).join("；")) +
        " |",
    );
  }
  if (!inventory.duplicateNameClusters.length)
    lines.push("| — | 未发现 | 0 | — | — |");
  lines.push(
    "",
    "### Fixture/assertion signature clusters",
    "",
    "| ID | Signature | Count | Package / owner | Disposition | Locations |",
    "| --- | --- | ---: | --- | --- | --- |",
  );
  for (const cluster of inventory.signatureClusters) {
    lines.push(
      "| `" +
        cluster.id +
        "` | `" +
        escapeMarkdown(cluster.key) +
        "` | " +
        cluster.count +
        " | `" +
        escapeMarkdown(cluster.package + "；" + cluster.owner) +
        "` | `" +
        cluster.disposition +
        "` | " +
        escapeMarkdown(cluster.tests.map((test) => test.location).join("；")) +
        " |",
    );
  }
  if (!inventory.signatureClusters.length)
    lines.push("| — | 未发现 | 0 | — | — | — |");

  lines.push(
    "",
    "## M05-0 gate and boundary",
    "",
    "- [x] Discovery 与 runner `collectTestFiles` 文件集合一致；JS/MJS 均覆盖。",
    "- [x] 每个 discovered file 恰好有一个 runner pool，pool reason 来自现有 policy；M05-0 未修改 concurrency/timeout/pool policy。",
    "- [x] file-level heuristic 与 assertion-level source-reading 结论分离。",
    "- [x] 每个 declaration 有稳定 ID、disposition、replacement/retention mapping；source-reading candidate 与 duplicate cluster 有 owner/follow-up。",
    "- [x] A/B/C authoritative Renderer ownership 与 A–H package boundary 冻结；跨 cluster 按实际 feature state/action 归属。",
    "- [x] E 冻结为 `M05-E1 → M05-E2 → M05-E3`；migration reader 不进入 E1–E3。",
    "- [ ] 后续包不得自行改 ownership/scope/disposition；只有 blocking finding 按 Audit Protocol 先修订本 ledger/合同后才能例外。",
    "- [ ] M05-A 是下一且唯一允许启动的 package；本包不实施任何 A–H 测试迁移。",
    "",
    "## M05-0 do-not-touch boundary",
    "",
    "`production/`、业务测试断言的删除/降级、runner concurrency/timeout/pool policy、auth-server 业务测试、Renderer/IPC/store/adapter implementation、真实登录/发布/付费/取消/上传、M06/Ticket 25 均不属于本包。",
    "",
  );
  return lines.join("\n");
}

function parseArguments(args) {
  const options = { output: DEFAULT_OUTPUT };
  const values = Array.from(args || []);
  while (values.length) {
    const arg = values.shift();
    if (arg === "--output") {
      const output = values.shift();
      if (!output || output.startsWith("--"))
        throw new Error("--output requires a path");
      options.output = path.resolve(output);
    } else {
      throw new Error("Unknown inventory option");
    }
  }
  return options;
}

function main(args) {
  const options = parseArguments(args);
  const inventory = collectInventory();
  const markdown = renderInventory(inventory);
  fs.mkdirSync(path.dirname(options.output), { recursive: true });
  fs.writeFileSync(options.output, markdown, "utf8");
  process.stdout.write(
    "Generated " +
      path.relative(ROOT, options.output).replaceAll("\\", "/") +
      " from " +
      inventory.summary.files +
      " discovered files (" +
      inventory.summary.jsFiles +
      " JS, " +
      inventory.summary.mjsFiles +
      " MJS) and " +
      inventory.summary.declarations +
      " declarations. manifest=" +
      inventory.manifestDigest +
      "\n",
  );
  return inventory;
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    const code =
      error &&
      typeof error.code === "string" &&
      /^TEST_[A-Z0-9_]{1,72}$/.test(error.code)
        ? error.code
        : "TEST_INVENTORY_FAILED";
    process.stderr.write(code + "\n");
    process.exitCode = 1;
  }
}

module.exports = {
  collectInventory,
  createInventorySnapshot,
  extractDynamicMatrices,
  extractTests,
  main,
  parseArguments,
  reconcileInventory,
  renderInventory,
  dispositionFor,
  hasProductionSourceRead,
  inferStaticCategories,
  sourceReadSignals,
  staticSignals,
  tokenize,
  E_DECISION,
  PACKAGE_FREEZE,
  DUPLICATE_INVARIANT_CLUSTERS,
};
