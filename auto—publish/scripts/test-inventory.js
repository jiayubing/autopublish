'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const TESTS_DIR = path.join(ROOT, 'tests');
const OUTPUT_FILE = path.join(ROOT, 'docs', 'test-suite-inventory.md');
const TEST_CALL_NAMES = new Set(['test', 'it', 'specify']);
const TEST_CALL_MODIFIERS = new Set(['skip', 'todo', 'only', 'failing', 'if', 'unless']);

function decodeEscapes(value) {
  return value.replace(/\\(.)/gs, function(_, character) {
    switch (character) {
      case 'n': return '\n';
      case 'r': return '\r';
      case 't': return '\t';
      case 'b': return '\b';
      case 'f': return '\f';
      case 'v': return '\v';
      case '0': return '\0';
      default: return character;
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
  return new Set(['(', '[', '{', '=', ':', ',', ';', '!', '?', '=>', 'return', 'case', 'throw', 'yield', 'await']).has(previous.value);
}

function tokenize(source) {
  const tokens = [];
  let index = 0;
  let line = 1;

  function push(type, start, end, value, tokenLine) {
    tokens.push({ type: type, start: start, end: end, value: value, line: tokenLine });
  }

  function advanceTo(end) {
    for (; index < end; index += 1) {
      if (source[index] === '\n') line += 1;
    }
  }

  while (index < source.length) {
    const character = source[index];
    if (/\s/.test(character)) {
      advanceTo(index + 1);
      continue;
    }

    if (character === '/' && source[index + 1] === '/') {
      const end = source.indexOf('\n', index + 2);
      advanceTo(end === -1 ? source.length : end);
      continue;
    }

    if (character === '/' && source[index + 1] === '*') {
      const end = source.indexOf('*/', index + 2);
      advanceTo(end === -1 ? source.length : end + 2);
      continue;
    }

    const tokenLine = line;
    if (character === '\'' || character === '"') {
      const quote = character;
      const start = index;
      index += 1;
      while (index < source.length) {
        if (source[index] === '\\') {
          index += 2;
          continue;
        }
        if (source[index] === quote) {
          index += 1;
          break;
        }
        if (source[index] === '\n') line += 1;
        index += 1;
      }
      const raw = source.slice(start, index);
      push('string', start, index, decodeString(raw, quote), tokenLine);
      continue;
    }

    if (character === '`') {
      const start = index;
      index += 1;
      let hasInterpolation = false;
      while (index < source.length) {
        if (source[index] === '\\') {
          index += 2;
          continue;
        }
        if (source[index] === '$' && source[index + 1] === '{') hasInterpolation = true;
        if (source[index] === '`') {
          index += 1;
          break;
        }
        if (source[index] === '\n') line += 1;
        index += 1;
      }
      const raw = source.slice(start, index);
      push('template', start, index, hasInterpolation ? null : decodeEscapes(raw.slice(1, -1)), tokenLine);
      continue;
    }

    if (character === '/' && isRegexStart(tokens)) {
      const start = index;
      index += 1;
      let inCharacterClass = false;
      while (index < source.length) {
        if (source[index] === '\\') {
          index += 2;
          continue;
        }
        if (source[index] === '[') inCharacterClass = true;
        if (source[index] === ']') inCharacterClass = false;
        if (source[index] === '/' && !inCharacterClass) {
          index += 1;
          while (/[A-Za-z]/.test(source[index] || '')) index += 1;
          break;
        }
        if (source[index] === '\n') break;
        index += 1;
      }
      push('regex', start, index, source.slice(start, index), tokenLine);
      continue;
    }

    if (isIdentifierStart(character)) {
      const start = index;
      index += 1;
      while (isIdentifierPart(source[index] || '')) index += 1;
      push('identifier', start, index, source.slice(start, index), tokenLine);
      continue;
    }

    const twoCharacter = source.slice(index, index + 2);
    if (['=>', '==', '!=', '<=', '>=', '&&', '||', '??', '?.', '++', '--'].includes(twoCharacter)) {
      push('punctuation', index, index + 2, twoCharacter, tokenLine);
      index += 2;
      continue;
    }

    push('punctuation', index, index + 1, character, tokenLine);
    index += 1;
  }

  return tokens;
}

function findMatchingParenthesis(tokens, openIndex) {
  let depth = 0;
  for (let index = openIndex; index < tokens.length; index += 1) {
    if (tokens[index].value === '(') depth += 1;
    if (tokens[index].value === ')') {
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
    if (tokens[index].type !== 'identifier' || !names.has(tokens[index].value)) continue;
    if (tokens[index + 1].value !== '(') continue;
    const closeIndex = findMatchingParenthesis(tokens, index + 1);
    if (closeIndex === -1) continue;
    calls.push(source.slice(tokens[index].start, tokens[closeIndex].end));
  }
  return calls;
}

function extractTests(source) {
  const tokens = tokenize(source);
  const tests = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type !== 'identifier' || !TEST_CALL_NAMES.has(token.value)) continue;
    if (tokens[index - 1] && ['.', '?.'].includes(tokens[index - 1].value)) continue;

    let callIndex = index + 1;
    let modifier = null;
    while (tokens[callIndex] && tokens[callIndex].value === '.' && tokens[callIndex + 1] && TEST_CALL_MODIFIERS.has(tokens[callIndex + 1].value)) {
      modifier = tokens[callIndex + 1].value;
      callIndex += 2;
    }
    if (!tokens[callIndex] || tokens[callIndex].value !== '(') continue;

    const closeIndex = findMatchingParenthesis(tokens, callIndex);
    if (closeIndex === -1) continue;
    const firstArgument = tokens[callIndex + 1];
    const name = firstArgument && (firstArgument.type === 'string' || firstArgument.type === 'template')
      ? firstArgument.value
      : null;
    tests.push({
      name: name || '(动态测试名，需人工确认)',
      modifier: modifier,
      line: token.line,
      endLine: tokens[closeIndex].line,
      start: token.start,
      end: tokens[closeIndex].end,
      source: source.slice(token.start, tokens[closeIndex].end)
    });
  }

  return tests;
}

function hasAny(value, patterns) {
  return patterns.some(function(pattern) { return pattern.test(value); });
}

function staticSignals(source) {
  const rendererBuildPatterns = [
    /(?:execFileSync|execFile|spawnSync|spawn)\s*\([\s\S]{0,500}?npm[\s\S]{0,160}?media-workbench[\s\S]{0,160}?run[\s\S]{0,80}?build/i,
    /(?:execFileSync|execFile|spawnSync|spawn)\s*\([\s\S]{0,500}?\"build\"[\s\S]{0,160}?media-workbench/i,
    /\b(?:buildRenderer|buildRendererApp|runRendererBuild|startRenderer|ensureBuild)\s*\(/i
  ];
  const browserLaunchPatterns = [
    /\b(?:chromium|firefox|webkit|electron)\s*\.\s*launch\s*\(/i,
    /\blaunchPersistentContext\s*\(/i,
    /\bbrowserType\s*\.\s*launch\s*\(/i,
    /\bstartRenderer\s*\(/i
  ];
  const readsProductionSource = hasProductionSourceRead(source);

  return {
    rendererBuild: hasAny(source, rendererBuildPatterns),
    browserLaunch: hasAny(source, browserLaunchPatterns),
    readsProductionSource: readsProductionSource,
    evidence: {
      rendererBuild: hasAny(source, rendererBuildPatterns) ? (/\bstartRenderer\s*\(|\bensureBuild\s*\(/i.test(source) ? '检测到共享 Renderer harness 的构建入口调用' : '检测到子进程/构建器调用与 Renderer build 命令的静态组合') : null,
      browserLaunch: hasAny(source, browserLaunchPatterns) ? (/\bstartRenderer\s*\(/i.test(source) ? '检测到共享 Renderer harness 的浏览器生命周期入口调用' : '检测到 chromium/firefox/webkit/electron launch 调用') : null,
      readsProductionSource: readsProductionSource ? '检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数' : null
    }
  };
}

function hasProductionSourceRead(source) {
  const productionPathPattern = /(?:media-workbench[\\/](?:src|dist)|desktop[\\/]|src[\\/]|electron-builder(?:\.[^'"`\s]+)?\.ya?ml|package\.json)/i;
  const fileReadNames = new Set(['readFileSync', 'readFile', 'createReadStream']);
  const readCalls = findCallSources(source, fileReadNames);
  if (readCalls.some(function(call) { return productionPathPattern.test(call); })) return true;

  const helperReadsProductionPath = /\b(?:read|read[A-Z_$][A-Za-z0-9_$]*|readSource)\s*\(\s*['"`][^'"`]*(?:media-workbench[\\/](?:src|dist)|desktop[\\/]|src[\\/]|electron-builder(?:\.[^'"`\s]+)?\.ya?ml|package\.json)/i;
  if (readCalls.length > 0 && helperReadsProductionPath.test(source)) return true;

  const rootedVariables = new Set();
  const variablePattern = /\b(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*[^;\n]*(?:media-workbench[\\/]src|media-workbench['"`]\s*,\s*['"`]src|desktop[\\/]|src[\\/])/gi;
  let match;
  while ((match = variablePattern.exec(source)) !== null) rootedVariables.add(match[1]);
  return rootedVariables.size > 0 && readCalls.some(function(call) {
    return Array.from(rootedVariables).some(function(variable) { return new RegExp('\\b' + variable + '\\b').test(call); });
  });
}

function classifyLayers(fileName, testName, testSource, signals) {
  const namedValue = fileName + '\n' + testName;
  const strongValue = namedValue + '\n' + testSource;
  const layers = [];
  if (/renderer|react-workbench/i.test(namedValue) || /media-workbench[\\/]src|chromium\s*\.\s*launch|browser\.newPage|page\.goto/i.test(strongValue) || (signals && signals.browserLaunch)) layers.push('renderer');
  if (/packag|packaged|alpha-smoke|application-identity|runtime-tools|electron-security|builder/i.test(namedValue)) layers.push('packaging');
  if (/migration|legacy/i.test(namedValue)) layers.push('migration');
  if (/ipc|preload|channel|electron-api/i.test(namedValue)) layers.push('ipc');
  if (/auth|security|workspace-validator|symlink|sandbox|permission|protected|credential|token|boundary|injection|isolation|\bpath\b/i.test(namedValue)) layers.push('security');
  if (/store|ledger|archive|trash|queue|batch|workspace|attention|query|settings|config|resource/i.test(namedValue)) layers.push('store');
  if (layers.length === 0) layers.push('domain');
  return layers;
}

const INVARIANT_RULES = [
  { pattern: /auth|password|credential|token|secret|cookie|permission|sandbox|isolation|path|symlink|safe|protected|boundary|injection|leak|expos/i, label: '安全边界与敏感信息不泄露' },
  { pattern: /publication|submission|duplicate|attempt|uncertain|retry|reconcile|ledger|queue|publish|archive|attention/i, label: '发布状态、重复保护与尝试历史保持一致' },
  { pattern: /migration|legacy|import|dry.?run|idempotent|restore|recover/i, label: '迁移兼容、幂等与恢复语义保持稳定' },
  { pattern: /renderer|react|workbench|view|layout|page|ui|drawer|refresh|session|browser/i, label: 'Renderer 用户流程、状态刷新与布局行为保持稳定' },
  { pattern: /doubao|hepan|platform|provider|adapter|remote|publish/i, label: '平台适配、配置隔离与远端结果分类保持稳定' },
  { pattern: /ai|generation|prompt|research|material|template/i, label: '内容生成来源、模板与输入选择保持可追溯' },
  { pattern: /client|question|search_query/i, label: '客户端知识、问题查询与来源数据保持稳定' },
  { pattern: /docx|document|text.?extract/i, label: '文档文本提取与空/损坏输入错误语义保持稳定' },
  { pattern: /resource|balance|pagination|dto/i, label: '资源 DTO、分页与外部数据归一化保持稳定' },
  { pattern: /store|workspace|article|content|file|atomic|rollback|trash|delete|remove|version/i, label: '工作区数据、文件事务与内容生命周期保持完整' },
  { pattern: /ipc|preload|channel|desktop|electron/i, label: 'IPC 契约、DTO 过滤与主进程边界保持稳定' },
  { pattern: /packag|runtime|build|install|identity|tool/i, label: '打包边界、运行时依赖与应用身份保持一致' },
  { pattern: /config|setting|default|environment/i, label: '配置持久化、默认值与环境来源保持明确' }
];

function inferInvariants(fileName, test) {
  const value = fileName + '\n' + test.name;
  const labels = [];
  for (const rule of INVARIANT_RULES) {
    if (rule.pattern.test(value) && !labels.includes(rule.label)) labels.push(rule.label);
    if (labels.length === 3) break;
  }
  if (labels.length === 0) labels.push('待人工确认：未从静态文本提取明确不变量（删除候选）');
  return labels;
}

const FIXTURE_RULES = [
  { name: '临时目录', pattern: /\b(?:mkdtempSync|mkdtemp|makeTemporaryDirectory|createTemp(?:orary)?Directory|temporaryDirectory)\b/i },
  { name: '工作区 fixture', pattern: /\b(?:workspaceRoot|contentLibraryRoot|localStateRoot|createWorkspace|workspacePath|fixtureRoot)\b/i },
  { name: 'IPC stub', pattern: /\b(?:createIpc|ipcMain|ipcRenderer|handlers|register[A-Z_$][A-Za-z0-9_$]*Ipc)\b/i },
  { name: 'store/service stub', pattern: /\b(?:create[A-Z_$][A-Za-z0-9_$]*(?:Store|Service|Fixture)|fake[A-Z_$][A-Za-z0-9_$]*|mock[A-Z_$][A-Za-z0-9_$]*|stub[A-Z_$][A-Za-z0-9_$]*)\b/i },
  { name: '浏览器/Renderer fixture', pattern: /\b(?:chromium\s*\.\s*launch|browser\.newPage|page\.goto|rendererUrl|viteProcess)\b/i },
  { name: '文件 fixture', pattern: /\b(?:fs\.(?:readFile|writeFile|mkdir|rm|readdir|symlink|lstat|realpath)|readFileSync|writeFileSync)\b/i }
];

const ASSERTION_RULES = [
  { name: 'equal', pattern: /\bassert\s*\.\s*(?:equal|strictEqual|notEqual|notStrictEqual)\s*\(/i },
  { name: 'deep-equal', pattern: /\bassert\s*\.\s*(?:deepEqual|deepStrictEqual|notDeepEqual|notDeepStrictEqual)\s*\(/i },
  { name: 'throws/rejects', pattern: /\bassert\s*\.\s*(?:throws|rejects|doesNotThrow|doesNotReject)\s*\(/i },
  { name: 'match', pattern: /\bassert\s*\.\s*(?:match|doesNotMatch)\s*\(/i },
  { name: 'truthiness', pattern: /\bassert\s*\.\s*(?:ok|ifError|ifStrictEqual)\s*\(/i }
];

function getSignature(test) {
  const fixtures = FIXTURE_RULES.map(function(rule) {
    const match = rule.pattern.exec(test.source);
    return match ? rule.name + ': ' + match[0].replace(/\s+/g, ' ') : null;
  }).filter(Boolean);
  const assertions = ASSERTION_RULES.filter(function(rule) { return rule.pattern.test(test.source); }).map(function(rule) { return rule.name; });
  if (fixtures.length === 0 || assertions.length === 0) return null;
  return { fixtures: fixtures, assertions: assertions, key: fixtures.join(' + ') + ' :: ' + assertions.join(' + ') };
}

function normalizeName(name) {
  return String(name).replace(/\s+/g, ' ').trim();
}

function escapeMarkdown(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function formatBoolean(value, evidence) {
  return value ? '是（' + evidence + '）' : '否（未见静态证据）';
}

function formatDate(value) {
  return value.toISOString();
}

function collectInventory() {
  if (!fs.existsSync(TESTS_DIR)) throw new Error('tests directory not found: ' + TESTS_DIR);
  const files = fs.readdirSync(TESTS_DIR, { withFileTypes: true })
    .filter(function(entry) { return entry.isFile() && entry.name.endsWith('.test.js'); })
    .map(function(entry) { return entry.name; })
    .sort((left, right) => left.localeCompare(right));

  const records = files.map(function(fileName) {
    const absolutePath = path.join(TESTS_DIR, fileName);
    const source = fs.readFileSync(absolutePath, 'utf8');
    const stat = fs.statSync(absolutePath);
    const signals = staticSignals(source);
    const tests = extractTests(source).map(function(test) {
      const layers = classifyLayers(fileName, test.name, test.source, signals);
      return Object.assign({}, test, {
        layers: layers,
        invariants: inferInvariants(fileName, test),
        signature: getSignature(test)
      });
    });
    return {
      fileName: fileName,
      relativePath: 'tests/' + fileName,
      bytes: stat.size,
      modifiedAt: formatDate(stat.mtime),
      tests: tests,
      testCount: tests.length,
      primaryLayer: tests[0] ? tests[0].layers[0] : classifyLayers(fileName, '', '', signals)[0],
      signals: signals
    };
  });

  const allTests = records.flatMap(function(record) {
    return record.tests.map(function(test) {
      return Object.assign({ fileName: record.fileName, relativePath: record.relativePath }, test);
    });
  });
  const duplicateNames = new Map();
  const signatures = new Map();
  for (const test of allTests) {
    const name = normalizeName(test.name);
    if (!duplicateNames.has(name)) duplicateNames.set(name, []);
    duplicateNames.get(name).push(test);
    if (test.signature) {
      if (!signatures.has(test.signature.key)) signatures.set(test.signature.key, []);
      signatures.get(test.signature.key).push(test);
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    records: records,
    allTests: allTests,
    duplicateNames: Array.from(duplicateNames.entries()).filter(function(entry) { return entry[1].length > 1; }).sort(function(left, right) { return right[1].length - left[1].length || left[0].localeCompare(right[0]); }),
    signatures: Array.from(signatures.entries()).filter(function(entry) { return entry[1].length > 1; }).sort(function(left, right) { return right[1].length - left[1].length || left[0].localeCompare(right[0]); })
  };
}

function renderInventory(inventory) {
  const records = inventory.records;
  const totalTests = inventory.allTests.length;
  const primaryLayerCounts = new Map();
  for (const record of records) {
    primaryLayerCounts.set(record.primaryLayer, (primaryLayerCounts.get(record.primaryLayer) || 0) + record.testCount);
  }
  const rendererBuildFiles = records.filter(function(record) { return record.signals.rendererBuild; }).length;
  const browserFiles = records.filter(function(record) { return record.signals.browserLaunch; }).length;
  const sourceReadFiles = records.filter(function(record) { return record.signals.readsProductionSource; }).length;
  const unresolvedInvariants = inventory.allTests.filter(function(test) { return test.invariants.some(function(value) { return value.startsWith('待人工确认'); }); }).length;
  const layerSummary = Array.from(primaryLayerCounts.entries()).sort(function(left, right) { return left[0].localeCompare(right[0]); });

  const lines = [
    '# 测试套件清单（Phase 0）',
    '',
    '> 自动生成文件。重新运行 `node scripts/test-inventory.js` 会重新扫描 `tests/*.test.js` 并覆盖本清单。',
    '',
    '## 范围与证据边界',
    '',
    '- 生成时间：`' + inventory.generatedAt + '`（仅是清单生成时间，不是测试运行时间）。',
    '- 扫描范围：根目录 `tests/*.test.js`，共 **' + records.length + ' 个文件**；静态解析出 **' + totalTests + ' 个测试声明**。',
    '- 本脚本只使用 Node 内置 `fs`、`path` 和字符串扫描；不会 `require` 测试文件，不启动 Node test runner，不启动浏览器、Vite、Electron、Python 或任何外部服务，也不发起网络请求。',
    '- `Renderer build`、`启动浏览器`、`读取生产源码` 均为静态证据标签，不代表本次执行过这些行为；未检测到证据时只表示“未见静态证据”。',
    '- 运行时间、通过/失败/跳过、认证测试、lint/typecheck、Renderer build、audit 和包体积均未在本次清单生成中实际采集，不伪造基线。',
    '',
    '## 基线记录',
    '',
    '| 项目 | 状态 | 证据/采集命令 |',
    '| --- | --- | --- |',
    '| 根测试文件 | 已静态扫描：' + records.length + ' 个 | `tests/*.test.js` |',
    '| 根测试声明数 | 已静态解析：' + totalTests + ' 个 | 不是实际运行结果；需用 `npm test` 采集 |',
    '| 根测试运行时间与通过/失败/跳过 | 待采集 | `npm test` |',
    '| 认证服务测试 | 待采集 | `npm --prefix auth-server test` |',
    '| Renderer lint/typecheck | 待采集 | `npm --prefix media-workbench run lint`（计划命令） |',
    '| Renderer production build 时间与产物体积 | 待采集 | `npm run build:renderer` |',
    '| npm audit | 待采集 | `npm audit` |',
    '| 安装包/包体积 | 待采集 | 需在明确的 alpha/production 构建后记录 |',
    '',
    '## 汇总',
    '',
    '| 指标 | 数值 |',
    '| --- | ---: |',
    '| 测试文件 | ' + records.length + ' |',
    '| 静态测试声明 | ' + totalTests + ' |',
    '| 检测到 Renderer build 静态证据的文件 | ' + rendererBuildFiles + ' |',
    '| 检测到浏览器启动静态证据的文件 | ' + browserFiles + ' |',
    '| 检测到读取生产源码静态证据的文件 | ' + sourceReadFiles + ' |',
    '| 未提取出明确不变量、需人工确认的测试声明 | ' + unresolvedInvariants + ' |',
    '',
    '### 按主层级的静态测试声明数',
    '',
    '| 主层级 | 测试声明数 |',
    '| --- | ---: |'
  ];

  for (const entry of layerSummary) lines.push('| `' + entry[0] + '` | ' + entry[1] + ' |');

  lines.push('', '## 文件清单', '', '| 文件 | 测试数 | 主层级 | 构建 Renderer | 启动浏览器 | 读取生产源码 | 字节数 | 文件修改时间 |', '| --- | ---: | --- | --- | --- | --- | ---: | --- |');
  for (const record of records) {
    lines.push('| `' + escapeMarkdown(record.relativePath) + '` | ' + record.testCount + ' | `' + record.primaryLayer + '` | ' + formatBoolean(record.signals.rendererBuild, record.signals.evidence.rendererBuild) + ' | ' + formatBoolean(record.signals.browserLaunch, record.signals.evidence.browserLaunch) + ' | ' + formatBoolean(record.signals.readsProductionSource, record.signals.evidence.readsProductionSource) + ' | ' + record.bytes + ' | `' + record.modifiedAt + '` |');
  }

  lines.push('', '## 测试声明明细', '', '每一项的层级和不变量都是静态候选。`待人工确认` 不表示该测试无价值，只表示自动扫描没有足够语义证据；删除前必须人工确认替代覆盖。', '');
  for (const record of records) {
    lines.push('### `' + record.relativePath + '`', '', '- 测试声明数：**' + record.testCount + '**。', '- 未采集运行时间：**待采集**（本脚本未执行该文件）。', '- 静态信号：Renderer build=' + (record.signals.rendererBuild ? '是' : '否') + '；浏览器启动=' + (record.signals.browserLaunch ? '是' : '否') + '；读取生产源码=' + (record.signals.readsProductionSource ? '是' : '否') + '。', '');
    if (record.tests.length === 0) {
      lines.push('- 未发现静态 `test`/`it`/`specify` 声明；需人工确认是否使用了非标准封装。', '');
      continue;
    }
    lines.push('| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |', '| ---: | --- | --- | --- | --- | --- |');
    for (const test of record.tests) {
      lines.push('| ' + test.line + ' | `' + escapeMarkdown(test.name) + '` | ' + (test.modifier ? '`' + test.modifier + '`' : '—') + ' | ' + test.layers.map(function(layer) { return '`' + layer + '`'; }).join('、') + ' | ' + test.invariants.map(escapeMarkdown).join('<br>') + ' | ' + (test.signature ? escapeMarkdown(test.signature.key) : '—') + ' |');
    }
    lines.push('');
  }

  lines.push('## 重复测试名称候选', '', '以下仅按静态解析后的精确测试名分组，不判断输入、分支或可观察结果是否相同；不自动删除。', '');
  if (inventory.duplicateNames.length === 0) {
    lines.push('未发现重复测试名。', '');
  } else {
    for (const entry of inventory.duplicateNames) {
      lines.push('### `' + escapeMarkdown(entry[0]) + '`（' + entry[1].length + ' 项）', '');
      for (const test of entry[1]) lines.push('- `' + test.relativePath + ':' + test.line + '`');
      lines.push('');
    }
  }

  lines.push('## 相同 fixture/断言组合候选', '', '以下分组只比较静态命中的 fixture 与断言类别。它们是保守的人工审查入口，不等同于重复覆盖：必须进一步核对输入、分支、依赖替身和可观察结果后，才能决定合并或删除。', '');
  if (inventory.signatures.length === 0) {
    lines.push('未发现重复的静态 fixture/断言签名。', '');
  } else {
    for (const entry of inventory.signatures) {
      lines.push('### `' + escapeMarkdown(entry[0]) + '`（' + entry[1].length + ' 项）', '');
      for (const test of entry[1]) lines.push('- `' + test.relativePath + ':' + test.line + '` — ' + escapeMarkdown(test.name));
      lines.push('');
    }
  }

  lines.push('## 后续采集与人工复核', '', '- [ ] 在隔离且不连接真实客户/投稿服务的环境执行 `npm test`，记录实际总时长、通过/失败/跳过，并与本清单的静态声明数对照。', '- [ ] 单独执行 `npm --prefix auth-server test`、`npm --prefix media-workbench run lint` 和 `npm run build:renderer`，记录实际结果、耗时和产物体积。', '- [ ] 运行 `npm audit` 并记录报告时间、范围和已知接受项。', '- [ ] 对重复名称和 fixture/断言组合逐项确认替代覆盖位置；只有满足计划删除门槛的测试才进入后续 Phase 6。', '- [ ] 对检测到的四个 Renderer build/browser 流程人工确认是否可在共享 harness 中复用；本清单不改变任何测试执行方式。', '');

  return lines.join('\n');
}

function main() {
  const inventory = collectInventory();
  const markdown = renderInventory(inventory);
  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, markdown, 'utf8');
  process.stdout.write('Generated docs/test-suite-inventory.md from ' + inventory.records.length + ' test files and ' + inventory.allTests.length + ' statically parsed test declarations. Runtime baselines remain pending.\n');
}

if (require.main === module) main();

module.exports = { collectInventory, extractTests, renderInventory, tokenize };
