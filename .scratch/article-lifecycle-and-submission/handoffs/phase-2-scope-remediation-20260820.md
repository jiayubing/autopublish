# 第二阶段普通平台投稿执行链：范围内修复与延期登记

日期：2026-08-20
分支：`codex/第二阶段`
基线：`ced31e8`

## 结论

本次按第二阶段《普通平台投稿执行链专项审计》严格收敛。审计报告已确认普通投稿执行链无 P0/P1；后续 remediation 同步了三项已漂移的测试合同，并按用户产品决策暂时关闭 Toutiao 的普通投稿 capability。未修改 schema、投稿状态机或远端副作用边界。

普通投稿关键不变量仍由现有测试证明：队列 admission/removal 原子性、claim/FIFO、远端边界后的 uncertain、uncertain 禁止自动重试、publication first-wins/idempotency、启动恢复、图片降级和 attention 投影均通过。

## 定向验证

命令（`auto—publish`）：

```text
node --test --test-concurrency=1 tests/phase-07-regular-queue.test.js tests/regular-platform-outcomes.test.js tests/regular-platform-outcome-service.test.js tests/regular-platform-adapter-outcomes.test.js tests/regular-publication-evidence-contract.test.js tests/submission-cleanup-recovery.test.js tests/publication-recovery.test.js tests/article-attention-policy.test.js tests/platform-image-boundary.test.js tests/regular-image-plan-service.test.js
```

结果：`81 passed, 0 failed`。测试使用合成数据；未执行真实登录、真实投稿或其他生产外部副作用。

## Remediation

1. `tests/phase-06-platform-typed-ipc.test.js`：平台 domain surface 合同同步当前 7 项 capability。
2. `tests/phase-08-operational-store-internals.test.js`：OperationalStore facade 合同补入既有 `deleteAccountProfile`。
3. `tests/renderer-lieju-publication-profile.test.js`：修正空账号档案 fixture；只有选中真实档案后才显示删除入口。删除 capability、确认、队列/活动目标保护及 history 保留由直接回归覆盖。
4. Toutiao 当前 remote submission 无法绑定可靠远端 identity，提交后只能保真为 `uncertain`。经用户确认，`src/platforms/toutiao/definition.js` 关闭 `regularSubmission`，`platform.js` 不再公开对应 port；普通投稿目录与 admission 不再接受 Toutiao。登录、账号检查、legacy queue 和 adapter 代码保持不变，后续只有在可靠远端结果能力验收通过后才重新开放。

以上修复没有新增状态 owner、兼容层或旁路 writer。

## Remediation 验证

```text
node --test --test-concurrency=1 tests/phase-06-platform-typed-ipc.test.js tests/phase-08-operational-store-internals.test.js tests/renderer-lieju-publication-profile.test.js tests/account-profile-deletion.test.js tests/phase-03-account-profile-ipc.test.js tests/platform-account-profile-service.test.js tests/platform-submission-controller.test.mjs
```

结果：`39 passed, 0 failed`。

```text
node --test --test-concurrency=1 tests/platform-definition-loader.test.js tests/phase-01-architecture.test.js tests/article-management-snapshot.test.js tests/article-lifecycle-ticket-08.test.js tests/phase-07-regular-queue.test.js tests/regular-platform-outcome-service.test.js
```

结果：`80 passed, 0 failed`。全部使用合成数据；未执行真实登录或真实投稿。

## 工作树

本次变更仅涉及 Toutiao capability 声明/port、对应合同测试和本 handoff。后续复审应限定在这些 diff、普通投稿目录/admission、平台加载和直接回归，不重新开启第二阶段全量审计。

## 提交与主线集成

- Base integration commit：`ced31e8d3ded25aed68a5f3e6dfda86b9d29b024`。
- Implementation branch：`codex/第二阶段`。
- Implementation commit：`0970c90 fix(submission): close phase-2 deferred gaps`。
- Integration：`master` 从 `ced31e8` fast-forward 到 `0970c90`，未产生额外 merge commit。
- 最终主线门禁：合并后的 `master@0970c90` 运行上述两组测试的合并集合，`119 passed, 0 failed`。
- 最终验证后仅补充本 provenance evidence；生产源码、schema 和关键测试未再变化。
