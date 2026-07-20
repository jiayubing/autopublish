# AutoPublish 代码优化与测试收敛计划

**目标：** 在不改变现有业务行为、不接触真实客户数据和真实投稿接口的前提下，优先消除安全与性能风险，再将超宽接口和重复实现收敛为可测试的深模块，同时降低测试套件的重复、脆弱性和维护成本。

**基线：** 计划编写时 HEAD 为 `4f95ae1`。根测试共 846 项，839 通过、0 失败、7 跳过；认证服务 16 项全部通过；Renderer `tsc --noEmit` 通过。显式使用 PowerShell 7.6.3 (`pwsh`) 重跑后仍然是相同的 7 个符号链接测试因 `EPERM` 跳过。

**执行顺序：** 建立基线与测试分类 -> 修复生产安全门槛 -> 优化发布记录查询 -> 收敛重复实现与共享契约 -> 深化投稿/平台模块 -> 收敛 Renderer 接口 -> 精简测试 -> 建立 CI 和工程规范 -> 性能验收。

---

## 一、范围与明确约束

### 纳入本计划

- Electron 依赖升级、正式包签名和打包完整性。
- 发布账本、投稿批次和注意事项查询的同步扫描与重复写盘。
- `electron-api.ts`、投稿协调、平台工作台和主进程组合根的职责收敛。
- 平行实现、跨层错误文案、路径结构和平台默认值的重复。
- TypeScript 严格模式、Lint、格式化、CI 和测试分层。
- 800 多项测试的分类、替换、合并和删除。
- Windows 符号链接测试的执行环境与 CI 策略。

### 不纳入本计划

- **付费媒体服务商提供的 HTTP 地址不作为缺陷处理。** 这是已接受的外部对接约束，本计划不要求改成 HTTPS，也不修改当前服务地址或连接流程。
- 不修改真实 `.env`、API Key、Cookie、客户资料、文章、模板、投稿队列、发布记录和浏览器 profile。
- 不在优化过程中调用真实付费 AI、真实豆包采集或真实投稿接口。
- 不以“测试数量越少越好”为目标，也不设置必须降到某个固定数字的指标。

### 不可变业务门槛

- 重复投稿保护、`uncertain` 状态、发布尝试历史和文章回收事务语义不得弱化。
- 工作区外路径、符号链接逃逸、损坏 JSON 和原子写入失败必须继续 fail closed。
- Renderer 不得获得任意文件路径、Node.js、Electron 对象或未过滤的内部错误。
- 认证会话、设备授权和刷新令牌轮换行为保持兼容。

---

## 二、测试数量判断与精简原则

### 结论

846 项测试本身不算异常。项目同时覆盖 Electron、React、文件事务、四个平台适配器、内容生成、发布状态和独立认证服务，数量大是合理结果。当前真正的问题不是绝对数量，而是以下三类维护浪费：

1. 同一行为在浅模块、调用方和源码字符串断言中重复验证。
2. 测试读取源代码并匹配实现文本，重构实现时容易产生无业务价值的失败。
3. 四个真实 Renderer 测试文件各自执行一次 Vite build、启动浏览器和测试服务器。

测试精简采用“**替换，不叠加**”原则：新的深模块接口测试建立后，删除旧浅模块测试；新的行为测试覆盖后，删除对应源码字符串断言。不能只增加新测试而长期保留旧测试。

### 必须保留的测试

- 发布状态机、重复投稿、尝试重绑、`uncertain` 和并发保护。
- 文章 JSON/Markdown 双文件事务、回滚、回收和永久删除。
- 工作区隔离、路径穿越、符号链接逃逸和私有数据不入安装包。
- 认证密码哈希、设备名额、授权到期、刷新令牌轮换和重放检测。
- 平台远端结果为成功、明确失败和结果不确定的分支。
- 数据迁移 dry-run、冲突、幂等、恢复和旧版本兼容。
- Electron `sandbox`、`contextIsolation`、导航、权限和认证 IPC。
- 真实 Renderer 的关键用户流程和响应式布局烟雾测试。

### 优先合并或删除的测试

1. **源码字符串断言。** 优先审查：
   - `tests/react-workbench-regression.test.js`
   - `tests/auth-gate.test.js`
   - `tests/content-workbench-regression.test.js`
   - `tests/architecture-seams.test.js`
   - `tests/desktop-packaging.test.js` 中仅检查字符串存在、顺序或文件名的断言
   - `tests/renderer-*.test.js` 中已经被真实浏览器行为覆盖的源码读取断言

   处理规则：能由 TypeScript、模块导入、IPC 注册结果、打包清单或真实交互验证的，先补行为测试，再删除字符串断言。架构依赖方向可保留少量自动化规则，但应基于模块依赖图或显式导出，而不是匹配函数文本。

2. **重复的 Renderer 构建。** 以下文件当前各自构建 Renderer：
   - `tests/renderer-history-editor-flow.test.js`
   - `tests/renderer-residue-cleanup-flow.test.js`
   - `tests/renderer-question-editor-session.test.js`
   - `tests/renderer-responsive-layout.test.js`

   建立共享测试入口，在整组浏览器测试前只构建一次、只启动一次 Vite server，并复用一个 Browser。每个测试仍使用独立 BrowserContext，避免状态串扰。

3. **表格化重复边界。** 对同一验证器的空值、非法字符、保留名称、绝对路径、越界路径等用例，改成 table-driven test；保留一个成功用例和每一种不同错误语义，不为同一分支保留多份近似测试。

4. **退休实现测试。** 删除 `publication-status.js` 平行实现后，其测试改为直接执行生产 TS 模块；不得保留一份只为 Node 测试存在的生产逻辑副本。

5. **深模块建立后的旧单元测试。** 投稿协调、发布查询和平台浏览器生命周期形成新接口后，只保留接口可观察结果测试。若旧测试必须读取内部状态或 mock 私有函数才能成立，则视为测试越过 seam，迁移后删除。

### 删除门槛

每个待删测试必须满足以下至少一项，并在提交说明中记录替代覆盖位置：

- 与另一测试覆盖完全相同的输入、分支和可观察结果。
- 只验证实现字符串、私有函数或文件布局，且已有行为/契约测试。
- 对应实现已经删除或不在生产路径。
- 已被更高层接口测试覆盖，且旧测试会阻碍内部重构。
- 只重复验证语言、框架或第三方库自身保证。

以下理由不能单独作为删除依据：测试很长、测试运行慢、最近没有失败、看起来不容易出问题、测试数量超过 800。

### 测试收敛目标

- 根测试全量运行时间在当前机器上稳定低于 10 秒，或相对本计划基线下降至少 25%。
- Renderer production build 在一次根测试中最多执行一次。
- 不再保留 JS/TS 双份业务实现供测试分别执行。
- 源码字符串断言数量减少至少 70%，剩余项仅用于无法通过行为观察的打包/安全不变量。
- 测试数量允许自然下降，预估可删除或合并 100～200 项；最终数字服从分支覆盖和业务风险，不作为验收门槛。

---

## 三、PowerShell 与 7 个符号链接跳过项

### 已验证结论

- 当前执行环境已经是 PowerShell 7.6.3 Core，即 `pwsh`。
- 再通过 `pwsh -NoProfile` 显式运行 `npm test`，结果仍为 846 tests、839 pass、7 skip。
- 跳过原因全部是 Node.js `fs.symlinkSync` 返回 `EPERM`。
- 因此换用最新版 PowerShell不会解决问题。PowerShell 只是启动 Node；真正决定符号链接是否可创建的是 Windows 权限、开发者模式和当前进程令牌。

### 处理方案

1. 开发机优先开启 Windows“开发者模式”，然后重新运行测试；通常可以让普通用户创建文件符号链接。
2. 若公司安全策略不允许开发者模式，则在提升权限的专用测试终端中运行 `npm run test:links`，日常普通权限测试仍允许明确跳过。
3. CI 设置两个任务：
   - Windows 普通权限：运行全量业务和打包测试，验证真实 Windows 路径语义。
   - Windows 开发者模式/具备符号链接权限，或 Linux：强制运行链接安全测试，任何 skip 都视为失败。
4. 新增 `scripts/verify-link-capability.js`，只探测一次链接能力，并将结果传给链接测试，避免每个文件各自用不同文案跳过。
5. 新增 `test:links`：若环境没有链接能力则返回失败，而不是 skip，用于 CI 安全门槛。

目录 junction 不能完全替代文件 symlink。目录测试可以使用 junction 降低权限需求，但配置文件、marker、材料文件等测试仍必须覆盖真实文件 symlink。

---

## 四、Phase 0：建立可重复基线与测试清单

**Files:**

- Create: `scripts/test-inventory.js`
- Create: `docs/test-suite-inventory.md`
- Modify: `package.json`

- [ ] 记录每个测试文件的测试数量、运行时间、是否构建 Renderer、是否启动浏览器、是否读取生产源码。
- [ ] 为每个测试标记层级：`domain`、`store`、`ipc`、`renderer`、`packaging`、`migration`、`security`。
- [ ] 为每个测试标记主要业务不变量；没有明确不变量的进入删除候选。
- [ ] 输出重复测试名称和相同 fixture/断言组合，但不自动删除。
- [ ] 记录当前全量测试、认证测试、类型检查、build、audit 和包体积基线。

**Verification:**

```powershell
node scripts/test-inventory.js
npm test
npm --prefix auth-server test
npm --prefix media-workbench run lint
npm run build:renderer
```

**Gate:** 清单覆盖全部测试文件，且没有执行真实外部服务。

---

## 五、Phase 1：生产安全与发布门槛

**Files:**

- Modify: `package.json`, `package-lock.json`
- Modify: `electron-builder.alpha.yml` 或新增 production builder 配置
- Modify: Electron 安全与打包测试

- [ ] 将 Electron 升级到当前受支持稳定版本，消除 `npm audit` 报告的高危直接依赖。
- [ ] 分阶段回归 preload、IPC、BrowserWindow、safeStorage、Playwright 和安装包启动。
- [ ] Alpha 配置可继续明确标记未签名；正式生产配置必须启用代码签名。
- [ ] 正式包启用 ASAR，只通过 `asarUnpack` 解包确实需要通过文件路径执行的 Python/Node 工具。
- [ ] 保持 CSP、sandbox、导航白名单、权限拒绝和认证 IPC 测试。
- [ ] 付费媒体 HTTP 地址保持现状，不在本阶段修改。

**Verification:**

```powershell
npm audit
npm test
npm run verify
npm run pack:alpha
```

**Pass:** 无已知高危直接依赖；Alpha 与 production 安全属性明确分离；安装包不包含业务数据或密钥。

---

## 六、Phase 2：发布账本索引与批次单次写入

**Files:**

- Modify: `src/publication/publication-ledger-store.js`
- Modify: `src/content/submission-batch-store.js`
- Modify: `desktop/services/content-submission-service.js`
- Modify: `desktop/services/article-attention-query.js`
- Create: ledger/batch performance and regression tests

- [ ] 在 publication ledger 初始化时一次扫描，建立 `publicationId -> filename` 与文章/目标索引。
- [ ] create/save/migrate 后同步更新索引；发现目录 revision 变化时重建，不信任陈旧索引。
- [ ] `get(publicationId)` 不再每次执行全目录扫描。
- [ ] 投稿批次对账一次加载所需发布记录快照，不为每个 item 重复扫描账本。
- [ ] `reconcile` 在内存完成全部 transition，校验通过后只原子写入一次 batch JSON。
- [ ] 注意事项查询按 workspace revision 缓存只读快照；数据失效事件到达后再重建。
- [ ] 保留损坏记录、符号链接、目录替换和并发写入的 fail-closed 行为。

**Performance fixture:** 100、1000、10000 个 publication records，每个规模分别验证 `get`、`list`、批次对账和注意事项查询。

**Pass:** `get` 平均不随总记录数线性扫描目录；一次批次对账最多写一次批次文件；主进程查询没有明显长任务。

---

## 七、Phase 3：收敛重复实现和共享契约

**Files:**

- Remove: `media-workbench/src/publication-status.js`
- Modify: `media-workbench/src/publication-status.ts`
- Modify: `tests/renderer-publication-history.test.js`
- Create: shared auth error/config/path contract modules as required
- Modify: `desktop/workspace-paths.js`, `desktop/storage-paths.js`

- [ ] 生产代码和测试统一执行同一份 publication status 实现。
- [ ] 集中认证错误码与默认中文文案，主进程和 Renderer 从同一契约派生。
- [ ] `createStoragePaths` 复用唯一的 portable content path builder，不再平行列出目录。
- [ ] 平台默认值由主进程状态返回给 Renderer；UI 不再复制后端默认地址、分类 ID 和间隔。
- [ ] 安全白名单、业务状态枚举和确实属于不同部署层的配置保持显式，不做无意义配置化。

**Pass:** 克隆扫描不再发现整段平行业务实现；测试不再消费与生产不同的逻辑文件。

---

## 八、Phase 4：深化投稿与平台模块

### 4.1 投稿模块

将现有投稿协调实现收敛为四个内部模块：

- `SubmissionPreparation`：预览、资格判断、重复保护和队列写入。
- `SubmissionBatch`：批次创建、读取、状态转换和对账。
- `SubmissionCleanup`：失败、取消、已发布本地副本和回收残留清理。
- `FailedPublicationRetry`：失败重试预览、确认和 attempt rebind。

外部 IPC 接口保持兼容；调用方不直接学习内部 store、sidecar、ledger 和回滚顺序。每个模块通过少量命令返回完整结果，实现深模块和变化的局部性。

### 4.2 平台浏览器 seam

头条和猎聚已经是两个真实 Adapter，适合建立共享 seam：

- 共享 daemon 启动、状态加载/保存、关闭、登录恢复和标准结果分类。
- 平台 Adapter 只负责 URL、页面定位、表单填写、提交和成功证据解析。
- 保留每个平台独立的 DOM fixture 和远端结果测试，不把平台差异硬塞进共享实现。

### 4.3 主进程组合根

- 抽取 `AuthenticatedRuntime`，接口只保留 `start(bootstrapState)`、`dispose()` 和 `getState()`。
- `main.js` 只负责 Electron 生命周期、窗口安全策略、认证激活和运行时替换。
- 移除可避免的全局可变模块实例及隐式 require 顺序约束。

**Testing:** 新模块接口测试通过后，删除需要 mock 私有函数或断言内部调用顺序的旧浅模块测试。

---

## 九、Phase 5：收敛 Renderer 接口与包体积

**Files:**

- Split: `media-workbench/src/electron-api.ts`
- Modify: `media-workbench/src/App.tsx`
- Create: domain-specific Renderer bridge modules
- Modify: Vite configuration if needed

- [ ] 按 `auth`、`workspace`、`content`、`publication`、`platform`、`settings` 拆分 Renderer bridge。
- [ ] 每个页面只导入自己需要的接口；统一的 facade 仅用于兼容，后续逐步移除。
- [ ] 类型、IPC envelope 解包和错误映射分别只实现一次。
- [ ] 设置、平台、内容工作台采用动态导入，避免初始包加载全部页面。
- [ ] 开发 fixture 与生产接口彻底隔离，生产构建不能通过 localStorage 模拟业务数据。

**Pass:** `electron-api.ts` 不再是 1600 行、125 导出函数的单文件接口；首屏 bundle 不再触发 500 KB warning，或有记录充分的例外。

---

## 十、Phase 6：实施测试收敛

### 6.1 共享真实 Renderer 测试运行器

- Create: `tests/helpers/renderer-harness.js`
- Create: 一个聚合的 Renderer browser test 入口，或使用 Node test global setup
- Modify: 四个重复 build/browser server 的测试文件

- [ ] 测试进程启动时只执行一次 production build。
- [ ] 只启动一个静态服务器和一个 Browser。
- [ ] 每个 suite 创建独立 BrowserContext 和独立 fixture state。
- [ ] 失败时保存当前页面截图和控制台日志，成功时不保留生成物。

### 6.2 替换源码字符串测试

- AuthGate 使用真实渲染测试证明未认证时不挂载工作区，而不是匹配源码中的 `authenticated` 字符串。
- IPC surface 通过注册后的 channel 集合验证，而不是搜索 preload 文本。
- Renderer API 通过 TypeScript 编译和实际调用 fixture 验证，而不是搜索函数名。
- 打包边界通过解析 builder 配置和检查实际 unpacked artifact 验证，减少重复 `includes`。
- 架构规则只保留依赖方向和禁止导入等不可由用户行为观察的不变量。

### 6.3 删除旧测试

- 每完成一个深模块迁移，列出新接口测试覆盖的旧测试。
- 一次提交只删除同一模块的冗余测试，提交说明记录“删除原因 -> 替代测试”。
- 删除后运行相关测试、根全量测试和 mutation spot-check；若一个明显错误无法被剩余测试捕获，恢复或补强测试。

**Pass:** 运行时间达标；所有高风险不变量仍有唯一、清晰、可定位的测试所有者。

---

## 十一、Phase 7：工程规范与 CI

**Files:**

- Modify: `media-workbench/tsconfig.json`
- Create: ESLint/Prettier/EditorConfig configuration
- Modify: root and Renderer package scripts
- Create: CI workflow

- [ ] 分目录渐进开启 TypeScript `strict`；先处理新拆出的 bridge 和共享契约。
- [ ] ESLint 覆盖 Renderer TS/TSX 和根 JS，禁止未处理 Promise、危险 Electron 配置和无说明空 catch。
- [ ] Prettier 只做机械格式化，不与业务重构混在一个提交。
- [ ] 将 Windows 项目中的 `rm -rf` 改为跨平台 Node 清理脚本。
- [ ] CI 使用锁文件安装，运行 root tests、auth tests、typecheck、build、audit 和 package smoke。
- [ ] 链接安全测试设置独立强制任务，禁止静默 skip。

---

## 十二、建议提交顺序

1. `chore(test): inventory test ownership and runtime`
2. `build(electron): upgrade runtime and define production signing`
3. `perf(publication): index ledger records and batch reconciliation`
4. `refactor(contract): remove duplicate publication and auth contracts`
5. `refactor(submission): deepen submission workflow modules`
6. `refactor(platform): share browser session lifecycle`
7. `refactor(desktop): extract authenticated runtime`
8. `refactor(renderer): split desktop bridge and lazy-load workbenches`
9. `test(renderer): share browser harness and single build`
10. `test: replace source assertions and remove redundant coverage`
11. `chore(quality): enable strict checks and CI gates`

每个提交必须可独立回滚。性能优化、模块重构、测试删除和格式化不得合并为一个大提交。

---

## 十三、最终验收清单

- [ ] 根测试、认证测试和 Renderer typecheck 全部通过。
- [ ] 具备链接权限的 CI 中 7 个链接测试全部执行，0 skip。
- [ ] 普通开发机缺少链接权限时给出一条明确能力提示，而不是七条分散 skip。
- [ ] Electron 无已知高危直接依赖；production 包完成签名和完整性配置。
- [ ] 付费媒体 HTTP 对接保持兼容，未被本计划修改。
- [ ] publication lookup 不再逐次全目录扫描，batch reconcile 单次写盘。
- [ ] 没有 JS/TS 双份业务逻辑；共享契约只有一个事实来源。
- [ ] 投稿、平台和 Renderer bridge 的外部接口缩小，内部实现可独立替换和测试。
- [ ] Renderer 测试只构建一次，测试运行时间达到目标。
- [ ] 所有删除测试都有替代覆盖记录，没有只为降低数量而删除的高风险测试。
- [ ] `git status --short` 只包含本次计划内文件，真实工作区数据未被修改。

