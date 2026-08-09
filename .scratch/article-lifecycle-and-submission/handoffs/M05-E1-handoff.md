# M05-E1 handoff — lifecycle projection、article permissions/attention/query 与 ArticleMutationCoordinator evidence

## 状态

- 结果：`COMPLETE`。
- Base：`4e85ba3b109fddb0d6c0c63ed77b552af7dbd4bb`（M05-D Final clean HEAD）。
- Final：本 handoff 随 implementation/evidence closure commit 提交；提交后以真实 `git rev-parse HEAD` 为准。
- 下一包：`M05-E2`。
- 本任务未启动 E2 或任何后续包。

## 范围与 owner

本包只治理 lifecycle projection、article mutation admission、domain article permissions/attention policy/query、ArticleMutationCoordinator 及其直接 public-call-chain evidence。没有修改 production、OperationalStore persistence/transaction/recovery、submission/publication application orchestration、Renderer attention feature、IPC、adapter、migration reader、runner 或 static gate。

## Migrated / retired / retained

- Migrated `T-695bd134bf`：`article-management-filter-model` 不再启动 TS/Renderer wrapper 检查 stage list；现在直接执行 lifecycle projection 的六阶段、标签与互斥矩阵。
- Retired `T-dc280a91f0` / `tests/article-workflow.test.js`：该重复 TS wrapper 已删除；replacement 为上述 public projection matrix，以及保留的 `phase-03-six-stage-article-lifecycle` owner regression。
- Added ArticleMutationCoordinator direct admission matrix：重复 article refs 只 admission 一次；明确 `PUBLICATION_DUPLICATE` 映射为 `ARTICLE_ACTIVE_TARGET_CONFLICT`；已有其他活动目标在 transition 前 fail closed。
- Added domain attention query/resolver matrix：authoritative revision cache、stable identity dedup、client scope、optional lookup/preflight failure 的安全只读 fallback、confirmation、显式失败不失真、成功 invalidation 与 stale duplicate fencing。
- Retained 180 条 current E1 ledger rows，全部为 `RETAIN_BEHAVIOR`；保留 lifecycle priority/unknown/frozen matrix、permission operations、CAS/lock/fault/uncertain、removal recovery/concurrency、snapshot 与 content fixture diagnostics。没有为减少文件数删除故障注入。

## Inventory / replacement evidence

- After inventory：254 files（237 JS / 17 MJS）、1,709 declarations。
- File-level source-reading：42 files / 230 declarations；assertion-level candidates：103。
- Manifest：`07d85e1fb89ffaeccc0d1858d821d3f8c86cc0f507b5ee2c08b8a0fe561318b7`。
- Discovery：`9470ff0afa48f3818ed8456f07be67d71365f02671b3c2a3e0dedfea951d63ef`。
- E1 `REWRITE_PUBLIC_BEHAVIOR` residual=`0`；global residual 12 均属于 E2/E3/F/G，未触碰。
- Authoritative ledger 已恢复 A–D execution delta，并追加 E1 status、replacement mapping 与 next=`M05-E2`。

## Gates and evidence

- Directly affected lifecycle/coordinator/attention/snapshot：`node --test --test-concurrency=1 ...`（6 files）→ **53/53 passed**。
- Complete E1 owner regression：19 files → **191/191 passed**。
- Inventory/discovery contracts：`test-inventory-contract` + `test-discovery-contract` → **8/8 passed**。
- `npm run test:discover` → **254 files**。
- `npm run test:inventory` → generated digest/evidence above；E1 residual 0。
- `npm run typecheck:main` → passed。
- Targeted Prettier check → passed。
- `git diff --check` → passed。

## Primary review / bounded re-check

Primary review scope：changed tests、lifecycle projection public contract、ArticleMutationCoordinator admission/lock behavior、attention query/resolver revision/failure behavior、authoritative ledger 与 E1/E2 boundary。发现一个 P2 `INTRODUCED_BY_CHANGE` test-fixture finding：新增 attention failure fixture 缺少安全 article fallback，导致 item 按公开 policy 被正确排除为 removed history。修正 fixture 后没有剩余 P0/P1/P2 blocking finding，也没有 production/test-only seam、owner 旁路、断言弱化或 E2/E3 scope intrusion。

Bounded re-check 覆盖该 fixture、changed tests、完整 E1 owner regression、inventory/discovery contract、typecheck 与 diff gate，全部 PASS；未触发 escalation。

## Exceptions / environment

- 当前独立 worktree 初始缺少依赖；按 lockfile 执行 root 与 `media-workbench` 的 `npm ci --ignore-scripts` 后完成验证。npm 报告的 audit findings 未自动修复，因为不属于 E1 test-evidence scope。
- 未执行真实登录、投稿、付费、取消、上传、生产数据库或第三方写操作。
- 本包不要求完整 `npm test`；最终 M05 全套 gate 留给 M05-I final clean-HEAD closure。

## Do-not-touch / next

下一且唯一允许项是 `M05-E2`：OperationalStore public facade、persistence、transaction、fault/restart/recovery evidence。E2 不得回头修改 E1 owner，除非按 Audit Protocol 确认 blocking finding 并显式修订 ledger/合同。不要从本 handoff 启动 E3/F/G/H/I、Renderer/IPC/adapter/migration reader、production 修改、M06 或真实外部操作。
