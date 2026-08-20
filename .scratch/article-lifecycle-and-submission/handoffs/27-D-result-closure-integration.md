# Ticket 27-D — 投稿结果闭环 Combined Audit 与 Closure

## 状态与范围

- Ticket 27 已完成 27-A～27-D 的本地 implementation、Primary Audit、blocking remediation、Bounded Re-audit 与 final clean-HEAD gate，状态 `COMPLETE`。
- 27-D base integration HEAD：`ccba097803a8e245d32263496c0d62d28584699f`，分支：`codex/第三阶段`；开始时工作树与 staging 均干净，27-A～27-C 均为当前 HEAD 的祖先。
- 审计 integration diff `7da7ec4675f73ec5d5e7c218cc693692b4a4bb02...ccba097803a8e245d32263496c0d62d28584699f`，覆盖 success / failure / uncertain 的 publication、Attention、lifecycle、IPC 与 Renderer 闭环；27-B 只审当前运行期 recovery 与 startup fallback。
- 未执行真实登录、发布、图片上传、付费、取消、订单核对、生产迁移或其他外部副作用。

## Primary Audit findings 与整改

1. `P1 CROSS_TICKET_INTERACTION`：远端调用已开始后，accepted outcome 若因缺少 locator 等合同校验失败，orchestrator 会直接抛错而不执行 27-B 的当前进程 orphaned recovery，导致事实停在 `remote_started` 直至重启。已让所有非通用 adapter validation failure 进入既有窄 recovery capability；回归证明当前进程只产生一条 durable uncertain/manual-check，且 adapter 只调用一次。
2. `P1 CROSS_COMPONENT_INTERACTION`：V2 publication evidence、outcome service 与 outcome aggregate 原先只保证 HTTPS，fragment 或敏感 query 仍可能落盘并越过 IPC。已建立唯一的轻量 `published-article-url` domain owner，订单观察、V2 publication evidence、service 与 aggregate 共同使用 HTTPS / 无凭据 / 无 fragment / 无敏感 query 的同一规范化规则；V1 历史合同保持不变。
3. `P2 PROCESS_EVIDENCE_GAP`：Renderer 共享类型唯一 owner 的显式基线未登记 27-A 新增的 `PublicationEvidenceV2` 与 `PublicationEvidence`。已更新架构合同测试，声明总数由 143 调整为 145。
4. `P2 INTRODUCED_BY_CHANGE`：无 archive evidence 的 failed/uncertain 记录把普通 `updatedAt` 标成“最近确认时间”，且证据来源判断使用了无效枚举值。已改为“最近更新时间”，并按 `provider_event_time` / `first_positive_observation_time` / manual source 展示受控标签。

## Bounded Re-audit

仅复查上述 finding、修复 diff、直接调用方和受影响不变量。期间发现并关闭一个修复内 `P1 INTRODUCED_BY_CHANGE`：publication evidence 直接依赖 order observation 会把后者的 `node:crypto` 依赖带入 sandbox preload，导致整套 preload API 不暴露。安全 URL 规则已提取为不依赖 Node builtin 的单一 domain owner；真实 bundled preload 回归恢复通过。

Bounded Re-audit 结论：`PASS`。publication first-wins、evidence immutability、attempt identity、Attention 派生、resolution stale fencing、当前进程 uncertain recovery、startup fallback、resolved Attention 重启不复现、安全链接打开及 Renderer 主次信息分层均未出现新的 P0/P1 或直接违反 Ticket 27 acceptance 的 P2。

## 验证

环境：Windows，Node `v24.16.0`，npm `11.13.0`。最终 clean integration HEAD 上执行：

- `npm run test:desktop-core`
  - 268 个测试文件；1901 tests passed，1 skipped，0 failed。
- 27-A～27-C 与 Ticket 09/22/26-F/26-H 的 publication / recovery / lifecycle / IPC / Renderer 组合矩阵：全部通过。
- `node --test --test-concurrency=1 tests/production-preload-sandbox.electron.test.js tests/order-observation-contract.test.js tests/regular-publication-evidence-contract.test.js tests/regular-platform-outcome-service.test.js tests/regular-platform-outcomes.test.js`
  - 52 tests passed。
- `npm run lint`
- `npm run typecheck:renderer`
- `npm run typecheck:bridge`
- `npm run typecheck:main`
- `npm --prefix media-workbench run typecheck:strict`
- `npm --prefix media-workbench run lint`
- `npm run build:renderer`
- `git diff --check`

Renderer production build 仅保留既有的 Vite chunk-size warning，构建成功。根目录完整 `npm test` 未单独执行：当前桌面 CI 的必需合同是 `npm run test:desktop-core`，Ticket 27-D 也只在 package/CI 明确要求时执行完整根套件；auth / packaging / production smoke 与本次 owner 无直接变化。

## Closure / 边界

- Ticket 27 状态更新为 `COMPLETE`，Wave Plan 与 `docs/WORK-INDEX.md` 已同步；当前没有默认复杂执行入口。
- 没有 schema migration、第二 publication/Attention/resolution writer、adapter replay 或兼容路线。
- 测试后未再修改 production source、schema、关键测试或构建合同；最终交付时工作树与 staging 干净。
- 到此停止；不自动启动其他 Ticket，也不继承任何真实外部操作授权。
