# Renderer UI 解耦与扩展性改进计划

**Status:** COMPLETE

**更新时间：** 2026-08-18

**执行方式：** 由一个主线程以目标模式持续调度；每次只启动一个阶段线程，阶段完成、集成到主线程权威工作树并通过本阶段验收后，主线程才启动下一个阶段线程。主线程所在分支/工作树是实时调度真源；若 Codex 为阶段线程分配独立 worktree，必须先完成明确 handoff 和集成，不能假定文件自动共享。

**职责：** 在不改变文章、投稿、订单、付费、媒体和设置业务语义的前提下，收敛 Renderer 的模块职责，减少跨文件修改和大组件内的多流程耦合，使后续页面调整更容易定位、验证和扩展。

本计划以导航冷启动修复完成后的源码为基线。renderer-cold-start-navigation-fix 计划已完成 N6；当前基线提交为 f5a14a3 之后的文档收尾提交 380fb51。本计划不与导航修复并行，也不重开导航修复的完整审计。

本计划不是整体重写，不以文件数量或行数为目标，不建立新路由框架、全局 UI store、通用 manager、页面注册器或完整设计系统。

## 1. 当前事实与目标

### 1.1 当前事实

已有 feature、bridge、IPC 和 workspace scope 边界可以复用。维护成本集中在：

| 区域 | 当前问题 | 优先级 |
| --- | --- | --- |
| App.tsx | 同时拥有导航意图、跨页 intent、feature 装配、订单进入副作用和资源/订单长 props 映射 | 高 |
| GeneratedArticlesView.tsx | 同时处理筛选选择、投稿 intake、回收站事务、永久删除和多个弹窗 | 高 |
| OrdersView.tsx | 展示、订单动作会话和局部无类型准备结果混合 | 高 |
| settings feature | Provider 启动时读取全部设置，即使用户没有打开设置页 | 中 |
| Sidebar/CSS | 响应式规则依赖子节点位置选择器 | 中 |
| 导航定义 | ViewMode、Sidebar 菜单和 App 页面映射分散，但规模只有六项 | 低 |

已有深模块继续保留：content/media/settings feature、workspace scope、useSubmissionIntakeSession、订单列表 projection、bridge 和各业务 owner。UI 重构不得复制这些状态机。

### 1.2 目标不变量

- currentView 是导航意图唯一 owner；不新增 renderedView、pendingView 或 DOM 推断 state。
- feature snapshot 是业务查询与命令状态的权威来源；Page/session 只拥有页面协调和临时 UI 会话状态。
- content feature 继续拥有 article removal transaction 的权威 observation；media feature 继续拥有订单 snapshot、订单同步和 anomaly preparation。
- settings feature 的 scope 是 installation scope（当前为 installationId: "desktop"），不因 workspace 切换制造第二套 settings cache。
- UI 组件只接收展示数据和用户 intent，不接收整个 bridge，不新增 transport 调用。
- 不创建纯 props 转发 wrapper、通用 command bus、动态 route registry、全局 UI store 或同义 DTO。
- 性能目标是“不因解耦回退”：不重复实例化 feature/subscription，不复制昂贵 projection；只有已有证据支持的查询延迟和动画延迟才处理。

### 1.3 Owner 表

| 事实/状态 | 权威 owner | Page/session 可以做什么 |
| --- | --- | --- |
| media 资源 query、search、page、pool、refresh command | media feature | 页面激活、snapshot 映射、反馈投影、收集 intent |
| article removal transaction observation | content feature | 预检/确认临时状态、stale guard、反馈展示、调用 feature command |
| order list、sync、anomaly preparation | media feature | 订单页展示；session 不复制 anomaly preparation |
| cancellation preparation/resolution 临时 UI 状态 | order action session | 绑定当前 scope/order，成功、失败、scope switch 时清理 |
| settings query/cache/commands | settings feature | 页面首次激活、section 展示、显式刷新 |
| currentView 与跨页 article intent | AppContent | Sidebar 只投影和收集导航意图 |

## 2. 主线程目标模式执行合同

### 2.1 主线程职责

主线程拥有整个目标，不直接在阶段线程工作期间顺手修改生产文件。它依次执行：

1. 读取本计划、AGENTS.md 和当前阶段的最小阅读集。
2. 确认工作树、基线和前一阶段 evidence；只启动当前阶段线程。
3. 将当前阶段的范围、允许文件、非目标、验收命令和本阶段 owner 表发给阶段线程。
4. 等待阶段线程返回结构化 handoff。
5. 将阶段结果收敛到主线程权威工作树后执行 bounded integration check：查看 diff、检查 owner 不变量、运行本阶段验收；不重开无边界 fresh full review。
6. 只有本阶段验收全通过且没有 P0/P1 或直接影响当前正确性的 P2，才调度下一阶段。
7. 全部阶段完成后执行最终验证、一次 Primary Audit；如有 finding，只修复 finding 相关 diff 并进行一次 Bounded Re-audit。

主线程不得为了“让阶段绿灯”修改业务 owner、放宽有效断言、加入真实账号/发布/付费/取消操作或把不确定结果当成失败重试。

### 2.2 阶段线程 handoff 合同

阶段线程必须在结束消息中给出：

- stage：阶段 ID；
- status：COMPLETE 或明确 blocker；普通测试失败不是 blocker；
- 修改文件和未修改但核对过的直接调用方；
- 实际运行的命令及结果，不得声称未运行命令通过；
- 公开行为、owner 不变量和性能观察的 evidence；
- 未运行的重要验收及原因；
- 剩余风险和未来 owner；
- 当前 git 状态；若使用独立 worktree，说明可集成的 handoff/commit/diff。只有当前执行模式和用户授权允许时才创建或集成 commit；未经授权不得 push、发布或执行真实外部写操作。

阶段线程只修改本阶段允许范围。发现无关问题时记录，不扩大范围；发现产品决策、真源冲突、不可逆数据风险或缺少必要外部授权时停止并报告。

### 2.3 阶段推进规则

- 阶段严格串行：U1 → U2 → U3 → U4 → U5 → U6 → FINAL。
- 任何阶段未完成集成或未通过验收，主线程不得启动下一阶段线程。
- 下一阶段必须基于主线程已集成的最终代码启动，不允许基于阶段线程的临时分支继续分叉。
- 阶段之间不允许保留“临时兼容 owner”或双写状态。
- 每阶段只运行直接相关测试；最终再运行一次必要 build/typecheck/smoke，不建立复杂新门禁体系。

### 2.4 主线程启动提示词

后续启动目标模式主线程时，可直接使用以下目标说明：

~~~text
以 .scratch/ui-decoupling-and-extensibility/UI-DECOUPLING-AND-EXTENSIBILITY-PLAN.md 为本次执行真源，串行完成 U1、U2、U3、U4、U5、U6 和 FINAL。

你是主线程，只负责持续目标、阶段调度、bounded integration check、最终验证和审计收敛。每次只为当前阶段创建一个执行线程；等待它完成并核对 handoff、diff、owner 不变量和本阶段验收后，再自动创建下一阶段线程。阶段线程完成不等于总体目标完成，不要在 U1–U6 任一阶段后停止，也不要等待我逐阶段确认。只有计划定义的停止条件成立时才请求用户决定。

以主线程所在分支/工作树作为集成真源，所有阶段严格串行。若阶段线程使用独立 worktree，先按当前授权完成 handoff 和集成，再从集成后的 HEAD 启动下一阶段。保留已有用户改动，不并行修改重叠文件，不扩大阶段范围，不执行真实发布、付费、取消订单、生产数据删除、push 或 release。全部阶段完成后执行 FINAL、Primary Audit、必要的 finding remediation 和一次 Bounded Re-audit；只有计划完成定义全部满足后才结束总体目标。
~~~

## 3. 串行阶段

### U1 — 资源页面边界

**单线程目标：** 让 App 不再展开资源管理页面的长 props 映射。

**允许修改：** App.tsx、新建 components/ResourceLibraryPage.tsx、ResourceLibrary.tsx（仅在直接 props 收紧确有需要时）、该页面的直接测试；必要的类型文件。

**必须保持：** media feature 继续拥有资源 query、search、page、pool 和 command lifecycle；ResourceLibrary 继续是展示组件，不新增 bridge 调用。

**完成条件：**

- ResourceLibraryPage 吸收 feature-to-view 映射、错误/刷新反馈和页面级 intent，删除测试后复杂度会重新散落回 App，因而不是纯 wrapper；
- 资源搜索、分页、资源池切换、刷新成功/失败反馈的公开行为不变；
- App 不再包含资源 command 参数映射；没有第二个 media feature 或 workspace subscription；
- currentView、article intent、订单映射和 settings 行为不在本阶段改动。

**验收：** renderer typecheck；资源 library 现有公开行为测试（必要时补一个 focused regression）；renderer-publication-history.test.js 中资源展示场景；git diff --check。

### U2 — 设置页按需首次加载

**单线程目标：** 将 settings 详情查询从 Provider 启动副作用改为 SettingsView 首次激活。

**允许修改：** features/settings/settings-feature.js、features/settings/settings-context.tsx、components/SettingsView.tsx、settings focused test。

**必须保持：** scope 为 installation scope；既有 settings commands、错误映射和 section 行为不变；App 的 global ready 不等待 settings 详情。

**ensureLoaded 最小语义：**

- Provider mount 不触发详情查询；
- 同一 installation scope 的并发首次调用共享一次 in-flight load；
- 首次 load settled 后再次进入不重复；
- 显式 refresh 仍可重新读取；
- scope 变化清理旧 cache，不让旧结果覆盖新 scope。

**验收：** settings feature test 统计六类 query adapter 调用次数：启动为 0、首次进入为每类 1、并发/再次进入不增加、显式 refresh 增加一次；错误仍出现在 snapshot；renderer typecheck；git diff --check。

### U3 — 投稿 intake 展示边界

**单线程目标：** 从 GeneratedArticlesView 移出投稿 intake Dialog，但保留现有 useSubmissionIntakeSession 作为唯一投稿流程 owner。

**允许修改：** GeneratedArticlesView.tsx、新建 SubmissionIntakeDialog、现有 submission 类型/hook 的必要类型收紧、直接 renderer test。

**必须保持：** Dialog 只消费 session snapshot/intents 和必要的收藏媒体 read model；不调用 bridge，不重新实现普通/付费投稿规则。

**完成条件：**

- 普通投稿预检→确认→提交、付费媒体预检→确认、取消和 stale/client switch 行为不变；
- GeneratedArticlesView 不再包含投稿 Dialog 实现；文章删除流程暂时保留给 U4，不在本阶段顺手迁移；
- submission session/Dialog 的公开输入输出不含 any，并复用 bridge/publication 已有类型；removal command surface 留到 U4 一次收敛；
- 不为按钮或字段建立新的 hook/manager。

**验收：** renderer-history-editor-flow.test.js 中普通、付费、媒体选择和 scope stale 场景；必要时只补一个公开行为回归；renderer typecheck；git diff --check。

### U4 — 文章删除会话边界

**单线程目标：** 收敛文章回收站预检、提交、恢复和永久删除的临时会话，不复制 content feature 的事务 observation owner。

**允许修改：** GeneratedArticlesView.tsx、GeneratedArticlesView.types.ts、新建 useArticleRemovalSession、一个完整 ArticleRemovalDialog；ArticleRemovalStatus 只有在具备独立复杂展示或复用时才建立，否则留在 Dialog 内；直接 renderer test。

**会话职责：** 预检、确认、提交、重试、恢复、永久删除的临时状态；client/workspace stale guard；用户反馈。

**完成条件：**

- content feature 继续提供 removal snapshot、transaction observation 和 command；session 不维护第二个 transaction writer；
- 预检、已有开放事务、自动恢复/人工修复、恢复文章、永久删除和失败反馈行为不变；
- client switch 或 late result 不会污染当前文章列表；
- GeneratedArticlesView 不再包含删除事务流程实现。
- 旧的 GeneratedArticlesCommands 通用 Promise<any> surface 在本阶段退役，submission/removal 各使用实际所需的明确类型。

**验收：** renderer-history-editor-flow.test.js 的 removal transaction 场景；必要时补一个 restore/permanent-delete 公开行为回归；content feature 相关测试；renderer typecheck；git diff --check。

### U5 — 订单页面与动作会话

**单线程目标：** 让 App 只装配 OrdersPage，让 OrdersView 只展示订单列表与收集 intent。

**允许修改：** App.tsx、新建 components/OrdersPage.tsx、新建 components/use-order-action-session.ts、OrdersView.tsx、必要的 renderer 类型和直接测试。

**必须保持：** media feature 继续拥有订单 snapshot、sync lifecycle、anomaly preparation 和安全错误；session 只拥有 cancellation preparation/resolution、open-link 的临时 UI 状态，并绑定当前 scope/order。

**完成条件：**

- 每个 scope 首次进入订单页只执行一次现有 openOrders()；
- 打开发布链接、取消预检/确认、取消结果核对、异常证据核对/解决的公开行为不变；
- scope switch、订单消失、命令成功/失败后清理对应临时 preparation；
- OrdersView 公开接口没有 any，不复制远端准备结果；
- 列表入场动画不再使用无上限的 index * 0.03 延迟；不引入虚拟列表或广泛 memo。

**验收：** phase-06-media-feature.test.mjs 的订单 owner 场景；order-list-projection.test.mjs；新增或扩展一个 renderer order-action focused test 覆盖 prepare→confirm、人工核对和 scope switch；renderer typecheck；git diff --check。

### U6 — Sidebar/CSS 与导航合同

**单线程目标：** 降低 Sidebar 响应式 CSS 对 DOM 子节点顺序的依赖，同时保持六页显式导航映射。

**允许修改：** components/Sidebar.tsx、Sidebar 相关 CSS、必要的导航类型/直接测试。

**必须保持：** ViewMode 是导航 ID 真源；App 页面映射和 Sidebar metadata 仍为显式编译期位置；不引入 React Router、动态注册器或 route manager。

**完成条件：**

- header、navigation、navigation item、footer 有明确 class/data 属性；
- #app-sidebar 响应式规则不依赖 nav > button、first-child、last-child；
- 六个主页面可进入，aria-current 仍由 currentView 单向投影；
- shell 变量只覆盖真实重复的 Sidebar/header 尺寸，不迁移全部颜色 token。

**验收：** renderer-responsive-layout.test.js 的宽/窄窗口场景；六页导航 smoke；允许使用一次静态 legacy-absence 检查验证位置选择器消失；renderer typecheck；git diff --check。

## 4. 最终验证与完成定义

### 4.1 最终命令

最终只在 U1–U6 均完成后运行：

~~~powershell
npm run typecheck:renderer
npm run typecheck:bridge
node --test --test-concurrency=1 tests/renderer-history-editor-flow.test.js
node --test --test-concurrency=1 tests/phase-06-media-feature.test.mjs
node --test --test-concurrency=1 tests/phase-06-settings-feature.test.mjs
node --test --test-concurrency=1 tests/order-list-projection.test.mjs
node --test --test-concurrency=1 tests/renderer-responsive-layout.test.js
npm run build:renderer
git diff --check
~~~

如果某个阶段已运行同一命令且源码、关键测试和依赖未再变化，主线程可以复用该 evidence，不为形式重复运行。最终 smoke 只使用合成数据和本地 fixture：六页可进入、资源搜索/分页/刷新、投稿、回收站、订单核对、设置首次/再次进入、窄窗口 Sidebar。不得执行真实发布、付费、取消订单、生产数据删除或账号操作。

### 4.2 完成定义

- App 只保留应用级导航、跨页 intent 和 workspace feature 装配，不再包含资源/订单长 props 映射；
- 投稿、文章删除、订单临时动作分别有明确 session/UI owner，没有平行状态机；
- feature snapshot 和主进程业务事实没有新增 writer；
- GeneratedArticlesView、OrdersView 公共接口不含 any；
- 设置查询按 installation scope 页面激活，且没有重复 feature 实例或重复首次加载；
- Sidebar 响应式 CSS 不依赖子节点顺序；
- 没有新增纯转发 wrapper、通用 manager、全局 UI store、动态路由注册器或同义 DTO；
- 每个阶段的直接行为、typecheck、最终 build 和 smoke 均通过；
- Primary Audit 的 blocking findings 已关闭，Bounded Re-audit 只覆盖已知 finding、修复 diff、owner 不变量和直接回归；
- 最终 evidence 绑定到最终源码、测试和构建状态，工作树状态已记录。

## 5. 非目标与停止条件

### 5.1 非目标

- 不修改 domain、OperationalStore、IPC 业务语义或发布/订单状态机；
- 不重做 UI 视觉稿，不统一全部颜色、间距和组件样式；
- 不引入 React Router、Redux/Zustand、微前端或新的组件库；
- 不为了减少行数拆分纯展示碎片，也不把所有操作包装成自定义 hook；
- 不处理 Vite 大 chunk、真正多 chunk、虚拟滚动或全局性能工程；
- 不与导航缺陷修复并行修改同一文件。

### 5.2 必须停止并报告

只有出现以下情况才停止当前阶段并请求主线程/用户决定：

- 当前源码、测试与本计划真源发生实质冲突；
- 继续执行会建立第二 owner、第二状态机或不可逆数据变化；
- 需要新的产品决策、真实账号/生产凭据或真实外部写操作；
- 无法用合成数据建立公开行为测试 seam。

普通 TypeScript 错误、测试失败、局部 CSS 问题、需要收紧类型或需要补 focused regression，均在当前阶段内自行修复，不升级为 blocker。

## 6. FINAL 验证记录与完成结论

**完成日期：** 2026-08-18

### 6.1 实际运行的最终门禁

以下命令均在最终源码状态运行并通过：

~~~text
npm run typecheck:renderer                         PASS
npm run typecheck:bridge                           PASS
node --test --test-concurrency=1 tests/renderer-history-editor-flow.test.js PASS (13)
node --test --test-concurrency=1 tests/phase-06-media-feature.test.mjs PASS (8)
node --test --test-concurrency=1 tests/phase-06-settings-feature.test.mjs PASS (7)
node --test --test-concurrency=1 tests/order-list-projection.test.mjs PASS (2)
node --test --test-concurrency=1 tests/renderer-responsive-layout.test.js PASS (11)
npm run build:renderer                             PASS
git diff --check                                   PASS
~~~

补充的阶段直接行为与 bounded re-audit 命令也通过：

~~~text
node --test --test-concurrency=1 tests/renderer-order-action-session.test.js PASS (1)
node --test --test-concurrency=1 tests/renderer-publication-history.test.js PASS (4)
node --test --test-concurrency=1 tests/renderer-generation-batch-navigation.test.js PASS (1)
~~~

静态 owner/legacy 检查通过：目标 UI 公共接口无 `any`，无 `Promise<any>`，Sidebar CSS 无 `nav > button`、`:first-child`、`:last-child`，未引入 React Router/动态 route registry/全局 UI store；投稿、删除 Dialog/session 未新增 bridge 或 transport 调用。六页导航、资源搜索/分页/刷新、投稿、回收站、订单核对、设置首次/再次进入及窄窗口 Sidebar 均由合成 fixture 覆盖。未执行真实发布、付费、取消订单、生产数据删除或账号操作。

未运行全仓 `npm test`：本计划的最终门禁限定为上述与 Renderer UI 解耦直接相关的 typecheck、行为测试、build 和 diff 检查；未改变 domain、主进程业务 owner 或其他不受影响的测试边界。

### 6.2 Primary Audit 结论

- App 已收敛为导航、跨页 intent 和 feature 装配；资源与订单长 props 映射分别位于 `ResourceLibraryPage`、`OrdersPage`。
- 投稿 intake、文章删除、订单临时动作分别由 `useSubmissionIntakeSession`、`useArticleRemovalSession`、`useOrderActionSession` 及对应 Dialog/Page 协调；feature snapshot 和主进程业务事实没有新增 writer。
- `GeneratedArticlesView`、`OrdersView` 及新增页面/Dialog/session 的公开 TypeScript 接口没有 `any`；settings 仍为单一 installation scope feature，首次加载按页面激活且并发共享。
- Sidebar 的响应式规则改为明确 class/data 属性；六项 `ViewMode` 仍为编译期显式映射，`aria-current` 由 `currentView` 单向投影。
- 没有发现 P0/P1 或直接影响当前正确性、一致性、幂等、安全和公开合同的 P2。Bounded re-audit 仅覆盖上述检查、修复 diff、owner 不变量和直接回归，结论为通过。

### 6.3 工作树与剩余风险

- 最终 evidence 绑定到当前工作树源码、测试和 renderer build；工作树保留本计划及 U1–U6 的预期修改，未创建 commit、未 push、未执行外部写操作。
- `vite build` 仍报告既有单 chunk 超过 500 kB 的提示；该项属于计划明确的非目标，不影响本次完成定义。
- `git diff --check` 仅输出 Git 的 LF/CRLF 转换提示，没有 whitespace error。

据此，U1–U6 与 FINAL 均满足本计划完成定义，计划状态收敛为 `COMPLETE`。
