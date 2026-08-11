# Ticket 25-A — Acceptance Contract, State Matrix & Evidence Baseline

**状态：** `COMPLETE`（仅 25-A package closure；不代表 Ticket 25 / Wave 11 `COMPLETE`）

## 调度预检

- Base integration commit：`69687f778b53f1d1f030edd399e739e882e87864`。
- 基线分支：`codex/article-lifecycle-submission`；该分支仍由主任务工作树 `F:\官媒投稿-refactor` 持有。
- 本执行 worktree：`C:\Users\violet\.codex\worktrees\cd40\官媒投稿-refactor`；实现期间保持 detached，避免夺取主任务已占用的分支。实现提交：`dde5dfa045431ab431f12b16907faf94f74560d9`。
- 预检曾观察到本会话工作树在 `814ad92`；工作树当时 clean、无 staged change。随后安全切换到合同要求的 `69687f7` 基线，没有丢弃用户改动。
- 当前仓库根、实际 HEAD、status、暂存区、嵌套仓库和 submodule 已复核；没有嵌套 Git repository、未发现其他 Ticket 25 分支或并行 Ticket 25 任务。未创建新线程、子任务或子代理。
- `25-0=COMPLETE`，Ticket 24、Wave 10、Maintenance 10.5（M04–M06）均已满足，Ticket 25 scheduling gate 为 `SATISFIED`。

## 25-A 产物

Tracked acceptance source 位于 `.scratch/article-lifecycle-and-submission/acceptance/`：

- `25-a-story-matrix.json`：85 个 story ID、95 个 story/portion 行；6、29、78–85 的图片 portion 共 10 行均为 `DEFERRED_IMAGE_EXTENSION`，每个均有单独的纯文本 portion。核心行均为 `NOT_YET_RUN` 或 `USER_CONTROLLED_REQUIRED`，没有把 inventory 写成 PASS。
- `25-a-state-matrix.json`：唯一有限状态/故障矩阵，21 个 case，覆盖正常成功、明确失败、uncertain/unknown、duplicate/idempotent、stale/reordered、restart/recovery、共享 owner ordering、first-wins/terminal priority、迟到 observation，以及删除/恢复与活动目标竞态；冻结 publication success、普通平台人工 uncertain resolution、网站媒体订单创建和 cancel-vs-publish 四条 precedence rule。
- `25-a-query-scan-budget.json`：`ticket-25-a-query-scan-budget-v1`，冻结 synthetic scale、计数边界、warm-up/重复协议和每个操作的 query/scan hard limit；wall-clock baseline 为 `NOT_APPROVED`，p50/p95 只允许 observation。
- `25-a-evidence-manifest.json`：11 个 tracked artifact、4 个 generated artifact、provenance 必填字段、安全环境摘要、敏感字段拒绝规则和真实外部操作边界。
- `25-a-runner-contract.json`：Ticket 25 专用 test/benchmark 入口，以及 dirty/clean smoke 的精确命令、独立输出路径和 final `--output` forwarding 规则。
- `25-a-user-control-checklist.json`：两个显式 `USER_EXTERNAL_ACCEPTANCE_REQUIRED` 条目（普通平台两组纯文本并行、网站媒体已有订单状态刷新），含安全身份字段、风险、前置条件、记录字段和停止条件；25-A 未执行其中任何操作。

## 实现与 owner 边界

- `auto—publish/scripts/ticket-25-a-contract.js`、`ticket-25-a-evidence.js`：只读校验 tracked contract，生成安全 provenance evidence；不拥有文章、队列、订单或迁移状态。
- `auto—publish/scripts/run-ticket-25-a-benchmark.js`：通过现有 `createArticleManagementSnapshot` 公开服务 seam 使用合成数据，记录 logical query/scan 与 wall-clock observation；不调用远端，不暴露 test-only production API。
- `auto—publish/scripts/production-smoke-arguments.js`：抽取现有 production smoke 参数解析 owner，冻结重复 `--output` 的最后值规则；`verify-production-package.js` 只在真正运行 offline self-test 时加载重依赖。
- `auto—publish/scripts/production-smoke-evidence.js`：复用现有 evidence writer，补充不含凭据/敏感值的安全环境摘要。
- `auto—publish/package.json`、`auto—publish/tests/ticket-25-a-contract.test.js`：增加 Ticket 25-A 专用 test/benchmark 入口和合同测试。
- 未修改生命周期、队列、订单、迁移 schema、adapter、IPC、Renderer 或生产业务状态 owner。

## 实际验证（implementation commit `dde5dfa`）

环境：Windows `win32/x64`，Node `v24.16.0`，npm `11.13.0`。依赖安装仅用于本地测试（`npm ci --ignore-scripts --no-audit --no-fund`，以及 `media-workbench` 同命令），未启动外部服务。

| 命令 | 结果 |
| --- | --- |
| `npm run test:ticket-25-a -- --output build/evidence/ticket-25-a-contract.json` | PASS；contract test 5/5；report commit=`dde5dfa`，sourceState=`CLEAN`，changedEntries=`0` |
| `npm run benchmark:ticket-25-a -- --output build/evidence/ticket-25-a-benchmark.json` | hard query/scan gate PASS（7 queries、7 scans，limits 8/8，external transport 0）；整体状态 `OBSERVED_NOT_A_FINAL_GATE`；p50/p95 仅 observation |
| `npm run test:discover` | PASS；250 个 `.test.js/.test.mjs` 文件 |
| `node --test tests/packaging-runtime.test.js tests/production-packaging.test.js tests/release-evidence.test.js tests/test-discovery-contract.test.js tests/article-management-snapshot.test.js tests/article-management-snapshot-benchmark.test.js tests/ticket-25-a-contract.test.js` | PASS；43/43 |
| `npm run lint` | PASS |
| `npm run format:check` | PASS |
| `git diff --check` | PASS |

Generated reports均在 ignored `auto—publish/build/evidence/`，并包含精确 commit、`CLEAN` sourceState、Node 版本、命令、时间、结果和安全 environment；不提交 generated files、日志、缓存或 node_modules。

## 未运行与残余风险

- 未运行完整 `npm test`、Renderer/Preload build、完整 packaging smoke 或 `pack:production:smoke:dirty`。25-A 只冻结并验证这些命令的专用输出/provenance contract；正式 dirty smoke 属于后续合同要求的执行入口，clean smoke 保留给审计修复后的最终 clean integration HEAD。
- 未执行真实登录、发布、付费、订单创建/刷新/取消、图片上传、生产数据库操作或任何平台外部操作。缺少这些证据的固定原因是 `USER_EXTERNAL_ACCEPTANCE_REQUIRED`。
- benchmark 没有执行前批准的同环境 wall-clock baseline，因此没有 wall-clock PASS/FAIL 结论；query/scan hard gate 与观察数据保持分离。
- 当前未发现 25-A 引入的 blocking product finding。独立 Primary/combined audit 不属于本包，不能由本执行任务自我宣告 Ticket 25/Wave 11 完成。

## 下一包入口与停止边界

下一包入口是 `25-B`，但必须由主任务在集成 `dde5dfa` 到新的 clean integration HEAD 后另行调度；本执行任务不分析、实现或预建 25-B/C/D/E/F/G，也不更新后续包状态。
