# 19-D — 列举网图片交付与 Multipart 准备：Closure Handoff

## 状态与 provenance

- 工作包：`19-D-lieju-image-multipart-preparation`。
- 开始 integration HEAD：`17e068b7f7bf126c2b9e4aad179f18c34c5b20ec`（`codex/article-lifecycle-submission`；开始时工作树干净）。
- 实现提交：`ba4816b`（`feat(lieju): prepare multipart image delivery`）。
- 用户随后授权完成当前工作包；Primary Audit、bounded re-audit 与定向 gate 已完成。19-D=`COMPLETE`，19-E 才是唯一下一可调度项。
- 当前 source state：本 handoff 与 Wave Plan closure 更新已随本工作包的 closure docs commit 集成；没有未提交 production/test 改动。
- 未执行真实登录、GET、POST、上传、发布、付费、Cookie 导出或生产数据操作；测试仅使用临时目录、合成图片、合成 form controls 和假的 Ticket 17 resolver。

## 实现范围

- 新增列举网私有 `image-multipart-preparation` owner。它消费 Ticket 18 的冻结 `imagePlan`、Ticket 17 的 `resolveImage(clientId, imageId)` capability、19-A 已解析的当次 form controls 与已有 prepared evidence；不修改 Ticket 17/18、队列、公开 evidence schema 或任何远端 transport。
- 每个有可用真实 `local_file1..N` 连续槽位的候选都经 resolver 重新确认客户边界/常规文件，再用当前字节重新校验格式和列举网 1 MB 上限；成功内容以 SHA-256 形成实际 `assetFingerprint`，按成功顺序写入 0-based `layoutSlot`，最多四张。
- 所有非 file successful controls（包括当次 `photodb[N]` / `piddb[N]` / `ftype[N]` / hidden 值）原样冻结进 multipart capability；不推导、不新增、不改写 hidden 值。明确的非 hidden form override 仅为未来 19-E 将冻结正文映射到真实表单字段预留。
- 任何单图 resolver、边界、格式、常规文件、读取或大小失败只产生 `{ code: "LIEJU_IMAGE_DELIVERY_FAILED", stage: "delivery" }`，自动减量至 `text_only`；容量外候选产生固定的 `LIEJU_IMAGE_SLOT_CAPACITY_REACHED` warning。没有 decision、retry、replace UI 或 queue outcome。
- multipart capability 只在内存闭包中持有 bytes 与 hidden values；绝对 source path 仅用于准备期本地读取，不保留在 capability/evidence/warning。capability 只可消费一次；`JSON.stringify` 被拒绝，inspect 仅返回 `[LiejuMultipartPlan]`。安全 prepared evidence 与 warning 不含路径、buffer、Cookie 或 hidden value。

## 定向验证

在 `auto—publish/`、Node `v24.16.0` 实际运行：

```text
node --test --test-concurrency=1 tests/lieju-image-multipart-preparation.test.js tests/lieju-http-form-parser.test.js tests/lieju-http-session.test.js tests/lieju-plain-text-preparation.test.js tests/regular-image-plan-service.test.js tests/regular-platform-adapter-outcomes.test.js tests/article-lifecycle-ticket-08.test.js tests/regular-publication-evidence-contract.test.js
# 81 passed, 0 failed, 0 skipped, 0 cancelled

npm exec -- eslint src/platforms/lieju/image-multipart-preparation.js tests/lieju-image-multipart-preparation.test.js
# PASS

npm exec -- prettier --check src/platforms/lieju/image-multipart-preparation.js tests/lieju-image-multipart-preparation.test.js
# PASS

git diff --check
# PASS
```

新矩阵覆盖 0/1/4/5 图片、5 候选到 4 槽的容量减量、请求数量大于实际候选、缺失/越界/目录/超过 1 MB 的全失败、部分失败、连续槽位/fingerprint/layoutSlot、冻结 bytes、单次 consume、hidden value 不被 override、真实辅助 form 字段保留，以及 capability/evidence/warning 的路径与序列化边界。

## Primary Audit

- Scope：19-D private image/multipart owner、Ticket 17 `resolveImage` capability 的直接安全边界、19-A form successful-controls 合同、V1 prepared evidence、`form-data` 一次性 capability 与本包行为测试；不审计 19-E HTTP POST、19-F fallback、全局 lifecycle 或既有浏览器投稿路径。
- Checked invariants：每张实际候选重新经 resolver 和当前字节校验；仅真实连续 `local_file1..N`、最多四张；成功集与 evidence fingerprint/layoutSlot 同序；失败不改变 queue/outcome；hidden/辅助字段不被推导或重写；source bytes/path/hidden values 不进入安全 evidence/warnings/inspect/JSON；multipart 不可重放；不新增 Ticket 17/18 owner 或公开 evidence schema。
- Findings：无 P0/P1/P2/P3、无 deferred finding，也未触发 schema、状态 owner、事务或远端副作用边界的 escalation。
- Result：`PASS`。19-D 是为 19-E 提供的私有准备能力；本包没有 HTTP POST 或实际上传，未提前实现后续 transport/fallback。

## Bounded Re-audit

- Scope：实现 commit `ba4816b`、Primary Audit 所列不变量、直接 parser/session/plain-text/image-plan/evidence/queue 边界与定向 regression。
- Result：`PASS`。81 个定向测试、ESLint、Prettier 与 diff 检查均通过；没有 code remediation，因此未扩大审计范围。

## 后续边界

- 19-E 才把该私有 capability 与 19-A 的当次 HTTP form、19-C 的纯文本字段及一次 HTTP POST 边界接线。不得在 19-D 引入 POST、公开页轮询、Playwright fallback 或真实外部验收。
- 未运行完整 `npm test`、package/smoke 或 Wave 13 final gate：它们不属于本 Manual Dispatch 的 implementation/定向测试范围。
