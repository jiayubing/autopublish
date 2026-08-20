# Ticket 27-A — Publication evidence 与失败 read model

日期：2026-08-20
分支：`codex/第三阶段`
Base integration commit：`7da7ec4675f73ec5d5e7c218cc693692b4a4bb02`

## 结论

27-A 已完成，关闭 RC-1 与 RC-2。

- 在线普通平台 accepted 通过封闭的 V2 evidence 保存安全的 `remoteId`、`remoteUrl` 或两者；V1 维持只读，缺失的新 locator 不会被回填或伪造。
- archive/read model 提供单一 `publicationLocator` 投影：`RECORDED`、`MANUAL_CONFIRMED_NO_LOCATOR` 或 `UNKNOWN_LEGACY`。人工确认已接受可以没有 ID/URL，仍保留绑定 attempt、人工时间和 resolution fingerprint 形成的首个发布事实。
- 明确失败从权威 observation/recovery detail 经过 domain 的安全映射，向 publication、文章/投稿 snapshot 与 Attention 暴露相同的 `reasonCode` 和受控 `reasonSummary`。未知但安全的 code 使用受控 fallback；供应商原始异常和 metadata 不跨该边界。
- 没有 schema migration、真实登录/投稿/付费或新的 publication/attention writer；publication-success primitive 仍是唯一 first-wins writer。

## Primary Audit 与 remediation

Scope：V2 publication evidence、success primitive/outcome/recovery/fact reader、archive/query、article-management/Attention IPC read model、直接 renderer 类型消费者及相关行为测试。

Checked invariants：V1 兼容只读、ID-only/URL-only/combined locator、人工无 locator、first-wins/并发幂等、canonical evidence isolation、明确失败安全投影、Attention 派生与重启后不复现、IPC/preload 类型合同。

Findings 与处理：

1. `P1 CROSS_COMPONENT_INTERACTION`：`listPublicationRecords` 原先按“最新任意 remote evidence”读取；后续无关 evidence 可以遮蔽 canonical `publication-success:<attemptId>` 的 V2 locator。已改为精确查询 canonical success evidence，保留其他 evidence 仅作非 success fallback，并增加“success 后写入无关 evidence”回归。
2. `P2 INTRODUCED_BY_CHANGE`：manual `remoteId` 的语法校验复制在 outcome aggregate。已改为复用 domain `parsePublicationRemoteId`，保持 evidence contract 为唯一 owner。
3. `P2 PROCESS_EVIDENCE_GAP`：Ticket 的 manual-no-locator restart acceptance 缺少直接回归。已新增确认后 Attention 消失、关闭 store、重启后仍不复现的行为测试，并覆盖 optional manual ID+URL。

上述 blocking finding 均已修复。Bounded Re-audit 只复查这些修复 diff、V2 evidence 直接调用方、publication/Attention snapshot 以及并发/重启不变量；未发现新的 P0/P1 或本 Ticket 阻塞 P2，结论 `PASS`。

## 定向验证

在 `auto—publish`（Node `v24.16.0`、npm `11.13.0`）运行：

```text
node --check src/domain/publication-evidence-contract.js; node --check src/domain/publication-failure-read-model.js; node --check src/infrastructure/operational-store/internal/operational-store-publication-aggregate.js; node --check src/infrastructure/operational-store/internal/operational-store-regular-outcome-aggregate.js; node --check src/infrastructure/operational-store/internal/operational-store-fact-reader.js; node --check desktop/services/article-management-snapshot.js; node --test tests/publication-failure-read-model.test.js tests/regular-publication-evidence-contract.test.js tests/regular-platform-outcomes.test.js tests/article-management-snapshot.test.js tests/article-attention-query.test.js tests/publication-ipc.test.js tests/phase-06-publication-typed-ipc.test.js tests/ticket-25-b-lifecycle-acceptance.test.js tests/ticket-25-c-regular-platform-acceptance.test.js tests/article-lifecycle-ticket-22.test.js tests/production-preload-sandbox.electron.test.js
```

结果：`82 passed, 0 failed`。

```text
npm run lint; npm run typecheck:main; npm run typecheck:bridge; npm run typecheck:renderer
git diff --check
```

结果：全部通过。测试仅使用临时 SQLite 与合成数据；未执行真实外部副作用。

## Git / 停止边界

27-A implementation 已提交到当前分支；本次未执行 merge/integration。开始时已有 Wave Plan、WORK-INDEX 和 Ticket 27 合同的调度 setup 变更；本工作包没有覆盖或回退它们。

用户明确要求完成本工作包后停止：27-B 未进入、未修改其 owner，也不继承本次请求的执行或外部操作授权。若后续单独启动 27-B，必须先重新确认 HEAD、工作树、当前 Ticket/Wave Plan 状态与必要的 commit/integration authority。
