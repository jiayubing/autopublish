# AutoPublish Agent 工作约定

默认使用中文沟通、计划和交接；代码标识、命令、协议字段及已有英文文档保持原语言。

## 1. 真源与冲突处理

事实冲突按以下顺序判断：

1. 当前源码、测试、schema、脚本、CI、运行证据与当前 Git 状态。
2. 本文件。
3. `CONTEXT.md`：业务词汇与禁用称谓真源。
4. `ARTICLE-LIFECYCLE-AND-SUBMISSION-SPEC.md`：文章生命周期与投稿产品行为真源。
5. 当前仍有效的工程文档与 Git 历史。

文章生命周期重构额外使用：

- `.scratch/article-lifecycle-and-submission/ARTICLE-LIFECYCLE-WAVE-EXECUTION-PLAN.md`：**当前状态、调度顺序与 gate 唯一真源**。
- `.scratch/article-lifecycle-and-submission/EXECUTION-PROTOCOL.md`：**如何实施、提交、合并与推进**。
- `.scratch/article-lifecycle-and-submission/AUDIT-PROTOCOL.md`：**如何审计、何时复审、何时必须停止 review**。
- `issues/` 与 `maintenance/`：单 Ticket / Maintenance 的具体实施合同。
- `handoffs/`：历史实施、审计和测试 evidence；只作为历史证据，不参与实时调度。
- `archive/`：已退役规则和旧计划快照；不得作为当前规则使用。

源码与目标规格不一致时，先判断是否为当前重构明确要消除的旧残影。若是，按规格收敛并补行为测试；若不是，报告冲突和影响，不自行维持互斥双路线。

### 1.1 文档读取与上下文边界

- 每项任务先从根 `README.md`、`docs/AI-ENTRY.md` 和 `docs/WORK-INDEX.md` 确定阅读入口；不要通过扫描整个仓库或 `.scratch/` 猜测当前任务。
- 小型、明确、局部的修改只读取相关源码、直接调用方、测试和必要合同；不得因为历史计划存在就自动创建或阅读 ExecPlan。
- 复杂任务一次只选择一个当前 ExecPlan。先读该计划的最小阅读集，再按计划的直接引用扩展；不得并行加载所有 Wave、Ticket、handoff 或 archive。
- `handoffs/`、`archive/` 和已完成计划默认是历史证据，不是当前操作说明；只有当前计划、冲突调查或审计明确需要时才读取。
- `archive/` 中的旧 paid staging 计划不得作为当前产品或调度依据；当前产品行为以 `ARTICLE-LIFECYCLE-AND-SUBMISSION-SPEC.md` 和当前源码/测试为准。
- 完成复杂任务后，把重要发现和验证写回对应计划；不要把长日志复制进工作索引或根 `AGENTS.md`。

## 2. 产品长期边界

- 完整文章生成成功后直接待投稿，不恢复“待审核/已审核/批量审核”兼容路线。
- 一篇文章同时最多一个活动发布目标；入队后冻结；首次明确发布成功后永久只读，不再次入队、改投或回收。
- 普通平台接受投稿即产生发布事实，不增加公开页面轮询或审核等待状态。
- 网站媒体与普通平台共享文章身份/生命周期投影，但订单、价格、付费确认和人工核对属于独立应用服务。
- 超时、断线、缺少订单号等**不确定远端结果不得自动重试**；必须保真并进入人工核对。
- 不实现第三方自媒体；不支持同文多目标并发发布；不删除发布、订单和最小审计证据。
- 图片生产链仅按当前 Wave Plan 的显式 gate 推进；真实能力验证前不得承诺网站媒体图片传输机制。
- `auth-server/` 是独立鉴权服务，不接收客户内容、文章、模板、队列、Cookie 或本地内容库路径。

用户否定的旧概念必须从代码、类型、测试、fixture、文档和 UI 同步移除，不得改名保留。

## 3. 架构与 Owner 原则

- `src/domain/`：稳定身份、DTO、发布目标、publisher contract、安全错误。
- `src/content/`：客户资料、生成批次、文章内容与文件持久化；文章生命周期权限由唯一 projection owner 决定。
- `OperationalStore` 公共门面：投稿、发布、订单、恢复等运行事实；`internal/` 不得被外部直接依赖。
- `desktop/services/`：应用用例与跨 owner 编排；`desktop/composition/`：依赖装配。
- IPC / preload / renderer bridge：transport 与类型映射，不拥有业务语义。
- Renderer feature：用例协调；component：展示与收集用户意图，不复制主进程状态机。
- platform adapter：外部协议/字段/结果映射，不拥有冻结、重试、人工核对或生命周期事实。
- workspace/config/path policy：内容库、应用配置、凭据、日志、缓存与安装资源必须隔离。
- auth-server domain/migrations：鉴权领域与 SQLite schema owner。

新增业务规则先找到唯一 owner。不得通过 UI、IPC、adapter、prompt、临时 JSON 或散落 `if` 建立第二真源。

## 4. 实现纪律

- 从 owner、合同、schema 或核心状态转换开始，再接 service、IPC、bridge 和 UI。
- 修 bug 只闭合本问题及其直接调用链；不借 finding 顺手重构无关 owner。
- 不确定远端结果优先保真；禁止用自动重试、`sleep`、mock 固定成功值或静默吞错换取表面成功。
- 可恢复失败使用稳定 code 与安全 metadata；不得泄露 token、Cookie、原始请求头、数据库行、绝对敏感路径或供应商原始异常。
- 外部请求、文件、队列、重试、超时、并发和后台任务必须有明确边界与恢复语义。
- 配置与路径通过既有 config/store/path policy 显式下传；禁止硬编码生产密钥、地址或历史工作区。
- 修改合同、生命周期、配置或用户行为时同步更新对应真源与测试；一次性复盘只写 handoff，不写长期真源。

### 技术栈约束

- Electron 主进程和现有服务保持当前 CommonJS 边界；不无计划混入新的模块体系。
- preload 只暴露最小受控 API；renderer 不直接访问 Electron transport。
- Renderer 复用现有 feature/context/bridge/types/CSS；不在组件内创建平行业务 store。
- `media-workbench/dist/` 等生成物不手改。
- SQLite schema 只通过正式 migration 演进；不手改生产数据库或删除迁移历史。
- CI 基线优先于本机“能跑”；桌面与 auth-server 的 Node 基线按当前 CI 为准。

## 5. 测试原则

- 先跑最贴近改动风险的定向测试，再扩大门禁；不得声称未运行的命令已通过。
- 业务行为用公开行为/合同测试证明，不通过读取生产源码、私有函数名、文件布局、行数或源码字符串证明。
- 源码/正则静态检查仅用于：依赖方向、公开能力/legacy absence、CI/打包合同和安全静态边界。
- 生命周期、事务、并发、幂等、不确定结果与人工 resolution 优先使用故障注入和组合状态矩阵。
- UI 变化除 typecheck/build 外，还应验证加载、空态、错误态、禁用态和关键交互。
- 测试失败先复现并建立可证伪假设，再修改。

完整命令与阶段门禁由 `package.json`、CI 及当前 `EXECUTION-PROTOCOL.md` 决定。

## 6. 审计原则

审计必须遵守 `AUDIT-PROTOCOL.md`。默认是：

**Primary Audit → Finding Remediation → Bounded Re-audit → Closure**。

不得在每次修复后重新开启无边界 fresh full review。只有协议定义的 escalation 条件成立时才扩大审计，而且只扩大到受影响边界。

P0/P1 必须关闭；P2 只有直接违反当前 acceptance、持久事实一致性、幂等/不确定结果安全、公开合同或直接回归时才阻塞，其余登记到明确未来 owner；P3 默认不阻塞。

## 7. 外部操作与安全

自动化测试只用合成数据和内存/假 transport。真实登录、发布、付费、取消、生产数据库、Cloudflare/TLS、图片上传等用户可见或可能收费的操作，必须获得**本次操作的明确授权**并遵守停止条件。

## 8. Git / Worktree / 生成物

- dirty worktree 中保留用户改动；禁止破坏性 reset/checkout、`git add .`、force-add ignored 文件和未授权 push/release。
- stage/commit/merge 是否允许由 `EXECUTION-PROTOCOL.md` 的当前执行模式与用户授权决定。
- 不手改或提交 `node_modules/`、构建产物、日志、缓存、Playwright/runtime tools、运行期 workspace 或应用配置目录。
- 并行执行仅在 Wave Plan 明确允许且 owner/文件范围不重叠时使用；主 agent 对集成结果负责。

## 9. 必须停止并询问

仅在高影响且无法由当前合同消解时停止：

- 真源之间存在实质冲突；
- 需要新的产品决策或保留已否定路线；
- 需要真实数据迁移/删除、公开 API/schema/权限的不可逆变化；
- 需要未经授权的真实账号、付费、发布或生产操作；
- owner 无法确定且继续会制造竞争真源或数据风险。

普通实现选择、测试失败、in-scope finding 和可局部修复的回归不是询问用户的理由。

## 10. 完成与交接

“完成”至少包含：目标链路闭合、改动文件、实际运行的命令与结果、未运行的重要验收及原因、剩余风险、文档/evidence 更新和 Git 状态。

文章生命周期 Wave/Ticket/Maintenance 的更严格完成定义以当前 `.scratch/article-lifecycle-and-submission/ARTICLE-LIFECYCLE-WAVE-EXECUTION-PLAN.md`、`EXECUTION-PROTOCOL.md` 和 `AUDIT-PROTOCOL.md` 为准。
