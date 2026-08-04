# 08 — 迁移 Content 与 Generation Renderer 切片

**What to build:** 内容管理、资料/模板、生成 batch、文章审核、trash/removal 从 typed bridge 到 feature snapshot、commands 和 View 全链使用分域模块；View 只渲染 snapshot 和发送命令，异步请求身份、invalidation、busy/error 和 dispose 均由对应 feature owner 管理。

**Blocked by:** 07 — 扩展 Renderer 分域类型与 Bridge 布局

**Status:** ready-for-agent

## 必读输入

- Ticket 07 的 domain layout、content/generation symbol 清单和旧 barrel remaining callers。
- Content/generation bridge、feature、context/hooks、article management snapshot 与主要 Views。
- Phase 5/6 handoff以及 request identity、deferred promise、invalidation、confirmation host 和 responsive behavior tests。

## 开始门禁

1. 确认 Ticket 07 完成，Content/Generation wire contracts 无未决变化。
2. 冻结现有 feature public surface、snapshot shape、command result/error 和 invalidation scopes。
3. 为每个主要用户流建立从 View → feature → bridge → preload → application 的 production-chain contract。

## 执行过程

1. 按资料/模板、生成计划与运行、文章管理、删除/恢复四个小批次迁移类型和 bridge imports。
2. 将请求 token、scope、缓存、invalidation subscription、command busy/error/result 收入对应 feature；View 不直接读取 bridge 或手工刷新多个查询。
3. 将过长 View 拆为内聚展示组件和局部纯交互 helper；业务决策仍在 feature/application，不把 feature 逻辑搬进 hooks 碎片。
4. 每批验证切换客户、快速连续请求、过期结果、command failure、dispose/remount 和 workspace invalidation。
5. 删除 content/generation 范围内的旧 imports、重复 hooks、共享 busy、局部 native confirm 和无后端 owner UI。
6. 对拆分模块执行 deletion test，合并只传递 props/调用的浅 wrapper。

## 模块边界

- Feature module 拥有 request identity、snapshot、commands、invalidation 和 dispose。
- View 只渲染和发命令；bridge 只做 typed transport/error projection。
- Confirmation 通过唯一 ConfirmationHost，不在业务 View 调用 native confirm。
- Background result 不因 UI scope 变化被丢弃；过期结果只是不覆盖当前 snapshot。

## 验收标准

- [ ] Content/Generation production caller 全部改用分域类型与 bridge，不再引用旧共享 barrel。
- [ ] 每个 feature 有独立 snapshot、busy/error/result、request identity、subscription 和 dispose。
- [ ] View 不直接调用多个查询拼 management 状态，不包含 transport channel 或路径/数据库规则。
- [ ] 客户切换、竞态、失败、重试、删除/恢复和生成 handoff 行为保持稳定。
- [ ] 无页面级重复 invalidation、共享 busy、native confirm 或伪 UI consumer。
- [ ] 拆分后文件职责清晰，长 View/feature 符合 Ticket 01 规模门。

## 必跑验证

- Content/Generation feature、bridge、article management/removal、request race、confirmation、responsive UI 定向测试。
- renderer/bridge typecheck、Renderer build、lint、完整 root suite、Electron focus smoke、`git diff --check`。

## 交接与停止条件

- 记录迁移 symbol、feature owner、删除旧 imports、竞态矩阵和剩余 Ticket 10 收缩项。
- 若必须改变 Content/Generation application/IPC interface，停止并重开 Phase 5/6。
- 不增加产品功能，不自动提交。

