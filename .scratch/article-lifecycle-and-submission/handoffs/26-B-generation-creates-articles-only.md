# 26-B — 内容生产只创建文章：实施与审计交接

## 执行范围

- 基线：`77a9851eef67151c6a89d1fe8650cba2842dcbe8`。
- Worktree：`C:\Users\violet\.codex\worktrees\7602\官媒投稿-refactor`。
- 当前 worktree 保持 detached HEAD；未切换、push、release 或执行真实登录/投稿/付费/生产数据库操作。
- 本交接只覆盖 26-B；未进入 26-C 或后续工作包。

## 结果

生成成功路径现在只保留文章与生成批次/任务事实。生成 owner 的三个直接模块仍不接收 regular queue、paid admission 或 order 能力；旧的生成→投稿交接能力在确认无其他生产消费者后完整删除。批次结束按钮改为导航到文章库并设置内存中的 `generationBatchId` 筛选，不创建投稿选择、队列、发布目标、付费批次或订单。

文章继续保存稳定的 `generationBatchId` 与 `generationTaskId`，并保持 `status: "generated"`。失败、暂停、继续、停止、重试和取消仍由原 generation batch/runner 状态机处理。

## Owner 与依赖变化

| 事实/边界 | 变更前 | 变更后 |
| --- | --- | --- |
| 生成 owner（service/runner/generator） | 已无直接投稿 admission 注入；composition 另行装配 generation handoff service | 仍只创建/保存文章，且增加静态依赖门禁 |
| 成功文章身份 | 由生成 task 产生并保存 | 继续保存 `generationBatchId`/`generationTaskId`，服务测试覆盖 |
| 批次完成 UI | `GenerationSubmissionHandoffDrawer` 调用 preview/commit IPC | `GenerationBatchDetail` 只发出导航意图，`ContentWorkbench` 设置文章库批次筛选 |
| 旧能力链 | `generation.previewSubmissionHandoff`、`generation.commitSubmissionHandoff`、`content.listSubmissionPlatforms` 及其 service/IPC/preload/bridge/feature/UI | capability、所有真实消费者、DTO、fixture、测试和 invalidation reason 均删除；未保留 alias |

## 删除的 capability/consumer

删除内容包括：

- `desktop/services/generation-submission-handoff-service.js`；
- `desktop/ipc/generation-submission-handoff-ipc.js` 与 generation handoff contracts；
- `desktop/ipc/contracts/submission-platform-contracts.js` 及 `content:list-submission-platforms`；
- preload、`bridge/generation.ts`、generation feature/hook 中的旧方法；
- `GenerationSubmissionHandoffDrawer.tsx`、旧 IPC/服务/容量/renderer 测试及 production IPC fixture 记录；
- `GENERATION_SUBMISSION_HANDOFF_COMMITTED` invalidation reason、测试 inventory 与 focused verify 中的旧路径。

生产代码扫描中旧 capability 关键词无命中；命中仅存在于 `content-generation-batch-service.test.js` 的 legacy-absence/owner-dependency 断言中。

## 公开行为/能力状态矩阵

| 状态/动作 | 持久事实 | 公开行为 | 证据 |
| --- | --- | --- | --- |
| 生成成功 | 新文章、批次完成、task 成功；文章含 batch/task identity | 显示“查看本批次文章”，进入文章库并只显示该批次文章 | `content-generation-batch-service.test.js`；`renderer-generation-batch-navigation.test.js` |
| 重复导航 | 不新增文章或投稿事实 | 可重复进入同一筛选；可清除筛选 | renderer batch navigation 回归：两次导航后 mutation counter 仍为 0 |
| 生成失败/资料读取失败 | 保留失败 batch/task/error；不会以空输入继续生成 | 原错误状态与可恢复动作继续可见 | generation service/runner 定向套件 |
| 暂停/继续/停止/重试/取消 pending | 使用既有 batch/runner 状态转换 | 仍由 generation command owner 处理 | generation service/runner 与 feature typed IPC 测试 |
| client scope 切换 | 不复制或重建生成事实 | 文章库按既有 client scope 刷新 | `renderer-content-client-switch.test.js` |

## 零投稿事实证明

- `content-generation-batch-service.test.js` 的 owner dependency test 扫描 service、runner、generator，禁止 handoff、regular admission、paid submission、order creation 依赖。
- 同一测试的 legacy absence gate 检查旧生产文件已删除，并扫描 preload/IPC/bridge/feature/UI 关键路径无旧 capability。
- 生成服务测试只注入 article content store，成功断言文章身份和 `status: "generated"`；没有 queue/order/paid writer 入口。
- Renderer 合成 fixture 对 queue/paid mutation 做计数；重复点击“查看本批次文章”后计数始终为 `0`。
- production IPC registry 从 131 项收敛为 128 项，删除的三项正是上述旧 handoff/platform discovery capability。

## Primary Audit

审计范围为基线到当前 worktree 的全部生产、测试和必要 fixture/script diff，并按 owner、公开合同、状态/副作用、旧能力清零、错误路径和测试证据检查。

- 本包未发现 P0/P1 或直接阻塞正确性、一致性、幂等、安全、公开合同的 P2 finding。
- `EXPOSED_PREEXISTING / PROCESS_EVIDENCE_GAP`：`phase-06-production-ipc-fixture-matrix.test.js` 的 `attention.listArticleAttention` 生命周期 field consumer 仍无法被现有 TypeChecker consumer matcher 识别。证据显示 attention feature、bridge、preload、registrar 和 entry receiver 均可达；失败点是既有 snapshot field 消费映射。26-B 未修改 attention owner，因此未为其引入旁路或无关修复。

## Bounded re-audit

针对 Primary Audit 已知 finding 和本次删除/导航 diff 重跑：

- generation owner/runner/service、typed generation/content/submission IPC、generation feature、regular queue seam、workspace lifecycle、renderer type owner：85 tests，85 pass；
- renderer batch navigation：1 pass；renderer client switching：1 pass；
- renderer `tsc --noEmit`：pass；strict `tsc --noEmit -p tsconfig.strict.json`：pass；Vite production build：pass（仅已有单 chunk >500 kB warning）；
- legacy capability scan：生产路径零命中；`git diff --check`：pass；
- production IPC fixture matrix：34 pass、2 fail，仍只失败上述 `attention.listArticleAttention` aggregate/lifecycle evidence gap；其余 128 capability registry 与其他 lifecycle cases 通过。该 bounded re-audit 未改变 finding 分类，也未发现本包新增阻塞项。

## 实际命令与结果

通过：

- `npm ci --ignore-scripts`
- `npm --prefix media-workbench ci --ignore-scripts`
- `npm --prefix media-workbench run lint`
- `npm --prefix media-workbench run typecheck:strict`
- `npm --prefix media-workbench run build`
- `npm run test:inventory`
- `node --test --test-concurrency=1 tests/content-generation-batch-service.test.js tests/generation-batch-runner.test.js tests/phase-06-generation-typed-ipc.test.js tests/phase-06-generation-feature.test.mjs tests/phase-06-content-operations-typed-ipc.test.js tests/phase-06-submission-typed-ipc.test.js tests/phase-05-production-seams.test.js tests/phase-07-regular-queue.test.js tests/phase-08-renderer-contract-layout.test.js tests/workspace-runtime-lifecycle.test.js`
- `node --test --test-concurrency=1 tests/renderer-generation-batch-navigation.test.js`
- `node --test --test-concurrency=1 tests/renderer-content-client-switch.test.js`
- `git diff --check`

`test:inventory` 生成的 M05 台账文件是验证脚本的副作用，已恢复为任务开始时版本，未纳入本包提交。

## 未运行的重要验收与剩余风险

- 未运行完整 `npm test`、`npm run verify`、`npm run test:desktop-core` 和 `npm run test:capacity`；这些会扩大到本工作包外的大量历史/发布/打包场景，本包最低合同 gate 已逐项运行。production IPC matrix 已单独运行并保留上述既有 evidence gap。
- 未执行真实账号登录、远端投稿、付费、取消、生产数据库迁移或删除，符合项目外部操作安全边界。
- batch navigation renderer fixture 覆盖单 client 的公开文章库筛选；文章库本身仍按当前 client scope 工作，多 client 批次的跨 scope 汇总未在本包新增产品 API 中承诺。
- Vite 仍报告 bundle chunk 超过 500 kB；本包未改变该既有构建容量问题。

最终 commit hash 见本任务最终报告；本文件与本包源码/测试在同一个单一意图提交中。
