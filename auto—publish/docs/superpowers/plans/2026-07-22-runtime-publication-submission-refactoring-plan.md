# AutoPublish 运行时、发布事实与投稿模块重构计划

**日期：** 2026-07-22  
**基线：** `2a018fe`  
**状态：** 实施中；Phase 0-7 的实施、替换测试和最终 `npm test` 验证已完成。P2 仍因未满足启动条件而不实施；`npm run pack:alpha` 在本次执行窗口内超时，alpha package smoke 尚未通过。
**范围：** Electron 主进程运行时组装、发布账本注入、普通平台 Worker 归档事实、投稿批次查询、投稿模块深化、IPC 注册、相关 Renderer 控制器与测试  
**依据：** 全项目只读架构审查、静态依赖图、生产调用链复核、投稿批次内存基准、`CONTEXT.md`、ADR 0003-0004，以及 `2026-07-21` 架构深化计划实施后的剩余问题

## 一、执行结论

项目不需要推倒重写。当前分层方向、Electron 安全设置、工作区隔离、发布状态机和本地文件事务总体健康。后续优化只处理已经有证据证明“收益高于成本”的模块。

本计划按以下顺序实施：

1. 先建立能够在当前实现上失败的运行时组装、跨进程归档和真实查询性能测试。
2. 修复主进程 publication ledger 所有权，让所有主进程调用方使用同一运行时实例。
3. 把普通平台 Worker 的本地归档结果写入持久事实，不能继续依赖进程内 `Map`。
4. 消除投稿批次读取的重复全量扫描，并建立真实 store benchmark。
5. 在行为稳定后深化投稿模块，保持现有 IPC interface 兼容。
6. 收口 Workspace Runtime、IPC 注册和 mutation invalidation policy。
7. 审计并退休无 Renderer 调用者的旧投稿执行链。
8. 最后才处理 Renderer 控制器和模块全局 RuntimePaths；没有量化收益时不启动 P2。

| 优先级 | 主题 | 预期收益 | 风险 | 成本 |
| --- | --- | --- | --- | --- |
| P0 | 主进程 publication runtime 单一所有权 | 修复文章管理发布历史缺失和状态来源分裂 | 中 | 2-4 天 |
| P0 | Worker 归档结果持久化 | 防止远端成功、本地归档失败事实跨进程或重启丢失 | 中 | 2-4 天 |
| P0 | 投稿批次只读 snapshot/index | 消除近似二次扫描，降低主进程长任务 | 中高 | 3-6 天 |
| P1 | 投稿模块深化 | 提高局部性、可测试性，缩小状态机修改影响范围 | 高 | 1-2 周 |
| P1 | Workspace Runtime 与 invalidation policy | 消除隐式注册顺序和全局实例泄漏 | 中高 | 5-8 天 |
| P1 | 旧投稿执行链退休 | 删除缺少完整账本保护的第二套执行路径 | 中 | 1-3 天 |
| P1 | Renderer 控制器收敛 | 降低迟到响应和交互状态互相覆盖 | 中 | 5-8 天 |
| P2 | RuntimePaths 去全局化 | 消除 require 顺序和隐藏工作区依赖 | 高 | 1-2 周 |
| P2 | 跨测试文件 Renderer runner | 缩短反馈时间；仅在测量后实施 | 中 | 2-4 天 |

## 二、与已有计划的关系

### 2.1 继承但不重复的工作

本计划继承以下文档已经建立的约束和模块：

- `2026-07-20-codebase-optimization-and-test-consolidation-plan.md`
- `2026-07-21-architecture-deepening-decoupling-performance-plan.md`
- `2026-07-22-submission-generation-media-branding-pending-workflow-remediation-plan.md`

以下工作已经完成或由其他计划负责，本计划不重复实施：

- Electron 升级、签名、ASAR 和打包边界。
- Renderer bridge 按领域拆分和 `electron-api.ts` 删除。
- 平台投稿 plan 收回主进程。
- 批量生成运行快照。
- 品牌显示、单篇生成保存和 Media 页面刷新等功能修复。
- 通用 Lint、Prettier、CI 和符号链接执行环境。

### 2.2 本计划接管的剩余问题

本计划只接管以下已验证问题：

1. `article-management-ipc.js` 依赖 `values.publicationLedger`，但生产组合根没有传入该依赖。
2. 主进程内多个 IPC/module 各自创建 publication ledger，运行时事实所有权不明确。
3. 普通平台投稿发生在 Worker，但归档失败只写入 Worker 内存 `Map`；主进程 attention 读取的是另一份实例。
4. `contentSubmissionService.listBatches()` 对批次和 item 重复执行全量扫描。
5. 现有文章管理 benchmark 注入纯内存数组，没有覆盖真实投稿查询路径。
6. IPC 注册通过修改共享 `deps` 对象传递 `archiveIssueReader`，注册顺序成为隐藏 interface。
7. `main.js` 的业务 module 生命周期仍由多个全局变量承载，`AuthenticatedRuntime` 尚未形成完整 Workspace Runtime。

## 三、不可变业务门槛

任何阶段都必须遵守 `CONTEXT.md` 和 ADR 0003-0004。以下条件是 hard gate，不得用重构便利性换取弱化：

- `uncertain` 继续阻止自动重试；不得将超时、进程退出或本地写入失败自动归类为明确远端失败。
- publication 状态只描述远端发布事实；本地归档失败不得把 `published` 改成 `failed`。
- 发布记录、attempt 历史和标题快照不得因本地回收、队列清理或文章永久删除而丢失。
- 投稿动作计划继续绑定 revision、planId 和逐项 fingerprint；mutation 执行前必须重新读取并 fail closed。
- 同一文章与同一发布目标不得产生并发重复投稿。
- 队列 Markdown 与 submission sidecar 的身份、内容哈希和路径必须继续校验。
- 文件损坏、符号链接、路径逃逸、部分文件缺失和原子写入失败继续 fail closed。
- Renderer 不得获得绝对路径、Cookie、密钥、未过滤错误、publication 内部文件名或 Worker 内部 plan。
- 工作区切换、退出和认证失效时，Worker、浏览器会话、订阅和临时凭据必须可清理。
- 不调用真实 AI、真实浏览器投稿、真实付费媒体或客户工作区完成自动化验收。

## 四、明确不做

以下修改的收益低于成本，不进入实施范围：

- 不因文件行数拆分 `auth-domain.js`。它已有清楚的领域 interface 和内存/SQLite 两个真实 Repository Adapter。**不值得修改。**
- 不因文件行数拆分 `article-store.js`。双文件事务、回收和恢复集中在一个深模块中。**不值得修改。**
- 不把 `workspace-bootstrap-service.js` 拆成大量浅 helper module。安全时序保持局部更重要。**不值得修改。**
- 不仅为整理 import 而拆散 `media-workbench/src/types.ts`。会触碰大量调用方但没有运行时收益。**不值得修改。**
- 不做全项目 JavaScript 到 TypeScript 的一次性迁移。**不值得修改。**
- 不引入数据库、消息队列或微服务替代当前可迁移内容库。**不值得修改。**
- 不继续抽象头条/猎聚仅剩的少量生命周期转发函数。共享 browser lifecycle 已经存在。**不值得修改。**
- 不为本地文件模块创建只有一个生产 Adapter 的 hypothetical seam；本地文件依赖使用临时工作区测试。
- 不在同一提交中混合性能优化、状态机重构、测试删除和格式化。

## 五、当前架构与问题证据

### 5.1 当前主链路

```text
Renderer
  -> domain bridge
  -> preload
  -> authenticated IPC
  -> desktop modules
  -> content/publication/platform modules
  -> portable content library

普通平台投稿：
Renderer -> platform IPC -> main-process plan -> Worker
         -> platform adapter -> publication ledger -> batch update -> local archive
```

### 5.2 当前事实所有权矩阵

| 事实 | 当前 owner | 持久化位置 | 当前问题 |
| --- | --- | --- | --- |
| 文章正文与版本 | `ArticleStore` | 内容库 JSON + Markdown | 健康，不重构 |
| 投稿队列 pair | `ContentSubmissionService` / export module | Markdown + sidecar | owner 较宽，但事实明确 |
| 投稿批次 | `SubmissionBatchStore` | submission record JSON | 读取路径重复扫描 |
| 远端发布状态 | `PublicationLedger` | publication JSON | 主进程实例分散 |
| 本地归档结果 | Worker `archiveFailures` Map + 即时 result | 无稳定持久事实 | 跨进程和重启丢失 |
| 文章管理视图 | `ArticleManagementSnapshot` | 派生缓存 | 生产 wiring 缺 ledger |
| 需处理项 | `ArticleAttentionQuery` | 派生缓存 | archive reader 指向错误实例 |
| 工作区 revision | `main.js` | 进程内递增值 | scope policy 分散 |

### 5.3 publication runtime wiring 缺口

生产路径当前行为：

1. `ContentSubmissionService` 未获得注入时自己创建 ledger。
2. Media IPC、publication IPC、attention IPC 也会各自创建 ledger。
3. `article-management-ipc.js` 只转发 `values.publicationLedger`。
4. `main.js` 调用 `registerIpc()` 时没有提供该字段。
5. `ArticleManagementSnapshot` 最终使用空对象，`listForArticles` 不存在时 publication records 为空。

这不是 `PublicationLedger` implementation 的缺陷，而是组合根没有满足 module interface。

### 5.4 Worker 归档事实缺口

`PlatformWorkbenchService` 使用进程内 `Map` 记录 archive failure。主进程扫描队列的 module 实例与 Worker 投稿的 module 实例不同，因此：

- Worker 结果返回期间 Renderer 能看到 `archiveError`。
- Worker 退出后主进程 `listArchiveFailures()` 仍可能为空。
- 应用重启后该事实必然丢失。
- publication record 仍正确地保持 `published`，但缺少独立的本地归档事实。

### 5.5 投稿批次查询复杂度

当前 `listBatches(clientId)`：

1. 调用 `batchStore.list()`。
2. 对每个 batch 调用 `reconcileBatch()`。
3. 再调用 `buildSubmissionActionPlan()`。
4. `buildSubmissionActionPlan()` 再次调用 `reconcileBatch()`。
5. item action 定位再次调用 `articleSubmissionItems()`，后者再次全量 `batchStore.list()`。

受控内存 fixture 结果：

| 批次数 | 每批 item | `batchStore.list()` 次数 | 估算 batch-item 遍历 | 仅内存耗时 |
| ---: | ---: | ---: | ---: | ---: |
| 100 | 1 | 301 | 30,100 | 约 11 ms |
| 200 | 5 | 3,001 | 3,001,000 | 约 187 ms |
| 1,000 | 1 | 3,001 | 3,001,000 | 约 213 ms |

该数据不用于承诺具体生产耗时，只证明调用数量随批次和 item 组合出现近似二次增长。真实文件读取只会增加成本。

## 六、目标结构

```text
Electron lifecycle / Auth / Workspace bootstrap
                    |
                    v
             WorkspaceRuntime
                    |
       +------------+-------------+
       |            |             |
       v            v             v
 Publication    Submission     Media/Platform
 Runtime        Runtime        Runtime
       |            |             |
       +------------+-------------+
                    |
          ArticleManagementQuery
          ArticleAttentionQuery

Worker process
  -> reconstruct local adapters from safe paths
  -> use filesystem-backed publication adapter
  -> persist remote outcome and local archive outcome
  -> return safe presentation result
```

设计规则：

- 主进程每个工作区只有一个 publication runtime 实例。
- Worker 不能共享主进程 JavaScript 对象；跨进程 seam 使用持久文件和安全 IPC message。
- `PublicationLedger` 保持现有深 module，不拆内部状态机和 store。
- `ArticleManagementSnapshot` 保持 `get/invalidate/cacheSize` 小 interface。
- 投稿外部 IPC interface 在 P0-P1 期间保持兼容；内部 module 不穿越 IPC seam。
- 查询 snapshot 与 mutation command 分离：查询可复用一次加载结果，mutation 必须重新验证。
- mutation-to-invalidation scope 由一个 policy owner 决定，调用方不手写重复数组。
- IPC 注册函数返回显式 module/disposer，不修改输入 `deps` 对象。

## 七、阶段依赖

```text
Phase 0 基线与红测
    |
    +--> Phase 1 publication runtime wiring
    |        |
    |        +--> Phase 2 archive fact persistence
    |
    +--> Phase 3 submission read snapshot
             |
             +--> Phase 4 submission deepening
                         |
                         +--> Phase 5 WorkspaceRuntime
                                      |
                                      +--> Phase 6 legacy path retirement
                                      +--> Phase 7 Renderer controllers

P2 条件满足后：Phase 8 RuntimePaths / Phase 9 test runner
```

Phase 1-3 可以分别提交，但不得并行修改同一个状态转换函数。Phase 4 必须等待全部 P0 gate 通过。

### 实施记录（2026-07-23）

已完成的可回滚提交和已通过验证如下；P2 仍按启动条件不实施。最终 alpha package smoke 仍待补跑：

1. `8fc1cba` `test(runtime): expose publication wiring and submission baselines`
2. `a4361cf` `refactor(runtime): inject one main-process publication ledger`
3. `7c6b5b3` `fix(platform): persist local archive outcome`
4. `5403eee`、`092c538` `perf(submission): build/prove one linear read snapshot per query`
5. `7e62241`、`83784e9`、`920b8d0`、`6bef000`：投稿 Preparation、Query、Action owner 的提取及平行 facade 清理
6. `e320a97`、`e38b85d`、`95959b9`：Workspace Runtime 生命周期与集中 invalidation policy
7. `77f22ca` `refactor(desktop): retire unused legacy remote batch execution`

Phase 7 已完成：`PlatformWorkbench` 将提交、停止、残留修复、选择和 terminal refresh 生命周期委托给 platform submission controller。controller 使用 request identity 忽略陈旧响应、阻止重复提交，并对每个主进程 terminal revision 只刷新一次队列。`GeneratedArticlesView` 使用 article-management controller 对 snapshot 请求绑定 client/request identity，拒绝旧客户响应并在客户切换时清空客户局部选择；发布阶段继续消费主进程 `workflowByArticle`。

最终验证仅记录已提供结果：`npm test` 完成，928 通过、0 失败、7 跳过；`npm run pack:alpha` 在 124 秒执行窗口内超时，未标记为通过。

Phase 3 的结构性 gate 已通过：`listBatches()` 的真实 store 操作计数改为单次 list、每 item sidecar 至多一次读取，并保持近似线性。1000-batch 墙钟 p95 无法作为与旧 fixture 的可比 gate（新路径还包含安全 DTO clone、attention 与 transaction 派生，而旧 fixture 不含等价工作）；该不可比性已记录并接受，未把墙钟数字表述为性能提升承诺。

P2 不启动：没有复现 RuntimePaths/打包路径故障，也没有证据表明 Renderer build/browser 占根测试墙钟 20% 以上；按本计划的启动条件，Phase 8 和 Phase 9 目前均不值得修改。

## 八、Phase 0：建立失败反馈环和真实基线

**目标：** 在修改 production implementation 前，用测试固定当前缺陷、业务门槛和复杂度预算。

**收益：** 防止把 wiring、性能和状态机问题混在一起；为每个后续提交提供可回滚证据。  
**风险：** 低；测试若错误模拟生产组合根，会得到假阳性。  
**成本：** 2-4 天。

### Files

- Create: `tests/runtime-publication-wiring.test.js`
- Create: `tests/platform-archive-worker-boundary.test.js`
- Create: `tests/content-submission-query-benchmark.test.js`
- Modify: `tests/article-management-snapshot.test.js`
- Modify: `tests/article-management-snapshot-benchmark.test.js`
- Modify: `docs/test-suite-inventory.md`

### Tasks

- [ ] 建立接近 `main.js -> registerIpc()` 的组合测试，不能直接把 ledger 注入 snapshot 绕过生产 wiring。
- [ ] 在临时工作区创建一条 published publication record，通过注册后的 article management IPC 读取；当前实现应稳定暴露缺失。
- [ ] 验证 publication IPC、attention query、content submission 和 article management 最终观察同一 publicationId/status。
- [ ] 建立 Worker seam fixture：Worker module 记录 archive failure 后销毁实例，主进程重新构建 query，当前实现应证明事实丢失。
- [ ] 固定远端 `published` 与本地 archive `failed` 必须同时成立的业务断言。
- [ ] 使用真实临时目录、真实 `SubmissionBatchStore`、真实 publication store 和无远端 Adapter 建立查询 benchmark。
- [ ] 记录 `batchStore.list/get/reconcile`、ledger list/get、sidecar read 和总 item visit 次数。
- [ ] 记录 10、100、500、1000 批次，每批 1/5 item 的 p50/p95；操作计数是主 gate，墙钟只作辅助。
- [ ] 固定 mutation 执行前重新验证 planId/fingerprint 的行为测试。
- [ ] 固定 `uncertain`、published、failed、cancelled、双缺失、单缺失、identity conflict、content changed 分支。

### Verification

```powershell
node --test tests/runtime-publication-wiring.test.js
node --test tests/platform-archive-worker-boundary.test.js
node --test tests/content-submission-query-benchmark.test.js
node --test tests/article-management-snapshot.test.js
node --test tests/publication-ledger.test.js tests/publication-ledger-store.test.js
```

### Gate

- wiring 和 archive 测试在当前 implementation 上因目标缺陷失败，而不是因 fixture 配置失败。
- benchmark 可以报告真实 store 操作计数。
- 任何测试不得连接真实外部服务或读取当前客户工作区。

### 回滚条件

如果无法通过公开 interface 构造失败反馈环，先修测试 seam；不得为了测试暴露 production 私有函数。

## 九、Phase 1：建立主进程 publication runtime 单一所有权

**目标：** 每个已认证工作区 Runtime 只创建一份主进程 publication ledger，并显式注入所有调用方。

**收益：** 修复文章管理发布历史缺失；统一主进程 publication 状态来源；减少重复索引和组装歧义。  
**风险：** 中；漏掉一个调用方会形成新旧实例混用。Worker 不能错误共享主进程对象。  
**成本：** 2-4 天。

### Files

- Modify: `desktop/main.js`
- Modify: `desktop/ipc/register.js`
- Modify: `desktop/ipc/article-management-ipc.js`
- Modify: `desktop/ipc/article-attention-ipc.js`
- Modify: `desktop/ipc/publication-ipc.js`
- Modify: `desktop/ipc/media-ipc.js`
- Modify: `desktop/ipc/platform-ipc.js`
- Modify: `desktop/services/content-submission-service.js`
- Modify: `desktop/services/media-workbench-service.js`
- Modify: `desktop/services/media-order-service.js`
- Modify: `desktop/services/platform-workbench-service.js`
- Modify: Phase 0 wiring tests

### Tasks

- [ ] 在已认证工作区 Runtime 初始化中创建 `publicationLedger`。
- [ ] 将同一实例注入 content submission、media workbench、media order、publication IPC、attention query/resolver 和 article management snapshot。
- [ ] 主进程 production 路径禁止这些 module 在依赖缺失时静默创建第二份 ledger；测试 fixture 可以显式使用 factory helper。
- [ ] Worker 保持独立 filesystem-backed ledger Adapter；文档和测试明确这是进程 seam，而不是漏注入。
- [ ] `registerIpc()` 显式接收 publication ledger，并把它传给每个需要的注册 module。
- [ ] article management snapshot 必须返回通过相同 ledger 创建的 publication records。
- [ ] attention reconcile 后，publication history 和 article management 在同一 revision 中观察更新。
- [ ] dispose Runtime 后，不保留指向旧工作区 ledger 的闭包或订阅。

### Interface decision

不新建只包一层 `createPublicationLedger()` 的浅 facade。publication runtime 在本阶段就是由 Workspace Runtime 拥有并注入的 ledger 实例；等 Phase 5 出现更多真实生命周期行为后再决定是否需要独立 module。

### Verification

```powershell
node --test tests/runtime-publication-wiring.test.js
node --test tests/publication-ipc.test.js
node --test tests/article-management-snapshot.test.js
node --test tests/article-attention-query.test.js tests/article-attention-resolver.test.js
node --test tests/media-workbench-service.test.js tests/media-order-service.test.js
node --test tests/submission-batch-worker-integration.test.js
```

### Pass

- 主进程组合图中 publication ledger factory 调用为 1。
- Worker 进程仍可独立重建 ledger。
- published/failed/uncertain/reconcile 在 article management、attention 和 publication IPC 中一致。
- 文章管理 production-like wiring 不再返回空 publication records。

### Rollback

该阶段只改变依赖组装，不改变 publication schema 和状态机。若失败，可整体回滚注入提交，不需要数据迁移。

## 十、Phase 2：持久化 Worker 本地归档结果

**目标：** 本地归档状态成为可恢复的持久事实，不依赖 Worker 内存或一次 IPC 返回值。

**收益：** 远端成功、本地归档失败在 Worker 退出和应用重启后仍可处理；防止误重试远端投稿。  
**风险：** 中；必须避免把本地归档错误写成 publication failed，并处理旧 batch 兼容。  
**成本：** 2-4 天。

### Domain decision

远端发布事实和本地归档事实分开：

```text
publication.status = published
submissionItem.localArchive = {
  status: pending | archived | failed,
  errorCode: string | null,
  updatedAt: ISO timestamp
}
```

建议把 `localArchive` 作为 submission batch item 的可选、版本化字段，因为：

- batch item 已经拥有 queue pair、publicationId、attemptId 和目标身份。
- archive 是该本地投稿工作的后置阶段。
- publication ledger 不应学习本地文件移动状态。
- 不需要为一个事实再创建新的 store 和 hypothetical seam。

### Files

- Modify: `src/content/submission-batch-store.js`
- Modify: `desktop/services/platform-workbench-service.js`
- Modify: `desktop/worker/run-task.js`
- Modify: `desktop/services/content-submission-service.js`
- Modify: `desktop/services/article-attention-query.js`
- Modify: `desktop/services/article-attention-resolver.js`
- Modify: `desktop/ipc/platform-ipc.js`
- Modify: publication/archive/submission integration tests

### Tasks

- [ ] 定义并验证 `localArchive` schema；旧 batch 缺少该字段时保持兼容。
- [ ] 远端调用前不写 archived；远端明确 published 后设置 `pending`。
- [ ] 归档成功后原子更新为 `archived`。
- [ ] 归档失败后更新为 `failed + errorCode`；publication 继续保持 `published`。
- [ ] Worker 在发送最终 result 前确保持久状态写入已完成或返回明确本地写入错误。
- [ ] 删除或停止使用 `archiveFailures` 进程内 Map 作为事实 owner。
- [ ] `ArticleAttentionQuery` 从 batch item + queue pair 派生 `PUBLISHED_ARCHIVE_FAILED`。
- [ ] 安全重试归档时重新验证 publicationId、attemptId、article identity、content hash、pair state 和目标路径。
- [ ] 归档目标冲突继续 fail closed，不覆盖已有归档文件。
- [ ] 应用重启后仍能列出归档失败项。
- [ ] 已归档成功且 queue pair 已移动的旧记录不得误报失败。

### Verification

```powershell
node --test tests/platform-archive-worker-boundary.test.js
node --test tests/published-archive.test.js
node --test tests/article-attention-query.test.js tests/article-attention-resolver.test.js
node --test tests/submission-batch-worker-integration.test.js
node --test tests/published-article-trash.test.js
```

### Pass

- Worker 销毁和 Runtime 重建后 archive issue 仍存在。
- publication 始终保持真实远端状态。
- 同一 archive action 重复执行具有明确幂等结果。
- archive failure 不允许再次远端投稿。

### Migration and rollback

- 新字段必须可选，避免一次性重写全部历史 batch。
- 读取旧记录时只做兼容派生，不在 read path 隐式写盘。
- 若回滚代码，新字段必须被旧 reader 安全忽略；先通过 schema 兼容测试再发布。

## 十一、Phase 3：建立投稿只读 snapshot/index

**目标：** 一次请求只加载一次批次集合和所需 publication/sidecar 事实，从同一 snapshot 派生列表、对账结果和 action plan。

**收益：** 消除近似二次扫描；降低文章管理加载和主进程阻塞；为后续模块深化提供稳定内部 seam。  
**风险：** 中高；查询 snapshot 若被 mutation 直接复用，会弱化 stale plan 防护。  
**成本：** 3-6 天。

**实施状态（2026-07-23）：** 已完成结构操作计数 gate；同机墙钟 p95 的旧、新 fixture 工作量不等价，已按上述接受记录标为不可比，而非未达标的性能回归。

### Target internal model

```text
SubmissionReadSnapshot
  revision
  batchesById
  itemsByArticle
  itemsByPublicationAttemptTarget
  publicationsById
  sidecarFactsByItem
```

这是 `ContentSubmissionService` implementation 的内部 seam，不暴露给 IPC 或 Renderer。

### Files

- Modify: `desktop/services/content-submission-service.js`
- Modify: `src/content/submission-batch-store.js`（仅当需要批量读取 interface）
- Modify: `desktop/services/article-management-snapshot.js`
- Modify: `desktop/services/article-attention-query.js`
- Modify: query benchmark and behavior tests

### Tasks

- [ ] `listBatches(clientId)` 开始时只调用一次 `batchStore.list()`。
- [ ] 一次建立 batch/item identity index，item 查找不得再次全量扫描 batch store。
- [ ] 一次收集所需 publicationId；优先批量 list/index，不为每个 item 全目录扫描。
- [ ] sidecar 每个 item 最多读取一次。
- [ ] `reconcileBatch` 能接收内部 snapshot，但外部单批次调用仍可自己创建 fresh snapshot。
- [ ] `buildSubmissionActionPlan` 从已对账 snapshot 派生，不再次 reconcile 同一 batch。
- [ ] `listBatches` 为每个 batch 只执行一次对账。
- [ ] query snapshot 绑定 workspace data revision；revision 变化时不复用。
- [ ] `cancelBatch/cleanup/retry` 执行前重新构建最小 fresh snapshot 并验证 planId/fingerprint。
- [ ] 保持损坏 publication、损坏 sidecar、符号链接、文件变化和身份冲突 fail closed。
- [ ] 更新 benchmark，使其通过 production module interface，而不是直接注入结果数组。

### Performance gates

- `listBatches` 每次请求 `batchStore.list()` 不超过 1 次。
- 同一个 item 的 sidecar read 不超过 1 次。
- 总 item visit 与 batch/item 总量近似线性；输入扩大 2 倍时结构操作计数不得扩大超过 3 倍。
- 1000 批次 fixture 相对 Phase 0 同机基线 p95 至少下降 50%，或记录无法达到的明确原因和接受决策。
- 不把 AI、浏览器、网络耗时归功于本阶段。

### Verification

```powershell
node --test tests/content-submission-query-benchmark.test.js
node --test tests/content-submission-batch.test.js
node --test tests/submission-pair-state.test.js
node --test tests/submission-batch-reconcile-write.test.js
node --test tests/article-management-snapshot-benchmark.test.js
```

### Pass

- 结构操作计数达标。
- plan stale、identity conflict、content changed 等安全测试无退化。
- article management 只读快照使用新的线性查询路径。

### Rollback

查询优化不得修改持久 schema。若性能或正确性退化，可以独立回滚，不影响 Phase 1-2 数据。

## 十二、Phase 4：深化投稿模块

**目标：** 在保持外部 IPC interface 兼容的同时，把准备、查询和 mutation 知识集中到三个内部深模块。

**收益：** 状态机、文件事务和查询知识获得局部性；后续修复只修改一个 owner。  
**风险：** 高；这是本计划最大的结构调整，必须在 P0 全部通过后进行。  
**成本：** 1-2 周。

### Proposed internal modules

```text
ContentSubmission (existing external interface)
  |
  +-- SubmissionPreparation
  |     previewBatch
  |     createBatch
  |     previewRetry
  |     retryFailed
  |
  +-- SubmissionQuery
  |     getBatch
  |     listBatches
  |     buildActionPlan
  |     previewRemovalImpact
  |
  +-- SubmissionAction
        cancel
        cleanupFailed
        cleanupResidue
        cleanupPublishedLocal
        retryArchive
```

这些是 implementation 内部 module。IPC 调用方不直接学习 store、sidecar、ledger 和回滚顺序。

### Files

- Create: `desktop/services/submission/submission-preparation.js`
- Create: `desktop/services/submission/submission-query.js`
- Create: `desktop/services/submission/submission-action.js`
- Create: `desktop/services/submission/submission-read-snapshot.js`
- Modify: `desktop/services/content-submission-service.js`
- Modify: `desktop/ipc/content-submission-ipc.js`
- Modify: related tests

文件名可在实施时微调，但 module 职责和 interface 不得退化成一组一函数一文件的浅 wrapper。

### Tasks

- [ ] 先写三个 module 的 interface 行为测试，再移动 implementation。
- [ ] `ContentSubmissionService` 暂时作为稳定外部 facade，但不得继续增加业务逻辑。
- [ ] Preparation 独占资格判断、reservation 和 queue pair 创建顺序。
- [ ] Query 独占 snapshot、对账、action plan 和 DTO 安全输出。
- [ ] Action 独占取消、清理、残留修复和 archive retry 的 mutation 顺序。
- [ ] 文件系统、batch store 和 publication ledger 作为内部依赖注入，不穿越外部 interface。
- [ ] 删除移动后遗留的平行 helper 和重复状态映射。
- [ ] 新 module interface 测试覆盖后，删除测试私有函数和内部调用顺序的旧测试。
- [ ] 保留高风险端到端 fixture：创建 -> 投稿 -> published/failed/uncertain -> cleanup/retry。

### Verification

```powershell
node --test tests/content-submission-batch.test.js
node --test tests/content-submission-export.test.js
node --test tests/submission-batch-worker-integration.test.js
node --test tests/submission-pair-state.test.js
node --test tests/article-removal-recovery-regression.test.js
node --test tests/article-trash-submission-lifecycle.test.js
```

### Pass

- 外部 IPC channel 和 DTO 保持兼容。
- 三个内部 module 各自有单一 interface 和明确 owner。
- `content-submission-service.js` 不再实现全部状态机，只负责组合内部 module。
- 删除任一内部 module 时，其复杂度会回到多个调用方，证明该 module 有实际 leverage。

### Rollback

按 module 分提交：Preparation、Query、Action 各自独立迁移。任何一个迁移失败时只回滚该 module，不回滚 P0。

## 十三、Phase 5：建立完整 Workspace Runtime 和失效策略

**目标：** `main.js` 只负责 Electron、认证和工作区生命周期；业务 module、IPC 和订阅由 Workspace Runtime 拥有。

**收益：** 消除全局实例、隐式注册顺序和缺失依赖；工作区切换/退出的清理集中。  
**风险：** 中高；启动、认证恢复、退出和 Worker 清理时序敏感。  
**成本：** 5-8 天。

### Target interface

```text
createWorkspaceRuntime(deps)
  start(bootstrapState)
  registerIpc(ipcMain)
  getState()
  dispose()
```

### Files

- Create: `desktop/workspace-runtime.js` 或等价位置
- Modify: `desktop/main.js`
- Modify: `desktop/services/authenticated-runtime.js`
- Modify: `desktop/ipc/register.js`
- Modify: individual IPC registration modules
- Create: Workspace Runtime integration tests

### Tasks

- [ ] Workspace Runtime 拥有 publication、submission、generation、media、platform task、attention、snapshot 和 subscriptions。
- [ ] `main.js` 不再保存这些 module 的独立全局变量。
- [ ] IPC 注册函数禁止修改传入 `deps`；显式返回 `{ module, dispose }` 或注册结果。
- [ ] 删除通过注册顺序传递 `archiveIssueReader` 的做法。
- [ ] 每个注册 module 的必需依赖在构造时验证，缺失时启动失败而不是运行时静默降级。
- [ ] 所有订阅拥有明确 disposer；Runtime dispose 后监听器数量归零。
- [ ] Worker、浏览器、临时 Cookie、generation runner、豆包会话按固定顺序清理。
- [ ] 建立 mutation reasonCode -> scopes policy map。
- [ ] publication、batch、archive、article removal、generation、media mutation 通过 policy 产生 scope，调用方不手写重复数组。
- [ ] 保持 revision 单调递增、scope 去重和 Renderer 安全 payload。

### Verification

```powershell
node --test tests/authenticated-runtime.test.js
node --test tests/runtime-publication-wiring.test.js
node --test tests/architecture-seams.test.js
node --test tests/auth-protected-ipc.test.js
node --test tests/workspace-bootstrap-service.test.js
node --test tests/workspace-data-invalidation.test.js
```

### Pass

- `main.js` 只包含 Electron/Auth/Workspace 生命周期和 Runtime 替换。
- 工作区 Runtime 可以在测试中启动、注册、dispose，并证明无旧工作区引用。
- IPC 注册顺序不再影响 module 可用性。
- 每个 mutation reasonCode 的 scope 有一个唯一测试 owner。

### Rollback

先引入 Runtime 并让 `main.js` 委托，确认稳定后再删除旧全局变量。不得在同一提交中完成引入和全部清理。

## 十四、Phase 6：审计并退休旧投稿执行链

**目标：** 删除 Renderer 当前无调用者、且缺少完整 publication 保护的第二套批次投稿路径。

**收益：** 减少远端投稿攻击面和维护成本；所有普通平台投稿经过同一深 module。  
**风险：** 中；可能存在未记录的运维或 CLI 使用。  
**成本：** 1-3 天。

**实施状态（2026-07-23，Go）：** 静态调用矩阵确认 `desktop:start-batch`、`desktop:stop-batch`、`desktop:refresh-queue` 与 `desktop:get-state` 仅由旧 `desktopConsole.batch` preload surface 和 `batch-ipc.js` 互相连接；Renderer 没有该 surface 的调用。`startBatch` 的唯一生产调用者为 Worker `batch` branch，`runPublicationBatch` 的唯一生产调用者又是该 branch。故删除旧 IPC/preload/Worker/执行实现。`snapshot` 未删除：它仍由 `npm run snapshot` -> `scripts/snapshot.cmd` -> Worker `snapshot` -> `createQueueSnapshot` 调用；`platform-submit` 也保留为当前 Renderer 投稿链。`src/core/jobs.js` 仍被独立 publication 测试使用，未删除。

### Candidate files

- `desktop/ipc/batch-ipc.js`
- `desktop/preload.js` 中 `batch` surface
- `desktop/services/desktop-task-service.js` 中旧 `startBatch/stopBatch/refreshQueueSnapshot`
- `desktop/worker/run-task.js` 中 `snapshot` / `batch` branch
- `src/app/publish-batch.js`
- `src/core/jobs.js`（只有确认无其他调用方后）
- 对应旧测试和文档

### Tasks

- [ ] 使用静态依赖、运行日志和运维文档确认当前 Renderer/CLI 没有真实调用者。
- [ ] 明确 `desktop:start-batch`、`desktop:refresh-queue`、`desktop:get-state` 是否仍承担兼容职责。
- [ ] 如果存在真实调用者，将其迁移到 Platform Runtime；不得保留第二套 publication execution implementation。
- [ ] 如果不存在调用者，删除 preload method、IPC channel、Worker branch 和只为该路径存在的实现。
- [ ] 删除后验证 PlatformWorkbench、暂停/停止、队列刷新和打包运行不受影响。
- [ ] 更新 docs 和 test inventory。

### Go/No-Go gate

- 无法确认外部使用情况时，不删除。先记录 deprecated 和调用观测。
- 确认当前生产入口无调用者后才进入删除提交。

### Verification

```powershell
rg -n "desktop:start-batch|desktop:refresh-queue|runPublicationBatch|startBatch" desktop media-workbench/src src scripts
node --test tests/desktop-task-service.test.js tests/platform-workbench-service.test.js
node --test tests/platform-ipc-boundary.test.js tests/platform-submission-invocation-count.test.js
```

### Pass

- 只剩一条普通平台远端投稿执行链。
- Renderer/preload 不暴露无调用者的远端执行命令。
- publication、attempt、uncertain 和归档测试仍通过。

## 十五、Phase 7：收敛 Renderer 工作台控制器

**目标：** 视图负责渲染，异步命令生命周期、请求身份和选择状态由控制器/hook 管理；业务阶段继续由主进程 snapshot 决定。

**收益：** 降低迟到响应、客户切换、停止/取消和确认框状态互相覆盖。  
**风险：** 中；可能产生焦点、Escape、按钮 busy 状态和响应式布局回归。  
**成本：** 5-8 天。

**实施状态（2026-07-23）：** 已完成。platform submission controller 管理 request identity、busy/stop、选择及 terminal refresh；article-management controller 管理 client/request identity、selection reset 和陈旧 snapshot 拒绝。视图不再拥有这些异步命令生命周期，且 `GeneratedArticlesView` 直接使用 snapshot `workflowByArticle`。

### Files

- Modify: `media-workbench/src/components/PlatformWorkbench.tsx`
- Modify: `media-workbench/src/components/content/GeneratedArticlesView.tsx`
- Create: platform submission controller/hook
- Create: article management controller/hook
- Modify: related Renderer tests

### Tasks

- [ ] 控制器拥有 requestId、clientId、busy、selection、terminal refresh 和 stale response 处理。
- [ ] `PlatformWorkbench` 不再同时实现 queue selection、submit lifecycle、residue repair 和全部展示状态。
- [ ] `GeneratedArticlesView` 不再自行派生 publication stage；直接消费 snapshot `workflowByArticle`。
- [ ] 业务 plan、target pairing、publication status 和 cleanup eligibility 不进入 Renderer controller。
- [ ] 组件只保留局部展示状态，例如 drawer 展开、视觉折叠和输入草稿。
- [ ] 新 hook 必须通过 bridge interface 测试，不直接访问 `window.desktopConsole`。
- [ ] 完成新 interface 测试后删除依赖源码字符串或私有 hook 状态的旧测试。

### Verification

```powershell
npm run typecheck:renderer
npm run typecheck:bridge
node --test tests/renderer-platform-queue-refresh*.test.js
node --test tests/renderer-article-management-*.test.js
node --test tests/renderer-content-client-switch.test.js
node --test tests/renderer-responsive-layout.test.js
```

### Pass

- 客户切换后旧响应不能覆盖新客户。
- 重复点击只产生一个 mutation IPC。
- submit/cancel/cleanup terminal event 只刷新一次。
- 视图不复制主进程业务阶段规则。

## 十六、Phase 8（P2 条件项）：移除模块全局 RuntimePaths

**启动条件：** 只有出现可复现的工作区路径/打包路径错误，或下一项功能必须修改该区域时实施。仅为“架构更纯”不得启动。

**收益：** 消除 `scripts/config.js`、`DIRS/PW` 和 lazy require 顺序；提高工作区和 Worker 路径测试可信度。  
**风险：** 高；路径错误可能影响客户数据、浏览器 profile 和打包运行。  
**成本：** 1-2 周。

### Scope

- `scripts/config.js`
- `src/core/files.js`
- `src/core/playwright.js`
- `src/core/logger.js`
- `src/core/stop-signal.js`
- 普通平台 Adapter
- Worker Runtime 配置

### Gate

- [ ] 先列出全部模块级路径读取和加载时副作用。
- [ ] 每个受影响 module 已经存在显式 `{ paths }` 注入路径。
- [ ] 临时工作区、开发模式、portable package、installed package 和 Worker 各有测试。
- [ ] 不改变内容库、roaming config 和 local state 的数据归属。

未满足启动条件时：**不值得修改。**

## 十七、Phase 9（P2 条件项）：Renderer 测试运行器

**启动条件：** 完整测试实测证明 Renderer build/browser 占根测试墙钟时间的 20% 以上，或持续影响开发反馈。

**收益：** 缩短本地和 CI 反馈。  
**风险：** 中；跨 suite 状态、端口和 BrowserContext 污染。  
**成本：** 2-4 天。

### Tasks

- [ ] 先记录各测试文件、build、browser launch 和 server 的实际时间。
- [ ] 每个测试仍使用独立 BrowserContext。
- [ ] build、browser 和 preview server 可以共享，但 fixture state 不共享。
- [ ] 失败时保留截图/console，成功时清理临时文件。
- [ ] 并发运行和异常退出后不得留下锁、端口或浏览器进程。

未达到 20% 门槛时：**不值得修改。**

## 十八、测试策略：替换，不叠加

### 18.1 Interface 是测试表面

- Publication wiring 通过 Workspace Runtime/IPC 可观察结果测试。
- Archive persistence 通过 Worker 销毁和 Runtime 重建后的可观察结果测试。
- Submission Query 通过公开 list/get/preview interface 和操作计数测试。
- Submission Action 通过文件、batch、publication 的最终一致结果测试。
- Renderer controller 通过 bridge command 次数和页面可见行为测试。

### 18.2 必须保留

- publication 状态机、重复投稿保护、attempt rebind、uncertain。
- 双文件事务、回滚、损坏 JSON、符号链接和路径逃逸。
- published archive 成功、冲突、回滚失败和重启恢复。
- 文章回收与 publication 历史保留。
- Worker stop/pause 在远端调用前后不同语义。
- Electron sandbox、contextIsolation、导航和认证 IPC。

### 18.4 已完成的测试替换映射

| 旧测试/浅表面 | 替代测试表面 | 保留的不变量 |
| --- | --- | --- |
| 旧 remote batch 的 `desktop-task-service.startBatch` fixture | `tests/desktop-task-service.test.js` 的 `platform-submit` worker 路径 | 显式 runtime paths、Worker payload 与平台暂停/停止生命周期 |
| `buildBatchPlan()` 的 workspace scan fixture | `tests/batch-workspace-scan.test.js` 的 `createQueueSnapshot()` CLI 事实 | snapshot 只扫描显式 `AUTO_PUBLISH_WORKSPACE` input |
| `desktopConsole.batch` / `batch-ipc` surface | `tests/platform-ipc-boundary.test.js`、`tests/platform-submission-invocation-count.test.js` | Renderer 只经 `platforms:submit-selected` 触发一次主进程拥有的普通平台投稿 |
| 旧 content submission facade query 状态机测试 | `tests/submission-module-interface.test.js`、`tests/submission-query-interface.test.js` 与 `tests/submission-action-interface.test.js` | Preparation、Query、Action 的领域 owner、stale plan 和 fail-closed 行为 |
| `PlatformWorkbench` 内联提交/停止/terminal refresh 状态 | `tests/platform-submission-controller.test.mjs` | 重复命令只执行一次、陈旧 submit 响应不覆盖当前状态、每个 terminal revision 只刷新一次 |
| `GeneratedArticlesView` 内联 article snapshot 请求状态 | `tests/article-management-controller.test.js`、`tests/renderer-content-client-switch.test.js` | 客户切换时清空局部选择，旧客户 snapshot 不覆盖新客户 |

### 18.3 可以替换或删除

新深 module interface 测试建立后，可以删除：

- 只验证私有 helper 的测试。
- 只断言函数名、调用顺序或源码文本的测试。
- 已被新 interface 测试完全覆盖的浅 facade 测试。
- 退休旧投稿路径的专属测试。

每次删除必须在提交说明中记录：

```text
旧测试 -> 新 interface 测试 -> 覆盖的业务不变量
```

## 十九、实施提交顺序

建议一个提交只解决一个可回滚问题：

1. `test(runtime): expose publication wiring gap`
2. `test(platform): expose archive issue across worker boundary`
3. `perf(submission): record real query operation baseline`
4. `refactor(runtime): inject one main-process publication ledger`
5. `fix(platform): persist local archive outcome`
6. `perf(submission): build one read snapshot per query`
7. `refactor(submission): extract preparation module`
8. `refactor(submission): extract query module`
9. `refactor(submission): extract action module`
10. `refactor(desktop): introduce workspace runtime`
11. `refactor(desktop): centralize invalidation policy`
12. `refactor(desktop): retire legacy publication path`（通过使用审计后）
13. `refactor(renderer): extract platform submission controller`
14. `refactor(renderer): extract article management controller`
15. P2 按启动条件另开计划，不默认执行

禁止把 4-14 合并成一个大提交。

## 二十、阶段验收矩阵

| 行为 | Phase 0 | Phase 1 | Phase 2 | Phase 3 | Phase 4-7 |
| --- | --- | --- | --- | --- | --- |
| 文章管理看到 publication records | 建立失败测试 | 必须通过 | 保持 | 保持 | 保持 |
| attention 与 publication 状态一致 | 固定行为 | 必须通过 | 加入 archive | 保持 | 保持 |
| Worker 重启后 archive issue 存在 | 建立失败测试 | 仍失败 | 必须通过 | 保持 | 保持 |
| `listBatches` 单次 store list | 记录基线 | 不要求 | 不要求 | 必须通过 | 保持 |
| mutation stale plan fail closed | 固定行为 | 保持 | 保持 | 必须保持 | 保持 |
| IPC 注册无顺序副作用 | 记录现状 | 部分改善 | 保持 | 保持 | Phase 5 必须通过 |
| 只有一条普通平台执行链 | 审计 | 保持 | 保持 | 保持 | Phase 6 决策 |
| Renderer 不复制业务阶段 | 固定规则 | 保持 | 保持 | 保持 | Phase 7 必须通过 |

## 二十一、全量验证

每个阶段先运行相关测试，P0/P1 阶段结束后运行：

```powershell
npm run lint
npm run typecheck:renderer
npm run typecheck:bridge
npm test
npm run test:auth
npm run build:renderer
npm run verify
node --test tests/production-packaging.test.js
```

如果 `npm test` 受执行器时限影响：

1. 记录已完成分组、通过/失败/跳过数量和超时时间。
2. 不得把超时写成全量通过。
3. 在不受时限影响的本地或 CI 环境补跑并记录结果。

涉及打包路径、Worker 或 Runtime dispose 的阶段，额外执行 alpha package smoke；不得连接真实投稿目标。

## 二十二、最终完成标准

### 正确性

- [ ] 文章管理 production wiring 能读取实际 publication records。
- [ ] 主进程 publication、attention、media、submission 和 snapshot 观察同一状态。
- [ ] Worker 退出和应用重启后，published archive failure 仍可见。
- [ ] publication `published` 与 local archive `failed` 可以同时表达。
- [ ] uncertain、duplicate guard、attempt history 和 cleanup 语义无退化。

### 性能

- [ ] `listBatches` 每次请求只全量读取 batch store 一次。
- [ ] 查询总 item visit 近似线性。
- [ ] 真实 store 1000 批次 benchmark 达到 Phase 3 gate，或存在明确接受决策。
- [ ] Renderer 一次文章管理刷新仍只有一个 snapshot IPC。

### 架构

- [ ] 主进程工作区只有一个 publication runtime owner。
- [ ] IPC 注册不修改共享 deps，也不依赖注册顺序。
- [ ] 投稿准备、查询和 mutation 各自拥有清楚的内部 interface。
- [ ] `main.js` 不再直接管理全部业务 module 全局变量。
- [ ] 只保留一条普通平台远端投稿执行链，或对保留旧链有明确外部使用证据。

### 测试与维护

- [ ] 新 interface 测试替代对应浅实现测试，没有长期叠加重复覆盖。
- [ ] 文档、test inventory、ADR/CONTEXT 术语与 implementation 一致。
- [ ] Git 工作区无临时 benchmark、日志、真实数据和调试文件。

## 二十三、实施纪律

- 每开始一个 Phase，先复核上一个 Phase 的 gate 和 Git 状态。
- 每个 Phase 开始前重新确认收益仍高于成本；如果前一阶段已消除问题，后续建议应取消，而不是机械执行。
- 性能判断以真实 operation count 和同机对照为主，不用单次墙钟数字做结论。
- 新 module 必须通过 deletion test；删除后复杂度没有扩散的 wrapper 不应保留。
- 本地文件使用临时工作区 Adapter；外部平台使用 mock Adapter；不为测试暴露 production 私有 seam。
- 遇到数据 schema 变化，先保证 forward/backward reader 兼容，再写迁移或生产数据。
- 任何真实客户数据、Cookie、API Key、远端投稿和付费调用都不属于自动化重构步骤。

本计划的核心不是减少文件行数，而是让远端发布事实、本地归档事实、投稿动作和文章管理视图各有唯一 owner；让调用者通过小 interface 获得完整行为，并让高风险验证集中在这些 interface 上。
