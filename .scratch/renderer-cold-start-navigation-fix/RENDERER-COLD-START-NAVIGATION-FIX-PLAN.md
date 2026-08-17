# Renderer 冷启动主导航收敛修复计划

**Status:** `READY_FOR_IMPLEMENTATION`

**更新时间：** 2026-08-17

**职责：**修复软件冷启动后快速点击主导航时，左侧导航高亮与右侧实际可见页面永久分叉的问题。本计划只处理 Renderer 页面切换收敛，不改变文章、投稿、订单、媒体资源、设置等业务事实和命令语义。

**独立审计：**2026-08-17 的只读独立审计已完成；审计提出的测试红绿矛盾、重复性、真实环境边界和公开高亮观察点已在本计划中修正。

本文件是独立的 Renderer 缺陷修复计划，不属于新的文章生命周期 Wave/Ticket/Maintenance，不修改或回填 `.scratch/article-lifecycle-and-submission/ARTICLE-LIFECYCLE-WAVE-EXECUTION-PLAN.md`，也不重开其中已经完成的 gate。

后续实施或审计的最小阅读集为：自动生效的 `AGENTS.md`、本计划、当前 `App.tsx`/`Sidebar.tsx`/`vite.config.ts`、直接 Renderer/Electron 测试与 `package.json`。除非出现事实冲突，不读取文章 lifecycle/store、平台 adapter、历史 handoff 或 archive；本问题不需要理解业务状态机内部实现。

下文命令如无特别说明，工作目录均为 `F:\官媒投稿-refactor\auto—publish`。

## 1. 证据基线

### 1.1 核对对象

- 源码 HEAD：`ba4fd442dcf90c68c64499e56cccb7d5176418a1`
- 分支：`master`，相对 `origin/master` ahead 362
- 核对时工作树：clean
- 实际测试程序：`auto—publish/release-alpha/win-unpacked/ETO—001.exe`
- 实际测试构建时间：2026-08-17 20:31:52
- 实际测试 `app.asar` 构建时间：2026-08-17 20:31:51
- Renderer bundle：`media-workbench/dist/assets/index-yPIausEk.js`
- Renderer bundle 大小：766,726 bytes

本计划中的复现只执行本地页面导航，没有执行真实发布、付费、订单取消、账号变更、生产数据删除或第三方写操作。

### 1.2 已稳定复现的公开症状

在最新解包版冷启动、主导航刚可交互时，以原始鼠标坐标点击执行：

| 场景 | 点击序列                   | 最终导航高亮 | 最终可见页面 | 结果   |
| ---- | -------------------------- | ------------ | ------------ | ------ |
| A    | 媒体资源 → 约 180ms → 订单 | 订单         | 媒体资源     | 复现   |
| B    | 订单 → 约 180ms → 设置     | 设置         | 订单         | 复现   |
| C    | 页面预热后重复 A           | 订单         | 订单         | 不复现 |

场景 A 卡住后继续点击“设置”和“内容生产”，导航高亮会继续变化，但右侧仍停在“媒体资源”；点回当前实际可见的“媒体资源”后，再点击“订单”即可恢复。该恢复路径与用户现场描述一致。

因此验收不能只检查点击事件、`currentView` 或导航高亮，必须检查：

> 快速切换停止后，最后一次导航意图、左侧高亮和右侧实际可见页面必须在限定时间内收敛为同一个 `ViewMode`。

### 1.3 当前实现证据

`media-workbench/src/App.tsx` 当前同时具备以下条件：

1. `currentView` 是主导航意图的唯一 React state owner；
2. Sidebar 直接使用 `currentView` 计算高亮；
3. 五个页面通过 `React.lazy(() => import(...))` 首次异步解析；
4. 页面区域外层使用 `Suspense`；
5. 页面切换使用 `AnimatePresence mode="wait"`；
6. 每页退场动画时长为 150ms。

`media-workbench/vite.config.ts` 把 Renderer 输出为 IIFE。实际构建只有一个 766KB JavaScript bundle，没有按页面生成独立 chunk。因此当前 `React.lazy` 没有减少安装包资源数量或实现真正页面拆包，却仍引入首次异步提交和 `Suspense` 时序。

同一 Electron 进程中先访问媒体资源页和订单页，再重复相同 180ms 点击序列不复现，说明“首次页面解析”是必要触发条件之一。把最终页面从订单换成设置仍复现，说明问题不属于媒体、订单或设置业务数据 owner。

### 1.4 根因模型

当前最符合全部证据的时序如下：

1. 用户从文章库点击页面 A，`currentView` 立即变为 A，Sidebar 因此立即高亮 A；
2. 页面 A 首次 `React.lazy` 解析，页面提交经过 `Suspense` 与退场动画；
3. 用户在约 150–200ms 边界内继续点击页面 B，`currentView` 立即变为 B；
4. 页面 B 的首次异步 render 尚未形成可提交的新页面，`AnimatePresence mode="wait"` 内部仍保留最近一次已提交的待呈现页面 A；
5. 旧页退场完成后，动画内部呈现 A，但外部 `currentView` 已经是 B；
6. 后续没有新的状态变化能强制动画内部重新收敛到 B，于是形成“B 高亮、A 可见”的永久分叉；
7. 点击实际可见的 A 使外部 state 与动画内部页面重新一致，之后导航恢复。

该问题是 Renderer 展示状态协调竞态，不是主进程数据查询失败，也不是 Sidebar 点击事件丢失。修复不得新增第二个“实际页面 state”、旁路 writer、点击防抖锁或强制 reload 来掩盖分叉。

## 2. 目标与不变量

### 2.1 目标

1. 冷启动首次访问任意页面时，快速连续导航始终由最后一次用户意图获胜。
2. 导航高亮和实际可见页面在最后一次点击后 1 秒内收敛；正常动画路径应在现有约 150–300ms 范围内完成。
3. 保留现有六个主导航入口、页面内容、badge、业务 feature、命令和错误语义。
4. 保留当前 150ms 淡入/位移动画体验作为首选路径。
5. 用自动化行为测试锁定“高亮页面等于可见页面”，不通过读取源码或私有动画状态证明正确。
6. 修复后在最新 `release-alpha/win-unpacked` 构建上重新执行真实冷启动压力测试。

### 2.2 必须保持的不变量

- `currentView` 继续作为导航意图的唯一 owner；不新增 `renderedView`、`pendingView` 或 DOM 推断 state。
- Renderer 不复制主进程业务状态机，不改变任何发布、订单、付费或文章生命周期规则。
- Sidebar 只收集导航意图和显示当前选择，不拥有页面调度。
- 页面 feature/context 的 workspace、client、query identity 和 stale 保护保持原语义。
- 不为修复导航而延迟或丢弃合法点击；禁止用 debounce/throttle 让最后一次意图失效。
- 不用 `window.location.reload()`、隐藏 click overlay、全局 loading lock 或重新点击当前页作为恢复机制。
- 不手改 `media-workbench/dist/`、`release-alpha/` 或 `app.asar`；生成物只能由正式构建脚本产生。

## 3. 方案取舍

| 方案                                                           | 结论   | 理由                                                                                    |
| -------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------- |
| 给导航加 debounce/throttle                                     | 不采用 | 会丢弃或延迟真实用户意图，没有修复页面与导航 state 分叉。                               |
| 卡住时增加 watchdog 并重设 `currentView`                       | 不采用 | 会建立第二套协调逻辑，仍依赖猜测动画内部状态。                                          |
| 同时维护 `currentView` 与 `renderedView`                       | 不采用 | 制造两个页面事实 owner，扩大竞态面和未来 UI 修改成本。                                  |
| 保持现状，只延长/缩短 150ms 动画                               | 不采用 | 只能移动竞态窗口，不能保证最后一次意图收敛。                                            |
| 页面启动时主动预热所有 lazy import                             | 不采用 | 在单 bundle 构建下属于额外生命周期和缓存协调，复杂度高于直接静态 import。               |
| 把顶层 `mode="wait"` 改为默认 sync                             | 备选   | 可能直接规避 stale wait 状态，但会改变退场/入场重叠方式，应只在首选方案不能闭合时使用。 |
| 继续 lazy，重构 Suspense/动画嵌套边界                          | 备选   | 若未来确定要真正代码拆分才有价值；当前会为不存在的 chunk 边界增加页面 host 复杂度。     |
| 页面改为静态 import，移除顶层无收益的 `Suspense`，保留现有动画 | 首选   | 删除已证实的首次异步提交条件，不新增状态或抽象，并保持当前页面切换体验。                |

### 3.1 首选方案

在 `media-workbench/src/App.tsx` 中：

1. 把 `ResourceLibrary`、`OrdersView`、`SettingsView`、`PlatformWorkbench`、`ContentWorkbench` 改为静态 import；
2. 删除 `lazy` 和页面 host 外层 `Suspense`；
3. 删除不再需要的“正在加载工作台…” fallback；
4. 第一轮保留 `AnimatePresence mode="wait"`、页面 key、150ms transition 和页面 className；
5. 不抽取通用 route manager、view registry 或导航 store。本问题只有一个页面 host，直接修正现有 seam 比新增浅转发层更清楚。

首选方案与当前 IIFE 单 bundle 打包合同一致：代码本来就在同一文件中，静态 import 不会把多个远端 chunk 提前下载，只会移除运行时伪懒加载边界。

静态 import 可能让页面模块的顶层初始化略微提前，因此 N3 仍需确认冷启动后主导航及时可交互；本次不为此增加性能框架或改变 bundle 配置。

### 3.2 有条件备选

只有满足以下任一条件，才进入备选方案：

- 首选方案后的红灯回归测试仍然失败；
- 真实解包版冷启动压力测试仍出现高亮/页面分叉；
- 后续有独立批准的工作把 Renderer 改为真正多 chunk 构建。

备选顺序固定为：

1. 先评估移除 `mode="wait"` 或改为 `mode="sync"`，让最新页面无需等待旧页退场；
2. 若必须保留严格“先退场后入场”且同时需要真正 lazy chunk，再设计一个单一页面 host，把页面级 fallback 放进 keyed 页面内部，确保 `AnimatePresence` 每次都接收到可提交的最新 key；
3. 不并行实施两个备选，不叠加预热器、watchdog 或第二 state。

## 4. 串行实施计划

固定顺序：

`N0 复现合同 → N1 红灯回归 → N2 最小修复 → N3 Renderer 验证 → N4 解包版验收 → N5 Primary Review → N6 Bounded Re-review/Closure`

### N0 — 冻结复现合同

**目的：**确保后续测试捕获用户的原始症状，而不是只证明按钮能点击。

必须冻结以下公开观察：

- 最后点击的导航按钮：通过已有 `id`/`aria-label` 观察；
- 当前高亮：`Sidebar` 必须在当前项输出 `aria-current="page"`，非当前项不输出该属性；测试不得依赖 Tailwind class 名；
- 实际可见页面：通过页面现有可访问标题和独有控件观察；
- 收敛条件：最后一次点击后最多 1 秒，高亮页和可见页一致；
- 反例：高亮继续变化但可见页保持旧页，属于失败；
- 测试不接受“重新点回旧页后恢复”作为成功。

`aria-current="page"` 只能是 `currentView` 的无状态可访问性投影，不能成为新的页面事实或测试专用生产 API。

永久测试在点击 A 后，以“出现旧 fallback 或到达固定约 180ms 边界，二者先到就点击 B”触发；fallback 只是修复前的可选诊断信号，不能成为必经条件或断言。两个场景各用全新 Electron 进程执行 3 轮：修复前每个场景至少 2/3 轮复现才进入 N2，修复后同一测试必须 6/6 收敛。若 180ms 在测试环境不能稳定复现，只允许在 150–220ms 内做一次有界校准并在改实现前冻结，禁止失败后无限重试。

### N1 — 建立当前代码必红的行为回归

**推荐文件：**`auto—publish/tests/renderer-cold-start-navigation-convergence.electron.test.js`

**正确测试 seam：**真实 React renderer + Electron 窗口 + 合成 preload bridge。测试不使用真实用户目录、真实认证凭据、真实媒体供应商或任何外部写操作。

测试要求：

1. 复用现有 Renderer 构建锁/构建 helper，禁止并发写 `dist`；
2. 每个冷启动场景使用新的 Electron 窗口/进程，使页面 lazy 状态没有预热；
3. preload 只提供页面启动需要的最小合成 capability，所有 mutation 记录调用次数并默认不得调用；
4. 使用 `page.mouse.click` 的真实坐标输入，不使用会等待稳定状态的高层 locator `click()` 模拟快速连点；
5. 严格使用 N0 冻结的“fallback 或固定 timeout 二者先到即点击 B”触发；等待 fallback 不得阻塞修复后的测试；
6. 按 N0 的固定轮次和阈值验证，修复后的永久断言只检查最后意图、`aria-current` 与实际页面在 1 秒内收敛；
7. 断言不读取 Motion 私有 state、React fiber、生产源码字符串或组件私有函数；
8. 所有合成 mutation 必须保持 0 次，不连接真实认证、真实用户目录或外部 transport；
9. `finally` 中关闭 Electron 并清理临时 fixture，失败也不得留下进程。

建议命令：

```powershell
node --test --test-concurrency=1 tests/renderer-cold-start-navigation-convergence.electron.test.js
```

该文件由现有 discovery 收集并进入串行池，Windows required CI 必须默认执行。现有 root runner 会拒绝 skip/todo/cancelled，因此新测试不得用默认 `describe.skip` 或手工环境变量隐藏。

### N2 — 实施最小根因修复

**允许修改：**

- `auto—publish/media-workbench/src/App.tsx`
- `auto—publish/media-workbench/src/components/Sidebar.tsx`，仅补当前导航项的 `aria-current="page"` 投影
- N1 新增的行为测试及其最小 fixture/helper
- 若测试发现现有共享 fixture 缺少公开 capability，只补真实 App 启动所需最小合成响应

**默认不修改：**

- 任何 feature/context、bridge、IPC、preload production surface；
- 页面业务组件、订单/发布/媒体 owner；
- Vite 输出格式、Electron main、打包 schema；
- `dist/` 和 `release-alpha/` 生成物。

实施步骤：

1. 用静态 import 替换五个页面级 `React.lazy`；
2. 从 React import 中移除 `lazy`、`Suspense`；
3. 删除页面 host 的 `Suspense` wrapper/fallback；
4. 在 `Sidebar` 当前导航按钮上补 `aria-current="page"`，保持 `currentView` 是它的唯一输入；
5. 保持 `currentView`、Sidebar 回调、页面 key、现有动画参数和页面 props 不变；
6. 立即运行 N1 红灯测试，确认同一命令 6/6 转绿；
7. 若仍红，只做根因所需的一个备选变量实验；不得同时改动画、状态和页面拆分。

### N3 — Renderer 定向验证

至少运行：

```powershell
npm run typecheck:renderer
npm run typecheck:bridge
node --test --test-concurrency=1 tests/renderer-cold-start-navigation-convergence.electron.test.js
node --test --test-concurrency=1 tests/renderer-generation-batch-navigation.test.js
$env:RUN_ELECTRON_FOCUS_TESTS='1'; node --test --test-concurrency=1 tests/renderer-settings-window-focus.electron.test.js
npm run build:renderer
git diff --check
```

验证内容：

- 冷启动、空数据和合成错误响应下 App 均能挂载；
- 六个导航入口仍存在，badge 语义不变；
- 当前导航具有且仅具有一个 `aria-current="page"`，并与实际可见页面一致；
- 内容生产与文章库跨页 intent 不回归；
- 订单页进入时原有 `openOrders()` 行为保持；
- 设置页面首次点击仍立即可交互；
- 冷启动后主导航没有出现新的明显延迟或不可交互窗口；
- build 仍符合 Electron `file://` 与 IIFE 合同；
- 构建结果不存在手工修改。

如 `typecheck:bridge` 或其他命令在当前基线本来就失败，必须先区分 pre-existing 与 introduced；不得修改无关业务代码换绿灯。

### N4 — 最新解包版冷启动验收

Renderer 源码验证通过后，通过正式 alpha 构建流程生成新的 `release-alpha/win-unpacked`，再对生成物执行压力测试。不得复用旧 `app.asar` 证明新源码已修复。

本节的“20 轮”是最终解包版的人工 smoke，只启动应用和点击主导航，不触发发布、付费、取消、保存或外部刷新。优先使用临时/合成环境；若必须打开真实账号或真实用户工作区，执行前取得当次授权。若未来自动化该验收，必须使用合成数据和假 transport，不能控制真实环境。

建议构建命令由当时 Git/执行授权决定：clean worktree 使用正式 clean gate；若仍处于经允许的实施 dirty 状态，只能使用项目已有的 `pack:alpha:dirty`，不得绕过构建脚本手改包。

验收矩阵：

| 状态               | 序列                           | 节奏         | 预期                   |
| ------------------ | ------------------------------ | ------------ | ---------------------- |
| 冷启动             | 媒体资源 → 订单                | 150–220ms    | 最终订单高亮且订单可见 |
| 冷启动             | 订单 → 设置                    | 150–220ms    | 最终设置高亮且设置可见 |
| 冷启动             | 内容生产 → 投稿中心 → 媒体资源 | 快速连续     | 最后意图获胜           |
| 冷启动             | 六入口往返                     | 0–250ms 混合 | 停止点击后 1 秒内收敛  |
| 页面已预热         | 任意两页往返                   | 快速连续     | 最后意图获胜           |
| 点击中伴随查询完成 | 任意两页                       | 快速连续     | 查询刷新不改变当前页   |

至少执行 20 轮冷启动快速导航。判定按轮计算：任何一轮出现“高亮 B、页面 A”且超过 1 秒不收敛即失败，不允许通过点击 A 恢复后把该轮记为通过。

### N5 — Primary Review

Primary Review 只检查本修复直接风险：

1. 回归测试是否真实捕获冷启动首次页面竞态；
2. fallback 是否只是可选诊断信号，同一测试是否按固定轮次达到红绿阈值；
3. 测试是否只用合成数据且没有外部写操作；
4. `currentView` 是否仍是唯一导航 owner，`aria-current` 是否只是它的投影；
5. 是否删除伪懒加载而没有新增平行状态机或恢复 watchdog；
6. 页面 import 是否影响冷启动交互、打包或 Electron `file://`；
7. 原有跨页 intent、订单打开、设置首次交互及解包版人工 smoke 是否通过。

Finding 按项目 `AGENTS.md` 分类。P0/P1 阻塞；P2 只有直接影响当前导航正确性、测试可信度、打包合同或公开 UI 行为才阻塞。

### N6 — Bounded Re-review 与 Closure

修复 blocking finding 后只做 bounded re-review：已知 finding、修复 diff、导航收敛不变量、直接调用方、Renderer build 和解包版冷启动回归。除非修改公开合同、构建格式、页面事实 owner 或引入新的严重问题，不重开 fresh full review。

完成证据至少包括：

- 当前代码上的红灯输出；
- 修复后同一命令的绿灯输出；
- 红绿阶段的固定轮次和最终观察结果；
- Renderer typecheck/build 结果；
- 最新解包版人工 20 轮冷启动矩阵结果，或未运行及授权/环境原因；
- 实际改动文件；
- 未运行的重要验收及原因；
- Primary Review finding 与 bounded closure；
- 最终 Git status、HEAD/commit（如获得提交授权）和生成物对应关系。

## 5. 完成定义

只有同时满足以下条件才可标记完成：

- 用户原始症状有自动化红灯回归；
- 红灯达到固定复现阈值，首选修复或经批准的备选修复让同一命令按相同 timing 6/6 转绿；
- 最后导航意图、Sidebar 高亮和实际页面始终收敛；
- `aria-current="page"` 是 `currentView` 的唯一可访问性投影，测试不锁死视觉 class；
- 冷启动与预热状态矩阵通过；
- 没有新增第二导航 state、点击锁、watchdog、reload 或兼容层；
- Renderer typecheck/build 和直接回归通过；
- 最新解包版由最终源码正式构建并通过 20 轮压力测试；
- blocking review findings 关闭；
- 最终证据绑定到最终代码状态，临时诊断和测试进程已清理。

## 6. 非目标与未来 owner

本修复不顺带处理：

- `GeneratedArticlesView.tsx` 的文章库职责拆分；
- App 顶层 feature 订阅和设置启动查询下沉；
- 订单页 props/view-model 收敛；
- 全局设计 token 或整体 UI 换肤；
- 真正的 Renderer 代码拆分、多 chunk 加载或 bundle 性能优化；
- 主导航路由库迁移；
- 任何文章生命周期、投稿、付费、订单和媒体供应商行为。

这些属于独立 UI/架构工作，不能并入本次导航正确性修复。若未来要实现真正代码拆分，应单独评估 Electron `file://`、CSP、chunk 路径、离线打包、首次加载 fallback 和导航动画边界，再决定是否恢复页面 lazy import。

## 7. 需要用户确认的条件

当前没有必须确认的开放产品决策。首选方案保留现有页面结构和 150ms 动画体验。

实施过程中只有出现以下情况才暂停并请求用户决定：

1. 静态 import 修复不能闭合回归，下一步必须在“严格先退后进”与“同步/交叉淡入”之间改变用户可见动画体验；
2. 用户希望本次同时改成真正多 chunk 代码拆分，这会扩大到构建、打包和离线加载合同；
3. 自动回归只能依赖真实用户内容库、真实账号或外部服务才能复现，无法建立安全的合成测试 seam；
4. 当前源码、测试与本计划的根因事实出现冲突，继续会制造第二导航 owner。

普通测试失败、fixture 补齐、TypeScript 错误、局部 CSS/可访问性调整或 timing 参数收紧不构成询问理由，应在本计划边界内自行解决。
