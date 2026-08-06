# AutoPublish Agent 工作约定

默认使用中文沟通、写计划和交接；代码标识、命令、协议字段及已有英文文档保持原语言。

## 作用域与真源

本文件是仓库级 agent 指令真源，适用于整个仓库。若以后在子目录增加更具体的 `AGENTS.md` 或 `AGENTS.override.md`，只允许补充该子树的局部规则，不得复制或改写本文件的业务真源。

事实冲突时按以下顺序判断：

1. 当前源码、测试、schema、脚本、CI、运行证据与当前 Git 状态。
2. 本文件。
3. `CONTEXT.md`：AutoPublish 业务词汇与禁用称谓的唯一真源。
4. `ARTICLE-LIFECYCLE-AND-SUBMISSION-SPEC.md`：文章生命周期、投稿规则、测试决策和非目标的目标规格。
5. `auto—publish/README.md`：工程入口、目录边界和人工控制操作。
6. 当前仍有效的其他文档与 Git 历史。

`ARTICLE-LIFECYCLE-GOAL-ORCHESTRATION.md` 是当前文章生命周期重构的执行编排协议；只有任务明确进入该 Goal 时才应用。它不得覆盖 `CONTEXT.md` 和产品规格中的业务语义，也不是一般开发任务的默认流程。历史分支计划、handoff、归档材料和 pre-refactor 文档只能作为历史证据。

源码与目标规格暂时不一致时，先判断它是否是当前重构已明确要消除的旧残影。若是，按规格收敛并补测试；若不是，报告冲突、影响和推荐方向，等待用户确认，不得自行维护双路线。

## 产品边界

AutoPublish 是本地 Electron 内容运营应用，负责客户调研、内容生成、投稿准备、普通平台工作流和网站媒体付费投稿。用户选择的可迁移内容库必须与应用配置、凭据、浏览器状态、日志、缓存和安装目录分离。

长期边界如下：

- 生成成功的完整文章直接待投稿，不引入人工审核、待审核、已审核或批量审核兼容入口。
- 一篇文章同时最多一个活动发布目标；入队后冻结，首次明确发布成功后永久只读，不再次入队、改投或回收。
- 普通平台接受投稿即产生发布事实，不新增公开页面轮询、审核等待或可见性回查。
- 网站媒体与普通平台共享文章身份和生命周期投影，但使用独立应用服务与执行策略；网站媒体的订单、价格、付费确认和人工核对规则不得污染普通平台队列。
- 超时、断线、缺少订单号等不确定结果不得自动重试，必须冻结文章并进入人工核对。
- 不实现第三方自媒体；不支持同一文章同时投多个目标；不删除发布、订单和最小审计证据。
- 在真实低价媒体验证前，不实现或承诺网站媒体本地图片传输方式、图片大小和最大请求体。
- `auto—publish/auth-server/` 是独立管理和部署的鉴权服务合同，不属于 Electron 安装包，也不得接收客户内容、文章、模板、队列、Cookie 或本地内容库路径。

用户否定的旧概念必须同时从代码、类型、测试、fixture、文档和 UI 文案中移除，禁止改名保留或增加无意义兼容分支。

## 仓库结构与 Owner Map

- `CONTEXT.md`：产品术语、用户对象和业务概念 owner；新增或改名业务概念必须先更新这里。
- `ARTICLE-LIFECYCLE-AND-SUBMISSION-SPEC.md`：文章分类、编辑权限、活动目标、队列、订单、不确定结果、回收和发布后的目标行为 owner。
- `auto—publish/src/domain/`：跨入口稳定身份、DTO、发布目标、publisher contract 和安全错误合同 owner。
- `auto—publish/src/content/`：客户资料、问题、调研、模板、生成批次、文章内容与文件持久化 owner。文章六阶段分类和操作权限集中在 `article-lifecycle-projection.js`，UI、IPC 和 service 不得复制判断。
- `auto—publish/src/infrastructure/operational-store/operational-store.js`：投稿、发布、订单、恢复等运行事实的公共持久化门面。`internal/` 是实现细节，外部模块不得绕过门面直接依赖内部文件或 schema。
- `auto—publish/desktop/composition/`：运行时依赖装配 owner；`desktop/services/`：应用用例与跨 owner 编排；两者不得重新定义领域身份或供应商协议。
- `auto—publish/desktop/ipc/contracts/`：生产 IPC 的输入、输出、投影和 channel 合同 owner。`desktop/preload.js` 与 `media-workbench/src/bridge/` 只做受控暴露和类型化映射，不拥有业务语义。
- `auto—publish/media-workbench/src/features/`：renderer 用例协调与状态快照；`components/` 只渲染读模型、收集意图和展示错误。组件不得访问 `ipcRenderer`、主进程文件或自行推导生命周期。
- `auto—publish/src/platforms/`：普通平台、禾畔和网站媒体供应商协议 adapter owner，只负责传输、字段映射和供应商结果解析。业务状态、冻结、暂停、重试和人工核对属于应用层。
- `auto—publish/desktop/workspace-schema-gate.js`、workspace/runtime config 与 `src/infrastructure/workspace/`：内容库、应用配置和运行路径隔离边界。不要回退到历史固定根路径或把密钥写进内容库。
- `auto—publish/auth-server/src/domain/` 与 `auth-domain.js`：鉴权、设备、会话、权益和密码策略 owner；`auth-server/migrations/` 是 SQLite schema/migration owner；HTTP handler、CLI 和 Docker 只做 adapter。
- `.github/workflows/ci.yml` 与各 `package.json` scripts：自动化门禁和可执行命令真源。

当前没有独立的 UI token、设计稿或设计系统文档 owner。修改 UI 时以 `media-workbench/src/index.css`、现有组件和当前真实渲染为证据；涉及新的视觉体系时先向用户说明这一缺口，不要自行另起设计语言。

## 开始修改前

先完成只读审计：

- 确认仓库根、分支、`git status --short`、暂存区、ignored 产物和嵌套仓库；本仓库可能有用户正在进行的大量未提交改动。
- 读取与任务相关的真源、owner、调用方、消费者、测试和 CI gate；使用 `rg` 定位，不能凭旧记忆判断。
- 明确实际问题、唯一 owner、最小闭合调用链、最大回归风险和验证方式。
- 检查是否存在同职责模块、合同、状态机、store、migration 或 fixture；不要从 UI、IPC、prompt、脚本或临时 JSON 倒推核心业务。
- 给出一个推荐主线。只有会改变可见范围、成本、停机、迁移、数据、权限、供应商锁定或不可逆后果时才要求用户决策。

用户说“先看”“诊断”“不动代码”时保持只读。诊断任务只报告原因与证据，除非用户同时要求修复。

## 实现纪律

- 从 owner、合同、schema 或核心状态转换开始，再接 service、IPC、bridge 和 UI。跨层语义必须单一真源。
- adapter、handler、preload、bridge、组件、CLI 和 prompt 只能做映射、展示或接线，不得成为业务 owner。
- 禁止用散落 `if`、全局 flag、硬编码、`sleep`、mock 数据、固定健康值或静默吞错绕过架构问题。
- 可恢复失败必须使用项目既有结构化错误、稳定 code 和安全 metadata；不得向 renderer、日志或诊断产物泄露凭据、token、Cookie、原始请求头、数据库行、绝对敏感路径或供应商原始异常。
- 外部请求、正文、文件、批次、队列、重试、超时、并发和后台任务必须有明确上界、取消/暂停语义和恢复策略。不确定远端结果优先保真，不以自动重试换取表面成功。
- 配置与路径使用现有 config/store/path policy 显式下传。禁止新增硬编码密钥、生产地址、历史工作区路径或跨内容库全局可变状态。
- 修改合同、生命周期、配置、用户行为或产品语义时同步更新对应真源文档和测试；不要把一次性复盘混入长期真源。
- 修 bug 不顺手重构无关模块；但本轮触达的 owner、调用链、测试和文档必须闭合。没有证据的优化不进入本轮范围。

### Node / Electron / CommonJS

- 桌面主进程、service、domain 和测试以现有 CommonJS 风格为准；不要在未设计完整边界时混入新的模块体系。
- Electron 主进程入口是 `desktop/main.js`。运行时依赖经 composition 装配，资源与浏览器运行时路径经现有 resolver 解析；不得依赖开发机偶然存在的全局工具。
- preload 只暴露经过合同约束的最小 API。renderer 业务视图必须经 `media-workbench/src/bridge/` 和 feature 层访问能力，不得直接访问 Electron transport。
- `package-lock.json` 只随依赖变更更新。依赖安装、升级和 runtime-tools 准备会写状态，未经任务需要不要运行。

### React / TypeScript / Vite

- renderer 复用现有 feature/context、bridge、types、组件和 CSS 体系；不要在组件内建立平行业务 store 或复制服务端/主进程状态机。
- TypeScript 合同优先复用 `media-workbench/src/types/`、`contracts/` 与 bridge 返回类型；避免 `any`、未校验的类型断言和字符串 channel。
- UI 变化必须检查真实加载态、空态、错误态、禁用态、确认流程、窗口窄宽布局和键鼠交互。只通过类型检查不代表 UI 验收完成。
- `media-workbench/dist/` 是 Vite 生成物，不手改。

### 鉴权 / SQLite / Docker

- 桌面端只消费版本化鉴权合同；服务端权限、设备、会话和权益必须在 `auth-server` 的真实服务边界执行，不能只靠 renderer 或 IPC 隐藏。
- SQLite schema 只通过 `auth-server/migrations/*.sql` 和现有迁移/恢复工具演进；不得手改生产数据库、删除迁移历史或自动迁移历史 `auth.json`。
- 真实迁移、备份、恢复、完整性检查、管理员操作和部署必须使用明确批准的数据库路径与 operator 流程；密码不得进入命令参数、环境回显、shell 历史或日志。
- `auth-server` 与桌面应用使用不同运行基线：CI 中桌面为 Node 24，鉴权服务为 Node 22。不要因本机版本可运行而降低 CI 基线。

### 平台与外部服务

- 自动化测试只使用合成数据和内存 transport。不得访问真实普通平台账号、真实鉴权服务器、真实服务商、真实付费订单或生产数据库。
- 真实账号/TLS、Cloudflare/代理、发布、付费、取消、申诉、图片传输与外部 E2E 都是用户可见或可能收费的操作，执行前必须获得明确授权并记录证据。
- 供应商字段、HTTP 状态和错误不得直接泄漏到文章 UI；先映射为稳定应用结果。只有明确成功且有必需远端身份时才能建立发布或订单事实。
- `auto—publish/resources/hepan/vendor-pure/` 是随包提供的第三方 Python 依赖，不作为业务源码编辑；变更依赖必须走明确的依赖更新与打包验证流程。

## 测试与验收

所有命令默认从 `auto—publish/` 运行，除非命令明确使用 `--prefix`。先运行与改动风险最贴近的测试，再扩大到工具链和整套门禁。不得声称未运行的命令已通过。

常用入口：

```powershell
npm run test:discover
npm test
npm run test:desktop-core
npm run test:auth
npm run lint
npm run typecheck:renderer
npm run typecheck:bridge
npm run typecheck:main
npm run format:check
npm run build:renderer
npm run build:preload
```

按风险增加验证：

- 单模块/合同：优先 `node --test tests/<相关测试>.test.js`，测试外部可观察行为，不锁死私有函数和文件布局。
- 生命周期、IPC、媒体 transport、诊断、容量、迁移和 phase gate：使用 `package.json` 中对应的 `test:*` / `verify:*` script，并核对 `.github/workflows/ci.yml`。
- 鉴权服务：在 `auto—publish/auth-server/` 运行 `npm test`；健康、限流、迁移、备份恢复按对应脚本验证。
- UI：除 typecheck/build 外，必须使用真实 renderer 或受控浏览器检查受影响流程；涉及 Electron-only 行为时使用相应 Electron 测试或手工验收。
- 打包/发布：`pack:*`、`dist:*`、production smoke、签名、安装器与 release evidence 会生成大量产物或触发高成本流程，仅在任务需要且工作树条件满足时运行。

测试失败时先复现并建立可证伪假设，再修改。warning、类型错误、格式漂移、生成物漂移、fixture 漂移和本轮遗留 TODO 都按缺陷处理，除非明确记录为与本轮无关的既有债务。

## 生成物与工作区边界

不要手改或提交以下内容：`node_modules/`、`media-workbench/dist/`、`build/`、`release*/`、日志、临时目录、Playwright 缓存、`__pycache__/`、运行期 workspace、应用配置目录和下载/解压的 runtime tools。发现 `DO NOT EDIT`、生成合同或打包清单时，找到源文件与生成命令再变更。

内容库、应用配置、本地状态、凭据和安装资源是不同边界。测试必须使用临时目录和合成身份，清理时只删除本轮明确创建且已验证位于测试临时根内的内容。

## Git 与协作

- dirty worktree 中保留用户改动；修改前查看相关 diff，禁止回滚、覆盖、格式化或顺带吸收无关文件。
- 禁止 `git add .`、force-add ignored 文件、破坏性 reset/checkout 和未经请求的 commit、push、PR、release。
- stage 时逐个列出本任务文件；提交或交接前复核仓库根、当前分支、状态、暂存文件和嵌套仓库。
- 只有用户明确要求并行 agent 工作，或当前任务明确启用了 `ARTICLE-LIFECYCLE-GOAL-ORCHESTRATION.md`，才拆分多 agent。每个 agent 必须有不重叠的 owner/文件范围、输入、禁止事项、验证和交接；主 agent 对最终集成负责。

## 必须停止并询问

出现以下情况时，先给出冲突证据、影响、推荐方向和需要确认的单一高影响问题：

- 当前源码、测试、业务词汇、目标规格或本文件存在无法解释的冲突。
- 需要保留审核状态、多目标、未知结果自动重试等已否定路线，或同时支持互斥模型。
- 需要删除/迁移真实数据、旧 API、字段、路由、schema、迁移历史、订单/发布证据、权限模型或部署流程。
- 需要访问真实账号、产生付费、发布内容、停机、改变公开访问面或执行不可逆操作。
- owner 不清晰且猜测会造成跨层扩散、数据风险或多个竞争真源。

## 完成与交接

“完成”必须包含：目标链路已闭合、改动文件清单、实际运行的命令及结果、未运行的关键验收与原因、剩余风险、文档更新和 Git 状态。若任务未闭合，交接还必须写明当前 owner/调用链、不可触碰的用户改动、下一条最安全命令和停止条件。
