# 26-H — Renderer 信息架构

## 目标

把主导航和页面重组为“内容生产、文章库、投稿中心、订单、媒体资源、设置”，彻底移除旧六阶段文章导航、其他平台投稿页和付费暂存队列页。

## 最小必读

1. 根 `AGENTS.md`。
2. `CONTEXT.md` 中：文章库、投稿中心、需处理事项、服务商订单、媒体资源。
3. SPEC：§1–4、§7–9、§11 第 14 项。
4. Wave Plan 当前动作、umbrella、26-A–G 各最终 handoff、本合同；`EXECUTION-PROTOCOL.md` §§2–6、§8；`AUDIT-PROTOCOL.md` §§1–6、§10。
5. 页面组合：`App.tsx`/view types、`Sidebar.tsx`、`ContentWorkbench.tsx`、article library components、`PlatformWorkbench.tsx`、`PaidMediaWorkbench.tsx`、`OrdersView.tsx`。
6. Feature/read model：content、platform、media、attention contexts 及上游 26-D/E/F 新工作台 query。
7. 直接测试：renderer navigation、article management filters/flow、platform queue、paid workbench、orders、responsive/layout、bridge capability absence。

不要读取 domain/store internals、平台 adapter、migration planner 或历史 UI handoff；上游行为以 A–G handoff 和公开 contracts 为准。

## 实施边界

- Renderer 不重新判断生命周期、费用、移出、取消或 resolution 权限。
- 页面只消费版本化 read model 和具名 command。
- 跨页导航传稳定 identity/filter intent，不传共享可变 article/order object。
- 删除旧页面/入口/feature 后同步删除 bridge/types/CSS/tests 残影，不保留隐藏兼容入口。
- 可拆分现有巨型组件，但拆分必须按文章库、投稿入口、回收站、详情等职责形成有行为的组件/feature，不制造纯转发层。

## 验收条件

- Sidebar 只有六个新入口及真实 badge；不显示伪造成功率/无事实监控。
- 内容生产只含采集/生成；文章库独立可达。
- 文章库支持五类筛选、批次筛选、编辑、发起投稿、查看进度/档案/订单、回收站。
- 投稿中心含普通队列、已确认付费批次、需处理事项，所有执行动作集中。
- 订单页只处理真实订单。
- 旧“历史文章六阶段 tabs”“其他平台投稿”“付费媒体投稿暂存队列”生产入口 absence。
- 加载、空态、错误、禁用、确认、stale refresh、客户切换和窄屏均有行为测试。
- 组件不访问 Electron transport 或复制主进程状态机。

## 最低验证

- Renderer strict typecheck、lint、build。
- navigation/layout/responsive/customer-switch/editor/queue/paid/order/attention tests。
- preload/bridge capability absence tests。
- production packaging renderer smoke（若合同要求）。
- `git diff --check`。

## 停止条件

- 上游 A–G 任一公开 capability/handoff 缺失，UI 只能通过复制业务规则补齐；
- 需要新的产品页面或动作选择；
- 当前 dirty Renderer diff 与 26-0/c10a838 provenance 不一致且无法保全；
- 需要真实账号或真实付费才能证明基础 UI 行为。

组件较大、测试需更新和 CSS 重排不构成停止理由。

## 完成交接

记录导航 before/after、删除的旧入口、read model/command mapping、组件职责、截图或结构证据及实际测试。完成后停止，不进入 26-I。
