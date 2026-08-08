# Ticket 24-B — Single-target Submission Contract Handoff

## 状态与边界

- 状态：Closure-ready，等待主任务在 clean HEAD 上集成。
- base integration HEAD：`07574b7074a05b1a1cc985751c508b2877fea98e`。
- 分支：`codex/article-lifecycle-submission`。
- 本包只处理 Single-target Submission Contract Owner；未进入 24-C、M04，也未执行 push 或真实外部操作。
- 24-C generic outcome、24-D queue/removal capability、历史持久 `targetPlatformId` 事实、网站媒体单资源命令均保留。

## 改动闭环

- 普通平台投稿与 generation submission handoff 的公开 request/command 已收敛为单一 `platformId + accountProfileId`。planner 每篇文章只生成一个绑定同一目标的 task，不生成 article × target 笛卡尔积；一次 admission 最多一个活动目标。
- generation contract、handoff service、submission planner、handoff IPC、preload/bridge/type、Drawer 和生成后投稿 UI 已统一消费单目标合同。输入对 `targetPlatformIds`、`accountProfiles`、数组目标及未知字段显式拒绝，不保留长度为 1 数组、compatibility mapper、fallback 或双形状；service 只暴露实际使用的 `preview`/`commit`。
- 普通平台 UI 删除 checkbox/multi-select target；多篇文章 checkbox 选择仍保留，但一个命令只绑定一个目标。缺 account profile、stale preview、重复 admission、已有活动目标和显式多目标 payload 均有行为/合同测试。
- platform workbench 的 command preparer、submission boundary、platform contracts、application、queue handoff 及直接调用方已改为单目标；移除旧 direct-submit command、旧数组 plan helper 和对应死合同。平台 queue/login/暂停/停止等现有能力未被本包删除。
- 网站媒体继续使用独立的单一 `mediaResourceId` 命令，没有合并普通 target DTO；08/09 adapter/evidence seam 保持不变，本包不实现图片传输。
- `desktop-task-service` 的内部聚合变量仅改名为 `distinctTargetIds`，不改变其对历史 durable task `targetPlatformId` 的读取或事实语义。

## 真实验证结果

以下命令均在 `F:\官媒投稿-refactor\auto—publish` 执行：

- `node --test tests/generation-submission-handoff.test.js tests/generation-submission-handoff-ipc.test.js tests/phase-06-generation-typed-ipc.test.js`：15/15 通过；这是移除 handoff service 无消费者别名后的 bounded re-audit。
- `node --test tests/generation-submission-handoff.test.js tests/generation-submission-handoff-ipc.test.js tests/phase-06-generation-typed-ipc.test.js tests/submission-preparation-lifecycle.test.js tests/phase-03-content-account-binding-execution.test.js tests/phase-03-content-publication-chain.test.js tests/phase-03-operational-content-submission.test.js tests/platform-workbench-service.test.js tests/phase-07-regular-queue.test.js`：50/50 通过。
- `node --test tests/platform-workbench-service.test.js tests/renderer-account-profile-selector.test.js tests/phase-04-platform-account-projection.test.js`：11/11 通过。
- `node --test tests/phase-05-handoff-capacity.test.js`：1/1 通过；覆盖 500 与 5000 task 的 production file adapter handoff，且保持一次 identity scan/preview。
- `node --test tests/renderer-account-profile-selector.test.js tests/renderer-generation-submission-handoff.test.js tests/renderer-content-client-switch.test.js`：3/3 通过；Renderer harness 的 Vite build 成功，仅有既存 chunk size warning。
- `node --test tests/phase-04-platform-account-projection.test.js tests/phase-06-legacy-path-absence.test.js`：7/7 通过。
- `npm run typecheck:renderer`：通过。
- `npm run typecheck:bridge`：通过。
- `npm run typecheck:main`：通过。
- `npx eslint desktop/services/generation-submission-handoff-service.js`：通过；此前全量变更 JS lint 也通过。
- `git diff --check`：通过；Git 仅报告工作区 LF/CRLF 转换提示，无 whitespace error。

上述矩阵覆盖多篇单目标、重复 admission/idempotency、已有活动目标、stale preview、缺 account profile、unsupported target 及显式多目标拒绝。普通 queue 的既有状态矩阵继续验证 active/claimed/order 与旧多目标 payload 拒绝。

## Primary Audit 与 bounded re-audit

- Primary Audit 范围限定为 24-B diff、generation handoff → planner → queue/application、platform workbench、IPC/preload/bridge/Renderer 及直接调用方；没有重新开启全仓库 fresh review。
- Primary Audit 发现 generation handoff service 返回了没有生产消费者的旧别名。已删除别名，保持唯一 `preview`/`commit` owner；bounded re-audit 重新运行上述 15/15 handoff/IPC/typed tests，结果通过。
- 当前没有 P0/P1 或直接阻塞正确性、一致性、幂等、不确定结果安全和公开合同的 P2 finding。Primary Audit / Finding Remediation / Bounded Re-audit 已收敛。

## 未运行或未完成 gate

- `node --test tests/phase-06-production-ipc-fixture-matrix.test.js tests/phase-06-legacy-path-absence.test.js tests/phase-04-platform-account-projection.test.js` 曾运行至 123.7 秒后 timeout（exit 124、无测试输出），因此不记为通过；其中 phase-04 与 legacy absence 已拆开以 7/7 通过复验。
- 未运行全仓库 fresh test/review、完整打包/release gate、真实数据库/迁移 gate 或人工交互 UI 全量验收。
- 未执行真实登录、投稿、付费、订单、图片上传、生产环境操作、M04、24-C、merge 或 push。

## 下一动作

1. 主任务在本提交上验证 clean HEAD，并按当前 Wave Plan 的 integration gate 集成 24-B。
2. 仅在主任务确认本包集成完成且后续 gate 允许后，再调度下一个工作包；本包不推进 24-C 或 M04。
