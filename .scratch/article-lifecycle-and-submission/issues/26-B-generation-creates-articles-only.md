# 26-B — 内容生产只创建文章

## 目标

生成模块成功后只保存文章；移除生成批次直接创建普通队列的生产能力。批次结束后只导航到文章库并筛选该批次文章。

## 最小必读

1. 根 `AGENTS.md`。
2. `CONTEXT.md` 中：生成任务、生成批次、文章、待投稿文章、普通平台入队批次、文章库。
3. SPEC：§2.2、§3.1–3.2、§4.1、§9.1、§10、§11 第 1–2 项。
4. Wave Plan 当前动作、umbrella、26-A handoff、本合同；`EXECUTION-PROTOCOL.md` §§2–6、§8；`AUDIT-PROTOCOL.md` §§1–6、§10。
5. 直接 owner：`desktop/services/content-generation-batch-service.js`、`src/content/generation-batch-runner.js`、`src/content/article-generator.js`。
6. 旧交接链：`generation-submission-handoff-service.js`、对应 IPC/contract/preload/bridge/feature、`GenerationSubmissionHandoffDrawer.tsx`、`GenerationBatchDetail.tsx`。
7. 直接测试：content generation batch/service/IPC、`renderer-generation-submission-handoff.test.js`、generation feature tests。

不要读取 regular executor、platform adapters、paid media/order internals 或 migration 历史 handoff。

## 实施边界

- 生成服务不注入 regular queue、paid admission 或订单能力。
- `generationBatchId`/task identity 继续保存在成功文章，供文章库筛选。
- “查看本批次文章”只是导航意图，不创建持久投稿选择。
- 旧 handoff 的所有真实消费者清零后删除 service、IPC、bridge、DTO、UI、fixture 和测试；不保留 alias。

## 验收条件

- 单篇/批量生成成功只新增文章与生成批次事实，运行库中无队列、活动目标、付费批次或订单。
- 失败、暂停、继续、停止和取消生成任务行为不回归。
- 批次结束后可从公开 UI 导航到文章库并只筛选本批次成功文章。
- 重复导航不重复创建文章或任何投稿事实。
- production dependency scan 证明生成 owner 不依赖投稿 admission。
- 旧“将成功文章加入投稿队列”能力在 production/bridge/UI 中不存在。

## 最低验证

- generation batch owner/integration tests。
- Renderer generation flow 与 batch navigation tests。
- Renderer typecheck/build（涉及 UI 时）。
- legacy capability absence 静态 gate。
- `git diff --check`。

## 停止条件

- 文章缺少稳定 `generationBatchId`，且补充会不可逆改变历史 schema；
- 当前唯一用户路径无法导航/筛选而需要新的产品决策；
- 删除旧交接会影响非生成消费者，且该消费者不属于已确认旧路径。

普通 UI 重接、测试更新和旧能力删除不构成停止理由。

## 完成交接

列出删除的 capability/consumer、生成模块依赖 before/after、零投稿事实证明与实际测试。完成后停止，不进入 26-C。
