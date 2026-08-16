# Post-Wave E4 Audit Closure

**工作包：**`E4 — 图片库窄 port 与交付边界`

**结论：**E4 `COMPLETE`。Primary Audit 的两个 blocking findings 已关闭，bounded re-audit `PASS`，最终 clean implementation HEAD gate 全部通过；下一 gate 为 `E5 READY`。未进入 E5，未 merge/push。

## Source state

- Base HEAD：`2d5c946302d361fce70824aefbcdde024da34169`。
- E4 implementation/remediation/tests/audit commit：`4f8f45235795dc4a561a0254202bf134ab9c72e8`。
- Closure evidence 在上述 clean implementation HEAD 上运行；本文件与计划 closure record 由后续独立 provenance docs commit 固化，不修改 production、contracts、tests 或 package gate。

## Audit closure

- F1 `P2 / INTRODUCED_BY_CHANGE`：asset 原实现仍可被 structured clone / V8 serialization，且调用者可修改共享 Buffer，造成 bytes 与 fingerprint 失配；已改为不可进程间序列化的 opaque proxy，私有 bytes 只通过防御性副本读取，普通 inspect 仅暴露安全占位信息。
- F2 `P2 / INTRODUCED_BY_CHANGE`：图片 metadata scanner 与 `ImagePlanV1` 的 dimension 上限不一致，超限图片可在 selection 成功后使整次 plan 解析失败；已由 `ImagePlanV1` 单一拥有 bytes/dimension 上限，scanner 使用同一约束并将超限候选安全降级。
- Lieju delivery 只取得一次 asset bytes 副本，并继续由平台 owner 执行 1 MiB gate；未恢复任何 `client-image-*` 平台直接依赖。
- 两项 finding 的资产边界、bytes/fingerprint 一致性、超限图片降级与直接投稿状态矩阵均通过；无 deferred finding，无 escalation。
- 未修改 schema、事实 writer、事务、普通队列/文章生命周期状态机、订单、attention、publication writer、uncertain/retry 或远端副作用边界。

## Final clean-HEAD validation

在 `auto—publish/`、HEAD `4f8f45235795dc4a561a0254202bf134ab9c72e8`、`git status --short` 为空时实际运行：

1. E4 ImagePlan/library/selection/Lieju HTTP+browser+multipart/队列与生命周期直接矩阵：`97 passed / 0 failed / 0 skipped`。
2. 计划 §1 baseline：`104 passed / 0 failed / 0 skipped`。
3. `npm run test:packaging`：`49 passed / 0 failed / 0 skipped`。
4. `npm run typecheck:main`：PASS。
5. E4 production/test 文件定向 ESLint、`git diff --check`：PASS；最终工作树 clean。

## Boundaries

- 未运行 full `npm test`、bridge/Renderer typecheck/build 或实际 alpha package smoke；E4 未修改 IPC/Renderer/schema/asset include，完整组合门禁与 package smoke 留给 E6。
- 未执行真实登录、投稿、图片上传、付费、取消、订单核对、生产数据库或生产迁移；E4 测试全部使用本地合成文件与假 transport，真实图片上传次数为 0。
- 未进入 E5 implementation；reference platform acceptance 与扩展文档仍由 E5 独立实施。
- 未 merge/push。
