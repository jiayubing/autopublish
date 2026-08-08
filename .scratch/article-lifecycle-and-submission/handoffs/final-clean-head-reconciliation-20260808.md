# Final clean-HEAD reconciliation — 2026-08-08

## 状态

`COMPLETE`。Dependency-Resolution Lane 的最终 reconciliation 已在新的 clean integration HEAD 上闭合；Wave 6、Wave 7、Wave 8、Maintenance M03、Wave 9 已按原顺序回填 `COMPLETE`。本次未进入 Ticket 24。

## Git / sourceState

- Branch：`codex/article-lifecycle-submission`
- 起始 HEAD：`74e32bb627812ad98b601929f894c0fa88596b9a`
- Reconciliation remediation commit / clean implementation HEAD：`265517a8d25934b7917e10a0c2240ce25a20182e`
- 最终完整测试、专项 gates 与 clean production-smoke 均绑定上述 implementation HEAD。
- 测试期间 production source、schema、关键测试与 gate 未变化；生成物均为 ignored runtime/build output。

## 首轮 final gate 与 finding 分类

首轮 clean HEAD `74e32bb` 的完整 `npm test` 收集 267 个 test files，结果为 1,930 tests：1,902 PASS、28 FAIL。失败收敛为以下 blocking reconciliation findings：

1. `CROSS_COMPONENT_INTERACTION`：Ticket 16 cancellation IPC 声明了 7 个稳定 error code，但安全错误映射缺失，导致 contract 自身不能解析其 failure envelope。
2. `CROSS_COMPONENT_INTERACTION`：Ticket 22 的 content contract broad-import `src/domain`，把 Node-only crypto/util 依赖带入 sandbox preload，真实 bundled preload 无法暴露受控 API。
3. `PROCESS_EVIDENCE_GAP`：Ticket 23-D 新增 migration startup composition 后，TypeChecker evidence helper 不能追踪 `option || require(...)` callable fallback，误报 4 个生产事件链不可达。
4. `PROCESS_EVIDENCE_GAP`：Ticket 10/16/23 后若干 Renderer fixture、legacy direct-submit 测试、类型 owner baseline、文案/交互断言与 production-smoke package 未同步当前公开合同。

## Remediation / bounded re-audit

- 补齐 cancellation error code 的安全 category、retryability 与 userMessage；通用 production contract failure matrix恢复可解析。
- `regular-publication-contract` 使用可打包的 `@noble/hashes` SHA-256，并以固定 UTF-8 test vector 证明 fingerprint 与既有合同一致；`content-core-contracts` 只直接依赖所需领域合同，不再 broad-import domain index。
- TypeChecker helper 只增加 `||` / `??` callable fallback 的符号追踪；channel、producer、receiver、唯一 consumer 与 disposer 断言均未放宽。
- 删除已退役 `platforms:submit-selected` 的旧行为测试，改为验证 legacy handler absence；同步 cancellation fixture、V1 type owner baseline、普通平台队列组与 residue 当前公开交互。
- 重新生成 production-smoke package，验证 packaged owner hash 与当前源码一致。
- 已知 13 个失败文件 bounded re-audit：53/53 PASS；production capability matrix：131 capabilities、35/35 PASS；无 escalation finding。

## Final clean-HEAD gates

环境：Windows；Node `v24.16.0`；npm `11.13.0`。

- `npm test`：267 files；1,927/1,927 PASS；0 fail/skip/cancel/todo；wall clock 472,772 ms。
- `npm run test:migration`：65/65 PASS；原 4 个 migration blocker 保持清零。
- `npm run test:phase-08:gates`：5/5 PASS。
- `npm run lint`：PASS。
- `npm run typecheck:main`：PASS。
- `npm run typecheck:bridge`：PASS。
- `npm run typecheck:renderer`：PASS。
- `npm run format:check`：PASS。
- `npm run test:discover`：PASS；发现 267 个 test files。
- `npm run pack:production:smoke`：PASS；`check:clean-build` 明确记录 `clean=true`、commit=`265517a8d25934b7917e10a0c2240ce25a20182e`；packaged preload sandbox、renderer contract absence、workspace schema、storage boundaries 与离线 artifact verification 全部 PASS。
- `git diff --check`：PASS；final gate 后工作树与暂存区保持 clean，直至本 evidence/status-only 更新。

## 状态回填与边界

依 Wave Plan 固定顺序回填：Wave 6 → Wave 7 → Wave 8 → Maintenance M03 → Wave 9，全部为 `COMPLETE`。Ticket 24 调度 gate 现为 `READY`，但本次未读取或实施 Ticket 24，不存在真实登录、发布、付费、取消、生产数据库或外部写操作。
