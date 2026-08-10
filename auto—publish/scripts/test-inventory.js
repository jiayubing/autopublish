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
        "tests/phase-03-operational-content-submission.test.js",
        "tests/phase-03-publication-workflow.test.js",
        "tests/phase-07-regular-queue.test.js",
        "tests/phase-08-publication-submission-orchestration.test.js",
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

const PRODUCTION_SOURCE_PATH_PATTERN =
  /(?:media-workbench[\\/](?:src|dist)|media-workbench(?:["'\s,()[\]]{1,40})(?:src|dist)|desktop[\\/]|desktop(?:["'\s,()[\]]{1,40})(?:main|preload|ipc|services|composition|workspace)|src[\\/]|electron-builder(?:\.[^'"`\s]+)?\.ya?ml|package\.json)/i;

function findProductionPathVariables(source) {
  const tokens = tokenize(source);
  const variables = new Set();
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
    const expression = source.slice(
      tokens[index + 2].end,
      tokens[Math.min(end, tokens.length - 1)].end,
    );
    if (PRODUCTION_SOURCE_PATH_PATTERN.test(expression))
      variables.add(tokens[index + 1].value);
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
    const readCalls = findCallSources(body, new Set([
      "readFileSync",
      "readFile",
      "createReadStream",
    ]));
    helpers.set(name, {
      readsProductionSource:
        hasProductionSourceRead(body) ||
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
      if (
        closeParen !== -1 &&
        tokens[openBrace]?.value === "{"
      ) {
        const closeBrace = findMatchingToken(
          tokens,
          openBrace,
          "{",
          "}",
        );
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
      const closeBrace = findMatchingToken(
        tokens,
        bodyStart,
        "{",
        "}",
      );
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

function hasProductionSourceReaderCall(testSource, fileSource) {
  const helpers = findProductionSourceReaderHelpers(fileSource || "");
  for (const [name, helper] of helpers) {
    const calls = findCallSources(testSource, new Set([name]));
    if (
      calls.some(
        (call) =>
          helper.readsProductionSource ||
          PRODUCTION_SOURCE_PATH_PATTERN.test(call),
      )
    )
      return true;
  }
  return false;
}

function hasSourceTextAssertion(testSource, fileSource) {
  const helperNames = [
    ...findProductionSourceReaderHelpers(fileSource || "").keys(),
  ];
  const readerNames = [
    "readFileSync",
    "readFile",
    "createReadStream",
    ...helperNames,
  ];
  if (!readerNames.length) return false;
  const tokens = tokenize(testSource);
  const aliases = new Set();
  for (let index = 0; index < tokens.length - 3; index += 1) {
    if (
      !["const", "let", "var"].includes(tokens[index]?.value) ||
      tokens[index + 1]?.type !== "identifier" ||
      tokens[index + 2]?.value !== "="
    )
      continue;
    const name = tokens[index + 1].value;
    let depth = 0;
    let hasReaderCall = false;
    for (let cursor = index + 3; cursor < tokens.length; cursor += 1) {
      const value = tokens[cursor].value;
      if (["(", "[", "{"].includes(value)) depth += 1;
      if ([")", "]", "}"].includes(value)) depth = Math.max(0, depth - 1);
      if (
        depth === 0 &&
        value === ";"
      )
        break;
      if (
        tokens[cursor].type === "identifier" &&
        readerNames.includes(value) &&
        tokens[cursor + 1]?.value === "("
      ) {
        hasReaderCall = true;
        break;
      }
    }
    if (hasReaderCall) aliases.add(name);
  }
  if (!aliases.size) return false;

  const assertionMethods = new Set([
    "match",
    "doesNotMatch",
    "equal",
    "strictEqual",
    "deepEqual",
    "deepStrictEqual",
    "ok",
    "throws",
    "rejects",
  ]);
  const matcherMethods = new Set([
    "toMatch",
    "toContain",
    "toEqual",
    "toStrictEqual",
    "toBe",
    "toHaveProperty",
    "toThrow",
  ]);

  function containsSourceValue(start, end) {
    for (let index = start; index < end; index += 1) {
      const token = tokens[index];
      if (token.type !== "identifier") continue;
      if (!aliases.has(token.value) && !readerNames.includes(token.value))
        continue;
      const previous = tokens[index - 1]?.value;
      if (previous === "." || previous === "?.") continue;
      if (
        aliases.has(token.value) ||
        tokens[index + 1]?.value === "("
      )
        return true;
    }
    return false;
  }

  for (let index = 0; index < tokens.length; index += 1) {
    if (
      tokens[index]?.value === "assert" &&
      tokens[index + 1]?.value === "." &&
      assertionMethods.has(tokens[index + 2]?.value) &&
      tokens[index + 3]?.value === "("
    ) {
      const closeIndex = findMatchingToken(
        tokens,
        index + 3,
        "(",
        ")",
      );
      if (closeIndex !== -1 && containsSourceValue(index + 4, closeIndex))
        return true;
    }

    if (tokens[index]?.value !== "expect" || tokens[index + 1]?.value !== "(")
      continue;
    const closeIndex = findMatchingToken(tokens, index + 1, "(", ")");
    if (closeIndex === -1 || !containsSourceValue(index + 2, closeIndex))
      continue;
    for (
      let matcherIndex = closeIndex + 1;
      matcherIndex < Math.min(tokens.length, closeIndex + 5);
      matcherIndex += 1
    ) {
      if (matcherMethods.has(tokens[matcherIndex]?.value)) return true;
    }
  }

  for (let index = 0; index < tokens.length - 2; index += 1) {
    if (
      tokens[index]?.type === "identifier" &&
      aliases.has(tokens[index].value) &&
      tokens[index - 1]?.value !== "." &&
      tokens[index + 1]?.value === "." &&
      ["includes", "indexOf", "match", "test"].includes(
        tokens[index + 2]?.value,
      ) &&
      tokens[index + 3]?.value === "("
    )
      return true;
  }
  return false;
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
  const fileReadNames = new Set([
    "readFileSync",
    "readFile",
    "createReadStream",
  ]);
  const readCalls = findCallSources(source, fileReadNames);
  if (readCalls.some((call) => PRODUCTION_SOURCE_PATH_PATTERN.test(call)))
    return true;

  const helperReadsProductionPath =
    /\b(?:read|read[A-Z_$][A-Za-z0-9_$]*|readSource)\s*\(\s*['"`][^'"`]*(?:media-workbench[\\/](?:src|dist)|desktop[\\/]|src[\\/]|electron-builder(?:\.[^'"`\s]+)?\.ya?ml|package\.json)/i;
  if (readCalls.length > 0 && helperReadsProductionPath.test(source))
    return true;

  const rootedVariables = findProductionPathVariables(source);
  return (
    rootedVariables.size > 0 &&
    readCalls.some((call) =>
      Array.from(rootedVariables).some((variable) =>
        new RegExp("\\b" + variable + "\\b").test(call),
      ),
    )
  );
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

function sourceReadSignals(testSource, fileSignals, fileSource) {
  const helperRead = hasProductionSourceReaderCall(testSource, fileSource);
  const directRead = hasProductionSourceRead(testSource);
  const sourceRead = directRead || helperRead;
  const sourceAssertion =
    sourceRead && hasSourceTextAssertion(testSource, fileSource);
  if (sourceAssertion) {
    return {
      level: "assertion",
      direct: directRead,
      sourceAssertion: true,
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
      reason:
        "文件级 source-reading heuristic 命中，但本测试声明未提取到 assertion-level 读取；保留并由后续包人工确认",
    };
  }
  return {
    level: "none",
    direct: false,
    sourceAssertion: false,
    reason: null,
  };
}

const STATIC_GATE_FILE_RULES = Object.freeze([
  {
    pattern:
      /^tests\/(?:architecture-seams|phase-01-architecture|phase-03-composition|phase-05-production-seams|phase-05-production-removal|phase-06-content-core-typed-ipc|phase-06-dead-content-ipc|phase-06-production-caller-inventory|phase-06-production-ipc-fixture-matrix|phase-06-typed-ipc-production|phase-08-operational-store-internals|phase-08-platform-media-settings-workspace-renderer-slice|phase-08-renderer-contract-layout|react-workbench-regression|renderer-confirmation-host|renderer-platform-cross-page-progress|renderer-resource-library-api|workspace-bootstrap-ipc)(?:\.electron)?\.test\.(?:js|mjs)$/,
    categories: ["architecture/dependency"],
  },
  {
    pattern:
      /^tests\/(?:desktop-packaging|electron-security|j4125-auth-contract|phase-06-production-ipc-fixture-matrix|phase-06-typed-ipc-production|phase-06-workspace-bootstrap-typed-ipc|phase-08-operational-store-internals|production-preload-sandbox|renderer-confirmation-host|ticket-24-g-legacy-boundary|workspace-paths)(?:\.electron)?\.test\.(?:js|mjs)$/,
    categories: ["security"],
  },
  {
    pattern:
      /^tests\/(?:content-library-migration|desktop-packaging|phase-03-composition|phase-03-workbench-readonly|phase-05-production-seams|phase-05-production-removal|phase-06-capability-specific-inventory|phase-06-content-core-typed-ipc|phase-06-dead-content-ipc|phase-06-production-caller-inventory|phase-08-cleanup-gates|phase-08-publication-submission-orchestration|phase-08-renderer-contract-artifact-absence|phase-08-renderer-contract-layout|react-workbench-regression|renderer-confirmation-host|renderer-platform-task-store|ticket-24-g-legacy-boundary)(?:\.electron)?\.test\.(?:js|mjs)$/,
    categories: ["retired-capability/legacy-absence"],
  },
  {
    pattern:
      /^tests\/(?:content-library-migration|desktop-packaging|desktop-workbench-flow|packaged-playwright-runtime|phase-05-production-seams|phase-06-capability-specific-inventory|phase-08-cleanup-gates|phase-08-renderer-contract-artifact-absence|production-packaging|production-preload-sandbox|relaunch-environment|renderer-encoding|test-discovery-contract)(?:\.electron)?\.test\.(?:js|mjs)$/,
    categories: ["packaging/release/CI"],
  },
]);

const STATIC_CATEGORY_TARGETS = Object.freeze({
  "architecture/dependency":
    /\b(?:moduleSpecifiers|dependency|forbidden|assembly|bridge|import|require|capability|surface|seam|owner|registry|typedIpcMain|PlatformFeatureProvider|usePlatformFeature|RegularQueueGroupsPanel|createArticleStore|ArticleStore|articleStore|content-store|content stores|physical store|preload|IpcResponse|platform status|ConfirmationHost|scopeKey|WorkspaceBootstrap|registrar|LocalStorage|Workspace switching|AES-256|clearAll)\b/i,
  security:
    /\b(?:sandbox|csp|credential|cookie|token|secret|auth|protected|private|path|permission|isolation|boundary|safe|Documents|process\.cwd|homedir)\b/i,
  "retired-capability/legacy-absence":
    /\b(?:legacy|retired|absence|dead|migration|removed|forbidden|prohibited|not\s+(?:exist|package|ship)|PreflightModal|window\.confirm|publicationLedger|legacyStatus)\b/i,
  "packaging/release/CI":
    /\b(?:package|packag|asar|artifact|release|build|runtime|resource|preload|electron|discovery|runner|config|relaunch|environment|mojibake|replacement|readable|编码|中文)\b/i,
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

function inferStaticCategories(fileName, _testName, testSource) {
  const file = fileName.replaceAll("\\", "/");
  const allowedCategories = [
    ...new Set(
      STATIC_GATE_FILE_RULES.filter((item) => item.pattern.test(file)).flatMap(
        (item) => item.categories,
      ),
    ),
  ];
  if (!allowedCategories.length) return [];
  const target = file + "\n" + testSource;
  return allowedCategories.filter((category) =>
    STATIC_CATEGORY_TARGETS[category].test(target),
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
    /^tests\/(?:article-lifecycle-ticket-14-renderer|article-attention-invalidation|article-attention-policy|article-attention-query|article-editor-session|content-workbench-regression|doubao-content-workbench|generation-snapshot-(?:event|order)|generation-batch-runner|generation-batch-store|content-generation-batch-service|renderer-(?:content|article|batch|generation|history|question|template)[a-z0-9-]*|react-workbench-regression|client-image-library|client-image-selector|content-workspace|phase-06-(?:attention-feature|content-feature|content-read-model|content-workbench-feature|generation-feature|query-identity)|phase-08-content-renderer-feature-races|phase-12-paid-media-preflight)\.test\./.test(
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
    /^tests\/(?:ai-content-ipc|ai-provider-ipc|auth-ipc-boundary|auth-protected-ipc|content-generation-batch-ipc|content-submission-ipc|desktop-ipc-response|doubao-collection-ipc|generation-submission-handoff-ipc|phase-03-account-profile-ipc|phase-06-.*(?:ipc|typed-ipc|bridge|caller-inventory|symbol-identity|capability)|phase-06-(?:media|platform|publication|settings|submission|workspace)-typed-ipc|phase-06-typed-ipc-production|publication-ipc|runtime-diagnostics-ipc|workspace-bootstrap-ipc|workspace-runtime-ipc)\.test\./.test(
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
    /^tests\/(?:article-removal-transaction-store|phase-02-operational-store|phase-02-runtime-capacity|phase-03-operational-store-v3|phase-04-operational-store-lifecycle|phase-08-operational-store-internals|submission-file-helpers-failure-injection|article-removal-recovery-scheduler)\.test\./.test(
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
    /^tests\/(?:article-lifecycle-ticket-(?:08|13|15|16|22)|generation-submission-handoff|order-observation-contract|phase-01-domain-contracts|phase-03-content-batch-store|phase-03-media-publication-workflow|phase-03-operational-content-submission|phase-03-post-processing|phase-03-publication-workflow|phase-05-p1-blockers|phase-07-regular-queue|phase-08-publication-submission-orchestration|publication-article-identity|publication-targets|regular-platform-outcome-service|regular-publication-evidence-contract|submission-cleanup-recovery|submission-preparation-lifecycle|ticket-24-c-runtime-outcome-vocabulary)\.test\./.test(
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
  if (test.modifier && /(?:skip|todo|only|failing)/.test(test.modifier)) {
    return {
      disposition: "REVIEW_MODIFIER_WITHOUT_WEAKENING",
      replacement:
        "后续 owner 必须解释 modifier 的产品/测试语义；M05-0 不删除、放宽或把它计为 PASS。",
    };
  }
  if (sourceLevel === "assertion" && staticCategories.length > 0) {
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
        replacement:
          "后续 owner 以公开行为/contract/harness observable result 替换源码断言，并保留当前动态故障/输入矩阵。",
      };
    }
    return {
      disposition: "REWRITE_PUBLIC_BEHAVIOR",
      replacement:
        "后续 owner 先确认等价 public behavior evidence，再移除实现形状断言；不得按文件整体删除。",
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
      const sourceRead = sourceReadSignals(test.source, signals, source);
      const staticCategories = inferStaticCategories(
        relativePath,
        test.name,
        test.source,
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
    process.stderr.write((error && error.stack) || String(error));
    process.stderr.write("\n");
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
