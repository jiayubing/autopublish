# 普通平台批量入队性能修复

状态：COMPLETE（2026-09-11，本地实现及验证完成）。基线：62b867163bd30944dba0499af810351f2d45f95d，开始时工作区干净。

## 范围与合同

- 修复批量入队逐篇事务、removal 历史嵌套匹配、重复账号解析与 preview group 查询。
- 文章锁、读取、生命周期判断、fingerprint 均在数据库事务前完成。
- 存储端唯一批量 admission writer：一个外层事务，逐项 savepoint。单项冲突回滚该项，其他项继续；外层提交失败回滚全部，不能报告成功。回滚无法确认时沿用 manual-check uncertain。
- 删除无生产调用方的单项 admission 接口，测试 fixture 改用批量接口。保持 IPC/renderer DTO、schema、发布状态机不变。
- 保留提交前身份校验、当前 group 的定向读取；不做真实账号、发布或付费操作。

## 已核实事实

- N 篇原本执行 N 次 transaction，且每项独立返回 queued/idempotent/conflict。
- removalTransactionStore 为 JSON 文件存储；本次仅将匹配改为 articleId 与规范化 client/article key 集合，保留无 client 的历史引用匹配和损坏文件 fail-closed。
- 单次入队账号解析重复两次；preview 对同 group 的 idempotent 项重复读取。
- 河畔在 queue run 中已跳过最终 inspection；其他平台仍执行 identity service 的 adapter.prepare + inspect，不能仅凭调用次数认定其耗时。
- 跨客户入口仍按客户拆分：本次一事务指一次单客户 admission，不声称跨客户全选只有一事务。

## 验证与审计

### 最终验证

在 `auto—publish/` 运行：

- `npm test`：61 个文件、574 项通过，无失败/跳过，约 28.6 秒。
- `node --test tests/phase-07-regular-queue.test.js tests/article-mutation-coordinator.test.js tests/regular-queue-application-read-dedupe.test.js`：最终 41 项通过。此轮和 core 均在最后一次 production source 修改之后运行。
- `npm run typecheck:main`：通过。
- `npm run lint`：通过。
- 根目录 `git diff --check`：通过（只有 Git 的 LF/CRLF 提示）。

扩展回归命令（154 项通过，约 157.6 秒，含较慢的 100/1000 篇存储成本矩阵）：

```text
node --test tests/phase-07-regular-queue.test.js tests/article-mutation-coordinator.test.js tests/regular-queue-application-read-dedupe.test.js tests/article-lifecycle-ticket-08.test.js tests/article-lifecycle-ticket-22.test.js tests/article-management-snapshot-storage-cost.test.js tests/hepan-acceptance-recovery.test.js tests/regular-platform-outcomes.test.js tests/regular-platform-outcome-service.test.js tests/regular-queue-submission-interval.test.js tests/submission-runtime-shutdown.test.js tests/ticket-18-a-queue-image-count-persistence.test.js tests/regular-platform-preparation-port.test.js tests/cross-client-regular-queue-application.test.js tests/article-removal-transaction-store.test.js tests/article-lifecycle-acceptance.test.js
```

扩展回归启动后做过最后一处 matcher 复用调整和一项 uncertain 测试补充，因此最终代码的直接证明以上述后跑的 41 项、574 项、typecheck 和 lint 为准，不以旧结果替代最终代码验证。

关键结果：500 个 prepared articles 只触发一次事务提交；幂等重放保留 500 个 item 身份和 FIFO。中间项在 publication record 写入后因重复 attempt 失败，该项 batch/publication 等被回滚，相邻项提交且后续可修正重入。公开入口整批提交故障无发布/批次残留、不通知成功，重试成功并经重开验证。10000 条 removal 历史与跨客户同 ID、无 client 的历史引用匹配正确。同组 30 个 idempotent preview 只读一次 group，下一请求重新读取。

### Primary Review → Bounded Re-review → Closure

由主 agent 对唯一 writer、文章锁、事务/savepoint、返回结果、通知、直接调用方和测试进行审查；未使用独立 reviewer。

- `EXPOSED_PREEXISTING`：逐项事务、历史 refs 嵌套匹配、重复账号/group 读取已关闭。
- `INTRODUCED_BY_CHANGE`：审查发现单篇生命周期筛选可能逐条新建 matcher，已改为每次筛选复用；数据库回滚无法确认时已复用 kernel 的 manual-check uncertain，不返回普通 conflict。
- 旧单项 admission capability 无生产消费者，已删除；8 个已有测试文件通过共享 fixture 使用新批量接口，未保留生产兼容层。
- bounded 复审只检查这些修复、最终 diff、上述回归和受影响不变量；无剩余 blocking finding。未扩展为新一轮全仓审计。

### 改动与 Git 状态

生产修改：`regular-queue-application.js`、`article-lifecycle-projection.js`、`article-mutation-admission.js`、`article-mutation-kernel.js`、`operational-store-queue-admission-transaction.js`、`operational-store-queue-aggregate.js`、`operational-store-transition-ports.js`。测试修改包括 admission 行为、能力合同、移除历史、读取计数和原单项调用 fixture；新增 `tests/fixtures/regular-queue-admission.js`。本记录为本次实施 evidence。

基线 HEAD 保持不变，未 stage/commit/push；无生产数据或 schema 修改。未运行完整 integration/release、renderer 构建或真实外部验收：本次没有 UI/打包改动，未获得真实账号/发布授权，相关本地状态链路已定向覆盖。

## 剩余边界

历史 JSON 仍需全量读取；进一步减少历史磁盘 IO 应由 article-removal-transaction-store owner 在单独任务中处理，不引入旁路索引。尚无真实平台 inspection 耗时测量，不宣称端到端加速倍数。
