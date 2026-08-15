# 18-A — 普通队列组 Image Count 持久化：Closure Handoff

## 当前状态

- 工作包：`18-A-queue-image-count-persistence`。
- 开始 integration HEAD：`7e2c9eaff42a40a27f25b6881d73bb1a641fdda9`（`codex/article-lifecycle-submission`）。开始时工作树干净。
- implementation commit：`8da3448f40fa2bbc9ccec0d0f77452f85863b9d1`（`feat(operational-store): persist queue image count`）。
- 已完成 Primary Audit、finding remediation 与 Bounded Re-audit；本工作包现在为 `18-A=COMPLETE`。
- 后续只有 `18-B` 可调度；本次不启动它，也没有执行任何真实登录、上传、发布、付费或生产迁移。

## 已实现的 owner 与合同

- `OperationalStore` schema version 升至 `8`，新增正式 `operational-store-schema-v8.js` migration。它在同一 transaction 内为 `submission_queue_groups` 添加唯一 `image_count` 列：`INTEGER NOT NULL DEFAULT 0`，并用 SQLite `typeof(...)='integer' AND ... BETWEEN 0 AND 5` 约束。
- v7 旧组仅由 schema default 迁移为 `0`；v8 migration 保留既有 group identity、平台/账号 identity、暂停意图、revision 与 timestamps，fault 后整笔 migration 回滚。restart 不会把旧组静默改成 `1`。
- 新 group（直接创建或 regular admission 新建）默认 `imageCount=1`，显式输入只接受整数 `0..5`。admission 找到已有 `(platformId, accountProfileId)` group 时只读取已有持久值，不写入调用方缺省值。
- `queueGroupRow` 与 `listRegularQueueGroupSnapshots` 返回安全标量 `imageCount`；没有图片引用、路径或 plan。
- 写操作仅经新窄 port `regularQueueGroupImageCountTransitions.setRegularQueueGroupImageCount({ queueGroupId, imageCount, expectedRevision })`。它以 revision CAS 更新 `image_count`、`revision` 与 `updated_at`；stale writer 得到 `OPERATIONAL_QUEUE_GROUP_REVISION_CONFLICT`，非法值不产生部分写入。
- 既有 `regularQueueGroupTransitions` 保持其精确键合同，以免破坏当前 queue orchestrator；18-B 可在该端口和现有 snapshot query 之上接线。

## 定向证据

在 `auto—publish/` 运行：

```text
node --test --test-concurrency=1 tests/ticket-18-a-queue-image-count-persistence.test.js tests/phase-02-operational-store.test.js tests/phase-03-operational-store-v3.test.js tests/phase-03-composition.test.js tests/phase-04-operational-store-lifecycle.test.js tests/phase-07-regular-queue.test.js tests/phase-08-operational-store-internals.test.js tests/article-lifecycle-ticket-23-c.test.js tests/ticket-25-e-migration-acceptance.test.js tests/ticket-26-c-unified-submission-intake.test.js tests/ticket-25-b-lifecycle-acceptance.test.js tests/ticket-25-c-regular-platform-acceptance.test.js
```

结果：86 passed，0 failed，0 skipped，Node `v24.16.0`。

新增 `tests/ticket-18-a-queue-image-count-persistence.test.js` 覆盖：v7→v8 每个 migration fault、旧组零值与 restart、新建默认/显式值、已有 group 对缺省及显式 admission 配置的继承、非法/额外 admission 配置的原子失败、数据库整数范围约束、CAS/stale writer、identity 不变与 update fault rollback。

另外实际通过：

```text
npx --no-install eslint src/infrastructure/operational-store/internal/operational-store-schema-v4.js src/infrastructure/operational-store/internal/operational-store-schema-v8.js src/infrastructure/operational-store/internal/operational-store-schema.js src/infrastructure/operational-store/internal/operational-store-maintenance.js src/infrastructure/operational-store/internal/operational-store-verifier.js src/infrastructure/operational-store/internal/operational-store-queue-admission-transaction.js src/infrastructure/operational-store/internal/operational-store-queue-aggregate.js src/infrastructure/operational-store/internal/operational-store-regular-queue-runtime.js src/infrastructure/operational-store/internal/operational-store-transition-ports.js tests/ticket-18-a-queue-image-count-persistence.test.js tests/phase-02-operational-store.test.js tests/phase-03-composition.test.js tests/phase-03-operational-store-v3.test.js tests/phase-04-operational-store-lifecycle.test.js tests/phase-08-operational-store-internals.test.js tests/article-lifecycle-ticket-23-c.test.js tests/ticket-25-e-migration-acceptance.test.js tests/ticket-26-c-unified-submission-intake.test.js
git diff --check
$files = @('src/infrastructure/operational-store/internal/operational-store-schema-v4.js', 'src/infrastructure/operational-store/internal/operational-store-schema-v8.js', 'src/infrastructure/operational-store/internal/operational-store-schema.js', 'src/infrastructure/operational-store/internal/operational-store-maintenance.js', 'src/infrastructure/operational-store/internal/operational-store-verifier.js', 'src/infrastructure/operational-store/internal/operational-store-queue-admission-transaction.js', 'src/infrastructure/operational-store/internal/operational-store-queue-aggregate.js', 'src/infrastructure/operational-store/internal/operational-store-regular-queue-runtime.js', 'src/infrastructure/operational-store/internal/operational-store-transition-ports.js', 'tests/ticket-18-a-queue-image-count-persistence.test.js', 'tests/phase-02-operational-store.test.js', 'tests/phase-03-composition.test.js', 'tests/phase-03-operational-store-v3.test.js', 'tests/phase-04-operational-store-lifecycle.test.js', 'tests/phase-08-operational-store-internals.test.js', 'tests/article-lifecycle-ticket-23-c.test.js', 'tests/ticket-25-e-migration-acceptance.test.js', 'tests/ticket-26-c-unified-submission-intake.test.js')
npx --no-install prettier --check --end-of-line auto $files
```

结果：全部通过。

另行实际通过：

```text
npm run test:migration
```

结果：68 passed，0 failed，0 skipped。

## Primary Audit

- Scope：v8 migration、schema verification/backup chain、queue-group create/admission/update/snapshot、transition port 与直接回归。
- Checked invariants：旧组安全迁移为 `0` 且幂等；新组默认为 `1`；已有组不会被 admission 改写；更新使用 revision CAS 且 fault rollback；安全快照不含图片引用；没有新增 UI、图片库、prepare port、adapter 或 evidence writer。
- Finding：`P2 / PROCESS_EVIDENCE_GAP` — admission 的非法/额外 config fail-closed 和既有组面对显式新值的保持语义已实现，但缺少直接行为回归。
- Remediation：补充 `ticket-18-a-queue-image-count-persistence.test.js`，覆盖上述输入及无部分 admission 事实。

## Bounded Re-audit

- Re-audit scope：上述 P2、修复 diff、admission→queue-group writer 直接链、migration/CAS/snapshot 不变量与定向门禁。
- Result：`PASS`。86 项定向测试、68 项独立 migration 测试、限定 eslint、限定 Prettier 与 `git diff --check` 全部通过；无 P0/P1、无遗留阻塞 finding、无 escalation。

未运行全量 `npm test` 或 Wave 12 final gate；它们不属于 18-A 单工作包的合同，Wave 12 的 final gate 由 `18-E` 负责。
