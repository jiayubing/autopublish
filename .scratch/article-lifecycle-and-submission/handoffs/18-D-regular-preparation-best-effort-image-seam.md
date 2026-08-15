# 18-D — 普通投稿 Prepare Seam 与 Best-effort 图片接线：Closure Handoff

## 状态与 provenance

- 工作包：`18-D-regular-preparation-best-effort-image-seam`。
- 开始 integration HEAD：`016dfcb903f0cc94694fa78aa9bd29b335354a15`（`codex/article-lifecycle-submission`，开始时工作树干净）。
- 当前 closure commit：包含本 handoff 的当前 integration commit；以 `git rev-parse HEAD` 为准。
- 本次完成 implementation、Primary Audit、无 finding remediation 的 Bounded Re-audit、定向 gate 与 commit；18-D=`COMPLETE`。
- 未执行真实登录、图片上传、发布、付费、取消、订单核对或生产迁移；这些操作仍须逐次明确授权。

## 实现与唯一 seam

- `claimRegularQueueGroupHead` 只读投影已有 queue-group `imageCount` 到当次 claim；没有新增持久字段、writer 或旁路状态。
- workspace composition 将唯一 `regularImagePlanService` 注入 `regular-platform-preparation-port`。首次账号核验成功后、adapter prepare 前，port 对每个当次 claim 仅调用一次 `createPlan({ clientId, imageCount })`，没有 `platformId` 分支。
- 图片计划只作为 `adapter.preparePlatformSubmission(adapterInput, imagePlan)` 的第二个进程内参数传递，不附加到 claim、IPC 或持久化 evidence。可恢复的图片库错误降级为安全空计划；未知图片合同或编程错误在 `beginRegularRemoteSubmission` 前继续失败。
- 时序保持为 `prepare（含图片 best-effort）→ beginRegularRemoteSubmission（冻结 evidence）→ submitPreparedPublication`。port 不改 submission-start writer、outcome enum 或 V1 evidence schema。
- 列举网、今日头条、禾畔及禾畔 runtime wrapper 仅兼容/转发第二参数，继续安全产出既有 `text_only` 的 `PreparedSubmission`；没有上传、DOM/API/Python 图片实现，也没有伪造 `with_images` evidence。
- 后续 19–21 唯一接入点是各自 adapter 的上述第二参数：只能将实际成功的 `{ assetFingerprint, layoutSlot }` 写入现有 V1 `with_images` evidence；全部失败合法地保留 `text_only`，新路径的 `decisionKind` 固定 `initial`。

## Primary Audit

**Scope：** 18-D port、claim 投影、composition、三个 adapter 的签名兼容、禾畔 wrapper，以及直接 08/09 提交边界与 V1 evidence 消费者。

**Checked invariants：**

- 首次账号核验后才选择，且 adapter 前恰好一次；当前 adapter 不按平台把 plan 写入 claim。
- 可恢复图片错误仅降级图片集合，不可映射为 `article_rejected` 或 `group_blocked`；账户、正文、平台错误保持原有分类。
- `beginRegularRemoteSubmission` 前的图片合同错误不会开始远端提交；边界后故障只形成 `uncertain`，没有再次选图或重投正文。
- `PreparedSubmission` 仍不可序列化；持久 evidence 只允许 V1 的 fingerprint 与 layout slot，当前 adapter 不伪造图片成功。
- 生产代码未产生 `preSubmitImageDecisionRequired`、`retry_preparation`、`replace_image` 或 `continue_text_only` 调用路径；后三者仅保留在 V1 历史 validator。

**Findings：** 无。没有 `INTRODUCED_BY_CHANGE`、`CROSS_TICKET_INTERACTION` 或需登记的非阻塞 finding。

## Bounded Re-audit

无阻塞 finding，因此复审仅覆盖 implementation diff、直接 seam 调用方、08/09 prepare/uncertain 不变量和定向回归。未触发公开合同、schema、事实 owner、事务或远端副作用边界的 escalation；结果 `PASS`。

## 定向验证

在 `auto—publish/`，Node `v24.16.0`：

```text
node --test --test-concurrency=1 tests/article-lifecycle-ticket-08.test.js tests/regular-image-plan-service.test.js tests/regular-platform-adapter-outcomes.test.js tests/regular-platform-outcomes.test.js
# 80 passed, 0 failed

node --test --test-concurrency=1 tests/ticket-18-a-queue-image-count-persistence.test.js tests/ticket-18-b-queue-image-config-surface.test.js
# 6 passed, 0 failed

node --test tests/phase-08-cleanup-gates.test.js
# PASS (exit 0)

node scripts/verify-phase-08-gates.js
# PASS (exit 0)

npx --no-install eslint desktop/services/regular-image-plan-service.js desktop/services/regular-platform-preparation-port.js desktop/composition/workspace-runtime-composition.js desktop/services/hepan-regular-preparation-adapter.js src/infrastructure/operational-store/internal/operational-store-regular-queue-runtime.js src/platforms/lieju/adapter.js src/platforms/toutiao/adapter.js src/platforms/hepan/adapter.js tests/article-lifecycle-ticket-08.test.js tests/regular-image-plan-service.test.js tests/regular-platform-adapter-outcomes.test.js
# PASS (exit 0)

git diff --check
# PASS
```

覆盖的行为包括 plan-once 顺序、三平台纯文本回归、recoverable plan fault 的文字继续、fake adapter 的 partial/all-success V1 投影、边界前异常与边界后 uncertain、禾畔二参转发和 composition 的唯一 service 注入。

## 下一步

18-E 已可从本 closure 的 clean integration HEAD 开始，执行一次 Ticket 18 combined audit、必要 remediation、bounded re-audit 与 final clean-HEAD gate。不得进入 19–21，也不得执行真实外部操作。
