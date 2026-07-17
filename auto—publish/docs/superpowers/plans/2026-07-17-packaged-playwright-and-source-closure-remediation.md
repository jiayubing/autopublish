# Packaged Playwright Runtime and Source Directory Closure Remediation Plan

**Goal:** 修复 AutoPublish 安装包在没有 Node.js、全局 `playwright-cli`、Codex 插件缓存和开发环境的新电脑上必现的 Playwright 启动错误；补齐打包期和安装后运行时验证；完成上一轮代码审查遗留的高风险修复；最后将 `F:\官媒投稿\auto—publish` 收口为纯源码、只读资源和可重建构建配置，不再混放业务数据、浏览器 profile、运行日志、依赖目录和安装包。

**Source scope:** 本计划所称“源代码目录”只指 `F:\官媒投稿\auto—publish`。`F:\官媒投稿` 下与它同级的内容库、local-state 或迁移输出目录不计入源码目录清理范围。

**Required order:** 修复未完成的 P1/P2 -> 固化 Playwright 运行时 -> 建立隔离打包验证 -> 统一应用身份与配置路径 -> 补迁仍在源码目录的业务数据 -> 验证新内容库和本机状态 -> 分批清理源码目录 -> 新电脑安装验收。禁止跳过验证直接删除。

---

## 1. 已确认诊断结论

### 1.1 当前安装包可以构建，但 Playwright 运行时不完整

当前代码已成功生成：

- `release-alpha/AutoPublish-Alpha-1.0.0-portable.exe`
- `release-alpha/AutoPublish-Alpha-1.0.0-x64.exe`
- `release-alpha/win-unpacked/`

但是 `win-unpacked/resources/app` 中：

- 没有 `tools/`；
- 没有 `@playwright/cli`；
- 没有 `playwright` / `playwright-core`；
- 没有标准 `node.exe`；
- `package.json` 的生产依赖只有 `dotenv`、`form-data`、`mammoth`。

`desktop/services/runtime-diagnostics-service.js` 会查找：

1. 应用配置中的外部工具路径；
2. 环境变量 `PLAYWRIGHT_CLI_JS`；
3. 包内 `tools/playwright-cli/playwright-cli.js`；
4. PATH 中的 `playwright-cli`。

新电脑四项均不存在，因此包内真实诊断稳定返回：

```text
VERDICT=RED
source=null
error=PLAYWRIGHT_UNAVAILABLE
```

直接调用包内 `createPlaywrightRuntime().open()` 稳定返回：

```text
VERDICT=RED
code=PLAYWRIGHT_EXEC_FAILED
originalCode=ENOENT
message=Playwright command failed
```

这就是安装后 Playwright 错误的首要根因，不是 UI、客户数据或内容库迁移造成的。

### 1.2 开发机之所以可用，是因为偷偷依赖了全局工具

开发机 PATH 中存在：

```text
C:\Users\violet\AppData\Roaming\npm\playwright-cli.ps1
C:\Users\violet\AppData\Roaming\npm\node_modules\@playwright\cli\playwright-cli.js
```

当前全局 CLI 为 `@playwright/cli 0.1.14`，连同嵌套 `playwright` 和 `playwright-core` 约 16.85 MB。给包内代码显式注入该 CLI 和真实 `node.exe` 后，`pwRun("list")` 立即转绿；使用系统 Edge 的隔离 session 可以正常 `open -> list -> close`。

因此开发机成功不能作为安装包可用的证据。

### 1.3 不能用 AutoPublish.exe 代替标准 Node

`AutoPublish.exe` 在 `ELECTRON_RUN_AS_NODE=1` 下可以执行 CLI `--help`，但 Playwright CLI 会用 `process.execPath` 再启动 daemon。daemon 在 Electron 可执行文件下稳定失败：

```text
Error: Daemon process exited with code 1
error: too many arguments. Expected 1 argument but got 2.
```

同一 daemon 使用标准 `node.exe` 可以正常启动。因此本次修复不得使用以下方案：

- 直接把 `process.execPath` 当作 Node；
- 只设置 `ELECTRON_RUN_AS_NODE=1`；
- 假设新电脑 PATH 中已经有 Node；
- 假设 Codex 插件会提供 Playwright CLI。

### 1.4 系统 Edge 在当前探针中可用

标准 Node + CLI + `--browser=msedge` 已完成真实 `open/list/close`。当前证据说明浏览器通道不是本机上的首要故障，但新电脑仍必须有明确的 Edge/Chrome 可用性诊断。

### 1.5 当前打包验证存在盲区

`scripts/verify-alpha-package.js` 当前报告 `Alpha package contents OK`，但包内没有 Playwright CLI 和 Node。现有验证只检查部分源码文件和私有数据排除规则，没有在隔离 PATH 下执行包内工具，也没有启动浏览器 session，因此无法拦截本次坏包。

---

## 2. 目标架构决定

### 2.1 安装包自带 CLI 和标准 Node

采用以下固定结构：

```text
resources/
  app/
    node_modules/
      @playwright/cli/
      playwright/
      playwright-core/
    tools/
      node/
        node.exe
        LICENSE
```

原则：

- 将 `@playwright/cli` 作为精确版本的生产依赖，不使用 `^`/`~`；初始实现可固定到本次已验证的 `0.1.14`，升级必须重新跑完整包探针。
- Node 使用受支持的官方 Windows x64 LTS 精确版本；版本、下载 URL 和 SHA-256 写入受版本控制的 manifest。
- 构建脚本只接受 SHA-256 匹配的 Node 归档，不直接复制开发机 `C:\Program Files\nodejs\node.exe`。
- Node 许可证随包分发。
- 当前修复阶段保持 `asar: false`。若以后启用 asar，CLI 及其依赖必须 `asarUnpack`，外部 Node 不能直接执行 asar 内的 JS 路径。
- 默认使用系统 Edge，暂不额外捆绑 Chromium，避免安装包增加数百 MB。若产品要求完全离线且不依赖 Edge，再单独评审浏览器捆绑方案。

### 2.2 运行时依赖优先级

Node 解析优先级：

1. 受信任的应用级显式覆盖；
2. 包内 `tools/node/node.exe`；
3. 开发模式下 PATH 中的 Node；
4. 否则返回 `PLAYWRIGHT_NODE_UNAVAILABLE`。

Playwright CLI 解析优先级：

1. 受信任的应用级显式覆盖；
2. 包内 `node_modules/@playwright/cli/playwright-cli.js`；
3. 开发模式下 PATH/npm wrapper；
4. 否则返回 `PLAYWRIGHT_CLI_UNAVAILABLE`。

打包模式禁止回退到 `process.execPath` 或依赖用户内容库里的任意可执行路径。

### 2.3 能力级诊断，不把所有外部工具混成一个总失败

诊断至少拆为：

- `playwrightNode`
- `playwrightCli`
- `browserChannel`
- `markitdown`
- `hepanPython`

缺少 Hepan Python 不应阻止豆包或普通文章浏览；缺少 MarkItDown 不应阻止纯 Markdown 流程；Playwright 不可用时只禁用依赖浏览器的采集/平台功能，并在操作前展示明确修复说明。

---

## 3. 实施提交顺序

每项单独提交并独立验证：

1. `fix(publishing): prevent retry after remote success and archive failure`
2. `fix(content): make permanent deletion recoverable and tombstones minimal`
3. `fix(renderer): converge hidden article selections`
4. `fix(migration): keep migration evidence atomic and auditable`
5. `build(playwright): bundle pinned cli and node runtime`
6. `fix(runtime): resolve packaged playwright without global tools`
7. `test(packaging): execute playwright probes in isolated environment`
8. `fix(desktop): unify development and packaged application identity`
9. `chore(migration): migrate remaining source-directory runtime data`
10. `chore(cleanup): remove verified runtime artifacts from source tree`
11. `docs: document clean-machine installation and recovery`

不得把上述内容继续堆在一个未提交工作区。

---

## Task 0：冻结当前现场并拆分已有改动

**Current risk:** 当前 `master` 相对 HEAD 仍是大量未提交修改，包含代码修复、旧 Renderer 删除、业务数据删除和迁移脚本修改。

- [ ] 先备份整个 Git 工作目录和迁移 manifest。
- [ ] 记录当前 `git status --short`、`git diff --stat` 和 HEAD。
- [ ] 按修复、测试、Renderer 退休、迁移工具、业务数据移除拆成独立提交。
- [ ] 删除业务源文件的提交必须附 manifest 路径、备份位置、文件数和校验摘要。
- [ ] 正式安装包只能从干净 commit 构建；构建脚本遇 tracked/untracked 修改时默认失败，除非显式 `--allow-dirty` 用于本地诊断包。
- [ ] 在安装包 About/诊断页显示 commit SHA 和 dirty 标记。

**Gate:** `git status --short` 为空，或只有当前任务明确允许的文件。

---

## Task 1：完成上一轮仍未闭环的 P1/P2 修复

### 1.1 投稿成功后归档失败不得重投

**Files:**

- `src/core/files.js`
- `src/core/jobs.js`
- `src/core/articles.js` if target reservation belongs there
- `tests/published-archive.test.js`

- [ ] 网络投稿前确定并保留唯一归档目标；同名并发任务不能都先远程成功再竞争本地路径。
- [ ] `published_archive_failed` 不得聚合成普通 `fail`。
- [ ] 写入持久化的“远端成功、本地待恢复”记录；下一轮扫描必须跳过这类正文。
- [ ] 提供只执行本地归档恢复的操作，禁止再次调用远端投稿。
- [ ] 增加两任务同名并发、重启后重新扫描、归档恢复的测试。

### 1.2 永久删除必须可恢复到确定终态

**Files:**

- `src/content/article-store.js`
- `src/content/article-trash-service.js`
- article trash tests

- [ ] 永久删除增加 journal 和启动恢复；断电发生在正文移动与 tombstone 写入之间也能恢复。
- [ ] `references[]` 严格只允许 `{type,id}`，拒绝任何额外嵌套字段。
- [ ] 终态 tombstone 提供给生成批次和投稿记录解析，“原文章已删除”必须有真实消费方和测试。

### 1.3 其他未完成项

- [ ] `GeneratedArticlesView` 在文本/状态筛选变化时收敛隐藏 selection。
- [ ] migration manifest/completion marker 不允许退化为直接覆盖写；Windows rename 被占用时重试，最终失败而不是破坏旧凭证。

**Gate:** 专项测试及全量 `npm test` 通过，原 P1/P2 复核无发现。

---

## Task 2：固定 Playwright CLI 生产依赖

**Files:**

- `package.json`
- `package-lock.json`
- `electron-builder.alpha.yml`
- packaging tests

- [ ] 使用 `npm install --save-exact @playwright/cli@<approved-version>`。
- [ ] 确认 lockfile 中包含 `@playwright/cli`、`playwright`、`playwright-core`，且没有依赖开发机全局 npm。
- [ ] 包内容测试断言 `resources/app/node_modules/@playwright/cli/playwright-cli.js` 存在。
- [ ] 包内容测试断言 CLI 的 `LICENSE` 以及依赖许可证可追踪。
- [ ] 明确禁止打包浏览器 profile、Cookie、state、`.playwright-cli` 页面快照和浏览器缓存。
- [ ] 记录 CLI 及依赖的解包体积基线；本次已知基线约 16.85 MB。

**Gate:** 删除全局 `playwright-cli` 或清空 PATH 后，包内 CLI 路径仍存在。

---

## Task 3：准备并打包受校验的官方 Node 运行时

**Files:**

- Create: `build/runtime-tools-manifest.json`
- Create: `scripts/prepare-runtime-tools.js`
- Modify: `.gitignore`
- Modify: `electron-builder.alpha.yml`
- Create tests for tool preparation and checksum rejection

- [ ] manifest 固定 Node LTS 版本、Windows x64 下载 URL、SHA-256、许可证文件名。
- [ ] prepare 脚本下载到可清理缓存，先验 SHA-256，再提取 `node.exe` 和 LICENSE。
- [ ] 校验失败必须停止构建，不允许回退复制本机 Node。
- [ ] staging 目录为生成物并加入 `.gitignore`；不得把 90 MB 左右的 node.exe 直接提交进 Git。
- [ ] electron-builder 将 staging 复制到 `resources/app/tools/node/`。
- [ ] 打包测试断言包内 Node 存在、不是符号链接、版本符合 manifest。

**Gate:** 包内执行 `tools/node/node.exe --version` exit 0，且版本与 manifest 完全一致。

---

## Task 4：重写 Playwright 运行时解析边界

**Files:**

- `desktop/services/runtime-diagnostics-service.js`
- `desktop/runtime-config.js`
- `scripts/config.js`
- `src/core/playwright.js`
- `desktop/services/desktop-task-service.js`
- `desktop/worker/run-task.js`
- `tests/runtime-diagnostics.test.js`
- desktop task tests

- [ ] diagnostics 同时解析 bundled Node、bundled CLI 和浏览器通道。
- [ ] 在加载 `src/core/playwright.js` 前设置经过验证的 `AUTO_PUBLISH_NODE_EXEC_PATH` 和 `PLAYWRIGHT_CLI_JS`。
- [ ] `nodeExecPath()` 打包模式只接受已验证的标准 Node，不再回退 `process.execPath`。
- [ ] `scripts/config.js` 实际读取 `BROWSER_CHANNEL`，默认 `msedge`；不能继续硬编码后忽略应用配置。
- [ ] `createPlaywrightRuntime` 使用 `execFile(nodeExe, [cliJs, ...args])`，禁止拼接 shell 命令。
- [ ] `closeBrowserSessions()` 改用同一 resolver 和 `execFile` 参数数组，移除 `where node` 和字符串命令。
- [ ] 主进程、worker、暂停/停止、daemon close 使用完全相同的 Node/CLI 路径。
- [ ] 错误保留稳定类别：Node 缺失、CLI 缺失、浏览器通道缺失、session 未开、命令超时、命令失败。
- [ ] Renderer 只获得安全错误码和操作建议，不暴露绝对安装路径、环境变量值或 daemon stderr 全文。

**Gate:** 清空 PATH、清空所有工具环境变量后，包内 runtime 的 `list` 命令仍 exit 0。

---

## Task 5：建立真正能拦截坏包的反馈环

**Files:**

- Create: `scripts/verify-packaged-playwright-runtime.js`
- Modify: `scripts/verify-alpha-package.js`
- Modify: `scripts/verify.js`
- Modify: `tests/desktop-packaging.test.js`
- Create: `tests/packaged-playwright-runtime.test.js`

### 5.1 静态包检查

- [ ] Node、CLI、Playwright 依赖和许可证均存在。
- [ ] 包中不存在 `.env`、runtime config、AI key、input、published、data、logs、profile、state、Cookie。
- [ ] 包中不存在对 `C:\Users\violet`、`.codex`、全局 npm 或项目绝对路径的引用。

### 5.2 无开发环境执行检查

验证脚本必须：

1. 把 PATH 缩减到 Windows 系统目录；
2. 清空 `PLAYWRIGHT_CLI_JS`、`AUTO_PUBLISH_NODE_EXEC_PATH` 等覆盖；
3. 使用包内 Node 执行包内 CLI `--help`；
4. 运行隔离 session 的 `list`；
5. 可选 browser smoke 模式执行 `open about:blank --browser=msedge -> list -> close`；
6. 使用临时 profile/daemon/state，并在结束后清理。

目标命令：

```powershell
node scripts/verify-packaged-playwright-runtime.js `
  release-alpha\win-unpacked\resources\app `
  --browser-smoke
```

**Red-capable requirement:** 从包中移走 Node 或 CLI 任一项，测试必须稳定失败；恢复后稳定通过。

### 5.3 worker 与退出清理检查

- [ ] 从打包目录启动 snapshot worker，证明 worker 不依赖开发机 Node。
- [ ] 打开并关闭 doubao/lieju/toutiao 隔离 session，证明 session 路径互不覆盖。
- [ ] 应用退出时 daemon 被关闭，profile 被保留，临时 session 文件不进入安装目录。

---

## Task 6：增加安装后环境自检和用户可操作提示

**Files:**

- Settings/runtime diagnostics UI
- preload and IPC boundary if a new probe is needed
- runtime diagnostics service
- docs

- [ ] 设置页展示 Node、Playwright CLI、Edge/Chrome、MarkItDown、Hepan Python 的独立状态。
- [ ] 增加“运行浏览器自检”，只打开临时 `about:blank` session 并立即关闭，不访问真实业务网站。
- [ ] Playwright 不可用时，在点击登录、采集或平台投稿前阻止操作并给出固定中文建议。
- [ ] Edge 缺失时提示安装 Edge 或在应用级设置中选择可用 Chrome channel。
- [ ] 内置 CLI/Node 正常时不再要求普通用户编辑 `runtime-tools.json`。
- [ ] 高级外部覆盖必须位于应用级配置，不从客户内容库读取任意可执行路径。

---

## Task 7：统一开发版与安装版应用身份

**Problem:** 当前开发脚本把 Electron 入口指向 `desktop/`，使用 `desktop/package.json` 的 `auto-publish-desktop` 身份；安装包使用根 `package.json` 的 `auto-publish` 身份，导致两套 `%APPDATA%` 和 workspace-location。

**Files:**

- `scripts/desktop.cmd`
- root `package.json`
- `desktop/package.json`（删除或只保留非身份用途）
- `desktop/main.js`
- workspace location/config migration tests

- [ ] 选定唯一稳定应用名和 appId，开发版与安装版都使用它。
- [ ] 开发脚本从项目根启动 Electron，不再因入口目录改变 userData 名称。
- [ ] 若 canonical 配置不存在，提供一次性、显式确认的旧配置导入；不得静默覆盖已存在配置。
- [ ] workspace-location、runtime-config、AI provider config 的 owner 必须一致。
- [ ] 新电脑安装、开发启动、升级安装均验证同一个 userData 目录。

---

## Task 8：补迁仍留在源码目录的业务与运行数据

本任务只处理 `F:\官媒投稿\auto—publish` 内的遗留，不处理它同级的迁移目录本身。

### 8.1 必须补迁的数据

| 旧路径 | 新归属 | 当前状态 |
| --- | --- | --- |
| `data/media-resources.json` | `<content>/.autopublish/data/` | 未迁移，约 11.9 MB |
| `data/media-pool.json` | `<content>/.autopublish/data/` | 未迁移 |
| `data/media-drafts.json` | `<content>/.autopublish/data/` | 未迁移 |
| `data/submission-orders.jsonl` | `<content>/.autopublish/data/` 或明确的 records 目录 | 未迁移 |
| `input/**` | `<content>/.autopublish/input/**` | 未迁移，待投稿业务数据 |
| `published/**` | `<content>/.autopublish/published/**` | 未迁移，历史发布副本 |
| source `.env` 中允许的运行配置 | canonical `%APPDATA%/.../runtime-config.json` | 现有迁移输出未接入实际 app identity |

### 8.2 浏览器 profile 的正确映射

旧 `work/playwright-cli` 不能整体复制到无消费者的 `browser-profile/playwright-cli`。按当前 runtime 期望映射：

```text
work/playwright-cli/profiles/doubao  -> %LOCALAPPDATA%/AutoPublish/browser/doubao
work/playwright-cli/profiles/lieju   -> %LOCALAPPDATA%/AutoPublish/browser/profiles/lieju
work/playwright-cli/profiles/toutiao -> %LOCALAPPDATA%/AutoPublish/browser/profiles/toutiao
work/playwright-cli/state            -> %LOCALAPPDATA%/AutoPublish/browser/state
work/playwright-cli/sessions         -> 不迁移，停止应用后重建
```

- [ ] 迁移前关闭应用和所有 Edge/Playwright daemon。
- [ ] dry-run 报告目标冲突、文件数、字节数和哈希。
- [ ] profile 目标非空时禁止覆盖，必须选择合并、保留新 profile 或重新登录。
- [ ] 迁移后分别验证豆包、列举、头条登录状态；无法验证时保留旧 profile 备份。
- [ ] logs 移到 `%LOCALAPPDATA%/AutoPublish/logs`；tmp 不迁移。

### 8.3 迁移凭证

- [ ] manifest 和 completion marker 使用真正的原子写/可恢复 journal。
- [ ] manifest 保存源、目标、文件数、字节数、SHA-256、执行版本和 commit SHA，不保存密钥值。
- [ ] 目标业务文件后续正常编辑时允许哈希变化，但源删除审批必须记录“迁移时匹配、删除时已发生合法业务更新”的证据。
- [ ] 源数据不由迁移命令自动删除。

---

## Task 9：收口 `F:\官媒投稿\auto—publish`

### 9.1 最终应保留的源码结构

```text
auto—publish/
  .env.example
  .gitignore
  config/
  desktop/
  docs/
  media-workbench/
  resources/
  scripts/
  src/
  tests/
  electron-builder.alpha.yml
  package.json
  package-lock.json
```

`media-workbench/` 内保留源码、配置和 lockfile；`node_modules` 与 `dist` 不属于源码。

### 9.2 数据验证后删除的旧目录

- `clients/`
- `generated/`
- `research/`
- `templates/`
- `data/`
- `input/`
- `published/`
- `failed/`
- `logs/`
- `tmp/`
- `work/`
- `workspace/`
- source `.env`

删除条件：目录为空，或全部文件已进入经校验的迁移 manifest，应用已从新位置成功读写，并有可恢复备份。

### 9.3 可重建产物

| 路径 | 当前约占用 | 恢复方式 |
| --- | ---: | --- |
| `release-alpha/` | 421.78 MB | `npm run pack:alpha` / `npm run dist:alpha` |
| `node_modules/` | 347.58 MB | `npm ci` |
| `media-workbench/node_modules/` | 134.41 MB | `npm --prefix media-workbench ci` |
| `media-workbench/dist/` | 0.55 MB | `npm run build:renderer` |

这些目录可在交付安装包、保存构建日志并确认可重建后删除。不要提交到 Git。

### 9.4 阻止回流

- [ ] 删除 `data/.gitkeep`、`input/.gitkeep` 等会重新制造旧运行目录的占位文件。
- [ ] 所有 production service 必须只使用注入后的 content/local/config paths。
- [ ] 测试使用临时目录，禁止在源码根创建 logs/tmp/work。
- [ ] 增加测试：运行 `npm test` 和 `npm run verify` 后，源码根不得新增业务/运行目录。
- [ ] `.gitignore` 继续忽略依赖、dist、release 和本地 `.env`，但不能用 ignore 掩盖仍在源码根写业务数据的问题。

---

## Task 10：新电脑安装验收

必须使用 Windows Sandbox、干净虚拟机或没有以下内容的真实电脑：

- 未安装 Node.js；
- 未安装全局 npm `playwright-cli`；
- 没有 Codex 目录和插件缓存；
- 没有开发仓库；
- PATH 只有系统默认项；
- 没有旧 AutoPublish userData。

### 安装前检查

- [ ] 安装器来自干净 commit，记录 SHA-256、版本、commit SHA。
- [ ] Windows Defender/SmartScreen 结果已记录。
- [ ] 安装目录中存在 bundled Node、CLI 和依赖许可证。

### 首次启动

- [ ] 应用要求选择内容库，不在安装目录创建业务数据。
- [ ] `%APPDATA%` 只保存应用级配置；`%LOCALAPPDATA%` 保存日志、cache、tmp、browser profile。
- [ ] 设置页 Playwright Node/CLI 为 bundled，浏览器 channel 为 msedge 或用户选择值。
- [ ] “运行浏览器自检”成功且关闭后无残留 daemon。

### 业务烟雾测试

- [ ] 打开豆包登录页，登录状态保存到 local state；重启应用后可复用。
- [ ] 点击登录状态刷新不会出现 `PLAYWRIGHT_UNAVAILABLE`、`PLAYWRIGHT_EXEC_FAILED` 或无解释的 `SESSION_NOT_OPEN`。
- [ ] 用测试账号验证 lieju/toutiao session 隔离，不执行真实发布。
- [ ] 退出应用后所有 daemon 关闭，内容库和安装目录无 profile/cache 写入。
- [ ] Edge 缺失场景返回明确 `BROWSER_CHANNEL_UNAVAILABLE`，不显示泛化 Playwright error。

### 卸载/升级

- [ ] 卸载不删除内容库和用户 profile，除非用户明确选择。
- [ ] 覆盖安装后 bundled Node/CLI 版本与应用版本一致。
- [ ] 旧版本 daemon 不残留，不使用旧安装目录工具路径。

---

## 4. 全量验证命令

```powershell
cd F:\官媒投稿\auto—publish

npm ci
npm --prefix media-workbench ci
npm test
npm --prefix media-workbench run lint
npm run build:renderer
npm run verify
npm audit --omit=dev

npm run pack:alpha
node scripts/verify-alpha-package.js release-alpha\win-unpacked\resources\app
node scripts/verify-packaged-playwright-runtime.js release-alpha\win-unpacked\resources\app --browser-smoke

npm run dist:alpha
```

**Expected:**

- 全部 exit 0；
- 隔离 PATH 下 bundled Node/CLI 可运行；
- msedge session 可打开、列出、关闭；
- 安装包不包含业务数据、密钥、日志或 profile；
- 测试和构建不在源码目录重新创建旧业务/运行目录；
- NSIS 安装后的实际 smoke checklist 全部通过。

---

## 5. 停止条件

遇到以下任一情况立即停止，不进入删除或发布：

- 包内探针仍依赖 PATH、全局 npm、Codex 或开发仓库；
- bundled Node/CLI 版本或 SHA-256 不确定；
- Edge/Chrome 自检不能稳定关闭 session；
- 远端成功、本地归档失败仍可能再次投稿；
- 永久删除中断仍不能恢复；
- 迁移 manifest 不是原子/可恢复写入；
- `data/input/published/work/.env` 任一项没有明确目标和校验记录；
- 新内容库、canonical app config 或 active local state 尚未验证；
- 工作区仍把修复、真实业务删除和打包产物混在同一提交；
- 新电脑安装测试没有完成。

## 6. 完成定义

只有同时满足以下条件才算完成：

1. 无开发环境的新电脑安装后 Playwright 自检和隔离 session 通过；
2. 安装包完全自带 CLI 和标准 Node，不依赖全局工具；
3. 所有遗留 P1/P2 已修复并有回归测试；
4. 开发版与安装版使用同一 app identity 和配置目录；
5. 源码目录内的业务数据和运行状态全部迁出并验证；
6. `F:\官媒投稿\auto—publish` 最终只保留源码、文档、只读资源和构建配置；
7. 正式安装包来自干净、可追踪的 commit，并通过隔离包探针和新电脑安装验收。
