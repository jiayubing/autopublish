# 26-A — 文章库投影与权限合同

## 目标

由唯一生命周期投影 owner 输出新的文章库分类、可编辑性、投稿资格和删除权限。移除把 `paid_processing`、`failed` 当作文章阶段的公开合同；需处理事项保持独立事实。

## 最小必读

只读以下内容，不预读后续工作包：

1. 根 `AGENTS.md`。
2. 根 `CONTEXT.md` 中：文章、待投稿文章、待完善文章、普通平台队列项、已确认付费批次、活动发布目标、付费处理中、需处理事项、投稿中文章、结果不确定、已发布文章、文章库、回收站文章。
3. 根 SPEC：§2、§3.2、§7、§8、§9.2–9.3、§11。
4. Wave Plan：§1 当前动作、§3 阶段 11.5；`EXECUTION-PROTOCOL.md` §§2–6、§8；`AUDIT-PROTOCOL.md` §§1–6、§10。
5. umbrella `issues/26-article-library-and-submission-center-redesign.md` 与 `handoffs/26-0-dirty-reconciliation-and-contract-freeze.md`。
6. 直接 owner：`src/content/article-lifecycle-projection.js`、`article-lifecycle-facts.js`、`article-submission-eligibility.js`、`desktop/services/article-management-snapshot.js`、`desktop/ipc/contracts/article-management-contracts.js`。
7. 直接消费者：`media-workbench/src/article-workflow.ts`、文章管理 bridge/types、文章库筛选组件。
8. 直接行为测试：`phase-03-six-stage-article-lifecycle.test.js`、`article-management-filter-model.test.js`、`article-management-snapshot.test.js`、`ticket-25-b-lifecycle-acceptance.test.js`。

不要读取 Ticket 18–25 历史 handoff、平台 adapter、订单供应商实现或 Renderer 其他页面，除非测试证明存在直接不变量。

## 实施边界

- 先写公开行为状态矩阵，再修改 owner。
- 分类固定为 `待投稿 | 待完善 | 投稿中 | 已发布 | 回收站`；需处理数量和订单摘要是独立字段。
- 编辑、投稿、回收权限只由同一投影/策略 owner 给出稳定 reason code。
- 不改队列、订单、发布、删除 schema 或 writer。
- 若为迁移直接消费者需要短期派生字段，必须在本 Ticket 内写明唯一消费者和 26-H 删除点；不得新增第二套判断。

## 验收条件

- 生成完整且无运行事实 → 待投稿、可编辑、可投稿。
- 内容不完整或存在可由编辑解决的内容校验问题，且无运行事实 → 待完善、可编辑、不可投稿。
- 普通队列、已确认付费批次、活动订单或结果不确定 → 投稿中、冻结。
- 明确失败/退稿且目标已结束 → 按内容完整性回待投稿或待完善，同时保留独立需处理事项。
- 首次可信成功 → 已发布、永久只读，迟到退稿/售后不覆盖。
- 回收事实 → 回收站；活动/发布冲突仍通过 attention 报告且操作 fail-closed。
- `paid_processing` 与 `failed` 不再是公开文章分类。
- 所有导航计数与权限来自一次批量投影，无逐文章运行事实查询。
- 旧六阶段行为测试被新的公开状态矩阵替代，而不是以源码字符串证明 absence。

## 最低验证

- 生命周期 owner/state matrix tests。
- article management snapshot/IPC contract tests。
- Renderer typecheck（若改 transport/types）。
- `git diff --check`。

## 停止条件

仅在以下情况停止请求主任务处理：

- 现有持久事实无法区分“确认前付费选择”和“已确认付费批次”，继续会制造错误冻结；
- 必须新增新的产品分类或改变首次发布成功不可逆规则；
- 当前 dirty 文件与 handoff 不一致且无法确认用户改动；
- 需要 schema/远端副作用修改才能完成投影。

普通测试失败、消费者较多或需要删除旧测试不构成停止理由。

## 完成交接

记录状态矩阵、公开 contract before/after、直接消费者、实际测试、遗留短期字段及其 26-H 删除点。完成后停止，不进入 26-B。
