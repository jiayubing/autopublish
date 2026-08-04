# 16 — 执行功能开发准入模拟

**What to build:** 使用只存在于测试/设计 fixture 的三个模拟变更，证明新增 fake 平台、publication 查询字段和 content command 都能沿既有深模块边界完成，不要求修改多个无关模块或学习 implementation 顺序；不实际发布任何产品功能。

**Blocked by:** 14 — 执行功能、故障与安全最终验收；15 — 执行迁移、容量、制品与回滚验收

**Status:** ready-for-agent

## 必读输入

- Tickets 14/15 的最终自动验收证据和当前 module/capability map。
- 目标架构的 Publisher、PublicationWorkflow、OperationalStore query/DTO、Content application、typed IPC 和 Renderer feature seams。
- Phase 8 功能开发准入测试三项定义。

## 开始门禁

1. 确认 Tickets 14/15 所有自动项通过或有明确前序阶段重开；存在自动失败时不得开始模拟。
2. 冻结 production source；模拟只能使用测试 fixture、compile-time contract、临时 patch 记录或静态 change-surface 分析，不留下产品 capability。
3. 为每项模拟定义允许修改面和禁止触及模块。

## 执行过程

1. **新增 fake 平台：** 以测试 adapter/registry fixture 接入 Publisher contract，证明 PublicationWorkflow、OperationalStore schema 和 Renderer 无需修改。
2. **新增 publication 查询字段：** 以测试 DTO/projection fixture 贯穿权威 query、typed contract 和一个 feature snapshot，证明无需多个 View 手工刷新或读取数据库。
3. **新增 content command：** 以 contract/handler/feature fixture 贯穿 Content application、typed IPC 和一个 Renderer feature，证明无需接触路径/数据库 implementation。
4. 对每项记录实际需要理解/修改的模块、public interface 数、调用顺序知识、测试入口和删除模拟后的绿色基线。
5. 执行 deletion test：移除对应深 module 时复杂性应散回 caller；若只是 pass-through，标记设计失败。
6. 清除临时模拟产物，重新验证 production source/capability/schema 与模拟前一致；保留测试性架构证明和安全摘要。

## 模块边界

- 模拟不能成为隐藏产品功能、长期 compatibility adapter 或新 production channel。
- 不以机械文件数判断深度；重点是 caller 必须学习的概念、顺序、错误和配置数量。
- 允许内部测试 adapter，不允许 test double 拥有 production contract 没有的能力。

## 验收标准

- [ ] fake 平台只需要 Publisher adapter/registry fixture，workflow/store/Renderer production code 无变化。
- [ ] publication 字段只触及权威 query/DTO/一个 feature projection，不需多个 View 刷新。
- [ ] content command 只经过 Content application、typed IPC 和一个 feature，不触及路径/数据库实现。
- [ ] 三项模拟均记录 change surface、接口负担和删除测试结论。
- [ ] 模拟结束后 production source、schema、capability inventory 与自动验收基线一致。
- [ ] 任一失败均映射到明确前序阶段，而不是在 Phase 8 增加 wrapper。

## 必跑验证

- 三项 admission contract tests、architecture/capability inventory、相关 domain/feature tests。
- 完整 root suite、lint/typecheck/build、legacy absence、`git diff --check`。

## 交接与停止条件

- 记录每项模拟结果、预期新功能模板和需要重开阶段的任何边界失败。
- 若模拟要求跨多个无关模块、学习 implementation 顺序或修改 schema/公共 interface，停止并重开相应阶段。
- 不保留产品实现，不自动提交。

