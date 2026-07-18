# 安装版 DOCX 解析与配置中心能力状态修复计划

**日期：** 2026-07-17  
**源代码范围：** 仅 `F:\官媒投稿\auto—publish`  
**目标：** 修复干净电脑安装最新版 AutoPublish 后“客户资料 DOCX 无法解析”的必现问题；修复配置中心把实际可用的 Edge/Chrome 误报为“不可用”的状态错误；把内置能力、未检测能力和可选平台依赖拆开表达，避免用户把局部限制误认为整套应用不可用。

**实施原则：** 先增加可复现的失败测试，再修改实现；不依赖新电脑全局安装 Node.js、Python、MarkItDown、Playwright CLI、Codex 缓存或开发仓库；不改动客户内容库和迁移数据；正式安装包必须从干净 commit 构建并在隔离环境验收。

---

## 1. 已确认结论

### 1.1 客户资料 DOCX 的根因不是文件本身，而是安装包缺少外部 MarkItDown

客户资料读取链路为：

```text
客户资料页/生成流程
  -> src/content/client-material-store.js
  -> src/core/markitdown.js: convertDocxToText()
  -> 外部 MARKITDOWN_CMD / markitdown 可执行文件
```

当前 `client-material-store` 默认转换器不是项目已经依赖的 `mammoth`，而是外部 `markitdown` 命令。打包版运行时解析器具有以下行为：

- packaged 模式不会从 PATH 查找 MarkItDown；
- `electron-builder.alpha.yml` 没有捆绑 MarkItDown；
- `package.json` 也不存在可直接随 Electron 分发的 MarkItDown 运行时；
- 因此没有应用级显式覆盖时，干净电脑必然返回 `MATERIAL_MARKITDOWN_UNAVAILABLE`。

最小复现连续运行 3 次，结果完全一致：

```text
{"attempt":1,"status":"error","code":"MATERIAL_MARKITDOWN_UNAVAILABLE","message":"MarkItDown is unavailable"}
{"attempt":2,"status":"error","code":"MATERIAL_MARKITDOWN_UNAVAILABLE","message":"MarkItDown is unavailable"}
{"attempt":3,"status":"error","code":"MATERIAL_MARKITDOWN_UNAVAILABLE","message":"MarkItDown is unavailable"}
```

失败发生在外部进程启动阶段，MarkItDown 尚未读取 DOCX 内容，所以更换普通、中文名或其他有效 DOCX 不能解决该环境问题。损坏、加密文档仍应保留为另一类可识别错误，但不是这次干净电脑故障的首要原因。

### 1.2 项目已经携带 Mammoth，但客户资料链路没有复用

`mammoth` 已经是生产依赖，并且以下安装版链路已经直接使用 `mammoth.extractRawText()`：

- `desktop/services/media-workbench-service.js`
- `desktop/services/platform-workbench-service.js`
- `desktop/ipc/platform-ipc.js`

`scripts/verify-alpha-package.js` 也已经断言安装包能加载 `mammoth`。因此客户资料 DOCX 最小、稳定的修复不是捆绑一套 Python/MarkItDown，而是建立统一的内置 DOCX 文本提取模块并复用现有 Mammoth 生产依赖。

### 1.3 Edge/Chrome 是确定的配置中心误报

诊断服务当前把浏览器通道解析为：

```js
{ channel: "msedge", available: true, probed: false }
```

配置中心却使用：

```ts
runtimeDiagnostics.browserChannel.available &&
runtimeDiagnostics.browserChannel.probed
```

作为唯一的“可用”布尔值，所以“配置合法但尚未自检”会被渲染成红色“不可用”。更严重的是，自检成功后 `handleRuntimeSelfCheck()` 丢弃返回结果并重新调用 `getRuntimeDiagnostics()`；诊断服务没有保存探测状态，重新读取仍然返回 `probed=false`。

本机使用真实 Node、Playwright CLI 和系统 Edge 的探针结果为：

```json
{
  "before": { "channel": "msedge", "available": true, "probed": false },
  "smoke": { "ok": true, "browserChannel": "msedge", "session": "runtime-self-check" },
  "after": { "channel": "msedge", "available": true, "probed": false },
  "uiBefore": false,
  "uiAfter": false
}
```

这与用户反馈“Edge 显示不可用，但采集和豆包登录正常”完全一致。浏览器本身和 Playwright 不是这次状态误报的根因。

### 1.4 MarkItDown 与 Hepan Python 的状态和 Edge 不同

- **MarkItDown：** 在当前安装包中确实不可用，并直接导致客户资料 DOCX 故障；不是误报。
- **Hepan Python：** 在当前安装包中也确实未捆绑。`docs/alpha-packaging-checklist.md` 已将“河畔需要本机 Python 和 Cookie 配置”列为已知 Alpha 限制；它不应阻止豆包、Edge 采集和普通文章功能。
- **Edge/Chrome：** 实际可用，但当前界面把“未检测”错误显示成“不可用”。

这三类状态不能继续共用一个红/绿布尔模型。

### 1.5 现有测试全绿，但没有覆盖用户症状

以下命令当前通过：

```powershell
node --test `
  tests/client-material-store.test.js `
  tests/runtime-diagnostics.test.js `
  tests/runtime-diagnostics-ipc.test.js `
  tests/renderer-settings.test.js
```

结果为 25 项测试、24 通过、1 个符号链接测试跳过、0 失败。覆盖缺口是：

- DOCX 测试注入了假的成功转换器，没有证明默认转换器在无 MarkItDown 的安装环境中成功；
- MarkItDown 测试只证明“缺失时能映射错误”，反而把当前故障固化为预期行为；
- Renderer 测试只匹配源代码字符串，没有执行状态映射；
- 浏览器自检测试没有断言成功结果能被后续诊断和界面消费；
- 包验证只执行 `require("mammoth")`，没有用包内代码解析真实 DOCX。

---

## 2. 修复后的能力模型

### 2.1 不再用一个 `available` 布尔值表达所有状态

配置中心采用至少四态模型：

| 状态 | 含义 | 建议显示 |
|---|---|---|
| `ready` | 已静态验证或已完成真实自检 | 绿色“可用” |
| `not_checked` | 配置合法，但本次进程尚未执行真实探测 | 琥珀色“未检测” |
| `optional_unconfigured` | 可选平台依赖未配置，不影响核心流程 | 灰色“未配置（仅影响…）” |
| `unavailable` | 已确认缺失或真实探测失败 | 红色“不可用” |

禁止再把 `not_checked` 和 `optional_unconfigured` 渲染为红色“不可用”。

### 2.2 配置中心展示业务能力，而不只展示原始工具

建议展示以下行：

| 能力 | 依赖 | 初始/探测规则 |
|---|---|---|
| Playwright Node | 包内 `tools/node/node.exe` | 文件与版本校验通过即 `ready` |
| Playwright CLI | 包内精确版本 CLI | 入口与依赖闭包校验通过即 `ready` |
| Edge/Chrome 浏览器 | 已选 channel + 真实 smoke | 启动时 `not_checked`，自检成功后 `ready` |
| 内置 DOCX 解析 | 包内 Mammoth + 真实 DOCX smoke | 包验证和运行诊断通过即 `ready` |
| 河畔投稿 | Python/依赖/Cookie | 未配置时 `optional_unconfigured`，不得污染核心 `ok` |

MarkItDown 在完成本计划的退役任务后从普通用户配置中心移除。若暂时仍有旧调用方，必须显示为“MarkItDown（旧版 DOCX 投稿兼容）”，并准确列出受影响功能，不能让用户误以为客户资料 DOCX 仍依赖它。

### 2.3 `ok`、错误和警告分离

诊断 DTO 调整为：

```text
ok             = 所有核心必需能力没有确认失败
errors[]       = 会阻止核心功能的错误
warnings[]     = 可选能力未配置或尚未检测
capabilities   = 每项能力的 state、safe code、source、lastCheckedAt
```

绝对安装路径、用户目录、环境变量值、CLI stderr 全文仍不得发送给 Renderer。

---

## 3. 实施任务与提交顺序

每个任务单独提交并独立验证。正式包不得从脏工作区构建。

### Task 0：冻结现场并增加两个红色回归测试

**Files:**

- Modify: `tests/client-material-store.test.js`
- Modify: `tests/runtime-diagnostics.test.js`
- Replace/extend: `tests/renderer-settings.test.js`
- Create: `tests/fixtures/docx/customer-material.docx`

- [ ] 记录当前 HEAD、`git status --short` 和新电脑安装包版本/commit SHA。
- [ ] 加入一份不含客户数据的最小有效 OOXML DOCX，正文至少包含中文、英文、两段文本；安装包排除该测试夹具。
- [ ] 新增失败测试：清空 `MARKITDOWN_CMD`、使用默认客户资料转换器时，有效 DOCX 必须返回 `status=ready` 和预期文本。
- [ ] 测试必须走真实 `createClientMaterialStore()` 和默认提取器，不允许注入“直接返回字符串”的假转换器。
- [ ] 新增失败测试：浏览器通道初始状态为 `not_checked`，不得映射成 `unavailable`。
- [ ] 新增失败测试：模拟 smoke 成功后，同一诊断服务再次读取必须得到 `ready/probed=true`。
- [ ] 新增失败测试：可选 Hepan 未配置时进入 `warnings`，不得令核心 `ok=false`。

**Red gate:** 上述新测试在修改实现前必须准确失败，失败原因分别指向 MarkItDown 依赖和浏览器探测状态丢失。

### Task 1：建立统一的内置 DOCX 文本提取模块

**Files:**

- Create: `src/core/docx-text-extractor.js`
- Create: `tests/docx-text-extractor.test.js`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] 将 `mammoth` 固定为经过批准的精确生产版本，不使用 `^`/`~`；本轮可固定当前已使用的 `1.12.0`。
- [ ] 新模块只暴露一个窄接口，例如 `extractDocxText({ buffer })` 和供文章流程使用的 `extractDocxArticle({ buffer, fallbackTitle })`。
- [ ] 使用 `mammoth.extractRawText({buffer})`，统一 CRLF、段落空白和首尾空白。
- [ ] 文章提取规则固定为“第一段非空文本为标题，其余非空内容为正文”；无标题时使用调用方提供的文件名兜底。
- [ ] 不修改源 DOCX，不把原文或客户路径写入日志。
- [ ] 损坏、加密、空内容和普通转换失败映射为稳定、安全的错误码；不得把 Mammoth 原始异常全文送到 Renderer。
- [ ] 对有效中文 DOCX、空 DOCX、损坏 ZIP、重复读取编写真实测试。

**Gate:**

```powershell
node --test tests/docx-text-extractor.test.js
```

在没有 MarkItDown/Python 的环境变量和 PATH 依赖时通过。

### Task 2：让客户资料 DOCX 只依赖包内 Mammoth

**Files:**

- Modify: `src/content/client-material-store.js`
- Modify: `tests/client-material-store.test.js`
- Modify: `desktop/services/ai-content-service.js`（仅在 DTO/错误码需要透传时）
- Modify: `desktop/services/content-generation-batch-service.js`（仅在 DTO/错误码需要透传时）

- [ ] 默认转换器改用 `docx-text-extractor`，彻底移除客户资料对 `convertDocxToText()` 和外部命令的依赖。
- [ ] 提取器接收已经读取并完成边界校验的 Buffer，避免再次按路径打开客户文件。
- [ ] 保留 SHA-256 缓存、原子写入、单文件重试和安全 DTO。
- [ ] 将缓存 schema/version 从 1 提升到 2，确保旧 MarkItDown 结果不会掩盖新提取器行为。
- [ ] 成功缓存只保存提取后的文本、字符数、源哈希和必要元数据；不保存 DOCX 二进制。
- [ ] 移除客户资料专属的 `MATERIAL_MARKITDOWN_UNAVAILABLE` 分支；旧错误码若可能存在于持久化批次中，只作为兼容读取处理，不再由新转换产生。
- [ ] 覆盖首次转换、缓存命中、源文件变化失效、失败后单文件重试和中文文件名。

**Gate:** 有效 DOCX 在 `MARKITDOWN_CMD` 为空且 PATH 不含 Python/MarkItDown 时稳定 `ready`；修改前的三次红色复现转绿。

### Task 3：退役安装版剩余 MarkItDown 硬依赖

**Files:**

- Modify: `src/core/articles.js`
- Modify: `src/platforms/toutiao/adapter.js`
- Modify/Delete: `src/core/markitdown.js`
- Modify: `scripts/config.js`
- Modify: `desktop/runtime-config.js`
- Modify: `desktop/runtime-config-store.js`
- Modify: `scripts/migrate-content-library-v2.js`
- Modify relevant article/Toutiao tests

- [ ] 将 `src/core/articles.js` 和 Toutiao 的 DOCX 解析改为统一 `extractDocxArticle()`；保留现有标题兜底、正文和失败隔离语义。
- [ ] 对比相同 DOCX 在旧 MarkItDown 与新 Mammoth 下的标题/正文，记录允许的格式差异；普通文本内容不得丢失。
- [ ] 若 DOCX 内图片由其他 sidecar/图片流程处理，明确保持原流程；本任务不把图片路径混入正文。
- [ ] 所有调用方迁移后删除 `convertDocxToMd()`、`convertDocxToText()` 和 shell 字符串执行路径。
- [ ] 删除 `MARKITDOWN_CMD` 的应用配置、环境加载、迁移白名单和诊断项；旧配置文件中该键被忽略但不导致启动失败。
- [ ] 更新 `.env.example` 和操作文档，说明安装版 DOCX 使用内置解析器。

**Gate:**

```powershell
rg -n "MARKITDOWN_CMD|convertDocxToMd|convertDocxToText" src desktop scripts
```

预期无生产调用；只允许迁移兼容说明或明确的历史文档命中。

### Task 4：重构浏览器探测状态，修复自检成功后仍显示不可用

**Files:**

- Modify: `desktop/services/runtime-diagnostics-service.js`
- Modify: `desktop/ipc/runtime-diagnostics-ipc.js`
- Modify: `tests/runtime-diagnostics.test.js`
- Modify: `tests/runtime-diagnostics-ipc.test.js`

- [ ] 将“channel 字符串合法”命名为 `configured`，不再称为已探测 `available`。
- [ ] `createRuntimeDiagnosticsService()` 在进程内保存最近一次浏览器探测结果：`state`、`channel`、`lastCheckedAt`、安全错误码。
- [ ] 初始合法 channel 返回 `not_checked`；不写红色错误。
- [ ] `probeBrowser()` 成功后原子更新为 `ready`，再返回新的安全 capability DTO。
- [ ] 失败后更新为 `unavailable`，只保留稳定错误码；下一次成功必须能从红色恢复为绿色。
- [ ] channel 配置发生变化时立即清除旧探测结果并回到 `not_checked`，不能把 msedge 的成功复用给 chrome。
- [ ] 状态只在当前进程内保存，不写入磁盘；应用重启后回到“未检测”比显示过期绿色更安全。
- [ ] `execFile` 依赖可注入，单测无需真的打开浏览器，同时保留一次真实安装包 smoke。
- [ ] 确保 finally 关闭 daemon 并删除临时 profile；失败和超时也不能残留。

**Gate:** 同一 service 上 `not_checked -> ready`、`not_checked -> unavailable -> ready` 和 channel 变化回到 `not_checked` 全部有确定性测试。

### Task 5：配置中心改用能力级多状态 UI

**Files:**

- Modify: `media-workbench/src/electron-api.ts`
- Create: `media-workbench/src/runtime-capability-state.js`（或等价纯函数模块）
- Modify: `media-workbench/src/components/SettingsView.tsx`
- Modify: `tests/renderer-settings.test.js`

- [ ] Renderer 类型与主进程 capability DTO 一致，不在组件内重新发明布尔规则。
- [ ] 把状态到文案/颜色的映射抽成可由 Node test 直接执行的纯函数。
- [ ] Edge/Chrome 初始显示“未检测”，不得显示红色“不可用”。
- [ ] 点击自检后直接消费 IPC 返回的新 capability DTO，或读取服务已保存的状态；禁止丢弃成功结果后恢复为 `probed=false`。
- [ ] 自检成功显示“可用”；失败显示“不可用”和固定中文建议；重试成功后清除旧错误。
- [ ] “内置 DOCX 解析”显示为独立能力。
- [ ] MarkItDown 完全退役后从页面移除。
- [ ] Hepan 未配置显示“未配置（仅影响河畔投稿）”，不使用红色，也不影响 Playwright/豆包/普通内容功能。
- [ ] Node/CLI 缺失仍为红色，因为这是浏览器自动化的核心安装损坏。
- [ ] 测试必须调用状态映射纯函数并断言输出，不再只用正则检查组件中是否存在某些字符串。

**Gate:** 至少覆盖 `ready`、`not_checked`、`optional_unconfigured`、`unavailable` 四态和自检重试状态转换。

### Task 6：强化安装包 DOCX 与诊断验证

**Files:**

- Create: `scripts/verify-packaged-docx-runtime.js`
- Modify: `scripts/verify-alpha-package.js`
- Modify: `scripts/verify.js`
- Modify: `tests/desktop-packaging.test.js`
- Create: `tests/packaged-docx-runtime.test.js`
- Modify: `electron-builder.alpha.yml`（仅补充断言/排除，不额外捆绑 Python）

- [ ] 静态包检查继续要求 `node_modules/mammoth` 及其许可证/依赖闭包存在。
- [ ] 新 verifier 在清空 `MARKITDOWN_CMD`、`HEPAN_PYTHON` 并缩减 PATH 后，从 `resources/app` 加载真实客户资料 store 和包内 Mammoth。
- [ ] verifier 用最小有效 DOCX 创建临时内容库，断言客户资料状态为 `ready`、文本包含预期中文、第二次读取命中缓存。
- [ ] 删除包内 Mammoth 或损坏 DOCX 夹具时，测试必须稳定转红；恢复后转绿。
- [ ] 包扫描继续排除客户资料、DOCX 缓存、测试夹具、日志、profile、Cookie、`.env` 和运行配置。
- [ ] 包验证不要求全局 Python、MarkItDown 或开发仓库存在。
- [ ] Playwright 隔离 verifier 与新 DOCX verifier 都必须运行，避免修复一个运行时后破坏另一个。

目标命令：

```powershell
node scripts/verify-alpha-package.js release-alpha\win-unpacked\resources\app
node scripts/verify-packaged-docx-runtime.js release-alpha\win-unpacked\resources\app
node scripts/verify-packaged-playwright-runtime.js release-alpha\win-unpacked\resources\app --browser-smoke
```

### Task 7：收口 Hepan Python 的产品表达，不在本次偷偷扩大运行时

**Files:**

- Modify: `desktop/services/runtime-diagnostics-service.js`
- Modify: `media-workbench/src/components/SettingsView.tsx`
- Modify: `docs/clean-machine-installation.md`
- Modify: `docs/alpha-packaging-checklist.md`

- [ ] 本轮不把开发机 Python、`D:\fenxi\vendor` 或任意本地 site-packages 复制进安装包。
- [ ] 未配置 Hepan 时明确显示“未配置（仅影响河畔投稿）”。
- [ ] 用户进入河畔发布并真正执行前，再用稳定错误阻止该平台操作；其他平台不得被阻止。
- [ ] 文档列出河畔当前所需的 Python、`requests`、`beautifulsoup4` 和 Cookie 配置，不再只写模糊的“Python 不可用”。
- [ ] 如果产品要求河畔也必须在绝对干净电脑开箱即用，另立专项计划：优先评估把 Python HTTP 发布器迁移到 Node；次选才是带校验和、许可证和依赖锁定的嵌入式 Python。该专项必须有模拟 HTTP 测试和真实平台验收，不能混入本次 DOCX/状态修复提交。

**Gate:** 缺少 Hepan Python 时豆包登录、豆包采集、Edge 自检、客户 DOCX 和普通 Markdown 流程全部保持可用。

### Task 8：文档、版本与正式安装包验收

**Files:**

- Modify: `docs/clean-machine-installation.md`
- Modify: `docs/alpha-packaging-checklist.md`
- Modify: `docs/content-generation-operations.md`
- Create: release note for the fixed build if the project maintains release notes

- [ ] 文档说明 DOCX 使用包内 Mammoth，不再要求用户安装 MarkItDown。
- [ ] 文档解释“未检测”“未配置”和“不可用”的区别。
- [ ] About/诊断页记录 commit SHA、版本和 dirty 标志，便于确认新电脑测试的是修复后安装包。
- [ ] 升级应用版本，避免新旧安装包同名导致误测。
- [ ] 正式 NSIS 包从干净 commit 构建，不使用 `dist:alpha:dirty`。

建议提交顺序：

1. `test(docx): reproduce clean-machine client material failure`
2. `feat(docx): add bundled mammoth text extractor`
3. `fix(content): parse client docx without external markitdown`
4. `refactor(docx): retire remaining markitdown runtime`
5. `fix(diagnostics): preserve browser probe capability state`
6. `fix(settings): render runtime capability states accurately`
7. `test(packaging): verify docx parsing in an isolated package`
8. `docs: document clean-machine docx and optional capabilities`

---

## 4. 自动化验证顺序

### 4.1 专项测试

```powershell
node --test `
  tests/docx-text-extractor.test.js `
  tests/client-material-store.test.js `
  tests/runtime-diagnostics.test.js `
  tests/runtime-diagnostics-ipc.test.js `
  tests/renderer-settings.test.js `
  tests/desktop-packaging.test.js `
  tests/packaged-docx-runtime.test.js
```

### 4.2 全量验证

```powershell
npm ci
npm --prefix media-workbench ci
npm run verify
```

### 4.3 干净提交构建与解包验证

```powershell
npm run pack:alpha
node scripts/verify-alpha-package.js release-alpha\win-unpacked\resources\app
node scripts/verify-packaged-docx-runtime.js release-alpha\win-unpacked\resources\app
node scripts/verify-packaged-playwright-runtime.js release-alpha\win-unpacked\resources\app --browser-smoke
npm run dist:alpha
```

构建前 `git status --short` 必须为空。`release-alpha` 是可重建产物，不提交 Git，也不作为源代码目录的一部分。

---

## 5. 新电脑人工验收矩阵

测试电脑不得预装全局 Node.js、Python、MarkItDown、Playwright CLI，也不得连接开发仓库或 Codex 插件缓存。

### 5.1 客户资料 DOCX

- [ ] 新建测试客户，放入一份有效中文 DOCX 和一份 Markdown。
- [ ] 客户资料列表中两份资料均为 ready，DOCX 能显示非零字符数。
- [ ] 选择 DOCX 执行单篇生成预览，提示词中包含 DOCX 文本。
- [ ] 再次进入资料页命中缓存，内容不重复转换且结果一致。
- [ ] 修改 DOCX 后缓存失效并读取新内容。
- [ ] 损坏 DOCX 只影响该文件，显示安全错误并允许单文件重试。
- [ ] 客户源 DOCX 的修改时间和 SHA-256 不因解析发生变化。

### 5.2 配置中心与 Edge

- [ ] 首次打开配置中心：Node、CLI、内置 DOCX 为“可用”；Edge/Chrome 为“未检测”，不是红色“不可用”。
- [ ] 点击浏览器自检：临时打开 `about:blank` 后关闭，Edge/Chrome 变为“可用”。
- [ ] 在同一应用进程内离开并再次进入配置中心，Edge/Chrome 仍为“可用”。
- [ ] 重启应用后允许回到“未检测”；不得显示过期绿色，也不得直接显示红色。
- [ ] 模拟错误 channel 时自检变红并给出固定建议；改回 msedge 重试后恢复绿色。
- [ ] 豆包登录、豆包采集和现有 Edge 功能继续正常。

### 5.3 可选能力隔离

- [ ] 无 Hepan Python 时只显示“未配置（仅影响河畔投稿）”。
- [ ] 无 Hepan Python 不影响客户 DOCX、豆包、Edge、普通文章和其他不依赖河畔的功能。
- [ ] 进入河畔真实发布前获得平台级明确提示，而不是在应用启动或配置中心制造全局故障感。

### 5.4 安装与残留

- [ ] NSIS 安装、覆盖升级、卸载重装各执行一次。
- [ ] 安装目录不产生 DOCX 缓存、客户文件、浏览器 profile、日志或 Cookie。
- [ ] DOCX 缓存仍位于 `%LOCALAPPDATA%\AutoPublish` 对应的 local-state 目录。
- [ ] 应用退出后没有浏览器自检 daemon 和临时 profile 残留。

---

## 6. 完成标准

只有同时满足以下条件，才能宣布本计划完成：

- [ ] 无 MarkItDown/Python 的干净电脑上，客户资料有效 DOCX 可以解析、缓存、重试并参与生成。
- [ ] 生产代码不再通过 shell 或外部 MarkItDown 解析 DOCX。
- [ ] Edge 真实自检成功后配置中心显示“可用”，未自检时显示“未检测”。
- [ ] Hepan 等可选依赖不会令核心诊断 `ok=false`，也不会把整页染成故障状态。
- [ ] 新的 DOCX 包内执行 verifier 和原 Playwright verifier 均通过。
- [ ] `npm run verify`、portable 构建、NSIS 构建和新电脑验收全部通过。
- [ ] 正式包可追溯到干净 commit 和唯一版本号。

---

## 7. 明确不做的事情

- 不删除、移动或重新迁移客户内容库；本问题与上一轮数据迁移无关。
- 不把开发机的 Python、MarkItDown、全局 npm 或 `D:\fenxi\vendor` 复制进安装包。
- 不把 Electron 可执行文件当作 Python/Node 的替代运行时。
- 不为让状态“变绿”而伪造浏览器探测结果。
- 不在本轮重写河畔真实投稿协议；若要求河畔干净机开箱即用，单独立项并单独验收。
- 不清理 `F:\官媒投稿` 下的其他目录；本计划只修改 `F:\官媒投稿\auto—publish` 源代码。

