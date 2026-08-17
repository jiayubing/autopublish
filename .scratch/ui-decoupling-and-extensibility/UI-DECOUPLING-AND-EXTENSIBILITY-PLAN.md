# Renderer UI 解耦与扩展性改进计划

**Status:** `READY_AFTER_NAVIGATION_FIX`

**更新时间：** 2026-08-17

**职责：**在不改变文章、投稿、订单、付费、媒体和设置业务语义的前提下，收敛 Renderer 的模块职责，减少跨文件修改和大组件内的多流程耦合，使后续页面调整更容易定位、验证和扩展。

本计划独立于冷启动导航缺陷修复。只有 `.scratch/renderer-cold-start-navigation-fix/RENDERER-COLD-START-NAVIGATION-FIX-PLAN.md` 完成 N6 后才开始，避免两份计划同时修改 `App.tsx` 和 `Sidebar.tsx`。

本计划不是整体重写，不以文件数量或行数为目标，不建立新路由框架、全局 UI store、通用 manager、页面注册器或完整设计系统。

## 1. 当前事实与优先级

当前 UI 不是全面失控，已有 feature、bridge 和 IPC 边界可以复用。主要维护成本集中在以下位置：

| 区域                        | 当前问题                                                                                  | 优先级 |
| --------------------------- | ----------------------------------------------------------------------------------------- | ------ |
| `App.tsx`                   | 同时拥有导航意图、跨页 intent、feature 装配、订单进入副作用和资源/订单页的大量 props 映射 | 高     |
| `GeneratedArticlesView.tsx` | 1151 行内同时处理筛选选择、投稿 intake、回收站事务、永久删除和多个弹窗                    | 高     |
| `OrdersView.tsx`            | 528 行、十余个回调，取消与异常核对使用局部 `any` 状态，页面展示和动作会话混合             | 高     |
| 设置 feature                | Provider 在应用启动时立即读取全部设置，即使用户没有打开设置页                             | 中     |
| Sidebar/CSS                 | 响应式规则依赖 `nav > button`、`first-child`、`last-child` 等 DOM 结构                    | 中     |
| 导航定义                    | `ViewMode`、Sidebar 菜单和 App 页面映射分散，但规模只有六项                               | 低     |

已有的深模块继续保留：content/media/settings feature、workspace scope、`useSubmissionIntakeSession`、订单列表 projection、bridge 和各业务 owner。UI 重构不得复制这些状态机。

## 2. 目标职责

| 模块                         | 唯一职责                                                                          |
| ---------------------------- | --------------------------------------------------------------------------------- |
| `App` / `AppContent`         | 装配 workspace 级 feature、持有 `currentView` 和真正跨页面的 intent、渲染应用外壳 |
| `ContentWorkbench`           | 当前客户、生产/文章库模式、文章编辑离开保护和页内 tab 协调                        |
| `GeneratedArticlesView`      | 文章浏览、筛选、选择和打开详情；不直接拥有投稿与删除事务实现                      |
| `useSubmissionIntakeSession` | 普通投稿和付费媒体 intake，会继续作为投稿流程 owner                               |
| 新的 article removal session | 回收站预检、提交、恢复、永久删除、事务恢复和反馈                                  |
| `OrdersPage`                 | 订单页进入行为、订单 feature 映射和订单动作会话                                   |
| `OrdersView`                 | 筛选、搜索、展开和订单列表展示                                                    |
| settings feature             | 设置数据、命令和缓存；提供幂等的首次加载能力                                      |
| `SettingsView`               | 用户进入设置页时激活首次加载，并展示各设置 section                                |
| `Sidebar`                    | 展示导航和收集导航意图；响应式样式依赖明确 class，不依赖子节点位置                |

`currentView`、feature snapshot 和主进程业务事实继续各自只有一个 owner。不得新增 `renderedView`、页面级全局 store 或从 DOM 反推状态。

## 3. 模块拆分规则

1. 新模块必须至少拥有一项真实职责：状态、决策、外部副作用协调或一块完整复杂 UI；只转发 props 的一行 wrapper 不建立。
2. 优先把完整流程放到已有 feature/session 后面，不把一个大组件拆成十几个同样需要理解全部上下文的小组件。
3. UI 组件只接收它实际展示的数据和用户 intent；不接收整个 bridge，也不新增 transport 调用。
4. 公共 props 和 session snapshot 禁止 `any`；复用已有 bridge/feature 类型，不再创建第二套同义 DTO。
5. 不按行数机械拆分。拆分完成的判断是：修改投稿、删除、订单核对或样式时，不需要理解无关流程。
6. 性能优化只处理已有证据：无用的启动查询、重复订阅、重复 feature 实例和随列表长度增长的动画延迟。没有测量前不引入虚拟列表或广泛 `memo`。

## 4. 串行实施

顺序固定为：`U1 App 边界 → U2 文章库 → U3 订单页 → U4 样式与导航合同 → 最终验证`。

### U1 — 收敛 App 与页面生命周期

目标是让 App 保持 composition root，但不再知道资源页和订单页的每个命令参数。

1. 导航修复完成后，以最终 `App.tsx` 为基线；保留 `currentView` 和 `articleLibraryIntent`，因为它们确实跨页面。
2. 建立 `ResourceLibraryPage`，接收现有 media feature，内部拥有资源查询、分页、搜索、刷新反馈和错误映射。它必须吸收当前 App 中完整的资源页用例映射，不做纯 props 转发。
3. 订单页的映射留到 U3 的 `OrdersPage`，同时把当前 App 中的 `openOrders()` 页面进入副作用移入该页面边界。
4. content/media/submission feature 实例仍由 workspace 级 App 装配，因为 Sidebar badge 和跨页 intent 真实共享这些数据；不为隐藏 import 额外增加 Provider。
5. Settings Provider 继续拥有 feature 实例和 scope，但不在应用启动时读取全部设置。由 settings feature 提供幂等 `ensureLoaded()`（或等价的已有状态判断），`SettingsView` 首次打开时调用；同一 scope 再次进入不重复加载。
6. App 的全局“数据已就绪”只聚合真正需要在应用启动阶段加载的数据；延迟到页面打开的数据不能阻塞全局 ready。

完成后，App 仍能一眼看出有哪些页面，但资源、订单和设置的内部用例不再散落在 App。

### U2 — 收敛文章库的三个流程

`GeneratedArticlesView` 最终只协调文章浏览；投稿和删除分别由自己的 session 负责。

1. 保留现有 `useSubmissionIntakeSession`，把当前文件中的投稿选择弹窗 JSX 移入一个完整的 `SubmissionIntakeDialog`。Dialog 只接收 session 的 snapshot/intents 和必要的收藏媒体页，不重新实现投稿规则。
2. 新建 `useArticleRemovalSession`，集中以下状态和行为：
   - 回收站预检与提交；
   - 开放删除事务观察与重试；
   - 恢复文章；
   - 永久删除预检、确认和提交；
   - stale/client switch 保护及用户反馈。
3. 把回收站预检和事务反馈 UI 移入 `ArticleRemovalDialog`/`ArticleRemovalStatus`。这些组件消费 removal session，不直接调用 command map。
4. `GeneratedArticlesView` 保留筛选、日期、批次、折叠、选择和 publication drawer，因为它们共同服务“浏览并选择文章”。
5. 将 `GeneratedArticlesCommands = Record<..., Promise<any>>` 替换为 submission/removal session 实际使用的明确类型。不要创建通用 command bus 或新的业务 DTO。
6. `ContentWorkbench` 继续拥有客户切换、文章编辑器和未保存离开保护；这些职责不下沉到文章列表，也不复制到新 session。

如果完成上述拆分后，筛选/选择逻辑仍没有跨越其他流程，就停止拆分，不再为了缩短文件继续抽 hook。

### U3 — 收敛订单页展示与动作会话

1. 建立 `OrdersPage`，接收现有 media feature，并负责：
   - 页面首次进入时执行现有 `openOrders()`；
   - 从 media snapshot 选择订单、busy、失败和异常准备数据；
   - 聚合当前订单页面的安全错误；
   - 创建并持有订单动作 session。
2. 新建 `useOrderActionSession`，集中打开发布链接、取消预检/确认、取消结果人工核对和订单异常核对。它只调用现有 media feature，不复制订单状态机。
3. 用 bridge 已有的 `OrderCancellationPreparation`、`CancellationResolutionPreparation`、`OrderAnomalyPreparation` 等类型替换局部 `Record<string, any>` 和 `Promise<any>`。
4. `OrdersView` 只保留筛选、搜索、展开和列表布局；单个订单块只有在能以 `order + session intents/status` 的小接口表达时才抽为 `OrderCard`，否则保持原位。
5. 删除或封顶 `index * 0.03` 的无限列表入场延迟，订单数量增加时不应让末尾项目等待更久。

完成后，App 不再传十余个订单回调，OrdersView 也不再自行保存远端准备结果的无类型副本。

### U4 — 降低样式和导航结构耦合

1. 为 Sidebar 的 header、navigation、navigation item 和 footer 增加明确 class/data 属性，用它们替换 `nav > button`、`first-child` 和 `last-child` 结构选择器。
2. 只为真正全局且重复使用的 shell 尺寸建立变量，例如展开/收起 Sidebar 宽度和 header 高度；不把全部 Tailwind 色值迁移成 token，不建设组件库。
3. `ViewMode` 仍是导航 ID 真源。App 使用显式且穷尽的页面映射，Sidebar 菜单使用 `ViewMode` 约束；不增加 React Router、动态页面注册器或通用 route manager。
4. 新增页面仍允许显式修改 ViewMode、Sidebar metadata 和 App 页面映射。当前只有六页，清晰的三个编译期位置比一个复杂注册框架更易维护。

## 5. 性能约束

- 设置页未打开前，不发起设置详情的整组查询；同一 workspace/installation scope 只做一次首次加载。
- 不因拆分创建第二个 media/content/settings feature 实例，也不新增重复 workspace subscription。
- 页面切换不能触发无关 feature 的重新创建或全量刷新。
- 列表 projection 保持在现有纯函数/`useMemo` 边界；不把昂贵计算复制到每个行组件。
- 不在本计划处理 Vite 大 chunk、真正代码拆分或虚拟滚动；它们需要独立证据。

## 6. 最小验证

每个 U 阶段只运行与改动直接相关的现有测试；缺少公开行为覆盖时只补一个聚焦回归，不建立新的门禁体系。

最终至少运行：

```powershell
npm run typecheck:renderer
npm run typecheck:bridge
node --test --test-concurrency=1 tests/content-workbench-regression.test.js
node --test --test-concurrency=1 tests/renderer-article-management-flow.test.js
node --test --test-concurrency=1 tests/renderer-article-management-filters.test.js
node --test --test-concurrency=1 tests/renderer-residue-cleanup-flow.test.js
node --test --test-concurrency=1 tests/ticket-26-c-unified-submission-intake.test.js
node --test --test-concurrency=1 tests/order-list-projection.test.mjs
node --test --test-concurrency=1 tests/renderer-settings.test.js
node --test --test-concurrency=1 tests/renderer-responsive-layout.test.js
npm run build:renderer
git diff --check
```

人工 smoke 只检查：六个主页面可进入、文章筛选/编辑/投稿/回收站可用、订单刷新/核对可用、设置首次进入和再次进入正常、窄窗口 Sidebar 布局正常。不得用真实发布、付费或取消订单充当 UI 验收。

## 7. 完成定义

- App 只保留应用级导航、跨页 intent 和 workspace feature 装配，不再包含资源/订单的长 props 映射。
- 投稿、文章删除和订单核对分别由明确 session owner 管理，没有平行状态机。
- `GeneratedArticlesView` 和 `OrdersView` 的公开接口不含 `any`，修改一个流程不需要理解另一个流程。
- 设置查询按页面激活，且没有重复 feature 实例或重复首次加载。
- Sidebar 响应式 CSS 不依赖子节点顺序。
- 没有新增纯转发 wrapper、通用 manager、全局 UI store、动态路由注册器或同义 DTO。
- 定向测试、Renderer typecheck/build 和人工 UI smoke 通过。

## 8. 非目标

- 不修改 domain、OperationalStore、IPC 业务语义或发布/订单状态机。
- 不重做 UI 视觉稿，不统一所有颜色、间距和组件样式。
- 不引入 React Router、Redux/Zustand、微前端或新的组件库。
- 不为了减少行数拆分纯展示碎片，也不把所有操作包装成自定义 hook。
- 不处理 bundle 大小警告、真正多 chunk、虚拟列表或全局性能工程。
- 不与导航缺陷修复并行修改同一文件。
